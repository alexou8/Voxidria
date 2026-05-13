import { test, expect } from "@playwright/test";

/**
 * ResultsPage E2E tests.
 *
 * Uses window.__CI_E2E__ to activate MockAuth0Provider.
 * get-session is mocked to return a complete session with a prediction so the
 * page can render the full results UI without a live backend.
 */

const MOCK_SESSION_WITH_RESULT = {
  session: {
    session_id:  "results-test-session",
    created_at:  "2026-01-15T10:30:00Z",
    status:      "DONE",
    reading_original_text: "The North Wind and the Sun were disputing.",
  },
  tasks: [
    {
      task_id:         "t1",
      task_type:       "SUSTAINED_VOWEL",
      task_status:     "ANALYZED",
      transcript_text: null,
      analysis_json:   null,
    },
    {
      task_id:         "t2",
      task_type:       "READING",
      task_status:     "ANALYZED",
      transcript_text: "The North Wind and the Sun.",
      analysis_json: {
        alignment: { missing_phrases: [], extra_phrases: [], substitutions: [] },
        fluency:   { hesitation_markers: [], repetitions: [], long_pauses: [] },
        metrics:   { word_error_rate_estimate: 0.05, coverage_ratio: 0.95 },
        summary:   ["Speech was mostly accurate.", "Minor pauses noted."],
      },
    },
  ],
  predictions: [
    {
      prediction_id:     "pred-1",
      model_version:     "1.0",
      risk_score:        42,
      risk_bucket:       "MODERATE",
      gemini_explanation: "Your vocal analysis shows moderate variation in pitch stability. This is within a common range and does not indicate a definitive concern. Continue monitoring your vocal health.",
      feature_summary:   { jitter: 0.008, shimmer: 0.05, hnr: 22.4 },
      created_at:        "2026-01-15T10:31:00Z",
    },
  ],
};

async function setupResults(page) {
  await page.addInitScript(() => { window.__CI_E2E__ = true; });
  await page.route("**/functions/v1/get-session**",  (r) =>
    r.fulfill({ json: MOCK_SESSION_WITH_RESULT })
  );
  await page.route("**/functions/v1/list-sessions**", (r) =>
    r.fulfill({ json: { sessions: [], total: 0 } })
  );
  await page.route("**/functions/v1/**", (r) => r.fulfill({ json: {} }));
}

test.describe("ResultsPage", () => {
  test("renders without crashing when navigated to", async ({ page }) => {
    await setupResults(page);
    // Navigate to results with a session_id query param
    await page.goto("/results?session_id=results-test-session");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("does not show LandingPage hero", async ({ page }) => {
    await setupResults(page);
    await page.goto("/results?session_id=results-test-session");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Hear what your/i);
  });

  test("does not show React error boundary", async ({ page }) => {
    await setupResults(page);
    await page.goto("/results?session_id=results-test-session");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Something went wrong/i);
  });

  test("risk score is visible when predictions are available", async ({ page }) => {
    await setupResults(page);
    await page.goto("/results?session_id=results-test-session");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500); // allow data fetch + render
    const bodyText = await page.locator("body").innerText();
    // The page should display "42" somewhere (the mocked risk_score)
    // We look for it broadly; exact selector depends on ResultsPage implementation
    expect(bodyText).toMatch(/42/); // risk_score from mock
  });
});
