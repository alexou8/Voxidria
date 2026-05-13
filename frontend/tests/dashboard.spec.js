import { test, expect } from "@playwright/test";

/**
 * DashboardPage E2E tests.
 *
 * Uses window.__CI_E2E__ to activate MockAuth0Provider.
 * The list-sessions Edge Function is mocked so no real Supabase instance is needed.
 */

const MOCK_SESSIONS_EMPTY  = { sessions: [], total: 0 };
const MOCK_SESSIONS_ONE    = {
  sessions: [
    {
      session_id:  "dash-session-1",
      created_at:  "2026-01-15T10:30:00Z",
      status:      "DONE",
      device_meta: { browser: "Chrome" },
    },
  ],
  total: 1,
};

async function setupDashboard(page, sessionsMock = MOCK_SESSIONS_EMPTY) {
  await page.addInitScript(() => { window.__CI_E2E__ = true; });
  // Catch-all registered FIRST so it has the lowest priority.
  // Playwright matches routes in reverse registration order (LIFO), so
  // handlers added later take precedence over handlers added earlier.
  await page.route("**/functions/v1/**", (r) => r.fulfill({ json: {} }));
  await page.route("**/functions/v1/list-sessions**", (r) =>
    r.fulfill({ json: sessionsMock })
  );
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

test.describe("DashboardPage", () => {
  test("renders without crashing (empty sessions)", async ({ page }) => {
    await setupDashboard(page, MOCK_SESSIONS_EMPTY);
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Hear what your/i);
  });

  test("renders without crashing (one session in history)", async ({ page }) => {
    await setupDashboard(page, MOCK_SESSIONS_ONE);
    await expect(page.locator("body")).toBeVisible();
  });

  test("does not show React error boundary", async ({ page }) => {
    await setupDashboard(page);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Something went wrong/i);
    expect(bodyText).not.toMatch(/Unhandled error/i);
  });

  test("list-sessions API is called on load", async ({ page }) => {
    let listSessionsCalled = false;
    await page.addInitScript(() => { window.__CI_E2E__ = true; });
    // Catch-all first (lowest priority), specific handler second (highest priority).
    await page.route("**/functions/v1/**", (r) => r.fulfill({ json: {} }));
    await page.route("**/functions/v1/list-sessions**", (r) => {
      listSessionsCalled = true;
      return r.fulfill({ json: MOCK_SESSIONS_EMPTY });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Allow time for async data fetch
    await page.waitForTimeout(1000);
    expect(listSessionsCalled).toBe(true);
  });
});
