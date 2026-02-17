const { jsonChat } = require("../lib/claude");
const { sendQAResult, notifySlack } = require("../lib/n8n");
const { QA_SYSTEM_PROMPT } = require("../config/prompts");

/**
 * Agent 2 — QA Controller
 *
 * Validates post quality before publication by checking against
 * the client's parameters (CTA, mood, product naming, etc.).
 * Pure reasoning — no tools needed.
 */
async function evaluatePost({ post_id, post_text, prompt_visual, product_name, customer }) {
  if (!post_id || !post_text) {
    throw new Error("Missing required fields: post_id, post_text");
  }

  console.log(`[QA] Evaluating post ${post_id}...`);

  const userMessage = buildQAPrompt({ post_id, post_text, prompt_visual, product_name, customer });

  // Single-turn JSON call — no tools needed
  const { data, usage } = await jsonChat({
    systemPrompt: QA_SYSTEM_PROMPT,
    userMessage,
  });

  console.log(`[QA] Verdict: ${data.verdict} (score: ${data.score}) — ${usage?.input_tokens || "?"}in / ${usage?.output_tokens || "?"}out tokens`);

  // Validate the response structure
  validateQAResponse(data, post_id);

  // Send result to n8n for Airtable update
  console.log("[QA] Sending result to n8n...");
  let n8nResult;
  try {
    n8nResult = await sendQAResult(data);
    console.log("[QA] n8n acknowledged");
  } catch (err) {
    console.error(`[QA] n8n webhook failed: ${err.message}`);
    n8nResult = { error: err.message };
  }

  // Notify Slack for WARN and FAIL
  if (data.verdict === "WARN" || data.verdict === "FAIL") {
    const slackMsg = buildSlackNotification(data, customer);
    await notifySlack(slackMsg).catch((err) => {
      console.error(`[QA] Slack notification failed: ${err.message}`);
    });
  }

  return {
    success: !n8nResult?.error,
    ...data,
    n8nResult,
  };
}

function buildQAPrompt({ post_id, post_text, prompt_visual, product_name, customer }) {
  return `Évalue la qualité du post suivant.

POST ID : ${post_id}

TEXTE DU POST :
"""
${post_text}
"""

PROMPT VISUEL :
"""
${prompt_visual || "Non fourni"}
"""

PRODUIT MIS EN AVANT : ${product_name || "Non spécifié"}

PARAMÈTRES CLIENT :
- Nom : ${customer?.Customer_Name || "N/A"}
- CTA attendu : ${customer?.CTA || "N/A"}
- Mood : ${customer?.Mood || "N/A"}
- Style visuel : ${customer?.Visual_type || "N/A"}
- Adresse : ${customer?.Customer_Adress || "N/A"}

Évalue chaque critère et retourne le JSON de résultat.`;
}

function validateQAResponse(data, postId) {
  // Ensure post_id matches
  data.post_id = data.post_id || postId;

  // Validate verdict
  const validVerdicts = ["PASS", "WARN", "FAIL"];
  if (!validVerdicts.includes(data.verdict)) {
    throw new Error(`Invalid verdict: "${data.verdict}". Expected one of: ${validVerdicts.join(", ")}`);
  }

  // Validate score
  if (typeof data.score !== "number" || data.score < 0 || data.score > 10) {
    throw new Error(`Invalid score: ${data.score}. Expected number between 0 and 10.`);
  }

  // Validate new_status
  const validStatuses = ["Prêt à publier", "À revoir"];
  if (!validStatuses.includes(data.new_status)) {
    throw new Error(`Invalid new_status: "${data.new_status}". Expected one of: ${validStatuses.join(", ")}`);
  }

  // Ensure consistency between score and verdict
  if (data.score >= 7.0 && data.verdict !== "PASS") {
    console.warn(`[QA] Score/verdict mismatch: score=${data.score} but verdict=${data.verdict}`);
  }
  if (data.score < 5.0 && data.verdict !== "FAIL") {
    console.warn(`[QA] Score/verdict mismatch: score=${data.score} but verdict=${data.verdict}`);
  }
}

function buildSlackNotification(data, customer) {
  const emoji = data.verdict === "FAIL" ? ":x:" : ":warning:";
  let msg = `${emoji} *QA ${data.verdict}* — Post ${data.post_id}\n`;
  msg += `Client : ${customer?.Customer_Name || "N/A"}\n`;
  msg += `Score : ${data.score}/10\n`;
  msg += `${data.feedback}\n`;

  if (data.suggestions && data.suggestions.length > 0) {
    msg += `\n*Suggestions :*\n`;
    for (const s of data.suggestions) {
      msg += `  - ${s}\n`;
    }
  }

  if (data.alternative_post) {
    msg += `\n*Post alternatif proposé :*\n> ${data.alternative_post}`;
  }

  return msg;
}

module.exports = { evaluatePost, validateQAResponse, buildSlackNotification };
