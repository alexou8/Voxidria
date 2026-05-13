import { test, expect } from "@playwright/test";

/**
 * Navigation tests.
 *
 * Unauthenticated routes: all redirect to LandingPage (checked via h1 presence).
 * Authenticated routes: use window.__CI_E2E__ to activate MockAuth0Provider.
 */

async function enableMockAuth(page) {
  await page.addInitScript(() => {
    window.__CI_E2E__ = true;
  });
}

async function mockAllApiFunctions(page) {
  const MOCK_SESSIONS = { sessions: [], total: 0 };
  const MOCK_SESSION  = {
    session: { session_id: "nav-test-session", status: "DONE", created_at: new Date().toISOString() },
    tasks:   [],
    predictions: [],
  };

  await page.route("**/functions/v1/list-sessions**",  (r) => r.fulfill({ json: MOCK_SESSIONS }));
  await page.route("**/functions/v1/get-session**",    (r) => r.fulfill({ json: MOCK_SESSION }));
  await page.route("**/functions/v1/create-session**", (r) =>
    r.fulfill({ json: { session_id: "nav-test-session", tasks: [] }, status: 201 })
  );
  await page.route("**/functions/v1/**",               (r) => r.fulfill({ json: {} }));
}

test.describe("Unauthenticated routing", () => {
  test("/ shows LandingPage when not authenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("/record redirects to LandingPage when not authenticated", async ({ page }) => {
    await page.goto("/record");
    // App.jsx: <Route path='/record' element={isAuthenticated ? <RecordPage /> : <LandingPage />}
    await expect(page.locator("h1")).toBeVisible();
  });

  test("/results redirects to LandingPage when not authenticated", async ({ page }) => {
    await page.goto("/results");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("/profile redirects to LandingPage when not authenticated", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("h1")).toBeVisible();
  });
});

test.describe("Authenticated routing (mock auth)", () => {
  test.beforeEach(async ({ page }) => {
    await enableMockAuth(page);
    await mockAllApiFunctions(page);
  });

  test("/ shows DashboardPage when authenticated", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // DashboardPage should NOT show the LandingPage h1
    const h1 = page.locator("h1");
    const bodyText = await page.locator("body").innerText();
    // Should show some dashboard UI, not the landing page hero
    expect(bodyText).not.toMatch(/Hear what your/i);
  });

  test("/record renders RecordPage when authenticated", async ({ page }) => {
    // Mock MediaRecorder so the browser doesn't prompt for mic permission
    await page.addInitScript(() => {
      window.__CI_E2E__ = true;
      class FakeMediaRecorder extends EventTarget {
        constructor() { super(); this.state = "inactive"; }
        start()  { this.state = "recording"; this.dispatchEvent(new Event("start")); }
        stop()   { this.state = "inactive";  this.dispatchEvent(new Event("stop")); }
        pause()  { this.state = "paused"; }
        resume() { this.state = "recording"; }
        static isTypeSupported() { return true; }
      }
      window.MediaRecorder = FakeMediaRecorder;
    });
    await page.goto("/record");
    await page.waitForLoadState("networkidle");
    // RecordPage renders without crashing
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Hear what your/i);
  });

  test("/profile renders ProfilePage when authenticated", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Hear what your/i);
  });
});
