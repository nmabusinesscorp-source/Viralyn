# n8n Setup Guide — Viralyn Agent System

## Prerequisites

- n8n instance running (self-hosted or cloud)
- Airtable account with Personal Access Token
- Slack webhook URL (already configured)

---

## 1. Airtable Base Setup

Create a base named **Viralyn** with the following tables:

### Table: `Customers`

| Field Name             | Type            | Notes                              |
|------------------------|-----------------|------------------------------------|
| Customer_ID            | Single line text| Primary key (e.g. LTH001)         |
| Customer_Name          | Single line text| Business name                      |
| Customer_Market        | Single line text| Sector (e.g. "Restauration")       |
| Customer_Adress        | Long text       | Full address                       |
| CTA                    | Single line text| Call to action (e.g. "Commande")   |
| Mood                   | Single line text| Communication tone                 |
| Visual_type            | Single line text| Visual style description           |
| Color_Set              | Single line text| Hex codes comma-separated          |
| Post_Frequency_Weekly  | Number          | Posts per week (3-5)               |
| Prompt_Text            | Long text       | LLM prompt template                |
| Customer_Status        | Single select   | Values: "En review", "Actif", "Inactif" |
| Source_URL             | URL             | Analyzed website                   |
| Platform               | Single select   | Values: "Instagram", "TikTok", "LinkedIn" |

### Table: `Products`

| Field Name      | Type            | Notes                              |
|-----------------|-----------------|------------------------------------|
| Product_Name    | Single line text| Product/service name               |
| Description     | Long text       | Product description                |
| Category        | Single select   | Entrée, Plat, Dessert, Boisson, Service, Produit |
| Price           | Number          | Price (nullable)                   |
| Is_Active       | Checkbox        | Active product flag                |
| Visual_Keywords | Single line text| Keywords for image generation      |
| Customer_ID     | Single line text| Link to Customers table            |

### Table: `Posts`

| Field Name       | Type            | Notes                              |
|------------------|-----------------|------------------------------------|
| Post_ID          | Single line text| Primary key                        |
| Post_Text        | Long text       | Generated post content             |
| Prompt_Visual    | Long text       | Image prompt                       |
| Product_Name     | Single line text| Featured product                   |
| Customer_ID      | Single line text| Link to Customers                  |
| Post_Status      | Single select   | "Brouillon", "Prêt à publier", "À revoir", "Publié" |
| QA_Verdict       | Single select   | "PASS", "WARN", "FAIL"            |
| QA_Score         | Number          | Score 0-10 (1 decimal)            |
| QA_Feedback      | Long text       | QA agent feedback                  |
| QA_Suggestions   | Long text       | JSON array of suggestions          |
| Alternative_Post | Long text       | Rewritten post (on FAIL)           |

---

## 2. n8n Credentials

### Airtable
1. Go to n8n → **Credentials** → **Add Credential**
2. Select **Airtable Personal Access Token**
3. Create a token at https://airtable.com/create/tokens with scopes:
   - `data.records:read`
   - `data.records:write`
   - Access to your Viralyn base
4. Save the credential

### Environment Variables (n8n)
In your n8n instance, set:
```
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
```
(Find this in Airtable URL: `airtable.com/appXXXXXX/...`)

---

## 3. Import Workflows

1. Open n8n → **Workflows** → **Import from File**
2. Import `workflow-onboard-client.json`
3. Import `workflow-qa-result.json`
4. In each workflow:
   - Click each Airtable node
   - Select your Airtable credential from the dropdown
   - Verify the base ID and table names match your setup
5. **Activate** both workflows

---

## 4. Configure Viralyn .env

After activating the workflows, copy the webhook URLs from n8n:

```env
# n8n webhook base URL (without trailing slash)
N8N_WEBHOOK_BASE_URL=https://your-n8n-domain.com/webhook

# Slack incoming webhook
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

The webhook paths are:
- **Onboarding**: `{N8N_WEBHOOK_BASE_URL}/onboard-client`
- **QA Result**: `{N8N_WEBHOOK_BASE_URL}/qa-result`

---

## 5. Test the Integration

### Test onboarding webhook:
```bash
curl -X POST https://your-n8n-domain.com/webhook/onboard-client \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "Customer_ID": "TST001",
      "Customer_Name": "Test Business",
      "Customer_Market": "Test",
      "Customer_Status": "En review"
    },
    "products": [{
      "Product_Name": "Test Product",
      "Description": "A test product",
      "Category": "Produit",
      "Price": 10,
      "Is_Active": true,
      "Visual_Keywords": "test"
    }]
  }'
```

### Test QA webhook:
```bash
curl -X POST https://your-n8n-domain.com/webhook/qa-result \
  -H "Content-Type: application/json" \
  -d '{
    "post_id": "POST-TEST-001",
    "verdict": "PASS",
    "score": 8.5,
    "new_status": "Prêt à publier",
    "feedback": "Test feedback",
    "suggestions": [],
    "details": {}
  }'
```

---

## Workflow Architecture

```
                     ┌──────────────┐
                     │   Viralyn    │
                     │   Server     │
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
    POST /onboard    POST /qa     Slack Webhook
         │               │             │
         ▼               ▼             ▼
    ┌─────────┐    ┌─────────┐   ┌─────────┐
    │  n8n    │    │  n8n    │   │  Slack  │
    │ Onboard │    │   QA    │   │  API    │
    └────┬────┘    └────┬────┘   └─────────┘
         │              │
    ┌────┴────┐    ┌────┴────┐
    │Airtable │    │Airtable │
    │Customers│    │  Posts   │
    │Products │    └─────────┘
    └─────────┘
```
