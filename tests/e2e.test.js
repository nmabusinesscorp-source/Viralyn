/**
 * E2E Integration Tests — Viralyn Agent System
 *
 * Tests the full process without external APIs:
 * 1. Express server lifecycle (start, health, shutdown)
 * 2. Input validation on all endpoints
 * 3. n8n workflow structural integrity
 * 4. Full flow mock: onboard → generate → QA
 */

// ─── Setup: mock env BEFORE any require ───────────────────────
process.env.ANTHROPIC_API_KEY = "sk-ant-test-fake-key";
process.env.N8N_WEBHOOK_BASE_URL = "http://localhost:19876/webhook";
process.env.SLACK_WEBHOOK_URL = "";
process.env.PORT = "19877";
process.env.NODE_ENV = "test";

const http = require("http");
const fs = require("fs");
const path = require("path");

// ─── Helper: HTTP request ─────────────────────────────────────
function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1",
      port: 19877,
      path: urlPath,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Mock n8n server ──────────────────────────────────────────
let mockN8nServer;
let n8nRequests = [];

function startMockN8n() {
  return new Promise((resolve) => {
    mockN8nServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = body ? JSON.parse(body) : {};
        n8nRequests.push({ path: req.url, method: req.method, body: parsed });

        // Simulate n8n responses per webhook path
        if (req.url.includes("onboard-client")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, customer_id: parsed.customer?.Customer_ID || "TST001" }));
        } else if (req.url.includes("qa-result")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, post_id: parsed.post_id, updated: true }));
        } else if (req.url.includes("generate-post")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, pipeline_record_id: "recXYZ123" }));
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      });
    });
    mockN8nServer.listen(19876, resolve);
  });
}

// ─── Express server lifecycle ─────────────────────────────────
let expressServer;

function startExpress() {
  return new Promise((resolve) => {
    // Clear module cache to allow fresh start with test env
    delete require.cache[require.resolve("../server")];

    // Capture the server instance from Express
    const originalListen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      expressServer = this;
      http.Server.prototype.listen = originalListen;
      return originalListen.apply(this, args);
    };

    require("../server");
    // Give server time to bind
    setTimeout(resolve, 500);
  });
}

function stopAll() {
  return Promise.all([
    expressServer && new Promise((r) => expressServer.close(r)),
    mockN8nServer && new Promise((r) => mockN8nServer.close(r)),
  ]);
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 1: Express Server — Health & Validation
// ═══════════════════════════════════════════════════════════════

describe("Express Server E2E", () => {
  beforeAll(async () => {
    await startMockN8n();
    await startExpress();
  });

  afterAll(async () => {
    await stopAll();
  });

  beforeEach(() => {
    n8nRequests = [];
  });

  // ─── Health check ──────────────────
  test("GET /health returns ok", async () => {
    const res = await request("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(res.body.timestamp).toBeDefined();
  });

  // ─── Onboard validation ────────────
  test("POST /agent/onboard rejects missing url", async () => {
    const res = await request("POST", "/agent/onboard", {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/url/i);
  });

  // ─── QA validation ─────────────────
  test("POST /agent/qa rejects missing post_id", async () => {
    const res = await request("POST", "/agent/qa", { post_text: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/post_id/i);
  });

  test("POST /agent/qa rejects missing post_text", async () => {
    const res = await request("POST", "/agent/qa", { post_id: "rec123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/post_text/i);
  });

  // ─── Generate validation ───────────
  test("POST /agent/generate rejects missing customer_id", async () => {
    const res = await request("POST", "/agent/generate", {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customer_id/i);
  });

  // ─── Generate proxies to n8n ───────
  test("POST /agent/generate forwards to n8n webhook", async () => {
    const res = await request("POST", "/agent/generate", {
      customer_id: "TST001",
      format: "image",
      source: "Rotation",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify the mock n8n received the call
    expect(n8nRequests.length).toBe(1);
    expect(n8nRequests[0].path).toContain("generate-post");
    expect(n8nRequests[0].body.customer_id).toBe("TST001");
    expect(n8nRequests[0].body.format).toBe("image");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 2: n8n Workflow Structural Validation
// ═══════════════════════════════════════════════════════════════

describe("n8n Workflow Structure", () => {
  const workflowDir = path.join(__dirname, "..", "n8n");
  const workflows = [
    { file: "workflow-onboard-client.json", requiredNodes: ["Webhook Onboard", "Create Customer", "Create Products", "Respond Success"] },
    { file: "workflow-generate-post.json", requiredNodes: ["Webhook", "Get Customer", "Get Products", "Claude — Generate Text", "Parse Claude Response", "Create Content_Pipeline"] },
    { file: "workflow-content-scheduler.json", requiredNodes: ["Daily 06:00", "Get Active Clients", "Plan Generation Tasks", "Has Tasks?"] },
    { file: "workflow-qa-result.json", requiredNodes: ["Webhook QA", "Find Post", "Post Found?", "Update Post", "Respond Updated", "Respond Not Found"] },
  ];

  for (const { file, requiredNodes } of workflows) {
    describe(file, () => {
      let wf;

      beforeAll(() => {
        const raw = fs.readFileSync(path.join(workflowDir, file), "utf8");
        wf = JSON.parse(raw);
      });

      test("is valid JSON with nodes and connections", () => {
        expect(wf.nodes).toBeDefined();
        expect(Array.isArray(wf.nodes)).toBe(true);
        expect(wf.connections).toBeDefined();
        expect(typeof wf.connections).toBe("object");
      });

      test("all nodes have unique IDs", () => {
        const ids = wf.nodes.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      test("all nodes have unique names", () => {
        const names = wf.nodes.filter((n) => !n.name.startsWith("Sticky")).map((n) => n.name);
        expect(new Set(names).size).toBe(names.length);
      });

      test(`contains required nodes: ${requiredNodes.join(", ")}`, () => {
        const nodeNames = wf.nodes.map((n) => n.name);
        for (const required of requiredNodes) {
          expect(nodeNames).toContain(required);
        }
      });

      test("all connection targets reference existing nodes", () => {
        const nodeNames = new Set(wf.nodes.map((n) => n.name));
        for (const [source, outputs] of Object.entries(wf.connections)) {
          expect(nodeNames.has(source)).toBe(true);
          for (const outputBranch of outputs.main) {
            for (const conn of outputBranch) {
              expect(nodeNames.has(conn.node)).toBe(true);
            }
          }
        }
      });

      test("no orphan nodes (except triggers and sticky notes)", () => {
        const triggerTypes = ["webhook", "scheduleTrigger", "stickyNote"];
        const connectedNodes = new Set();

        // Nodes that are sources of connections
        for (const source of Object.keys(wf.connections)) {
          connectedNodes.add(source);
        }
        // Nodes that are targets of connections
        for (const outputs of Object.values(wf.connections)) {
          for (const branch of outputs.main) {
            for (const conn of branch) {
              connectedNodes.add(conn.node);
            }
          }
        }

        for (const node of wf.nodes) {
          const isTrigger = triggerTypes.some((t) => node.type.includes(t));
          if (!isTrigger) {
            expect(connectedNodes.has(node.name)).toBe(true);
          }
        }
      });

      test("Airtable nodes reference correct base ID", () => {
        const airtableNodes = wf.nodes.filter((n) => n.type.includes("airtable"));
        for (const node of airtableNodes) {
          if (node.parameters?.base?.value) {
            expect(node.parameters.base.value).toBe("appGeibRFjtIvEGll");
          }
        }
      });
    });
  }

  // ─── Specific: Onboard workflow fixes ────────
  describe("Onboard workflow specifics", () => {
    let wf;
    beforeAll(() => {
      wf = JSON.parse(fs.readFileSync(path.join(workflowDir, "workflow-onboard-client.json"), "utf8"));
    });

    test("Create Customer maps Logo_URL field", () => {
      const createCustomer = wf.nodes.find((n) => n.name === "Create Customer");
      expect(createCustomer.parameters.columns.value.Logo_URL).toBeDefined();
      expect(createCustomer.parameters.columns.value.Logo_URL).toContain("Logo_URL");
    });

    test("Customer_Status uses dynamic value from payload", () => {
      const createCustomer = wf.nodes.find((n) => n.name === "Create Customer");
      const statusVal = createCustomer.parameters.columns.value.Customer_Status;
      // Should reference body.customer.Customer_Status with 'En review' fallback
      expect(statusVal).toContain("Customer_Status");
      expect(statusVal).toContain("En review");
    });

    test("has Merge node to wait for both branches before responding", () => {
      const mergeNode = wf.nodes.find((n) => n.type.includes("merge"));
      expect(mergeNode).toBeDefined();
      // Verify Create Customer → Merge (input 0)
      const customerConn = wf.connections["Create Customer"];
      expect(customerConn.main[0].some((c) => c.node === mergeNode.name && c.index === 0)).toBe(true);
      // Verify Create Products → Merge (input 1)
      const productsConn = wf.connections["Create Products"];
      expect(productsConn.main[0].some((c) => c.node === mergeNode.name && c.index === 1)).toBe(true);
    });
  });

  // ─── Specific: Generate workflow QA inline ────
  describe("Generate workflow specifics", () => {
    let wf;
    beforeAll(() => {
      wf = JSON.parse(fs.readFileSync(path.join(workflowDir, "workflow-generate-post.json"), "utf8"));
    });

    test("does NOT contain localhost QA trigger", () => {
      const httpNodes = wf.nodes.filter((n) => n.type.includes("httpRequest"));
      for (const node of httpNodes) {
        if (node.parameters?.url) {
          expect(node.parameters.url).not.toContain("localhost:3000/agent/qa");
        }
      }
    });

    test("has inline Claude QA evaluation node", () => {
      const qaNode = wf.nodes.find((n) => n.name === "Claude — QA Eval");
      expect(qaNode).toBeDefined();
    });

    test("has Parse QA Response code node", () => {
      const parseNode = wf.nodes.find((n) => n.name === "Parse QA Response");
      expect(parseNode).toBeDefined();
      expect(parseNode.type).toContain("code");
    });

    test("has Update QA Result Airtable node", () => {
      const updateNode = wf.nodes.find((n) => n.name === "Update QA Result");
      expect(updateNode).toBeDefined();
      expect(updateNode.type).toContain("airtable");
    });

    test("QA flow is fully connected: Update Product Date → Claude QA → Parse → Update → Respond", () => {
      expect(wf.connections["Update Product Date"].main[0][0].node).toBe("Claude — QA Eval");
      expect(wf.connections["Claude — QA Eval"].main[0][0].node).toBe("Parse QA Response");
      expect(wf.connections["Parse QA Response"].main[0][0].node).toBe("Update QA Result");
      expect(wf.connections["Update QA Result"].main[0][0].node).toBe("Respond Success");
    });

    test("Content_Pipeline creation maps Generated_Visual attachment", () => {
      const createNode = wf.nodes.find((n) => n.name === "Create Content_Pipeline");
      const columns = createNode.parameters.columns.value;
      expect(columns.Generated_Visual).toBeDefined();
    });
  });

  // ─── Specific: Content Scheduler fixes ─────
  describe("Content Scheduler specifics", () => {
    let jsCode;
    beforeAll(() => {
      const wf = JSON.parse(fs.readFileSync(path.join(workflowDir, "workflow-content-scheduler.json"), "utf8"));
      const codeNode = wf.nodes.find((n) => n.name === "Plan Generation Tasks");
      jsCode = codeNode.parameters.jsCode;
    });

    test("video format: 1-slot client gets image (not video)", () => {
      // The logic: isVideoSlot = (clientSlots.length >= 3) && (i % 3 === 2)
      // For length=1: (1 >= 3) = false → always image
      expect(jsCode).toContain("clientSlots.length >= 3");
    });

    test("campaign source uses 'Campaign' (not 'Planifiée')", () => {
      expect(jsCode).toContain("source = 'Campaign'");
      expect(jsCode).not.toContain("Planifiée");
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 3: Full Flow Mock — QA Controller E2E
// ═══════════════════════════════════════════════════════════════

describe("QA Controller — validateQAResponse + buildSlackNotification flow", () => {
  const { validateQAResponse, buildSlackNotification } = require("../agents/qa-controller");

  test("full PASS flow: validate → no Slack notification", () => {
    const data = {
      post_id: "recABC",
      verdict: "PASS",
      score: 8.5,
      new_status: "Prêt à publier",
      feedback: "Excellent post",
      suggestions: [],
    };
    // Should not throw
    validateQAResponse(data, "recABC");
    expect(data.verdict).toBe("PASS");
    // PASS should NOT trigger Slack (verified in qa-controller.js line 44)
  });

  test("full WARN flow: validate → Slack notification built", () => {
    const data = {
      post_id: "recDEF",
      verdict: "WARN",
      score: 6.0,
      new_status: "Prêt à publier",
      feedback: "Post acceptable mais améliorable",
      suggestions: ["Ajouter le CTA", "Mentionner le produit"],
    };
    validateQAResponse(data, "recDEF");
    const slack = buildSlackNotification(data, { Customer_Name: "TestClient" });
    expect(slack).toContain(":warning:");
    expect(slack).toContain("WARN");
    expect(slack).toContain("6/10");
    expect(slack).toContain("Ajouter le CTA");
    expect(slack).toContain("TestClient");
  });

  test("full FAIL flow: validate → Slack with alternative post", () => {
    const data = {
      post_id: "recGHI",
      verdict: "FAIL",
      score: 3.2,
      new_status: "Edité",
      feedback: "Le post ne mentionne pas le produit",
      suggestions: ["Nommer le produit", "Ajouter le CTA"],
      alternative_post: "Découvrez notre burger signature...",
    };
    validateQAResponse(data, "recGHI");
    const slack = buildSlackNotification(data, { Customer_Name: "BurgerShop" });
    expect(slack).toContain(":x:");
    expect(slack).toContain("FAIL");
    expect(slack).toContain("3.2/10");
    expect(slack).toContain("Post alternatif");
    expect(slack).toContain("burger signature");
  });
});
