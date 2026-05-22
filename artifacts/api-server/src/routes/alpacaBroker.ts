import { Router } from "express";
import type { Request } from "express";
import { db } from "@workspace/db";
import { userExchangeConnectionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requirePlan } from "../middlewares/requirePlan.js";
import { alpacaBrokerProvider } from "../services/exchanges/AlpacaBrokerProvider.js";
import { vault } from "../services/vault/CredentialVault.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { AlpacaAdapter } from "../services/exchanges/adapters/AlpacaAdapter.js";

// ── Alpaca Broker / OAuth routes ──────────────────────────────────────────────
//
// Implements the in-app Alpaca one-click connect flow. See
// `services/exchanges/AlpacaBrokerProvider.ts` for the full flow description.
//
// Routes:
//   GET  /api/user/exchanges/alpaca/oauth/config    auth-gated, paid-plan
//   GET  /api/user/exchanges/alpaca/oauth/callback  public (state-verified)
//
// When the provider is not configured (env vars missing), `config` returns
// `{ enabled: false }` so the OnboardingFlow falls back to the existing
// pasted-key / external-CTA path with zero UI churn.

const router = Router();
type AuthReq = Request & { clerkUserId: string };

router.get(
  "/user/exchanges/alpaca/oauth/config",
  requireAuth,
  requirePlan("starter"),
  (req, res): void => {
    if (!alpacaBrokerProvider.isEnabled()) {
      res.json({ enabled: false });
      return;
    }
    const userId = (req as AuthReq).clerkUserId;
    // Bind the opener's origin into the signed state so the callback can
    // postMessage back with a precise targetOrigin (defense-in-depth: not
    // `"*"`). Falls back to "" — callback will then post with "*" rather
    // than fail closed.
    const openerOrigin = String(req.headers["origin"] ?? "");
    const state = alpacaBrokerProvider.signState(userId, openerOrigin);
    res.json({
      enabled:      true,
      authorizeUrl: alpacaBrokerProvider.buildAuthorizeUrl(state),
      scope:        alpacaBrokerProvider.scope,
    });
  },
);

// ── OAuth callback ────────────────────────────────────────────────────────────
//
// Alpaca redirects back here with `?code=...&state=...`. We:
//   1. Verify state (HMAC-signed userId + 10-min TTL).
//   2. Exchange code → access_token at api.alpaca.markets/oauth/token.
//   3. Hit Alpaca /v2/account with the Bearer token to confirm the grant
//      actually works before persisting.
//   4. Encrypt and upsert into user_exchange_connections.
//   5. Render a tiny HTML page that postMessage()s to the opener popup and
//      closes itself. The opener (OnboardingFlow.tsx) advances to "intro".
//
// Public route — no requireAuth — because the browser arrives here via a
// third-party 302 with no cookie context guaranteed. Identity comes from
// the HMAC-signed state token instead.

router.get("/user/exchanges/alpaca/oauth/callback", async (req, res): Promise<void> => {
  const code  = String(req.query["code"]  ?? "");
  const state = String(req.query["state"] ?? "");
  const err   = req.query["error"] ? String(req.query["error_description"] ?? req.query["error"]) : "";

  if (err) {
    res.status(400).send(renderClosePage({ ok: false, error: err }));
    return;
  }
  if (!code || !state) {
    res.status(400).send(renderClosePage({ ok: false, error: "Missing code or state" }));
    return;
  }

  const verified = alpacaBrokerProvider.verifyState(state);
  if (!verified) {
    res.status(400).send(renderClosePage({ ok: false, error: "Invalid or expired state" }));
    return;
  }
  const { userId, openerOrigin } = verified;

  let token;
  try {
    token = await alpacaBrokerProvider.exchangeCode(code);
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, "alpacaBroker: token exchange failed");
    res.status(502).send(renderClosePage({ ok: false, error: (e as Error).message }));
    return;
  }

  // Verify the token actually grants the trading scope by calling /v2/account.
  // Avoids storing a token that won't work at execution time.
  const expiresAt = token.expires_in ? Date.now() + token.expires_in * 1000 : undefined;
  try {
    const adapter = new AlpacaAdapter({ oauthAccessToken: token.access_token });
    await adapter.getAccount();
  } catch (e) {
    req.log.warn({ userId, err: (e as Error).message }, "alpacaBroker: token failed live account probe");
    res.status(502).send(renderClosePage({
      ok: false,
      error: `Alpaca rejected the access token: ${(e as Error).message}`,
    }));
    return;
  }

  const encryptedBlob = vault.encryptBlob(userId, {
    apiKey:            "",
    apiSecret:         "",
    oauthAccessToken:  token.access_token,
    oauthRefreshToken: token.refresh_token,
    oauthExpiresAt:    expiresAt,
    oauthScope:        token.scope,
    label:             "Alpaca (OAuth)",
  });

  try {
    const now = new Date();
    await db
      .insert(userExchangeConnectionsTable)
      .values({
        userId,
        exchange:       "Alpaca",
        label:          "Alpaca (OAuth)",
        encryptedBlob,
        status:         "active",
        isDefault:      false,
        tradingMode:    "paper",
        permissions:    { read: true, trade: true, withdraw: false as const },
        lastVerifiedAt: now,
        lastError:      null,
      })
      .onConflictDoUpdate({
        target: [userExchangeConnectionsTable.userId, userExchangeConnectionsTable.exchange],
        set: {
          label:          "Alpaca (OAuth)",
          encryptedBlob,
          status:         "active",
          permissions:    { read: true, trade: true, withdraw: false as const },
          lastVerifiedAt: now,
          lastError:      null,
          updatedAt:      now,
        },
      });
    auditLogger.append(userId, "CREDENTIAL_STORED", { exchange: "Alpaca", method: "oauth" }, { exchange: "Alpaca" });
    req.log.info({ userId }, "alpacaBroker: OAuth connection stored");
  } catch (e) {
    req.log.error({ err: (e as Error).message }, "alpacaBroker: failed to persist connection");
    res.status(500).send(renderClosePage({ ok: false, error: "Failed to save connection" }));
    return;
  }

  res.send(renderClosePage({ ok: true }, openerOrigin));
});

// ── Tiny popup-closer HTML ───────────────────────────────────────────────────
// Posts a message to the opener so OnboardingFlow can react, then closes.

function renderClosePage(
  result: { ok: boolean; error?: string },
  openerOrigin = "",
): string {
  const json = JSON.stringify({ source: "aicandlez:alpaca-oauth", ...result });
  // Only honor an http(s) origin we signed into state — never trust a
  // free-form value at HTML-render time. Falls back to "*" so the popup
  // still closes cleanly in unusual hosting topologies.
  const safeOrigin = /^https?:\/\/[a-z0-9.\-:]+$/i.test(openerOrigin) ? openerOrigin : "*";
  const targetOriginLiteral = JSON.stringify(safeOrigin);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Alpaca connect</title>
<style>
  body{margin:0;background:#000;color:#E8F5EC;font-family:-apple-system,Inter,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:420px;text-align:center}
  .ok{color:#66FF66}.err{color:#FF6478}
  h1{font-size:18px;margin:0 0 8px}p{font-size:13px;color:#8A9C94;line-height:1.55;margin:0}
</style></head><body>
<div class="card">
  <h1 class="${result.ok ? "ok" : "err"}">${result.ok ? "Alpaca connected ✓" : "Connection failed"}</h1>
  <p>${result.ok
    ? "You can close this window — we&rsquo;ll take you back to AICandlez."
    : escapeHtml(result.error ?? "Unknown error")}</p>
</div>
<script>
  try { if (window.opener) window.opener.postMessage(${json}, ${targetOriginLiteral}); } catch (e) {}
  setTimeout(function(){ try { window.close(); } catch(e){} }, 800);
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export default router;
