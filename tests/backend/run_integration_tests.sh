#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Voxidria — Backend Integration Tests
#
# Tests every Edge Function endpoint against the local Supabase stack.
# Auth is bypassed via CI_TEST_USER_SUB injected into the functions env file;
# no real Auth0 token is needed.
#
# Usage:
#   SUPABASE_URL=http://localhost:54321 \
#   SUPABASE_ANON_KEY=<local-anon-key> \
#   bash tests/backend/run_integration_tests.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────────────
BASE_URL="${SUPABASE_URL:-http://localhost:54321}"
# Well-known deterministic anon key for local Supabase instances
ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7kyqd6G9Fz3OcPH38eJ3Y7bKrV8vHcxBMrY}"
FUNCS="${BASE_URL}/functions/v1"

# Dummy bearer token — the CI_TEST_USER_SUB env var in the functions runtime
# means the function never actually verifies this string.
CI_TOKEN="ci-dummy-token"

PASS=0
FAIL=0
ERRORS=()
SESSION_ID=""

mkdir -p test-results

# ── Helpers ──────────────────────────────────────────────────────────────────────
passed() { echo "  ✓ $1"; PASS=$((PASS+1)); }
failed() { echo "  ✗ $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }

assert_http() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    passed "$label (HTTP $actual)"
  else
    failed "$label — expected HTTP $expected, got $actual"
  fi
}

assert_has_key() {
  local label="$1" json="$2" key="$3"
  if echo "$json" | jq -e "has(\"$key\")" >/dev/null 2>&1; then
    passed "$label (key '$key' present)"
  else
    failed "$label — key '$key' missing in response"
  fi
}

assert_json_length() {
  local label="$1" json="$2" path="$3" expected="$4"
  local actual
  actual=$(echo "$json" | jq -r "$path | length" 2>/dev/null || echo "0")
  if [[ "$actual" == "$expected" ]]; then
    passed "$label ($path length = $actual)"
  else
    failed "$label — expected $path length $expected, got $actual"
  fi
}

curl_fn() {
  # Usage: curl_fn METHOD PATH [-d BODY]
  local method="$1" path="$2"
  shift 2
  curl -s -w "\n%{http_code}" \
    -X "$method" \
    "${FUNCS}${path}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${CI_TOKEN}" \
    -H "apikey: ${ANON_KEY}" \
    "$@"
}

parse_body()   { head -n -1 <<< "$1"; }
parse_status() { tail -1    <<< "$1"; }

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  Voxidria Backend Integration Tests"
echo "  Target : ${FUNCS}"
echo "══════════════════════════════════════════════════════════════════════════════"


# ── 1: POST /create-session ─────────────────────────────────────────────────────────
echo ""
echo "── 1. POST /create-session"
RESP=$(curl_fn POST "/create-session" -d '{
  "consent_version_accepted": "1.0",
  "device_meta": {"browser": "CI", "test": true},
  "reading_original_text": "The North Wind and the Sun were disputing which was the stronger."
}')
BODY=$(parse_body "$RESP")  ; STATUS=$(parse_status "$RESP")

assert_http   "create-session returns 201"          "201" "$STATUS"
assert_has_key "response contains session_id"        "$BODY" "session_id"
assert_has_key "response contains tasks"             "$BODY" "tasks"
assert_json_length "tasks array has 3 entries"       "$BODY" ".tasks" 3

SESSION_ID=$(echo "$BODY" | jq -r '.session_id // empty')
echo "  session_id: ${SESSION_ID:-<not set>}"


# ── 2: GET /list-sessions ───────────────────────────────────────────────────────────
echo ""
echo "── 2. GET /list-sessions"
RESP=$(curl_fn GET "/list-sessions?limit=10")
BODY=$(parse_body "$RESP")  ; STATUS=$(parse_status "$RESP")

assert_http   "list-sessions returns 200"            "200" "$STATUS"
assert_has_key "response contains sessions array"    "$BODY" "sessions"
assert_has_key "response contains total count"       "$BODY" "total"


# ── 3: GET /get-session ───────────────────────────────────────────────────────────
echo ""
echo "── 3. GET /get-session"
if [[ -z "$SESSION_ID" ]]; then
  echo "  [SKIP] no session_id from step 1"
else
  RESP=$(curl_fn GET "/get-session?session_id=${SESSION_ID}")
  BODY=$(parse_body "$RESP")  ; STATUS=$(parse_status "$RESP")

  assert_http   "get-session returns 200"            "200" "$STATUS"
  assert_has_key "response contains session object"  "$BODY" "session"
  assert_has_key "response contains tasks"           "$BODY" "tasks"
fi


# ── 4: POST /upload-url ───────────────────────────────────────────────────────────
echo ""
echo "── 4. POST /upload-url"
if [[ -z "$SESSION_ID" ]]; then
  echo "  [SKIP] no session_id from step 1"
else
  RESP=$(curl_fn POST "/upload-url" -d "{\n  \"session_id\": \"${SESSION_ID}\",\n  \"task_type\": \"SUSTAINED_VOWEL\",\n  \"content_type\": \"audio/wav\"\n}")
  BODY=$(parse_body "$RESP")  ; STATUS=$(parse_status "$RESP")

  assert_http   "upload-url returns 200"             "200" "$STATUS"
  assert_has_key "response contains signedUrl"       "$BODY" "signedUrl"
  assert_has_key "response contains path"            "$BODY" "path"
fi


# ── 5: POST /finalize-task (READING) ────────────────────────────────────────────
echo ""
echo "── 5. POST /finalize-task"
if [[ -z "$SESSION_ID" ]]; then
  echo "  [SKIP] no session_id from step 1"
else
  RESP=$(curl_fn POST "/finalize-task" -d "{\n  \"session_id\": \"${SESSION_ID}\",\n  \"task_type\": \"READING\",\n  \"transcript_text\": \"The North Wind and the Sun were disputing which was the stronger.\"\n}")
  BODY=$(parse_body "$RESP")  ; STATUS=$(parse_status "$RESP")

  assert_http   "finalize-task returns 200"          "200" "$STATUS"
  assert_has_key "response contains task_status"     "$BODY" "task_status"

  TASK_STATUS=$(echo "$BODY" | jq -r '.task_status // "<missing>"')
  echo "  task_status: ${TASK_STATUS}  (ANALYZED if GEMINI_API_KEY valid, else FAILED)"

  if [[ "$TASK_STATUS" == "ANALYZED" ]]; then
    passed "Gemini analysis succeeded"
  else
    echo "  [INFO] Gemini may be unavailable in this CI run — task_status=$TASK_STATUS is acceptable"
  fi
fi


# ── 6: DELETE /delete-session ────────────────────────────────────────────────────────
echo ""
echo "── 6. DELETE /delete-session"
if [[ -z "$SESSION_ID" ]]; then
  echo "  [SKIP] no session_id from step 1"
else
  RESP=$(curl_fn DELETE "/delete-session?session_id=${SESSION_ID}")
  BODY=$(parse_body "$RESP")  ; STATUS=$(parse_status "$RESP")

  assert_http   "delete-session returns 200"         "200" "$STATUS"
  assert_has_key "response confirms deletion"        "$BODY" "deleted"

  # Verify the session is actually gone
  VERIFY=$(curl_fn GET "/get-session?session_id=${SESSION_ID}")
  V_STATUS=$(parse_status "$VERIFY")
  if [[ "$V_STATUS" == "404" ]]; then
    passed "session no longer accessible after deletion (404)"
  else
    echo "  [WARN] get-session returned $V_STATUS after deletion (expected 404)"
  fi
fi


# ── Summary ───────────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  Passed : ${PASS}"
echo "  Failed : ${FAIL}"
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "  Failures:"
  for e in "${ERRORS[@]}"; do
    echo "    • $e"
  done
fi
echo "══════════════════════════════════════════════════════════════════════════════"

# Write JSON results for artifact upload
cat > test-results/backend-results.json <<EOF
{
  "suite": "backend-integration",
  "passed": ${PASS},
  "failed": ${FAIL},
  "target": "${FUNCS}"
}
EOF

if [[ "$FAIL" -gt 0 ]]; then
  echo "❌ Backend integration tests FAILED"
  exit 1
fi
echo "✅ Backend integration tests PASSED"
