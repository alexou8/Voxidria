/**
 * MockAuth0Provider
 *
 * A lightweight drop-in replacement for Auth0Provider used exclusively during
 * CI E2E tests and local Playwright runs.  It injects a fake Auth0Context so
 * that every call to useAuth0() returns a pre-authenticated mock user without
 * making any real network requests to Auth0.
 *
 * Activation:
 *   - Build-time:  VITE_CI_E2E=true  (dead-code eliminated in prod builds)
 *   - Runtime:     window.__CI_E2E__ = true  (set by Playwright addInitScript,
 *                  only honoured when import.meta.env.DEV is true)
 *
 * This provider is NEVER activated in production because:
 *   1. VITE_CI_E2E is not set in production builds.
 *   2. The window.__CI_E2E__ path is guarded by import.meta.env.DEV.
 *   3. The backend still enforces real JWT auth; mock tokens return 401 from
 *      any live Supabase instance that doesn't have CI_TEST_USER_SUB set.
 */
import { Auth0Context } from "@auth0/auth0-react";

const MOCK_USER = {
  sub: "test|ci-user-123",
  name: "CI Test User",
  email: "ci-test@example.com",
  picture: "",
  updated_at: new Date().toISOString(),
};

const MOCK_CONTEXT = {
  isAuthenticated: true,
  isLoading: false,
  user: MOCK_USER,
  loginWithRedirect: async () => {},
  logout: async () => {},
  getAccessTokenSilently: async () => "ci-mock-access-token",
  getAccessTokenWithPopup: async () => "ci-mock-access-token",
  getIdTokenClaims: async () => ({ __raw: "ci-mock-id-token", ...MOCK_USER }),
  loginWithPopup: async () => {},
  handleRedirectCallback: async () => ({ appState: {} }),
  buildAuthorizeUrl: async () => "https://ci.example.com/authorize",
  buildLogoutUrl: () => "https://ci.example.com/logout",
};

export function MockAuth0Provider({ children }) {
  return (
    <Auth0Context.Provider value={MOCK_CONTEXT}>
      {children}
    </Auth0Context.Provider>
  );
}
