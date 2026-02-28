// ── data from Claude ────────────────────────────────────────
const data = $('Parse Claude Response').first().json;

// ── upstream metadata (bypasses Claude API which strips non-prompt fields) ──
const upstream = $('Pick Product & Build Prompts').first().json;

// ── media from Supabase upload response ─────────────────
const uploadResponse = $input.first().json;
const mediaItem = $input.first();

// Build Supabase public URL from the upload response Key
const supabaseUrl = 'https://joibrhvnkmeisbalkilu.supabase.co';
const bucketPath = uploadResponse.Key || '';
const publicUrl = bucketPath
  ? supabaseUrl + '/storage/v1/object/public/' + bucketPath
  : (data.format === 'video' ? (mediaItem.json.url || '') : '');

// ── build record ────────────────────────────────────────
const record = {
  Customer_Name:  data.customer_name,
  Customer_ID:    data.customer_id,
  Status:         'Draft',
  Platform:       upstream.platform || data.platform || (data.format === 'video' ? 'TikTok' : 'Instagram'),
  Post:           data.post_text,
  Prompt_Visual:  data.prompt_visual,
  Prompt_Video:   data.prompt_video || '',
  Product_Name:   data.product_name,
  Campaign_ID:    data.campaign_id || '',
  Source:         data.source || '',
  Video_Status:   data.format === 'video' ? 'Ready' : undefined,
  URL_Visual:     publicUrl,

  // Airtable attachment array for Media field (thumbnail/preview)
  Media: publicUrl ? [{ url: publicUrl }] : [],

  // internal pass-through (read from upstream node, not Claude response)
  _product_record_id:  upstream.product_record_id  || '',
  _customer_record_id: upstream.customer_record_id || '',
  _format:             upstream.format || data.format,
  Blotato_ID:          upstream.blotato_client_id  || '',
  _blotato_client_id:  upstream.blotato_client_id  || '',
  _platform:           upstream.platform || data.platform || 'Instagram',
  _has_binary:         false,
  _media_url:          publicUrl,
};

// Only include PublishAt if we have a valid date (empty string crashes Airtable dateTime)
if (data.slot_time) {
  record.PublishAt = data.slot_time;
}

return { json: record };