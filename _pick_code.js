// ─── Pick Product & Build Prompts ───────────────────────────
const webhook = $('Webhook').first().json.body;
const customer = $('Get Customer').first().json;
const products = $('Get Products').all().map(i => i.json);

// --- Error handling: no active products ---
if (products.length === 0) {
  return [{
    json: {
      _error: true,
      message: `Aucun produit actif pour ${customer.Customer_Name || webhook.customer_id}`,
      customer_id: customer.Customer_ID || webhook.customer_id
    }
  }];
}

// ── Fix: Airtable ASC sort puts NULL dates LAST. Re-sort so nulls come FIRST ──
products.sort((a, b) => {
  const dateA = a.Last_Featured_Date || null;
  const dateB = b.Last_Featured_Date || null;
  if (!dateA && !dateB) return 0;
  if (!dateA) return -1;
  if (!dateB) return 1;
  return dateA.localeCompare(dateB);
});

let product;
if (webhook.product_name) {
  product = products.find(p => p.Product_Name === webhook.product_name) || products[0];
} else {
  product = products[0];
}

const format = webhook.format || 'image';
const platform = webhook.platform || (format === 'video' ? 'TikTok' : 'Instagram');
const brief = webhook.brief || '';

// ── Route Blotato ID per platform ──
const blotato_client_id = platform === 'TikTok'
  ? (customer.Blotato_ID_TikTok || customer.Blotato_Client_ID || '')
  : (customer.Blotato_ID_Instagram || customer.Blotato_Client_ID || '');

// ══════════════════════════════════════════════════════════════
// LAYER 1 — UNIVERSAL ANTI-AI RULES (hardcoded, NEVER overridable)
// ══════════════════════════════════════════════════════════════
const ANTI_AI = {
  do: [
    'Natural imperfections: irregular shapes, uneven distribution, asymmetry',
    'Realistic textures with visible grain, pores, and surface variations',
    'Single coherent light source with natural shadows',
    'Only elements that logically belong with the product',
    'Vertical 9:16 composition centered for mobile viewing',
    'Depth of field consistent with a real camera lens (bokeh on background)',
    'Surfaces with natural wear, scratches, or patina'
  ],
  dont: [
    'No floating or levitating ingredients/objects',
    'No vapor, smoke, steam, or mist effects',
    'No particle effects (sparkles, dust clouds, splashes frozen mid-air)',
    'No text, logos, watermarks, or any overlay',
    'No perfectly symmetrical arrangements',
    'No identical-sized pieces or uniform distribution (dead giveaway of AI)',
    'No unnaturally saturated or neon colors',
    'No plastic or artificial-looking textures (cheese, sauce, skin)',
    'No garnishes or decorations not logically part of the actual product',
    'No white, gradient, or studio backgrounds — use contextual real surfaces',
    'No contradictory shadows from multiple light sources',
    'No flowers, petals, herbs, or leaves as decoration unless part of the recipe'
  ]
};

// ══════════════════════════════════════════════════════════════
// LAYER 2 — MARKET CREATIVE DIRECTION (customizable per client)
// ══════════════════════════════════════════════════════════════
const marketGuidelines = {
  'FRENCH tacos': {
    creative_do: 'Grilled tortilla with visible grill marks, golden-brown color. Cheese visibly melting from fresh cut cross-section. Show filling layers: meat, frites, melted cheese, sauce. Dark wooden board or kraft paper base. Warm side lighting at 45-degree angle. Realistic sauce drips on cut edge. Street food setting. Generous overflowing portions.',
    creative_dont: 'No Mexican-style toppings (no guacamole, salsa, jalapenos — this is FRENCH tacos). No clean-cut geometric slices.',
    photo_style: 'Dark moody street food photography',
    video_style: 'Cheese pull reveal, slow cross-section cut'
  },
  'Pizza': {
    creative_do: 'Round wooden board or dark slate. Cheese with realistic melt and browning spots (leopard spots). Crust with charred bubbles and flour dust. Oil glistening on surface. One slice pulled with cheese stretch. Warm overhead or 45-degree lighting. Scattered ingredients matching actual toppings only.',
    creative_dont: 'No perfectly round pizza (real pizzas are irregular). No basil on every pizza — only Margarita. No tomato slices unless in recipe.',
    photo_style: 'Rustic wood-fired overhead photography',
    video_style: 'Slice pull with cheese stretch'
  },
  'Restaurant Tha\u00eflandais Authentique - Cuisine Asiatique': {
    creative_do: 'Authentic Thai ceramic bowls (not white plates). Jasmine rice in separate bowl, lime wedge on side, chopsticks or Thai spoon. Curries with visible coconut oil layer and distinct herb pieces. Pad Thai with wok hei browning marks. Warm ambient restaurant lighting. 45-degree for curries, slight overhead for stir-fries. Only garnishes belonging to the specific dish.',
    creative_dont: 'No random herb garnishes not belonging to the dish. No Western plating style. No chopsticks standing upright. No sushi or Japanese elements. No bamboo mat backgrounds.',
    photo_style: 'Warm authentic restaurant photography',
    video_style: 'Gentle steam reveal, slow spoon stir'
  }
};

const market = customer.Customer_Market || '';
let creative = null;
for (const [key, val] of Object.entries(marketGuidelines)) {
  if (market.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(market.toLowerCase())) {
    creative = val;
    break;
  }
}

if (!creative) {
  creative = {
    creative_do: 'Appropriate surface for the product. Natural lighting. Elements that logically belong with the product.',
    creative_dont: '',
    photo_style: 'Commercial product photography',
    video_style: 'Simple product reveal'
  };
}

// Customer overrides — affect ONLY creative direction, NEVER anti-AI rules
if (customer.Visual_Do && customer.Visual_Do.trim()) {
  creative.creative_do = customer.Visual_Do.trim();
}
if (customer.Visual_Dont && customer.Visual_Dont.trim()) {
  creative.creative_dont = customer.Visual_Dont.trim();
}
if (customer.Photo_Reference_Style && customer.Photo_Reference_Style.trim()) {
  creative.photo_style = customer.Photo_Reference_Style.trim();
}
if (customer.Video_Reference_Style && customer.Video_Reference_Style.trim()) {
  creative.video_style = customer.Video_Reference_Style.trim();
}

// ══════════════════════════════════════════════════════════════
// BUILD CLAUDE PROMPTS
// ══════════════════════════════════════════════════════════════
const antiAiDoBlock = ANTI_AI.do.map(r => '- ' + r).join('\n');
const antiAiDontBlock = ANTI_AI.dont.map(r => '- ' + r).join('\n');
const creativeDontBlock = creative.creative_dont
  ? '\n### \u00c9l\u00e9ments \u00e0 \u00e9viter pour ce march\u00e9 :\n' + creative.creative_dont
  : '';

const claudeSystemPrompt = `Tu es le moteur de cr\u00e9ation de contenu de Viralyn, une agence de Social Media Management automatis\u00e9e.

# TA MISSION
G\u00e9n\u00e9rer des posts de r\u00e9seaux sociaux qui CONVERTISSENT. Pas du contenu g\u00e9n\u00e9rique \u2014 du contenu qui donne envie d'agir.

# R\u00c8GLES D'\u00c9CRITURE

## Structure du post
${platform === 'TikTok' ? `1. HOOK (1ère ligne) — Accroche CHOC en <3 secondes (question provocante, affirmation bold, pattern-interrupt)
2. CORPS (1-3 lignes max) — Message ultra-concis, storytelling natif
3. CTA (dernière ligne) — CTA natif TikTok (pas corporate)` : `1. HOOK (1ère ligne) — Accroche qui arrête le scroll
2. CORPS (3-6 lignes) — Proposition de valeur concrète
3. CTA (dernière ligne) — Call-to-action du client`}

## Ton & Style
- Adapte-toi au mood : ${customer.Mood || 'Chaleureux'}
${platform === 'TikTok' ? `- Ton UGC/authentique — comme si tu parlais à un pote
- JAMAIS de langage corporate, publicitaire ou marketing
- Phrases ultra-courtes, punchlines, énergie` : `- Écris comme un humain, phrases courtes et percutantes
- Tutoie ou vouvoie selon le mood`}

## Longueur
${platform === 'TikTok' ? `- Caption TikTok : 15-50 mots MAX (hors hashtags) — COURT et PUNCHY
- Hashtags : 3-5 trending + niche, en fin de caption` : `- Post image : 40-100 mots (hors hashtags)
- Post vidéo/reel : 20-50 mots
- Emojis : 3-5 max, pertinents. Hashtags : 5-8 en fin de post.`}

## R\u00e8gles absolues
- NOMME le produit dans le texte${platform === 'TikTok' ? ' (intégré naturellement, pas forcé)' : ''}
- INT\u00c8GRE le CTA du client
- Z\u00c9RO mensonge
- PAS de \"Chez [nom]\" en d\u00e9but

# \u2550\u2550\u2550 R\u00c8GLES VISUELLES \u2550\u2550\u2550

## \ud83d\udd12 INTERDICTIONS UNIVERSELLES (NON N\u00c9GOCIABLE)
Ces r\u00e8gles sont ABSOLUES et s'appliquent \u00e0 TOUS les visuels sans exception.

### Le visuel DOIT respecter :
${antiAiDoBlock}

### Le visuel ne doit JAMAIS contenir :
${antiAiDontBlock}

## \ud83c\udfa8 DIRECTION CR\u00c9ATIVE (sp\u00e9cifique au client)
### \u00c9l\u00e9ments visuels souhait\u00e9s :
${creative.creative_do}${creativeDontBlock}

### Style photo : ${creative.photo_style}
### Style vid\u00e9o : ${creative.video_style}

## R\u00e8gles techniques des prompts visuels
- prompt_visual : MAX 40 mots, en anglais, FORMAT VERTICAL 9:16 (portrait), commence par le cadrage
- prompt_video : MAX 35 mots, en anglais, FORMAT VERTICAL 9:16 (portrait), commence par le mouvement cam\u00e9ra
- Structure : [Cadrage/Mouvement] + [Sujet exact centr\u00e9] + [D\u00e9cor r\u00e9aliste] + [\u00c9clairage] + [Style]
- COMPOSITION VERTICALE OBLIGATOIRE : sujet centr\u00e9 verticalement
- INTERDIT dans les prompts : texte, logos, watermarks, \u00e9l\u00e9ments flottants, particules, fum\u00e9e, vapeur
- Le r\u00e9sultat doit \u00eatre INDISCERNABLE d'une vraie photo professionnelle

# FORMAT DE SORTIE
JSON valide uniquement :
{\n  \"post_text\": \"texte complet avec emojis et hashtags\",\n  \"prompt_visual\": \"english prompt for Imagen \u2014 MAX 40 words \u2014 VERTICAL 9:16\",\n  \"prompt_video\": \"english prompt for Veo \u2014 MAX 35 words \u2014 VERTICAL 9:16\"\n}`;

const claudeUserPrompt = `PRODUIT \u00c0 METTRE EN AVANT :
- Nom : ${product.Product_Name}
- Description : ${product.Description || 'N/A'}
- Prix : ${product.Price || 'Non affich\u00e9'}
- Mots-cl\u00e9s visuels : ${product.Visual_Keywords || 'N/A'}

PROFIL CLIENT :
- Entreprise : ${customer.Customer_Name}
- Secteur : ${customer.Customer_Market || 'N/A'}
- Cible : ${customer.Target_Personna || 'N/A'}
- CTA : ${customer.CTA || 'N/A'}
- Ton/Mood : ${customer.Mood || 'Chaleureux'}

DIRECTIVES VISUELLES :
- Style photo : ${customer.Visual_type || 'professional photography'}
- Style vid\u00e9o : ${customer.Visual_to_Video_type || 'dynamic product video'}
- Palette couleurs : ${customer.Color_Set || 'warm natural tones'}

PLATEFORME : ${platform}
FORMAT DEMAND\u00c9 : ${platform === 'TikTok' ? 'TikTok (hook <3s, UGC, caption courte, trending)' : (format === 'video' ? 'Reel Instagram (engageant, dynamique)' : 'Post Instagram (engageant)')}${brief ? '\nBRIEF : ' + brief : ''}

RAPPEL CRITIQUE : Les prompts visuels doivent respecter TOUTES les interdictions universelles (pas de fum\u00e9e, pas d'\u00e9l\u00e9ments flottants, pas de particules, pas de textures plastiques) ET la direction cr\u00e9ative sp\u00e9cifique. Le r\u00e9sultat doit ressembler \u00e0 une VRAIE photo professionnelle.`;

return [{
  json: {
    customer_id: customer.Customer_ID || webhook.customer_id,
    customer_name: customer.Customer_Name,
    customer_record_id: customer.id,
    product_name: product.Product_Name,
    product_record_id: product.id,
    format: format,
    source: webhook.source || 'Rotation',
    campaign_id: webhook.campaign_id || '',
    slot_time: webhook.slot_time || '',
    platform: platform,
    blotato_client_id: blotato_client_id,
    claude_system: claudeSystemPrompt,
    claude_user: claudeUserPrompt,
    fallback_prompt_visual: `Vertical portrait close-up of ${product.Product_Name} on a dark surface, ${customer.Color_Set || 'warm natural tones'}, soft natural light, shot on Sony A7III, vertical 9:16 composition, ${creative.photo_style}`,
    fallback_prompt_video: `Slow dolly in on ${product.Product_Name}, warm ambient lighting, shallow depth of field, ${creative.video_style}, 9:16 vertical`
  }
}];