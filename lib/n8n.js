const N8N_BASE_URL = process.env.N8N_WEBHOOK_BASE_URL || "https://n8n.srv1000420.hstgr.cloud/webhook";

/**
 * Call an n8n webhook endpoint with a JSON payload.
 * All agent→Airtable communication goes through n8n.
 */
async function callWebhook(path, payload) {
  const url = `${N8N_BASE_URL}/${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`n8n webhook error: ${response.status} ${response.statusText} — ${errorBody}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

/**
 * Send onboarding data (customer + products) to n8n.
 * n8n handles creating records in Airtable.
 */
async function sendOnboardingData(data) {
  return callWebhook("onboard-client", data);
}

/**
 * Send QA results for a post to n8n.
 * n8n handles updating the post record in Airtable.
 */
async function sendQAResult(data) {
  return callWebhook("qa-result", data);
}

/**
 * Send a Slack notification via n8n webhook.
 */
async function notifySlack(message) {
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (!slackUrl) {
    console.warn("[n8n] SLACK_WEBHOOK_URL not configured, skipping notification");
    return;
  }

  const response = await fetch(slackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });

  if (!response.ok) {
    console.error(`[n8n] Slack notification failed: ${response.status}`);
  }
}

module.exports = { callWebhook, sendOnboardingData, sendQAResult, notifySlack };
