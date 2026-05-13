# Testing Guide

This document explains how to run each test suite locally and what each covers.

## Test Suites

### 1. ML Unit Tests (`tests/ml/test_ml_unit.py`)

Tests the ML pipeline: artifact loading, audio feature extraction, and prediction.

**What it covers:**
- Verifies `ml/artifacts/` files exist and are loadable (model, scaler, feature_names)
- Tests `extract_features()` from `audioParser.py` (jitter, shimmer, PPE)
- Tests `extract_uci16()` from `parsel_parser.py` (16 UCI voice biomarkers)
- Tests `predict_from_dict()` from `predict.py` (probability in [0,1], binary label)
- Smoke tests full WAV → features → prediction pipeline for both sample recordings

**Prerequisites:**
```bash
# System deps (Ubuntu/Debian)
sudo apt-get install libsndfile1 ffmpeg

# Python deps
pip install -r ml/requirements.txt pytest
```

**Run:**
```bash
pytest tests/ml/test_ml_unit.py -v
```

---

### 2. Backend Integration Tests (`tests/backend/run_integration_tests.sh`)

End-to-end curl tests against the local Supabase Edge Functions.

**What it covers:**
- `create-session` → 201 with session_id and tasks array
- `list-sessions` → 200
- `get-session` → 200 with session detail
- `upload-url` → 200 with signed upload URL
- `finalize-task` → 200 (requires `GEMINI_API_KEY` to be set)
- `delete-session` → 200, then 404 on re-fetch

**Prerequisites:**
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- Docker running

**Run:**
```bash
# 1. Start the local Supabase stack (from backend/ directory)
cd backend && supabase start

# 2. Create an env file for Edge Functions with CI auth bypass
cat > backend/.env.local << 'EOF'
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=your-api-identifier
GEMINI_API_KEY=your-gemini-key
ELEVENLABS_API_KEY=your-elevenlabs-key
CI_TEST_USER_SUB=test|local-user-123
CI_BYPASS_AUTH=true
EOF

# 3. Serve Edge Functions in the background
cd backend && supabase functions serve --env-file .env.local --no-verify-jwt &

# 4. Run integration tests
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7ACcPzu77v7IsO12uRhFXBs-GzFh0cU_zEI \
CI_TOKEN=ci-dummy-token \
bash tests/backend/run_integration_tests.sh
```

> **Note:** Both `CI_TEST_USER_SUB` and `CI_BYPASS_AUTH=true` must be set together. `verifyAuth0.ts` requires both env vars to activate the bypass, so setting only one has no effect and real JWT verification remains active.

---

### 3. E2E Playwright Tests (`frontend/tests/`)

Browser-level tests using Playwright and Chromium.

**What it covers:**
- `landing.spec.js` — Unauthenticated landing page (hero copy, CTAs, stats, nav, footer)
- `navigation.spec.js` — Route guards: unauthenticated redirect, authenticated page render
- `record.spec.js` — RecordPage renders with MediaRecorder stub and mocked API routes
- `dashboard.spec.js` — DashboardPage fetches and renders the session list
- `results.spec.js` — ResultsPage renders prediction data from a mocked `get-session` response
- `api-url.spec.js` — Asserts no requests to production Supabase domain on landing page load

**Prerequisites:**
```bash
# Install all Node deps (from repo root)
npm run install:all

# Install Playwright browsers
cd frontend && npx playwright install chromium
```

**Run:**
```bash
# Start the Vite dev server (background)
cd frontend && npm run dev &

# Run all E2E tests
cd frontend && npx playwright test

# UI mode (interactive)
cd frontend && npx playwright test --ui

# Single spec
cd frontend && npx playwright test tests/landing.spec.js
```

---

## CI Workflow (`.github/workflows/integration-test.yml`)

Runs all three suites on every push to `main`/`develop` and on PRs targeting `main`.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AUTH0_DOMAIN` | Auth0 tenant domain (e.g. `tenant.auth0.com`) |
| `AUTH0_AUDIENCE` | Auth0 API identifier |
| `AUTH0_CLIENT_ID` | Auth0 SPA client ID (for frontend env) |
| `GEMINI_API_KEY` | Google Gemini API key (needed for `finalize-task` test) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |

Local Supabase `anon` and `service_role` keys are deterministic for any local instance and are hardcoded in the workflow — they are not production secrets.

### Auth Bypass in CI

**Edge Functions:** The workflow sets both `CI_TEST_USER_SUB=test|ci-user-123` and `CI_BYPASS_AUTH=true` in the functions env file. `verifyAuth0.ts` requires **both** env vars to be present before returning the mock claims object. This two-variable gate ensures a single misconfiguration cannot silently disable Auth0 verification — an attacker would need to control both variables simultaneously. Neither variable is ever present in production Edge Function environments.

**Frontend E2E:** Playwright calls `page.addInitScript(() => { window.__CI_E2E__ = true; })` before each page load. In Vite dev mode (`import.meta.env.DEV`), `main.jsx` checks this flag and wraps the app with `MockAuth0Provider` instead of the real `Auth0Provider`. This exposes a fully authenticated context (fake user, mock `getAccessTokenSilently`) without any Auth0 SDK network activity.

### Uploaded Artifacts

| Artifact | Contents | Condition |
|----------|----------|-----------|
| `ml-test-results` | JUnit XML from pytest | Always |
| `backend-test-results` | JSON pass/fail summary | Always |
| `playwright-report` | Playwright HTML report (30-day retention) | Always |
| `e2e-test-results` | JUnit XML from Playwright | Always |
| `playwright-screenshots` | Failure screenshots and traces | On failure only |
