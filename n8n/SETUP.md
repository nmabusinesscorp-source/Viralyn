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

## 2. Content Generation Flow

```
2 SOURCES DE CONTENU :

1. ROTATION AUTOMATIQUE (cron via n8n)
   ┌─────────────┐
   │  Schedule    │ (quotidien)
   └──────┬──────┘
          ▼
   Clients actifs (Airtable)
          │
          ▼
   Pour chaque client :
   ├─ Récupérer produits actifs
   ├─ Trier par Last_Featured_Date ASC (null first)
   ├─ Sélectionner le produit suivant
   ├─ Claude API → texte post + prompt visuel
   ├─ Génération image (via prompt visuel)
   ├─ Créer dans Content_Pipeline (Source: "Rotation")
   ├─ Mettre à jour Last_Featured_Date du produit
   └─ Appeler /agent/qa → QA automatique

2. DEMANDE CLIENT (Telegram bot)
   ┌─────────────────────────────────────┐
   │ Client Telegram : "Promo burgers    │
   │ -20% aujourd'hui !"                 │
   └──────┬──────────────────────────────┘
          ▼
   Bot parse avec Claude :
   ├─ Identifie le client (Telegram_Chat_ID)
   ├─ Extrait : produit, durée, brief
   ├─ Calcule Posts_Needed selon durée
   │   (1 jour → 1 post, 1 semaine → 3-5 posts)
   ├─ Crée Campaign (Source: "Telegram", Priority: "Haute")
   └─ Déclenche la génération immédiatement
          │
          ▼
   Content_Pipeline (Source: "Telegram")
          │
          ▼
   QA → Notification client Telegram
```

---

## 3. n8n Credentials

### Airtable
1. Go to n8n → **Credentials** → **Add Credential**
2. Select **Airtable Personal Access Token**
3. Scopes needed: `data.records:read`, `data.records:write`
4. Access to base `appGeibRFjtIvEGll`

### Environment Variables (n8n)
```
AIRTABLE_BASE_ID=appGeibRFjtIvEGll
```

---

## 4. Webhook Paths

| Workflow            | Path                          | Method |
|---------------------|-------------------------------|--------|
| Onboard Client      | `/webhook/onboard-client`     | POST   |
| QA Result           | `/webhook/qa-result`          | POST   |
| Generate Post       | `/webhook/generate-post`      | POST   |
| Telegram Bot        | `/webhook/telegram-bot`       | POST   |

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    VIRALYN SYSTEM v2.0                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TRIGGERS                                                        │
│  ├─ Cron (n8n Schedule) ──────────────────────┐                 │
│  └─ Telegram Bot ─────────────┐               │                 │
│                                │               │                 │
│  n8n WORKFLOWS                 ▼               ▼                 │
│  ├─ Generate Post ◄───── Campaign Check + Product Rotation      │
│  │   ├─ Claude API → texte + prompt_visual                      │
│  │   ├─ Image Gen → Generated_Visual                            │
│  │   └─ → Content_Pipeline (Brouillon)                          │
│  │                                                               │
│  ├─ Onboard Client → Customers + Products                       │
│  └─ QA Result → Content_Pipeline update                         │
│                                                                  │
│  EXPRESS AGENTS                                                  │
│  ├─ /agent/onboard → Claude (web_search) → n8n                  │
│  └─ /agent/qa → Claude (JSON eval) → n8n                        │
│                                                                  │
│  AIRTABLE                                                        │
│  ├─ Customers (profil unifié)                                    │
│  ├─ Products (catalogue + rotation)                              │
│  ├─ Content_Pipeline (posts + visuels + QA)                      │
│  ├─ Customer_Campaigns (campagnes planifiées + Telegram)         │
│  ├─ Publishing_Slot (créneaux)                                   │
│  ├─ Slot_Settings (planning récurrent)                           │
│  ├─ System_Prompts (prompts versionnés)                          │
│  └─ Commercial_Packages (offres)                                 │
│                                                                  │
│  NOTIFICATIONS                                                   │
│  ├─ Slack (équipe interne)                                       │
│  └─ Telegram (client — confirmation post)                        │
└──────────────────────────────────────────────────────────────────┘
```
