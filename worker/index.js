// engin.al Worker (pattern from technoetkinlik / uncvl.xyz worker/index.js)
//
// Static pages are served by Cloudflare's asset layer and never reach this code (wrangler.jsonc:
// assets.run_worker_first only routes /api/* here).
//
// /api/auth/* signs CMS (/admin) editors in with GitHub, the same popup handshake as sveltia-cms-auth.
// Needs GITHUB_CLIENT_ID (wrangler.jsonc "vars") and the secret GITHUB_CLIENT_SECRET
// (npx wrangler secret put GITHUB_CLIENT_SECRET, or the dashboard: Settings → Variables and secrets).

const GITHUB_WEB = "https://github.com";
// The repository is public, so the CMS only needs "public_repo" to commit.
const ALLOWED_SCOPES = ["repo", "public_repo", "read:user", "user:email"];
const DEFAULT_SCOPE = "public_repo";
const STATE_COOKIE = "ea_oauth_state";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === "/api/auth" || p === "/api/auth/callback") return await handleAuth(request, env, url);
    } catch (err) {
      console.error("api error", p, err && err.stack ? err.stack : err);
      if (p.startsWith("/api/auth")) return authResult({ error: "Sign-in failed on the server", errorCode: "SERVER_ERROR" });
      return new Response("Internal error", { status: 500 });
    }
    // Only /api/* is routed here; anything else falls back to the static site.
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },
};

// ---------------------------------------------------------------- GitHub sign-in for the CMS
async function handleAuth(request, env, url) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return authResult({ error: "GitHub sign-in isn't set up on the server yet (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)", errorCode: "MISCONFIGURED_CLIENT" });
  }
  const redirectUri = `${url.origin}/api/auth/callback`;

  if (url.pathname === "/api/auth") {
    const provider = url.searchParams.get("provider");
    if (provider && provider !== "github") return authResult({ error: "Only GitHub sign-in is supported", errorCode: "UNSUPPORTED_BACKEND" });
    const asked = (url.searchParams.get("scope") || "").split(/[\s,]+/).filter((x) => ALLOWED_SCOPES.includes(x));
    const scope = asked.length ? [...new Set(asked)].join(",") : DEFAULT_SCOPE;
    const state = randomHex(16);
    const target = new URL(`${GITHUB_WEB}/login/oauth/authorize`);
    target.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope, state, allow_signup: "false" });
    return new Response(null, {
      status: 302,
      headers: { location: target.toString(), "set-cookie": stateCookie(state, 600), "cache-control": "no-store" },
    });
  }

  // /api/auth/callback
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(request.headers.get("cookie"), STATE_COOKIE);
  if (url.searchParams.get("error")) {
    return authResult({ error: url.searchParams.get("error_description") || url.searchParams.get("error"), errorCode: "AUTH_CODE_REQUEST_FAILED" });
  }
  if (!code || !state) return authResult({ error: "GitHub didn't return a sign-in code", errorCode: "AUTH_CODE_REQUEST_FAILED" });
  if (!expected || !timingSafeEqual(expected, state)) {
    return authResult({ error: "Sign-in expired or came from another window. Please try again.", errorCode: "CSRF_DETECTED" });
  }
  let body;
  try {
    const res = await fetch(`${GITHUB_WEB}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": "engin.al-auth" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    });
    body = await res.json();
  } catch (err) {
    console.warn("github token exchange failed:", String(err));
    return authResult({ error: "Couldn't reach GitHub. Please try again.", errorCode: "TOKEN_REQUEST_FAILED" });
  }
  if (!body || !body.access_token) {
    return authResult({ error: (body && (body.error_description || body.error)) || "GitHub returned no token", errorCode: "TOKEN_REQUEST_FAILED" });
  }
  return authResult({ token: body.access_token });
}

// The popup page GitHub sends the editor back to: announce "authorizing:github" to the CMS window, wait for
// its answer, then post the result back. The result only ever goes to a window on this site's own origin.
function authResult({ token, error, errorCode }) {
  const content = token ? { provider: "github", token } : { provider: "github", error, errorCode };
  const message = `authorization:github:${token ? "success" : "error"}:${JSON.stringify(content)}`;
  const nonce = randomHex(16);
  const script =
    `(function(){var m=${JSON.stringify(message).replace(/</g, "\\u003c")};` +
    `window.addEventListener("message",function(e){if(e.data!=="authorizing:github"||e.origin!==location.origin)return;` +
    `window.opener&&window.opener.postMessage(m,e.origin);setTimeout(function(){window.close()},500)});` +
    `window.opener?window.opener.postMessage("authorizing:github",location.origin):document.getElementById("msg").textContent="Open /admin/ and sign in from there.";})();`;
  const text = token ? "Signed in. You can close this window." : `Sign-in failed: ${error}`;
  const html =
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>engin.al · sign in</title>` +
    `<body style="background:#EDEDE8;color:#121212;font:16px/1.5 system-ui,sans-serif;padding:2rem"><p id="msg">${xml(text)}</p>` +
    `<script nonce="${nonce}">${script}</script></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": stateCookie("", 0),
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function stateCookie(value, maxAge) {
  // SameSite=Lax: the callback is a top-level navigation coming back from github.com.
  return `${STATE_COOKIE}=${value}; Path=/api/auth; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function readCookie(header, name) {
  for (const part of (header || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1)) || null;
  }
  return null;
}
function xml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]);
}
