const { agentLoop } = require("../lib/claude");
const { sendOnboardingData, notifySlack } = require("../lib/n8n");
const { ONBOARDER_SYSTEM_PROMPT } = require("../config/prompts");

/**
 * Agent 1 — Client Onboarder
 *
 * Analyzes a client's website using Claude's built-in web_search tool
 * and extracts all relevant business data to create a customer profile
 * and product catalog in Airtable (via n8n).
 */
async function onboard({ url, name }) {
  if (!url) {
    throw new Error("Missing required field: url");
  }

  console.log(`[Onboarder] Starting onboarding for "${name || "unknown"}" — ${url}`);

  const userMessage = buildUserMessage(url, name);

  // Run the agent loop with web_search tool enabled
  const result = await agentLoop({
    systemPrompt: ONBOARDER_SYSTEM_PROMPT,
    userMessage,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
    maxIterations: 15,
    maxTokens: 16384,
  });

  console.log(`[Onboarder] Claude response received (${result.usage?.input_tokens || "?"}in / ${result.usage?.output_tokens || "?"}out tokens, stop: ${result.stopReason || "?"})`);

  if (result.stopReason === "max_tokens") {
    console.warn("[Onboarder] Warning: response was truncated (max_tokens reached)");
  }

  // Parse the JSON from the response — fall back to minimal profile if site was inaccessible
  let data;
  try {
    data = extractJSON(result.text);
  } catch (extractErr) {
    console.warn(`[Onboarder] ${extractErr.message} — creating fallback profile`);
    data = buildFallbackProfile(url, name);
  }

  // Validate required fields
  validateOnboardingData(data);

  // Ensure Source_URL is set
  data.customer.Source_URL = data.customer.Source_URL || url;

  // Override name if provided in input
  if (name && !data.customer.Customer_Name) {
    data.customer.Customer_Name = name;
  }

  // Send to n8n for Airtable record creation
  console.log("[Onboarder] Sending data to n8n...");
  let n8nResult;
  try {
    n8nResult = await sendOnboardingData(data);
    console.log("[Onboarder] n8n acknowledged");
  } catch (err) {
    console.error(`[Onboarder] n8n webhook failed: ${err.message}`);
    // Still notify Slack about the onboarding even if n8n fails
    n8nResult = { error: err.message };
  }

  // Send Slack notification
  const slackMessage = buildSlackNotification(data);
  await notifySlack(slackMessage).catch((err) => {
    console.error(`[Onboarder] Slack notification failed: ${err.message}`);
  });

  return {
    success: !n8nResult?.error,
    customer: data.customer,
    productsCount: data.products?.length || 0,
    confidenceScores: data.confidence_scores,
    n8nResult,
  };
}

function buildUserMessage(url, name) {
  let msg = `Analyse le site web suivant et extrais toutes les informations pour créer un profil client complet.\n\nURL : ${url}`;
  if (name) {
    msg += `\nNom du client (fourni) : ${name}`;
  }
  msg += `\n\nExplore le site en profondeur :
1. Page d'accueil — type de business, ambiance générale
2. Menu / Catalogue / Services — liste exhaustive des produits avec prix
3. Contact / À propos — adresse, téléphone, réseaux sociaux
4. Analyse visuelle — couleurs dominantes, style, ton de communication

Retourne le JSON structuré complet.`;
  return msg;
}

function extractJSON(text) {
  if (!text || text.trim().length === 0) {
    throw new Error("No valid JSON found in agent response (empty text)");
  }

  // Try to extract JSON from markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (err) {
      // Code block found but JSON is invalid — try to find a nested JSON object inside it
      const nestedMatch = codeBlockMatch[1].match(/\{[\s\S]*\}/);
      if (nestedMatch) {
        try {
          return JSON.parse(nestedMatch[0]);
        } catch (_) {
          // fall through
        }
      }
      throw new Error(`Failed to parse JSON from code block: ${err.message}`);
    }
  }

  // Try to find the last complete JSON object (in case there's explanatory text before it)
  const jsonMatches = [...text.matchAll(/\{[\s\S]*?\}(?=\s*$|\s*\n\s*\n)/g)];
  if (jsonMatches.length > 0) {
    // Try the last match first (most likely the final JSON output)
    for (let i = jsonMatches.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(jsonMatches[i][0]);
      } catch (_) {
        continue;
      }
    }
  }

  // Fallback: try greedy match for any JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error(`[Onboarder] JSON parse failed. Raw text (first 500 chars): ${text.slice(0, 500)}`);
      throw new Error(`Failed to parse raw JSON from response: ${err.message}`);
    }
  }

  console.error(`[Onboarder] No JSON found in response. Full text (first 1000 chars): ${text.slice(0, 1000)}`);
  throw new Error("No valid JSON found in agent response");
}

function validateOnboardingData(data) {
  if (!data.customer) {
    throw new Error("Missing 'customer' object in agent response");
  }
  if (!data.products || !Array.isArray(data.products)) {
    throw new Error("Missing or invalid 'products' array in agent response");
  }

  const requiredCustomerFields = ["Customer_Name", "Customer_Market", "Mood", "Visual_type"];
  for (const field of requiredCustomerFields) {
    if (!data.customer[field]) {
      console.warn(`[Onboarder] Warning: missing customer field "${field}"`);
    }
  }
}

function buildFallbackProfile(url, name) {
  const domain = new URL(url).hostname.replace("www.", "");
  const guessedName = name || domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const id = guessedName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X") + "001";

  return {
    customer: {
      Customer_Name: guessedName,
      Customer_ID: id,
      Customer_Market: "Indéterminé - Site non accessible",
      Customer_Adress: "",
      CTA: "Découvrez",
      Mood: "Indéterminé",
      Visual_type: "generic",
      Color_Set: "#333333,#FFFFFF",
      Post_Frequency_Weekly: 3,
      Prompt_Text: `Crée un post engageant pour {product_name}. Description : {product_description}`,
      Customer_Status: "En review",
      Source_URL: url,
      Logo_URL: "",
      Platform: "Instagram",
    },
    products: [],
    confidence_scores: { name: 0.3, address: 0, products: 0, colors: 0, mood: 0 },
  };
}

function buildSlackNotification(data) {
  const c = data.customer;
  const scores = data.confidence_scores || {};

  // Flag low-confidence fields
  const lowConfidence = Object.entries(scores)
    .filter(([, score]) => score < 0.7)
    .map(([field, score]) => `  - ${field}: ${score}`)
    .join("\n");

  let msg = `:new: *Nouveau client onboardé*\n`;
  msg += `*${c.Customer_Name}* (${c.Customer_ID || "ID pending"})\n`;
  msg += `Secteur : ${c.Customer_Market || "N/A"}\n`;
  msg += `Adresse : ${c.Customer_Adress || "N/A"}\n`;
  msg += `Produits extraits : ${data.products?.length || 0}\n`;
  msg += `Fréquence : ${c.Post_Frequency_Weekly || "N/A"} posts/semaine\n`;
  msg += `Status : ${c.Customer_Status}\n`;

  if (lowConfidence) {
    msg += `\n:warning: *Champs à vérifier (confiance < 0.7) :*\n${lowConfidence}\n`;
  }

  msg += `\nSource : ${c.Source_URL}`;
  return msg;
}

module.exports = { onboard, extractJSON, validateOnboardingData, buildSlackNotification };
