# n8n Setup Guide — Viralyn Agent System

## Prerequisites

- n8n instance running (self-hosted or cloud)
- Airtable account with Personal Access Token
- Slack webhook URL (already configured)
- Telegram Bot Token (for client requests)

---

## 1. Airtable Base Setup

Base ID: `appGeibRFjtIvEGll`

### Table: `Customers` (tblJfTazPuRQVVTGa)

Table client unifiée — profil, config créative, contacts, liens campagnes/packages/prompts.

| Field Name                    | Type                  | Notes                                      |
|-------------------------------|-----------------------|--------------------------------------------|
| Customer_ID                   | Single line text      | PK (ex: LOS-04899)                         |
| Customer_Name                 | Single line text      | Nom commercial                             |
| Customer_Status               | Single select         | Actif / Inactif / Prospect                 |
| Customer_Adress               | Single line text      | Adresse complète                           |
| Customer_Market               | Single line text      | Secteur (Pizza, FRENCH tacos, etc.)        |
| Customer_Contact              | Single line text      | Nom du contact principal                   |
| Customer_Email                | Email                 | Email de contact                           |
| Customer_Phone                | Phone number          | Téléphone                                  |
| Customer_Website              | URL                   | Site web                                   |
| Telegram_Chat_ID              | Single line text      | ID Telegram pour demandes à la volée       |
| Blotato_Client_ID             | Single line text      | ID Blotato                                 |
| Target_Personna               | Single line text      | Persona cible                              |
| CTA                           | Long text             | Call to action                             |
| Mood                          | Long text             | Ton de communication                       |
| Visual_type                   | Long text             | Style visuel (photo)                       |
| Visual_to_Video_type          | Long text             | Style visuel (vidéo/reels)                 |
| Color_Set                     | Single line text      | Palette couleurs                           |
| Product                       | Long text             | Catalogue produits (JSON legacy)           |
| Customer_Catalogue            | Single line text      | Liste produits (texte)                     |
| Logo                          | Attachments           | Logo du client                             |
| Background                    | Attachments           | Image de fond par défaut                   |
| Activ_Package                 | Link → Packages       | Package commercial actif                   |
| Post_Frequency                | Lookup                | Fréquence posts/semaine (via package)      |
| Activ_Prompt_Post             | Link → System_Prompts | Prompt actif pour texte post               |
| Activ_Prompt_Visual           | Link → System_Prompts | Prompt actif pour visuel                   |
| Activ_Prompt_Visual_to_Video  | Link → System_Prompts | Prompt actif pour vidéo                    |
| Prompt_Text                   | Lookup                | Contenu prompt texte (via link)            |
| Prompt_Visual                 | Lookup                | Contenu prompt visuel (via link)           |
| Prompt_Visual_to_Video        | Lookup                | Contenu prompt vidéo (via link)            |
| Customer_Campaigns            | Link → Campaigns      | Campagnes associées                        |
| Activ_Campaign_Title          | Lookup                | Titre campagne active (via link)           |
| Social Media Keys & Tokens    | Single line text      | Clés API réseaux sociaux                   |
| Workflow_Input                | Single line text      | Input workflow n8n                         |

### Table: `Products` (tblKC0gfX8UmbhpOH)

| Field Name         | Type            | Notes                                        |
|--------------------|-----------------|----------------------------------------------|
| Product_Name       | Single line text| Nom du produit/service                       |
| Description        | Long text       | Description détaillée                        |
| Category           | Single select   | Entrée / Plat / Dessert / Boisson / Service / Produit |
| Price              | Currency        | Prix (nullable)                              |
| Is_Active          | Checkbox        | Produit actif                                |
| Visual_Keywords    | Single line text| Mots-clés pour génération d'image            |
| Customer_ID        | Single line text| Lien vers Customers                          |
| Customer_Name      | Single line text| Nom commercial du client                     |
| **Last_Featured_Date** | **Date**    | **Dernière mise en avant — rotation produit** |

### Table: `Content_Pipeline` (tbl6OlJbVl9XV8Tw3)

Pipeline de contenu — du brouillon à la publication.

| Field Name         | Type            | Notes                                        |
|--------------------|-----------------|----------------------------------------------|
| Customer_Name      | Long text       | Nom du client                                |
| Customer_ID        | Single line text| Lien vers Customers                          |
| Status             | Single select   | Draft / Edité / Prêt à publier / Validé / Planifié / Posté / Erreur |
| Platform           | Single select   | Instagram / TikTok                           |
| Post               | Long text       | Texte du post                                |
| Img                | Attachments     | Image uploadée manuellement                  |
| **Generated_Visual** | **Attachments** | **Visuel généré (image finale pour publication)** |
| URL_Visual         | URL             | URL du visuel externe                        |
| ID_Drive           | Long text       | ID Google Drive                              |
| Prompt_Visual      | Long text       | Prompt utilisé pour générer l'image          |
| Prompt_Video       | Long text       | Prompt utilisé pour générer la vidéo         |
| Video_Status       | Single select   | Pending / Generating / Ready / Error         |
| **Product_Name**   | **Single line** | **Produit mis en avant (tracking rotation)** |
| **Campaign_ID**    | **Single line** | **ID campagne liée (null si rotation)**      |
| **Source**         | **Single select** | **Rotation / Campaign / Telegram**         |
| Post_Planning      | Single line text| Planning de publication                      |
| PublishAt          | DateTime        | Date/heure de publication prévue             |
| PostedAt           | DateTime        | Date/heure de publication effective          |
| Slot_ID            | Single line text| Lien vers Publishing_Slot                    |
| Blotato_ID         | Single line text| ID Blotato                                   |
| QA_Verdict         | Single select   | PASS / WARN / FAIL                          |
| QA_Score           | Number (0.1)    | Score QA 0-10                                |
| QA_Feedback        | Long text       | Feedback QA                                  |
| QA_Suggestions     | Long text       | Suggestions QA (JSON)                        |
| Alternative_Post   | Long text       | Post alternatif (si FAIL)                    |
| Created            | Created time    | Auto                                         |
| Last Modified      | Last modified   | Auto                                         |

### Table: `Customer_Campaigns` (tblEY1A45MzgUe3ES)

| Field Name                  | Type              | Notes                                    |
|-----------------------------|-------------------|------------------------------------------|
| Campaign_Title              | Single line text  | Nom de la campagne                       |
| Customer_Name               | Link → Customers  | Client associé                           |
| Start Date                  | Date              | Début                                    |
| End Date                    | Date              | Fin                                      |
| Duration                    | Formula           | Durée auto-calculée                      |
| Status                      | Formula           | Auto basé sur dates (Active/Terminée/À venir) |
| Objectives                  | Long text         | Objectifs de la campagne                 |
| Channels                    | Multiple selects  | Facebook, Instagram, TikTok, etc.        |
| Budget                      | Currency          | Budget alloué                            |
| **Posts_Needed**            | **Number**        | **Nombre de posts à générer**            |
| **Posts_Generated**         | **Number**        | **Compteur posts générés**               |
| **Priority**                | **Single select** | **Haute / Normale / Basse**              |
| **Source**                  | **Single select** | **Planifiée / Telegram / Manuel**        |
| **Brief**                   | **Long text**     | **Instructions spécifiques du client**   |
| Performance Metrics         | Long text         | Métriques de performance                 |
| Campaign Visuals            | Attachments       | Visuels de la campagne                   |
| Campaign Summary (AI)       | AI text           | Résumé auto-généré                       |
| Optimization Suggestions    | AI text           | Suggestions auto-générées                |
| Associated Package          | Link → Packages   | Package commercial                       |
| System Prompt Used          | Link → Prompts    | Prompt système utilisé                   |

### Table: `Publishing_Slot` (tblWXtVqQT2hfEgn3)

| Field Name       | Type            | Notes                              |
|------------------|-----------------|------------------------------------|
| SlotDateTime     | DateTime        | Créneau de publication             |
| Status           | Single select   | Posted / Reserved / Available      |
| Customer_ID_Text | Single line text| ID client                          |
| Post_ID          | Single line text| ID du post associé                 |

### Table: `Slot_Settings` (tbllHM4ThwRmD52e0)

| Field Name    | Type            | Notes                              |
|---------------|-----------------|------------------------------------|
| Schedule_ID   | Auto number     | PK                                 |
| Customer_ID   | Single line text| ID client                          |
| Customer_Name | Single line text| Nom client                         |
| Day_of_Week   | Number          | 0=Dim, 1=Lun, ..., 6=Sam          |
| Time          | Single line text| Heure de publication (HH:mm)       |
| TimeZone      | Single select   | Europe/Zurich                      |
| Active        | Checkbox        | Créneau actif                      |

### Table: `System_Prompts` (tblfLIc6UFvVdUrRP)

| Field Name       | Type            | Notes                              |
|------------------|-----------------|------------------------------------|
| ID_Prompt        | Long text       | Identifiant du prompt              |
| Role             | Single select   | SYSTEM / USER                      |
| Status           | Single select   | Draft / Actif / Archive / Dév      |
| Prompt           | Long text       | Contenu du prompt                  |
| Activité         | Single select   | Marketing / Restauration / Industrie |
| Catégorie        | Single select   | Agence / FastFood / Petrol / Italienne |
| Linked_Customer  | Single line text| Client lié                         |

### Table: `Commercial_Packages` (tbl09x6UXzmNYcck2)

| Field Name           | Type            | Notes                              |
|----------------------|-----------------|------------------------------------|
| Package_Name         | Single line text| Nom du package                     |
| Package_Description  | Long text       | Description                        |
| Package_Details      | Long text       | Détails                            |
| Post_Frequency(Weekly)| Number         | Posts par semaine                  |
| Monthly_Price        | Currency        | Prix mensuel                       |

---

## 2. n8n Workflows

### Workflow: Content Scheduler (`workflow-content-scheduler.json`)
Cron quotidien → planifie la génération de contenu pour chaque client actif.

```
Daily 06:00 (Europe/Zurich)
    │
    ├─ Get Active Clients (Airtable)
    ├─ Get All Slot Settings (Airtable)
    └─ Get Active Campaigns (Airtable)
         │
         ▼
    Code: Plan Generation Tasks
    ├─ Match clients ↔ today's slots (Day_of_Week)
    ├─ Alternate formats: image/image/video pattern
    ├─ Check campaign priority (Posts_Generated < Posts_Needed)
    └─ Output: array of generation tasks
         │
         ▼
    SplitInBatches → Call Generate Post → Wait 10s → Loop
```

**Format alternation:**
- ≤2 slots/jour: dernier = video
- 3+ slots/jour: chaque 3ème = video
- Ex: 5 slots → image, image, **video**, image, **video**

### Workflow: Generate Post (`workflow-generate-post.json`)
Sub-workflow appelable par Scheduler, Telegram bot, ou API manuelle.

```
POST /webhook/generate-post
{
  "customer_id": "LOS-04899",
  "format": "image" | "video",
  "source": "Rotation" | "Campaign" | "Telegram",
  "product_name": "",    // auto-rotate if empty
  "campaign_id": "",     // optional
  "brief": "",           // optional
  "slot_time": ""        // ISO-8601 optional
}
    │
    ├─ Airtable: Get Customer config
    └─ Airtable: Get Products (sorted by Last_Featured_Date ASC)
         │
         ▼
    Code: Pick Product & Build Prompts
    ├─ Rotation: product with oldest Last_Featured_Date
    ├─ Or explicit product (campaign/telegram)
    └─ Build Claude prompt with customer persona
         │
         ▼
    HTTP Request: Claude API → JSON {post_text, prompt_visual, prompt_video}
         │
         ▼
    Parse Claude Response
         │
         ▼
    Switch: Image or Video?
    ├─ Image → Gemini Imagen 3.0 (generate image)
    └─ Video → Gemini Veo 2.0 (generate video 9:16, 8s)
         │
         ▼
    Merge Media
         │
         ▼
    Create Content_Pipeline record (Airtable)
         │
    ├─ Update Product.Last_Featured_Date
    └─ Create Publishing_Slot
         │
         ▼
    Trigger QA (/agent/qa)
         │
         ▼
    Respond Success
```

### Workflow: Onboard Client (`workflow-onboard-client.json`)
Webhook → Create customer + products in Airtable.

### Workflow: QA Result (`workflow-qa-result.json`)
Webhook → Update Content_Pipeline with QA verdict.

---

## 3. n8n Credentials

### Required credentials in n8n:

| Credential            | Type                         | Used by                        |
|-----------------------|------------------------------|--------------------------------|
| Airtable              | Personal Access Token        | All Airtable nodes             |
| Google Gemini         | Google PaLM API Key          | Image + Video generation       |
| *(optional)* Blotato  | Blotato API Key              | Auto-publish to social         |

> **Note :** Les env vars n8n (`$env.XXX`) ne sont disponibles que sur le plan Enterprise.
> Toutes les valeurs (Base ID, URLs) sont hardcodées directement dans les noeuds.
> Seule la clé Anthropic API doit être remplacée manuellement dans le noeud
> **"Claude — Generate Text"** du workflow Generate Post (`YOUR_ANTHROPIC_API_KEY`).

### Valeurs hardcodées dans les workflows

| Valeur                    | Emplacement dans les noeuds            |
|---------------------------|----------------------------------------|
| `appGeibRFjtIvEGll`       | Tous les noeuds Airtable (Base ID)     |
| `YOUR_ANTHROPIC_API_KEY`  | Claude — Generate Text (header x-api-key) |
| `http://localhost:3000`   | Trigger QA (URL du serveur Express)    |
| `https://n8n.srv1000420.hstgr.cloud/webhook/generate-post` | Content Scheduler → Call Generate Post |

---

## 4. Express Server Endpoints

| Endpoint            | Method | Description                                     |
|---------------------|--------|-------------------------------------------------|
| `/health`           | GET    | Health check                                    |
| `/agent/onboard`    | POST   | ⚠️ Deprecated — now handled directly in n8n form workflow |
| `/agent/qa`         | POST   | Claude JSON eval → QA verdict                   |
| `/agent/generate`   | POST   | Proxy → triggers n8n generate-post webhook      |

### Generate endpoint (for Telegram bot / manual trigger):
```bash
curl -X POST http://localhost:3000/agent/generate \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "LOS-04899",
    "format": "video",
    "source": "Telegram",
    "brief": "Promo -20% sur tous les tacos ce weekend"
  }'
```

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     VIRALYN SYSTEM v2.0                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  TRIGGERS                                                            │
│  ├─ Cron (n8n Schedule 06:00)                                       │
│  ├─ POST /agent/generate (Express)                                  │
│  └─ Telegram Bot (future)                                           │
│       │         │              │                                     │
│       ▼         ▼              ▼                                     │
│  ┌────────────────────────────────────────┐                         │
│  │   n8n: Content Scheduler               │ (cron only)             │
│  │   ├─ Fetch clients + slots + campaigns │                         │
│  │   ├─ Plan tasks for today              │                         │
│  │   └─ Call Generate Post × N            │                         │
│  └────────────────┬───────────────────────┘                         │
│                   ▼                                                  │
│  ┌────────────────────────────────────────┐                         │
│  │   n8n: Generate Post                   │ (webhook)               │
│  │   ├─ Get Customer + Products           │                         │
│  │   ├─ Product Rotation (or explicit)    │                         │
│  │   ├─ Claude API → texte + prompts      │                         │
│  │   ├─ Gemini Imagen → photo (1024px)    │ ← IMAGE branch         │
│  │   ├─ Gemini Veo → vidéo (9:16, 8s)    │ ← VIDEO branch         │
│  │   ├─ → Content_Pipeline (Draft)        │                         │
│  │   ├─ → Product.Last_Featured_Date      │                         │
│  │   ├─ → Publishing_Slot (Reserved)      │                         │
│  │   └─ → /agent/qa (QA check)           │                         │
│  └────────────────────────────────────────┘                         │
│                                                                      │
│  ┌────────────────────────────────────────┐                         │
│  │   n8n: Formulaire Onboarding Client   │ (form trigger)          │
│  │   ├─ Form → Claude API (web_search)    │                         │
│  │   ├─ Parse JSON → Create Customer      │                         │
│  │   └─ Split Products → Create Products  │                         │
│  └────────────────────────────────────────┘                         │
│                                                                      │
│  ┌────────────────────────────────────────┐                         │
│  │   Express: Agent Server (:3000)        │                         │
│  │   ├─ POST /agent/qa (Claude)           │                         │
│  │   └─ POST /agent/generate (→ n8n)      │                         │
│  └────────────────────────────────────────┘                         │
│                                                                      │
│  AIRTABLE (appGeibRFjtIvEGll)                                       │
│  ├─ Customers ──── profil unifié + config créative                  │
│  ├─ Products ───── catalogue + Last_Featured_Date (rotation)        │
│  ├─ Content_Pipeline ── posts + visuels + QA + Source               │
│  ├─ Customer_Campaigns ─ campagnes + Posts_Needed/Generated         │
│  ├─ Publishing_Slot ─── créneaux de publication                     │
│  ├─ Slot_Settings ───── planning récurrent (jour + heure)           │
│  ├─ System_Prompts ──── prompts versionnés par client               │
│  └─ Commercial_Packages ── offres et pricing                        │
│                                                                      │
│  NOTIFICATIONS                                                       │
│  ├─ Slack (équipe interne)                                          │
│  └─ Telegram (client — confirmation post, future)                   │
└──────────────────────────────────────────────────────────────────────┘
```
