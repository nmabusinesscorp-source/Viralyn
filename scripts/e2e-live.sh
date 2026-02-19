#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Viralyn — E2E Live Test Script
# ═══════════════════════════════════════════════════════════════
#
# Tests the full pipeline against real services:
#   1. Pre-flight checks (env, connectivity)
#   2. Express server health
#   3. n8n webhook connectivity
#   4. QA Agent (Claude API → n8n qa-result webhook)
#   5. Generate Post (n8n workflow → Claude → Gemini → Airtable)
#   6. Onboard Client (Claude web_search → n8n → Airtable)
#
# Usage:
#   cp .env.example .env   # fill in real keys
#   chmod +x scripts/e2e-live.sh
#   ./scripts/e2e-live.sh
#
# Options:
#   --skip-onboard    Skip the onboard test (slow, ~30s)
#   --skip-generate   Skip the generate test (slow, ~60s)
#   --customer-id ID  Use a specific customer ID for generate test
#   --url URL         Use a specific URL for onboard test
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ─── Config ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_PORT="${PORT:-3000}"
SERVER_URL="http://localhost:${SERVER_PORT}"
SERVER_PID=""
SKIP_ONBOARD=false
SKIP_GENERATE=false
CUSTOMER_ID=""
ONBOARD_URL=""
PASSED=0
FAILED=0
SKIPPED=0

# ─── Parse args ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-onboard) SKIP_ONBOARD=true; shift ;;
    --skip-generate) SKIP_GENERATE=true; shift ;;
    --customer-id) CUSTOMER_ID="$2"; shift 2 ;;
    --url) ONBOARD_URL="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Helpers ───────────────────────────────────────────────────

header() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

step() {
  echo -e "\n${CYAN}▸ $1${NC}"
}

pass() {
  echo -e "  ${GREEN}✓ $1${NC}"
  PASSED=$((PASSED + 1))
}

fail() {
  echo -e "  ${RED}✗ $1${NC}"
  FAILED=$((FAILED + 1))
}

warn() {
  echo -e "  ${YELLOW}⚠ $1${NC}"
}

skip() {
  echo -e "  ${YELLOW}⊘ $1 (skipped)${NC}"
  SKIPPED=$((SKIPPED + 1))
}

# JSON field extractor (no jq dependency)
json_val() {
  local json="$1" field="$2"
  echo "$json" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const v = JSON.parse(d)${field};
        process.stdout.write(String(v == null ? '' : v));
      } catch(e) { process.stdout.write(''); }
    });
  "
}

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    step "Stopping Express server (PID $SERVER_PID)"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    pass "Server stopped"
  fi
}

trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════
# PHASE 1: Pre-flight checks
# ═══════════════════════════════════════════════════════════════

header "Phase 1 — Pre-flight Checks"

# Check .env exists
step "Checking .env file"
if [[ -f "$PROJECT_DIR/.env" ]]; then
  source "$PROJECT_DIR/.env"
  pass ".env file found"
else
  fail ".env file not found — copy .env.example to .env and fill in your keys"
  exit 1
fi

# Check required env vars
step "Checking required environment variables"

if [[ -n "${ANTHROPIC_API_KEY:-}" ]] && [[ "$ANTHROPIC_API_KEY" != "sk-ant-..." ]]; then
  pass "ANTHROPIC_API_KEY is set"
else
  fail "ANTHROPIC_API_KEY is missing or placeholder"
  exit 1
fi

if [[ -n "${N8N_WEBHOOK_BASE_URL:-}" ]] && [[ "$N8N_WEBHOOK_BASE_URL" != *"your-n8n"* ]]; then
  pass "N8N_WEBHOOK_BASE_URL is set ($N8N_WEBHOOK_BASE_URL)"
else
  fail "N8N_WEBHOOK_BASE_URL is missing or placeholder"
  exit 1
fi

if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
  pass "SLACK_WEBHOOK_URL is set (notifications enabled)"
else
  warn "SLACK_WEBHOOK_URL not set — Slack notifications disabled"
fi

# Check node_modules
step "Checking dependencies"
if [[ -d "$PROJECT_DIR/node_modules" ]]; then
  pass "node_modules present"
else
  warn "node_modules missing — installing..."
  (cd "$PROJECT_DIR" && npm install --production)
  pass "Dependencies installed"
fi

# Check n8n connectivity
step "Checking n8n connectivity"
N8N_HOST=$(echo "$N8N_WEBHOOK_BASE_URL" | sed 's|/webhook.*||')
N8N_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$N8N_HOST/" 2>/dev/null || echo "000")
if [[ "$N8N_HEALTH" != "000" ]]; then
  pass "n8n is reachable ($N8N_HOST → HTTP $N8N_HEALTH)"
else
  fail "Cannot reach n8n at $N8N_HOST — check your network/URL"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2: Start Express server
# ═══════════════════════════════════════════════════════════════

header "Phase 2 — Express Server"

step "Starting Express server on port $SERVER_PORT"

# Check if port is already in use
if lsof -i :"$SERVER_PORT" -sTCP:LISTEN &>/dev/null 2>&1 || ss -tlnp 2>/dev/null | grep -q ":${SERVER_PORT} "; then
  warn "Port $SERVER_PORT already in use — assuming server is running"
else
  cd "$PROJECT_DIR"
  node server.js &
  SERVER_PID=$!
  sleep 2

  if kill -0 "$SERVER_PID" 2>/dev/null; then
    pass "Server started (PID $SERVER_PID)"
  else
    fail "Server failed to start"
    exit 1
  fi
fi

# Health check
step "Testing GET /health"
HEALTH=$(curl -s --max-time 5 "$SERVER_URL/health" 2>/dev/null || echo '{}')
HEALTH_STATUS=$(json_val "$HEALTH" '.status')
HEALTH_UPTIME=$(json_val "$HEALTH" '.uptime')

if [[ "$HEALTH_STATUS" == "ok" ]]; then
  pass "Health OK (uptime: ${HEALTH_UPTIME}s)"
else
  fail "Health check failed: $HEALTH"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 3: Input Validation
# ═══════════════════════════════════════════════════════════════

header "Phase 3 — Input Validation"

# POST /agent/onboard without url
step "POST /agent/onboard — missing url"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$SERVER_URL/agent/onboard" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -n -1)
if [[ "$HTTP_CODE" == "400" ]]; then
  pass "Rejected with 400 ($(json_val "$BODY" '.error'))"
else
  fail "Expected 400, got $HTTP_CODE"
fi

# POST /agent/qa without post_id
step "POST /agent/qa — missing post_id"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$SERVER_URL/agent/qa" \
  -H "Content-Type: application/json" \
  -d '{"post_text":"hello"}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -1)
if [[ "$HTTP_CODE" == "400" ]]; then
  pass "Rejected with 400"
else
  fail "Expected 400, got $HTTP_CODE"
fi

# POST /agent/generate without customer_id
step "POST /agent/generate — missing customer_id"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$SERVER_URL/agent/generate" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -1)
if [[ "$HTTP_CODE" == "400" ]]; then
  pass "Rejected with 400"
else
  fail "Expected 400, got $HTTP_CODE"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 4: QA Agent (Claude API + n8n)
# ═══════════════════════════════════════════════════════════════

header "Phase 4 — QA Agent (Claude API)"

step "POST /agent/qa — evaluate a test post"
echo -e "  ${YELLOW}(calling Claude API, may take 5-15s...)${NC}"

QA_PAYLOAD='{
  "post_id": "recTEST_E2E_001",
  "post_text": "Découvrez notre incroyable Burger Signature ! Préparé avec du bœuf Angus premium, fromage affiné et notre sauce secrète maison. Un vrai délice qui vous attend au 12 rue de la Paix. Commandez maintenant et régalez-vous !",
  "prompt_visual": "Photo appétissante d un burger gourmet sur fond sombre, éclairage chaud, style food photography premium",
  "product_name": "Burger Signature",
  "customer": {
    "Customer_Name": "E2E Test Restaurant",
    "CTA": "Commandez maintenant",
    "Mood": "Gourmand et chaleureux",
    "Visual_type": "food photography",
    "Customer_Adress": "12 rue de la Paix, Paris"
  }
}'

QA_START=$(date +%s)
QA_RESP=$(curl -s --max-time 60 -X POST "$SERVER_URL/agent/qa" \
  -H "Content-Type: application/json" \
  -d "$QA_PAYLOAD" 2>/dev/null || echo '{"error":"timeout"}')
QA_END=$(date +%s)
QA_DURATION=$((QA_END - QA_START))

QA_SUCCESS=$(json_val "$QA_RESP" '.success')
QA_VERDICT=$(json_val "$QA_RESP" '.verdict')
QA_SCORE=$(json_val "$QA_RESP" '.score')
QA_STATUS=$(json_val "$QA_RESP" '.new_status')
QA_FEEDBACK=$(json_val "$QA_RESP" '.feedback')

echo -e "  Response time: ${QA_DURATION}s"

if [[ -n "$QA_VERDICT" ]]; then
  pass "Claude returned verdict: $QA_VERDICT"
else
  fail "No verdict in response: $(echo "$QA_RESP" | head -c 200)"
fi

if [[ "$QA_VERDICT" == "PASS" || "$QA_VERDICT" == "WARN" || "$QA_VERDICT" == "FAIL" ]]; then
  pass "Verdict is valid ($QA_VERDICT)"
else
  fail "Invalid verdict: $QA_VERDICT"
fi

if [[ -n "$QA_SCORE" ]]; then
  pass "Score: $QA_SCORE/10"
else
  fail "No score returned"
fi

if [[ "$QA_STATUS" == "Prêt à publier" || "$QA_STATUS" == "Edité" ]]; then
  pass "Status: $QA_STATUS"
else
  fail "Invalid status: $QA_STATUS"
fi

if [[ -n "$QA_FEEDBACK" ]]; then
  pass "Feedback: $(echo "$QA_FEEDBACK" | head -c 100)"
else
  warn "No feedback returned"
fi

# Check n8n integration
QA_N8N_ERR=$(json_val "$QA_RESP" '.n8nResult.error')
if [[ "$QA_SUCCESS" == "true" ]]; then
  pass "n8n qa-result webhook acknowledged"
elif [[ -n "$QA_N8N_ERR" ]]; then
  warn "n8n webhook failed: $QA_N8N_ERR (QA still worked, just Airtable update failed)"
else
  warn "QA success=$QA_SUCCESS — check n8n logs"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 5: Generate Post (n8n full pipeline)
# ═══════════════════════════════════════════════════════════════

header "Phase 5 — Generate Post (n8n Pipeline)"

if [[ "$SKIP_GENERATE" == "true" ]]; then
  skip "Generate Post test skipped (--skip-generate)"
else
  if [[ -z "$CUSTOMER_ID" ]]; then
    warn "No --customer-id provided. Using a test ID."
    warn "For a real test, use: ./scripts/e2e-live.sh --customer-id YOUR_CUSTOMER_ID"
    CUSTOMER_ID="TST001"
  fi

  step "POST /agent/generate — customer=$CUSTOMER_ID"
  echo -e "  ${YELLOW}(calling n8n → Claude → Gemini pipeline, may take 30-120s...)${NC}"

  GEN_PAYLOAD=$(cat <<GEOF
{
  "customer_id": "$CUSTOMER_ID",
  "format": "image",
  "source": "Rotation"
}
GEOF
  )

  GEN_START=$(date +%s)
  GEN_RESP=$(curl -s --max-time 120 -X POST "$SERVER_URL/agent/generate" \
    -H "Content-Type: application/json" \
    -d "$GEN_PAYLOAD" 2>/dev/null || echo '{"error":"timeout or connection error"}')
  GEN_END=$(date +%s)
  GEN_DURATION=$((GEN_END - GEN_START))

  echo -e "  Response time: ${GEN_DURATION}s"

  GEN_SUCCESS=$(json_val "$GEN_RESP" '.success')
  GEN_PIPELINE=$(json_val "$GEN_RESP" '.pipeline_record_id')
  GEN_ERROR=$(json_val "$GEN_RESP" '.error')

  if [[ "$GEN_SUCCESS" == "true" ]]; then
    pass "Generate succeeded"
    if [[ -n "$GEN_PIPELINE" ]]; then
      pass "Pipeline record created: $GEN_PIPELINE"
    fi
    GEN_QA_V=$(json_val "$GEN_RESP" '.qa_verdict')
    GEN_QA_S=$(json_val "$GEN_RESP" '.qa_score')
    if [[ -n "$GEN_QA_V" ]]; then
      pass "Inline QA: $GEN_QA_V ($GEN_QA_S/10)"
    fi
  else
    if [[ "$CUSTOMER_ID" == "TST001" ]]; then
      warn "Generate failed (expected — TST001 is a fake ID): $GEN_ERROR"
    else
      fail "Generate failed: $GEN_ERROR"
      echo -e "  Full response: $(echo "$GEN_RESP" | head -c 300)"
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 6: Onboard Client (Claude web_search)
# ═══════════════════════════════════════════════════════════════

header "Phase 6 — Onboard Client (Claude web_search)"

if [[ "$SKIP_ONBOARD" == "true" ]]; then
  skip "Onboard test skipped (--skip-onboard)"
else
  if [[ -z "$ONBOARD_URL" ]]; then
    ONBOARD_URL="https://www.letempsdesfraises.ch"
    warn "No --url provided, using default: $ONBOARD_URL"
  fi

  step "POST /agent/onboard — url=$ONBOARD_URL"
  echo -e "  ${YELLOW}(Claude will crawl the website, may take 30-60s...)${NC}"

  OB_PAYLOAD="{\"url\": \"$ONBOARD_URL\"}"

  OB_START=$(date +%s)
  OB_RESP=$(curl -s --max-time 120 -X POST "$SERVER_URL/agent/onboard" \
    -H "Content-Type: application/json" \
    -d "$OB_PAYLOAD" 2>/dev/null || echo '{"error":"timeout"}')
  OB_END=$(date +%s)
  OB_DURATION=$((OB_END - OB_START))

  echo -e "  Response time: ${OB_DURATION}s"

  OB_SUCCESS=$(json_val "$OB_RESP" '.success')
  OB_NAME=$(json_val "$OB_RESP" '.customer.Customer_Name')
  OB_MARKET=$(json_val "$OB_RESP" '.customer.Customer_Market')
  OB_PRODUCTS=$(json_val "$OB_RESP" '.productsCount')
  OB_MOOD=$(json_val "$OB_RESP" '.customer.Mood')
  OB_LOGO=$(json_val "$OB_RESP" '.customer.Logo_URL')
  OB_STATUS=$(json_val "$OB_RESP" '.customer.Customer_Status')

  if [[ -n "$OB_NAME" ]]; then
    pass "Client name: $OB_NAME"
  else
    fail "No client name extracted"
  fi

  if [[ -n "$OB_MARKET" ]]; then
    pass "Market: $OB_MARKET"
  else
    fail "No market detected"
  fi

  if [[ "$OB_PRODUCTS" -gt 0 ]] 2>/dev/null; then
    pass "Products extracted: $OB_PRODUCTS"
  else
    fail "No products extracted (count: $OB_PRODUCTS)"
  fi

  if [[ -n "$OB_MOOD" ]]; then
    pass "Mood: $OB_MOOD"
  else
    warn "No mood detected"
  fi

  if [[ -n "$OB_LOGO" ]] && [[ "$OB_LOGO" == http* ]]; then
    pass "Logo URL: $OB_LOGO"
  else
    warn "No logo URL extracted (Logo_URL: $OB_LOGO)"
  fi

  if [[ "$OB_STATUS" == "En review" ]]; then
    pass "Status: $OB_STATUS"
  elif [[ -n "$OB_STATUS" ]]; then
    warn "Status: $OB_STATUS (expected 'En review')"
  fi

  # Check n8n Airtable write
  if [[ "$OB_SUCCESS" == "true" ]]; then
    pass "n8n: Customer + Products created in Airtable"
  else
    OB_N8N_ERR=$(json_val "$OB_RESP" '.n8nResult.error')
    warn "n8n failed: $OB_N8N_ERR (Claude extraction worked, Airtable write failed)"
  fi

  # Confidence scores
  step "Confidence scores"
  for field in name address products colors mood; do
    score=$(json_val "$OB_RESP" ".confidenceScores.$field")
    if [[ -n "$score" ]]; then
      # Check if score >= 0.7 using node for float comparison
      is_good=$(node -e "console.log($score >= 0.7 ? 'yes' : 'no')" 2>/dev/null || echo "no")
      if [[ "$is_good" == "yes" ]]; then
        pass "$field: $score"
      else
        warn "$field: $score (low confidence)"
      fi
    fi
  done
fi

# ═══════════════════════════════════════════════════════════════
# RESULTS
# ═══════════════════════════════════════════════════════════════

header "Results"

TOTAL=$((PASSED + FAILED + SKIPPED))
echo -e ""
echo -e "  ${GREEN}Passed:  $PASSED${NC}"
echo -e "  ${RED}Failed:  $FAILED${NC}"
echo -e "  ${YELLOW}Skipped: $SKIPPED${NC}"
echo -e "  ${BOLD}Total:   $TOTAL${NC}"
echo ""

if [[ "$FAILED" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✓ All E2E tests passed!${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}${BOLD}  ✗ $FAILED test(s) failed${NC}"
  echo ""
  exit 1
fi
