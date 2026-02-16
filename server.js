require("dotenv").config();

const express = require("express");
const { onboard } = require("./agents/onboarder");
const { evaluatePost } = require("./agents/qa-controller");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
    res.json(result);
  } catch (err) {
    console.error(`[Server] Onboarding error: ${err.message}`);
    res.status(500).json({ error: err.message });
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
    res.json(result);
  } catch (err) {
    console.error(`[Server] QA error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Viralyn] Agent server running on port ${PORT}`);
  console.log(`[Viralyn] Endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /agent/onboard`);
  console.log(`  POST /agent/qa`);
});
