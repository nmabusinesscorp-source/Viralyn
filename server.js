require("dotenv").config();

// ─── Startup env validation ─────────────────────────────────────
const REQUIRED_ENV = ["ANTHROPIC_API_KEY", "N8N_WEBHOOK_BASE_URL"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[Viralyn] FATAL: Missing required env vars: ${missing.join(", ")}`);
  console.error("[Viralyn] Check your .env file or environment configuration.");
  process.exit(1);
}

if (!process.env.SLACK_WEBHOOK_URL) {
  console.warn("[Viralyn] SLACK_WEBHOOK_URL not set — Slack notifications will be disabled");
}

const express = require("express");
const rateLimit = require("express-rate-limit");
const { onboard } = require("./agents/onboarder");
const { evaluatePost } = require("./agents/qa-controller");
const { triggerGeneratePost } = require("./lib/n8n");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Rate limiting ──────────────────────────────────────────────
// Agent endpoints call Claude API (~$0.05/call) — protect against abuse
const agentLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 10,          // 10 calls per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/agent/", agentLimiter);

// ─── Health check ────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── Agent 1 — Client Onboarder ─────────────────────────────────
app.post("/agent/onboard", async (req, res) => {
  const { url, name } = req.body;

  if (!url) {
    return res.status(400).json({ error: "Missing required field: url" });
  }

  try {
    console.log(`[Server] POST /agent/onboard — url=${url}, name=${name || "N/A"}`);
    const result = await onboard({ url, name });
    if (!result.success) {
      return res.status(503).json({ error: "Onboarding data could not be saved to Airtable", details: result.n8nResult });
    }
    res.json(result);
  } catch (err) {
    console.error(`[Server] Onboarding error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Agent 2 — QA Controller ────────────────────────────────────
app.post("/agent/qa", async (req, res) => {
  const { post_id, post_text, prompt_visual, product_name, customer } = req.body;

  if (!post_id || !post_text) {
    return res.status(400).json({ error: "Missing required fields: post_id, post_text" });
  }

  try {
    console.log(`[Server] POST /agent/qa — post_id=${post_id}`);
    const result = await evaluatePost({ post_id, post_text, prompt_visual, product_name, customer });
    // Always return the QA verdict — n8n failure is non-critical
    if (!result.success) {
      res.status(207).json(result);
    } else {
      res.json(result);
    }
  } catch (err) {
    console.error(`[Server] QA error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Generate Post (triggers n8n workflow) ───────────────────────
app.post("/agent/generate", async (req, res) => {
  const { customer_id, format, source, campaign_id, product_name, brief, slot_time } = req.body;

  if (!customer_id) {
    return res.status(400).json({ error: "Missing required field: customer_id" });
  }

  try {
    console.log(`[Server] POST /agent/generate — customer=${customer_id}, format=${format || "image"}, source=${source || "Rotation"}`);
    const result = await triggerGeneratePost({ customer_id, format, source, campaign_id, product_name, brief, slot_time });
    res.json(result);
  } catch (err) {
    console.error(`[Server] Generate error: ${err.message}`);
    res.status(err.status || 500).json({ error: err.message || "Internal server error" });
  }
});

// ─── Start server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Viralyn] Agent server running on port ${PORT}`);
  console.log(`[Viralyn] Endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /agent/onboard`);
  console.log(`  POST /agent/qa`);
  console.log(`  POST /agent/generate`);
});
