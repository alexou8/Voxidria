import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";
import { MockAuth0Provider } from "./test-utils/MockAuth0Provider";
import App from "./App";
import "./index.css";

// Strip any protocol prefix — Auth0Provider expects a bare domain (e.g. "alexou.ca.auth0.com")
const rawDomain = import.meta.env.VITE_AUTH0_DOMAIN || "";
const domain    = rawDomain.replace(/^https?:\/\//, "");
const clientId  = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience  = import.meta.env.VITE_AUTH0_AUDIENCE;

// CI E2E mode: replace real Auth0 with a mock provider so Playwright tests
// don't need live Auth0 credentials.
//
// Activated by:
//   • VITE_CI_E2E=true   — build-time flag (tree-shaken out of prod bundles)
//   • window.__CI_E2E__  — runtime flag set by Playwright addInitScript;
//     only honoured in dev mode so it can never activate in production.
const isCiE2E =
  import.meta.env.VITE_CI_E2E === "true" ||
  (import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.__CI_E2E__ === true);

function RealAuth0Provider({ children }) {
  return (
    <Auth0Provider
      domain={domain || "YOUR_AUTH0_DOMAIN"}
      clientId={clientId || "YOUR_AUTH0_CLIENT_ID"}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: audience || "voxidria",
      }}
    >
      {children}
    </Auth0Provider>
  );
}

const AuthProvider = isCiE2E ? MockAuth0Provider : RealAuth0Provider;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
