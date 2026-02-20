#!/usr/bin/env node

/**
 * n8n Workflow Sync — Import/update/activate workflows via the n8n REST API.
 *
 * Usage:
 *   node scripts/n8n-sync.js status          # Show deployed workflow status
 *   node scripts/n8n-sync.js import           # Import or update all workflows from n8n/
 *   node scripts/n8n-sync.js activate         # Activate all Viralyn workflows
 *   node scripts/n8n-sync.js export           # Export deployed workflows back to n8n/
 *
 * Requires: N8N_API_KEY and N8N_API_BASE_URL in .env
 */

require("dotenv/config");

const fs = require("fs");
const path = require("path");
const { ProxyAgent, fetch: proxyFetch } = require("undici");

const API_BASE = process.env.N8N_API_BASE_URL;
const API_KEY = process.env.N8N_API_KEY;

if (!API_BASE || !API_KEY) {
  console.error("Missing N8N_API_BASE_URL or N8N_API_KEY in .env");
  process.exit(1);
}

const HEADERS = {
  "X-N8N-API-KEY": API_KEY,
  "Content-Type": "application/json",
};

const WORKFLOW_DIR = path.join(__dirname, "..", "n8n");

function getDispatcher() {
  const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
}

// Map local filenames → expected n8n workflow names
const WORKFLOW_MAP = {
  "workflow-onboard-client.json": "Viralyn — Onboard Client",
  "workflow-generate-post.json": "Viralyn — Generate Post",
  "workflow-content-scheduler.json": "Viralyn — Content Scheduler",
  "workflow-qa-result.json": "Viralyn — QA Result",
};

async function api(method, endpoint, body) {
  const url = `${API_BASE}${endpoint}`;
  const opts = { method, headers: HEADERS, dispatcher: getDispatcher() };
  if (body) opts.body = JSON.stringify(body);

  const res = await proxyFetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${endpoint} → ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

async function listWorkflows() {
  const { data } = await api("GET", "/workflows");
  return data;
}

async function findViralyn(allWorkflows) {
  const viralynNames = new Set(Object.values(WORKFLOW_MAP));
  return allWorkflows.filter((w) => viralynNames.has(w.name));
}

// ── Commands ──────────────────────────────────────────────

async function cmdStatus() {
  const all = await listWorkflows();
  const viralyn = await findViralyn(all);

  console.log(`\nn8n instance: ${API_BASE}`);
  console.log(`Total workflows: ${all.length}`);
  console.log(`Viralyn workflows: ${viralyn.length}/4\n`);

  for (const [file, name] of Object.entries(WORKFLOW_MAP)) {
    const deployed = viralyn.find((w) => w.name === name);
    if (deployed) {
      const status = deployed.active ? "✅ Active" : "⏸️  Inactive";
      console.log(`  ${status}  ${name}  (ID: ${deployed.id})`);
    } else {
      console.log(`  ❌ Missing  ${name}  (file: ${file})`);
    }
  }
  console.log();
}

async function cmdImport() {
  const all = await listWorkflows();
  const viralyn = await findViralyn(all);

  for (const [file, name] of Object.entries(WORKFLOW_MAP)) {
    const filePath = path.join(WORKFLOW_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⏭️  Skip ${name} — file not found: ${file}`);
      continue;
    }

    const workflow = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const existing = viralyn.find((w) => w.name === name);

    if (existing) {
      // Update existing workflow
      console.log(`🔄 Updating ${name} (ID: ${existing.id})...`);
      await api("PUT", `/workflows/${existing.id}`, {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings,
      });
      console.log(`   ✅ Updated`);
    } else {
      // Create new workflow
      console.log(`➕ Creating ${name}...`);
      const created = await api("POST", "/workflows", {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings,
      });
      console.log(`   ✅ Created (ID: ${created.id})`);
    }
  }
  console.log("\nDone. Run 'node scripts/n8n-sync.js activate' to activate workflows.");
}

async function cmdActivate() {
  const all = await listWorkflows();
  const viralyn = await findViralyn(all);

  for (const [, name] of Object.entries(WORKFLOW_MAP)) {
    const w = viralyn.find((wf) => wf.name === name);
    if (!w) {
      console.log(`❌ ${name} not found — import first`);
      continue;
    }
    if (w.active) {
      console.log(`✅ ${name} already active`);
      continue;
    }
    console.log(`▶️  Activating ${name}...`);
    await api("PATCH", `/workflows/${w.id}`, { active: true });
    console.log(`   ✅ Activated`);
  }
}

async function cmdExport() {
  const all = await listWorkflows();
  const viralyn = await findViralyn(all);

  if (!fs.existsSync(WORKFLOW_DIR)) {
    fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
  }

  for (const [file, name] of Object.entries(WORKFLOW_MAP)) {
    const w = viralyn.find((wf) => wf.name === name);
    if (!w) {
      console.log(`⏭️  Skip ${name} — not deployed`);
      continue;
    }

    const full = await api("GET", `/workflows/${w.id}`);
    const filePath = path.join(WORKFLOW_DIR, file);
    fs.writeFileSync(filePath, JSON.stringify(full, null, 2) + "\n");
    console.log(`📥 Exported ${name} → ${file}`);
  }
}

// ── Main ──────────────────────────────────────────────────

const command = process.argv[2] || "status";

const commands = { status: cmdStatus, import: cmdImport, activate: cmdActivate, export: cmdExport };

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  console.error(`Available: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

commands[command]().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
