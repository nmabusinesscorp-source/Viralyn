"""
Deploy Viralyn n8n workflows via API.
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
BASE_ID = "appGeibRFjtIvEGll"  # Content_Creator_Engine (V1 — active)

# V1 table IDs
CUSTOMER_DATA_TABLE = "tblNie3b1sdkWVhuA"
CUSTOMER_SETTINGS_TABLE = "tblJfTazPuRQVVTGa"
PRODUCTS_TABLE = "tblKC0gfX8UmbhpOH"
CONTENT_PIPELINE_TABLE = "tbl6OlJbVl9XV8Tw3"

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
        print(f"HTTP Error {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)

# ═══════════════════════════════════════════════════════════
# WORKFLOW 1: Viralyn_Agent_Onboard_Client
# ═══════════════════════════════════════════════════════════
onboard_workflow = {
    "name": "Viralyn_Agent_Onboard_Client",
    "settings": {"executionOrder": "v1"},
    "nodes": [
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "onboard-client",
                "responseMode": "responseNode",
                "options": {}
            },
            "id": "a1000001-0001-0001-0001-000000000001",
            "name": "Webhook Onboard",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [240, 300],
            "webhookId": "onboard-client"
        },
        {
            "parameters": {
                "operation": "create",
                "base": {"__rl": True, "mode": "id", "value": BASE_ID},
                "table": {"__rl": True, "mode": "id", "value": "tblO28V5AfH0q2Z1H"},
                "columns": {
                    "mappingMode": "defineBelow",
                    "value": {
                        "Customer_ID": "={{ $json.body.customer.Customer_ID }}",
                        "Name": "={{ $json.body.customer.Customer_Name }}",
                        "Market": "={{ $json.body.customer.Customer_Market }}",
                        "Address": "={{ $json.body.customer.Customer_Adress }}",
                        "Website": "={{ $json.body.customer.Source_URL }}",
                        "Status": "Prospect"
                    }
                },
                "options": {}
            },
            "id": "a1000001-0001-0001-0001-000000000002",
            "name": "Create Customer",
            "type": "n8n-nodes-base.airtable",
            "typeVersion": 2.1,
            "position": [520, 120],
            "credentials": {"airtableTokenApi": AIRTABLE_CRED}
        },
        {
            "parameters": {
                "operation": "create",
                "base": {"__rl": True, "mode": "id", "value": BASE_ID},
                "table": {"__rl": True, "mode": "id", "value": "tblC1cidrEtj7xygR"},
                "columns": {
                    "mappingMode": "defineBelow",
                    "value": {
                        "Config_ID": "={{ $json.body.customer.Customer_ID + '_IG' }}",
                        "Platform": "={{ $json.body.customer.Platform || 'Instagram' }}",
                        "Posting_Frequency": "={{ $json.body.customer.Post_Frequency_Weekly }}",
                        "Tone_Guidelines": "={{ $json.body.customer.Mood }}",
                        "CTA_Templates": "={{ $json.body.customer.CTA }}",
                        "Brand_Colors": "={{ $json.body.customer.Color_Set }}",
                        "Visual_Style": "={{ $json.body.customer.Visual_type }}",
                        "Status": "Active"
                    }
                },
                "options": {}
            },
            "id": "a1000001-0001-0001-0001-000000000003",
            "name": "Create Customer Config",
            "type": "n8n-nodes-base.airtable",
            "typeVersion": 2.1,
            "position": [520, 340],
            "credentials": {"airtableTokenApi": AIRTABLE_CRED}
        },
        {
            "parameters": {
                "assignments": {
                    "assignments": [
                        {"id": "p1", "name": "products", "value": "={{ $json.body.products }}", "type": "array"},
                        {"id": "p2", "name": "customer_id", "value": "={{ $json.body.customer.Customer_ID }}", "type": "string"}
                    ]
                },
                "options": {}
            },
            "id": "a1000001-0001-0001-0001-000000000004",
            "name": "Set Products Data",
            "type": "n8n-nodes-base.set",
            "typeVersion": 3.4,
            "position": [520, 560]
        },
        {
            "parameters": {"fieldToSplitOut": "products", "options": {}},
            "id": "a1000001-0001-0001-0001-000000000005",
            "name": "Split Products",
            "type": "n8n-nodes-base.splitOut",
            "typeVersion": 1,
            "position": [740, 560]
        },
        {
            "parameters": {
                "operation": "create",
                "base": {"__rl": True, "mode": "id", "value": BASE_ID},
                "table": {"__rl": True, "mode": "id", "value": "tbliKTfqYtHD6X2dv"},
                "columns": {
                    "mappingMode": "defineBelow",
                    "value": {
                        "Item_Name": "={{ $json.Product_Name }}",
                        "Description": "={{ $json.Description }}",
                        "Category": "={{ $json.Category }}",
                        "Price": "={{ $json.Price }}",
                        "Ready": "={{ $json.Is_Active }}",
                        "Prompt_IMG": "={{ $json.Visual_Keywords }}"
                    }
                },
                "options": {}
            },
            "id": "a1000001-0001-0001-0001-000000000006",
            "name": "Create Products",
            "type": "n8n-nodes-base.airtable",
            "typeVersion": 2.1,
            "position": [960, 560],
            "credentials": {"airtableTokenApi": AIRTABLE_CRED}
        },
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ JSON.stringify({ success: true, customer_id: $('Webhook Onboard').item.json.body.customer.Customer_ID, message: 'Customer, config and products created' }) }}"
            },
            "id": "a1000001-0001-0001-0001-000000000007",
            "name": "Respond Success",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [1200, 300]
        }
    ],
    "connections": {
        "Webhook Onboard": {
            "main": [[
                {"node": "Create Customer", "type": "main", "index": 0},
                {"node": "Create Customer Config", "type": "main", "index": 0},
                {"node": "Set Products Data", "type": "main", "index": 0}
            ]]
        },
        "Create Customer": {
            "main": [[{"node": "Respond Success", "type": "main", "index": 0}]]
        },
        "Set Products Data": {
            "main": [[{"node": "Split Products", "type": "main", "index": 0}]]
        },
        "Split Products": {
            "main": [[{"node": "Create Products", "type": "main", "index": 0}]]
        }
    }
}

# ═══════════════════════════════════════════════════════════
# WORKFLOW 2: Viralyn_Agent_QA_Result
# ═══════════════════════════════════════════════════════════
qa_workflow = {
    "name": "Viralyn_Agent_QA_Result",
    "settings": {"executionOrder": "v1"},
    "nodes": [
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "qa-result",
                "responseMode": "responseNode",
                "options": {}
            },
            "id": "b1000001-0001-0001-0001-000000000001",
            "name": "Webhook QA",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [240, 300],
            "webhookId": "qa-result"
        },
        {
            "parameters": {
                "operation": "search",
                "base": {"__rl": True, "mode": "id", "value": BASE_ID},
                "table": {"__rl": True, "mode": "id", "value": "tbl6OlJbVl9XV8Tw3"},
                "filterByFormula": "={Slot_ID} = '{{ $json.body.post_id }}'",
                "options": {"limit": 1}
            },
            "id": "b1000001-0001-0001-0001-000000000002",
            "name": "Find Post",
            "type": "n8n-nodes-base.airtable",
            "typeVersion": 2.1,
            "position": [480, 300],
            "credentials": {"airtableTokenApi": AIRTABLE_CRED}
        },
        {
            "parameters": {
                "conditions": {
                    "options": {"leftValue": "", "typeValidation": "strict"},
                    "combinator": "and",
                    "conditions": [
                        {
                            "id": "check-found",
                            "leftValue": "={{ $json.id }}",
                            "rightValue": "",
                            "operator": {"type": "string", "operation": "isNotEmpty"}
                        }
                    ]
                }
            },
            "id": "b1000001-0001-0001-0001-000000000003",
            "name": "Post Found?",
            "type": "n8n-nodes-base.if",
            "typeVersion": 2,
            "position": [700, 300]
        },
        {
            "parameters": {
                "operation": "update",
                "base": {"__rl": True, "mode": "id", "value": BASE_ID},
                "table": {"__rl": True, "mode": "id", "value": "tbl6OlJbVl9XV8Tw3"},
                "id": "={{ $('Find Post').item.json.id }}",
                "columns": {
                    "mappingMode": "defineBelow",
                    "value": {
                        "QA_Verdict": "={{ $('Webhook QA').item.json.body.verdict }}",
                        "QA_Score": "={{ $('Webhook QA').item.json.body.score }}",
                        "QA_Feedback": "={{ $('Webhook QA').item.json.body.feedback }}",
                        "QA_Suggestions": "={{ JSON.stringify($('Webhook QA').item.json.body.suggestions || []) }}",
                        "Status": "={{ $('Webhook QA').item.json.body.new_status }}",
                        "Alternative_Post": "={{ $('Webhook QA').item.json.body.alternative_post || '' }}"
                    }
                },
                "options": {}
            },
            "id": "b1000001-0001-0001-0001-000000000004",
            "name": "Update Post",
            "type": "n8n-nodes-base.airtable",
            "typeVersion": 2.1,
            "position": [960, 200],
            "credentials": {"airtableTokenApi": AIRTABLE_CRED}
        },
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ JSON.stringify({ success: true, post_id: $('Webhook QA').item.json.body.post_id, verdict: $('Webhook QA').item.json.body.verdict }) }}"
            },
            "id": "b1000001-0001-0001-0001-000000000005",
            "name": "Respond Updated",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [1200, 200]
        },
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ JSON.stringify({ success: false, error: 'Post not found', post_id: $('Webhook QA').item.json.body.post_id }) }}",
                "options": {"responseCode": 404}
            },
            "id": "b1000001-0001-0001-0001-000000000006",
            "name": "Respond Not Found",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [1200, 440]
        }
    ],
    "connections": {
        "Webhook QA": {
            "main": [[{"node": "Find Post", "type": "main", "index": 0}]]
        },
        "Find Post": {
            "main": [[{"node": "Post Found?", "type": "main", "index": 0}]]
        },
        "Post Found?": {
            "main": [
                [{"node": "Update Post", "type": "main", "index": 0}],
                [{"node": "Respond Not Found", "type": "main", "index": 0}]
            ]
        },
        "Update Post": {
            "main": [[{"node": "Respond Updated", "type": "main", "index": 0}]]
        }
    }
}

# ═══════════════════════════════════════════════════════════
# Deploy both workflows
# ═══════════════════════════════════════════════════════════
print("Creating onboard-client workflow...")
r1 = n8n_request("POST", "workflows", onboard_workflow)
wf1_id = r1["id"]
print(f"  Created: {wf1_id} ({r1['name']})")

print("Creating qa-result workflow...")
r2 = n8n_request("POST", "workflows", qa_workflow)
wf2_id = r2["id"]
print(f"  Created: {wf2_id} ({r2['name']})")

# Activate both
print("\nActivating workflows...")
n8n_request("POST", f"workflows/{wf1_id}/activate")
print(f"  {wf1_id} activated")
n8n_request("POST", f"workflows/{wf2_id}/activate")
print(f"  {wf2_id} activated")

print("\nDone! Both workflows are live.")
