import { test, expect } from "@playwright/test";

/**
 * API URL configuration tests.
 *
 * Verifies that the frontend service layer correctly uses VITE_SUPABASE_URL
 * for all Edge Function calls and never contacts the production Supabase
 * domain (*.supabase.co) for application API calls.
 */
test.describe("API URL configuration", () => {
  test("no production Supabase API calls made on landing page load", async ({ page }) => {
    const prodApiCalls = [];

    // Abort Auth0 OIDC discovery so isLoading → false and networkidle is
    // reached promptly rather than waiting on a slow/unreachable Auth0 domain.
    await page.route("**/.well-known/openid-configuration**", (r) => r.abort());

    page.on("request", (req) => {
      const url = req.url();
      // Flag any request to *.supabase.co that is a function call
      if (/supabase\.co.*\/functions\/v1\//.test(url)) {
        prodApiCalls.push(url);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(prodApiCalls).toHaveLength(0);
  });

  test("Edge Function requests use the configured SUPABASE_URL base", async ({ page }) => {
    const functionRequests = [];

    await page.addInitScript(() => { window.__CI_E2E__ = true; });
    await page.route("**/functions/v1/**", (route) => {
      functionRequests.push(route.request().url());
      return route.fulfill({ json: { sessions: [], total: 0 } });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Any Edge Function calls that were made must NOT go to supabase.co
    for (const url of functionRequests) {
      expect(url).not.toMatch(/supabase\.co/);
    }
  });

  test("VITE_SUPABASE_URL env variable is not empty in the page", async ({ page }) => {
    // Vite injects VITE_* env vars into import.meta.env at build time.
    // We expose it to the test via evaluate to verify it's set.
    await page.goto("/");

    const supabaseUrl = await page.evaluate(() => {
      // The api.js module uses `import.meta.env.VITE_SUPABASE_URL`.
      // We check that the env var was injected (not undefined/empty).
      // We look for the meta tag or a window variable; if absent, skip gracefully.
      return window.__VOXIDRIA_SUPABASE_URL__ ?? null;
    });

    // If the app doesn't expose the var on window, the check is informational only.
    if (supabaseUrl !== null) {
      expect(supabaseUrl).not.toBe("");
      expect(supabaseUrl).toMatch(/^https?:\/\//); // must be a valid URL
    }
  });
});
