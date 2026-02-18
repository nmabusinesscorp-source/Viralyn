"""
Deploy Viralyn n8n workflows via API.

Loads workflow definitions from JSON files (single source of truth)
and deploys them to the n8n instance.

Usage: N8N_API_KEY=xxx python3 deploy-workflows.py
"""
import urllib.request
import json
import os
import sys

N8N_URL = os.environ.get("N8N_API_URL", "https://n8n.srv1000420.hstgr.cloud/api/v1")
N8N_KEY = os.environ.get("N8N_API_KEY")
if not N8N_KEY:
    print("Error: N8N_API_KEY environment variable required", file=sys.stderr)
    sys.exit(1)

AIRTABLE_CRED = {"id": "YtjWlkMv0kUOReCD", "name": "Airtable Personal Access Token account"}
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


# ─── API helper ──────────────────────────────────────────
def n8n_request(method, path, data=None):
    url = f"{N8N_URL}/{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("X-N8N-API-KEY", N8N_KEY)
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"HTTP Error {e.code}: {error_body}", file=sys.stderr)
        return None


def load_workflow(filename):
    """Load a workflow JSON file and fix credential references."""
    filepath = os.path.join(SCRIPT_DIR, filename)
    with open(filepath, "r") as f:
        wf = json.load(f)

    # Remove read-only fields rejected by the API
    wf.pop("tags", None)

    # Fix nodes
    for node in wf.get("nodes", []):
        # Fix Airtable credentials
        if node.get("type", "").startswith("n8n-nodes-base.airtable"):
            node["credentials"] = {"airtableTokenApi": AIRTABLE_CRED}
        # Sticky notes: merge parameters_extra into parameters
        if "parameters_extra" in node:
            node["parameters"].update(node.pop("parameters_extra"))

    return wf


def find_existing_workflow(name):
    """Search for an existing workflow by name."""
    result = n8n_request("GET", "workflows")
    if not result:
        return None
    for wf in result.get("data", []):
        if wf["name"] == name:
            return wf["id"]
    return None


def deploy_workflow(filename, activate=True):
    """Deploy a workflow: update if exists, create if new."""
    wf = load_workflow(filename)
    name = wf["name"]

    existing_id = find_existing_workflow(name)

    if existing_id:
        print(f"  Updating existing workflow: {name} (id={existing_id})")
        result = n8n_request("PUT", f"workflows/{existing_id}", wf)
        if not result:
            print(f"  FAILED to update {name}", file=sys.stderr)
            return None
        wf_id = existing_id
    else:
        print(f"  Creating new workflow: {name}")
        result = n8n_request("POST", "workflows", wf)
        if not result:
            print(f"  FAILED to create {name}", file=sys.stderr)
            return None
        wf_id = result["id"]

    if activate:
        n8n_request("POST", f"workflows/{wf_id}/activate")
        print(f"  Activated: {wf_id}")
    else:
        print(f"  Created (inactive): {wf_id}")

    return wf_id


# ─── Deploy all workflows ────────────────────────────────
WORKFLOWS = [
    ("workflow-onboard-form.json", True),      # Form → appelle l'agent Express
    ("workflow-onboard-client.json", True),     # CRUD Airtable (webhook interne)
    ("workflow-qa-result.json", True),          # QA verdict → Airtable
    ("workflow-generate-post.json", True),      # Génération de contenu
    ("workflow-content-scheduler.json", True),  # Cron quotidien
]

print(f"Deploying {len(WORKFLOWS)} workflows to {N8N_URL}...\n")

deployed = []
for filename, activate in WORKFLOWS:
    filepath = os.path.join(SCRIPT_DIR, filename)
    if not os.path.exists(filepath):
        print(f"  SKIP: {filename} (file not found)")
        continue
    wf_id = deploy_workflow(filename, activate)
    if wf_id:
        deployed.append((filename, wf_id))
    print()

print(f"Done! {len(deployed)}/{len(WORKFLOWS)} workflows deployed.")
for filename, wf_id in deployed:
    print(f"  {filename} → {wf_id}")
