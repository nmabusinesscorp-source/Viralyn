const { ProxyAgent, fetch: proxyFetch } = require("undici");

const N8N_BASE_URL = process.env.N8N_WEBHOOK_BASE_URL || "https://n8n.srv1000420.hstgr.cloud/webhook";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/**
 * Build an undici dispatcher that honours the container's egress proxy
 * (https_proxy / HTTPS_PROXY) when present. Respects no_proxy / NO_PROXY
 * for hosts that should bypass the proxy (e.g. localhost).
 */
function getDispatcher(targetUrl) {
  const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
  if (!proxyUrl) return undefined;

  // Respect no_proxy: skip proxy for matching hosts
  const noProxy = (process.env.no_proxy || process.env.NO_PROXY || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (targetUrl && noProxy.length > 0) {
    try {
      const host = new URL(targetUrl).hostname;
      for (const entry of noProxy) {
        if (host === entry || (entry.startsWith("*.") && host.endsWith(entry.slice(1))) || (entry.startsWith(".") && host.endsWith(entry))) {
          return undefined;
        }
      }
    } catch (_) {
      // Invalid URL — fall through to using proxy
    }
  }

  return new ProxyAgent(proxyUrl);
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a single HTTP POST to an n8n webhook.
 */
async function fetchWebhook(url, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await proxyFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      dispatcher: getDispatcher(url),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const err = new Error(`n8n webhook error: ${response.status} ${response.statusText} — ${errorBody}`);
      err.status = response.status;
      // Persistent n8n workflow errors won't self-heal — skip retries
      if (errorBody.includes("problem executing the workflow")) {
        err.noRetry = true;
      }
      throw err;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`n8n webhook timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call an n8n webhook with automatic retry + exponential backoff.
 * Retries on network errors and 5xx responses. Does NOT retry 4xx (client errors).
 */
async function callWebhook(path, payload) {
  const url = `${N8N_BASE_URL}/${path}`;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[n8n] Retry ${attempt}/${MAX_RETRIES} for ${path} in ${delay}ms...`);
        await sleep(delay);
      }
      return await fetchWebhook(url, payload);
    } catch (err) {
      lastError = err;
      // Don't retry client errors (4xx) or persistent workflow errors
      if ((err.status && err.status >= 400 && err.status < 500) || err.noRetry) {
        throw err;
      }
      if (attempt === MAX_RETRIES) break;
      console.warn(`[n8n] Attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  throw lastError;
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await proxyFetch(slackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
      signal: controller.signal,
      dispatcher: getDispatcher(slackUrl),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.error(`[n8n] Slack notification timeout after ${FETCH_TIMEOUT_MS}ms`);
      return;
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    console.error(`[n8n] Slack notification failed: ${response.status}`);
  }
}

/**
 * Trigger content generation for a specific customer via n8n.
 * The generate-post workflow handles: product rotation, Claude text gen,
 * Gemini image/video gen, Content_Pipeline record, QA trigger.
 */
async function triggerGeneratePost({ customer_id, format = "image", source = "Rotation", campaign_id, product_name, brief, slot_time }) {
  return callWebhook("generate-post", {
    customer_id,
    format,
    source,
    campaign_id: campaign_id || "",
    product_name: product_name || "",
    brief: brief || "",
    slot_time: slot_time || "",
  });
}

module.exports = { callWebhook, sendOnboardingData, sendQAResult, triggerGeneratePost, notifySlack };
