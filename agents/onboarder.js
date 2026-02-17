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
  });

  console.log(`[Onboarder] Claude response received (${result.usage?.input_tokens || "?"}in / ${result.usage?.output_tokens || "?"}out tokens)`);

  // Parse the JSON from the response
  const data = extractJSON(result.text);

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
  // Try to extract JSON from markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (err) {
      throw new Error(`Failed to parse JSON from code block: ${err.message}`);
    }
  }

  // Try to find a raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Failed to parse raw JSON from response: ${err.message}`);
    }
  }

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
