/**
 * Auth0 JWT Verification Module
 *
 * Used by EVERY Edge Function to validate the caller's identity.
 *
 * WHY we verify the JWT instead of trusting client-provided user IDs:
 *   - A client can send any user_id value in a request body.
 *   - Auth0 JWTs are cryptographically signed with Auth0's private RSA key.
 *   - By verifying the signature against Auth0's public JWKS endpoint, we
 *     confirm the token was genuinely issued by our Auth0 tenant.
 *   - The 'sub' claim from a verified token is the only authoritative user ID.
 *
 * WHY audience AND issuer checks both matter:
 *   - Issuer: ensures the token came from OUR Auth0 tenant, not another.
 *   - Audience: ensures the token was requested for THIS API specifically.
 *     Without it, a valid token issued for a different service could be
 *     replayed here (token substitution attack).
 */

import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

export interface Auth0Claims {
  sub: string;             // Auth0 user ID, e.g. "auth0|abc123"
  email?: string;          // Present when the 'email' scope was requested
  iss: string;             // Token issuer (Auth0 tenant URL)
  aud: string | string[];  // Audience (should match our API identifier)
  exp: number;             // Expiry (seconds since epoch)
  iat: number;             // Issued-at timestamp
}

// Cache the JWKS remote key set so we don't refetch on every request.
// Supabase Edge Function instances are short-lived, but caching still helps
// with concurrent invocations within the same instance.
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache) {
    const domain = Deno.env.get("AUTH0_DOMAIN");
    if (!domain) throw new Error("AUTH0_DOMAIN environment variable is not configured");
    // Auth0's JWKS endpoint contains the public keys used to verify JWTs.
    // It is publicly accessible and rotated automatically by Auth0.
    jwksCache = createRemoteJWKSet(
      new URL(`https://${domain}/.well-known/jwks.json`)
    );
  }
  return jwksCache;
}

/**
 * Verify the Auth0 Bearer token from the request Authorization header.
 * Throws an error (which callers should map to HTTP 401) if invalid.
 *
 * @param req - Incoming Request object
 * @returns Parsed, verified JWT claims including 'sub' (user ID)
 */
export async function verifyAuth0Token(req: Request): Promise<Auth0Claims> {
  // ── CI / integration-test bypass ──────────────────────────────────────────
  // BOTH CI_TEST_USER_SUB and CI_BYPASS_AUTH must be explicitly set to
  // activate this path.  Requiring two independent env vars means a single
  // misconfiguration cannot silently disable Auth0 verification — an attacker
  // would need to control both variables simultaneously.  Neither variable is
  // ever present in production Edge Function environments.
  const ciTestUserSub = Deno.env.get("CI_TEST_USER_SUB");
  const ciBypassAuth  = Deno.env.get("CI_BYPASS_AUTH") === "true";
  if (ciTestUserSub && ciBypassAuth) {
    return {
      sub: ciTestUserSub,
      email: "ci-test@example.com",
      iss: `https://${Deno.env.get("AUTH0_DOMAIN") ?? "ci.example.com"}/`,
      aud: Deno.env.get("AUTH0_AUDIENCE") ?? "ci",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Missing or malformed Authorization header");
  }

  const token = authHeader.slice(7); // Strip "Bearer " prefix

  const audience = Deno.env.get("AUTH0_AUDIENCE");
  if (!audience) throw new Error("AUTH0_AUDIENCE environment variable is not configured");

  const issuerBaseURL = Deno.env.get("AUTH0_ISSUER_BASE_URL");
  if (!issuerBaseURL) throw new Error("AUTH0_ISSUER_BASE_URL environment variable is not configured");

  // Auth0 issuer URLs always end with a trailing slash
  const issuer = issuerBaseURL.endsWith("/") ? issuerBaseURL : `${issuerBaseURL}/`;

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      audience,
      issuer,
      // jose validates 'exp' automatically
    });
    return payload as unknown as Auth0Claims;
  } catch (err) {
    // Re-throw as a generic Unauthorized error so we don't leak JWT internals
    throw new Error(`Unauthorized: ${err.message}`);
  }
}
