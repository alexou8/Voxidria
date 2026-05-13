import { test, expect } from "@playwright/test";

/**
 * LandingPage tests — no auth required.
 * Verifies the unauthenticated hero, CTAs, stats, and informational sections.
 */
test.describe("LandingPage", () => {
  test.beforeEach(async ({ page }) => {
    // Do NOT set window.__CI_E2E__ — RealAuth0Provider is used so we test the
    // genuine unauthenticated landing page.
    //
    // Auth0Provider calls checkSession() asynchronously after the first render,
    // keeping isLoading=true (and showing only a spinner) until the request
    // settles. Aborting the OIDC discovery request forces Auth0 to fail fast
    // so isLoading→false before any of our assertions run.
    await page.route("**/.well-known/openid-configuration**", (r) => r.abort());
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("page title contains Voxidria", async ({ page }) => {
    await expect(page).toHaveTitle(/Voxidria/i);
  });

  test("hero headline is visible", async ({ page }) => {
    // App.jsx shows LandingPage at / when not authenticated
    // LandingPage.jsx renders h1 with 'Hear what your' + 'voice reveals'
    await expect(page.locator("h1")).toBeVisible();
    const h1Text = await page.locator("h1").innerText();
    expect(h1Text.toLowerCase()).toContain("voice");
  });

  test("Start Free Screening CTA button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Start Free Screening/i })
    ).toBeVisible();
  });

  test("Sign In button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Sign In/i })
    ).toBeVisible();
  });

  test("How it works button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /How it works/i })
    ).toBeVisible();
  });

  test("How it works scrolls to #how section", async ({ page }) => {
    await page.getByRole("button", { name: /How it works/i }).click();
    // The #how section should exist in the DOM
    await expect(page.locator("#how")).toBeAttached();
  });

  test("medical disclaimer is present", async ({ page }) => {
    await expect(
      page.getByText(/Medical Disclaimer/i)
    ).toBeVisible();
  });

  test("screening statistics row is rendered", async ({ page }) => {
    // LandingPage renders a stats row with 'Average screening time'
    await expect(
      page.getByText(/Average screening time/i)
    ).toBeVisible();
  });

  test("Core capabilities section is present", async ({ page }) => {
    await expect(
      page.getByText(/Core capabilities/i)
    ).toBeVisible();
  });

  test("navigation bar is rendered", async ({ page }) => {
    await expect(page.locator("nav")).toBeVisible();
  });

  test("footer with copyright is rendered", async ({ page }) => {
    await expect(page.locator("footer")).toBeVisible();
  });
});
