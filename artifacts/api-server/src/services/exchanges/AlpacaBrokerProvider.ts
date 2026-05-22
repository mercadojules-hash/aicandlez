import crypto from "node:crypto";
import https from "node:https";
import { logger } from "../../lib/logger.js";

// ── AlpacaBrokerProvider ──────────────────────────────────────────────────────
//
// Server-side handler for the in-app Alpaca account-opening + OAuth flow.
//
// Powers the one-click "Connect Alpaca" CTA in OnboardingFlow.tsx (both PWA
// and trading-dashboard). When configured, the onboarding UI swaps its
// external CTA (sends user to alpaca.markets in a new tab) for an in-product
// OAuth handshake:
//
//   1. Frontend pulls public config (clientId, authorizeUrl) from
//      `GET /api/user/exchanges/alpaca/oauth/config`.
//   2. Frontend opens authorizeUrl in a popup. User signs in to Alpaca (or
//      signs up — Alpaca's hosted page handles both) and approves the scope.
//   3. Alpaca redirects to `/api/user/exchanges/alpaca/oauth/callback` with
//      `code` + `state`. The callback exchanges code → access_token, then
//      stores it via the CredentialVault (AES-256-GCM, per-user PBKDF2 key).
//   4. AlpacaAdapter routes via `Authorization: Bearer <token>` whenever
//      `oauthAccessToken` is present on the decrypted credential blob.
//
// Provider is enabled iff all of these env vars are set:
//   - ALPACA_OAUTH_CLIENT_ID
//   - ALPACA_OAUTH_CLIENT_SECRET
//   - ALPACA_OAUTH_REDIRECT_URI   (must match Alpaca-side allow-list exactly)
//
// When unset, `isEnabled()` returns false and the onboarding UI falls back
// to the pasted-API-keys / external CTA path. This is the documented
// extension surface from OnboardingFlow.tsx.

const AUTHORIZE_URL = "https://app.alpaca.markets/oauth/authorize";
const TOKEN_HOST    = "api.alpaca.markets";
const TOKEN_PATH    = "/oauth/token";
const DEFAULT_SCOPE = "account:write trading";

export interface AlpacaOAuthTokenResponse {
  access_token:   string;
  token_type:     string;
  scope?:         string;
  refresh_token?: string;
  expires_in?:    number;   // seconds
}

class AlpacaBrokerProvider {
  /** Public id of the OAuth client — safe to ship to the browser. */
  get clientId(): string | undefined {
    return process.env["ALPACA_OAUTH_CLIENT_ID"];
  }
  get clientSecret(): string | undefined {
    return process.env["ALPACA_OAUTH_CLIENT_SECRET"];
  }
  get redirectUri(): string | undefined {
    return process.env["ALPACA_OAUTH_REDIRECT_URI"];
  }
  get scope(): string {
    return process.env["ALPACA_OAUTH_SCOPE"] ?? DEFAULT_SCOPE;
  }

  /** True when the provider has every secret required to run the OAuth handshake. */
  isEnabled(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  /**
   * Build the Alpaca authorize URL the frontend should open in a popup.
   * `state` is the HMAC-signed userId+nonce produced by `signState`.
   */
  buildAuthorizeUrl(state: string): string {
    if (!this.isEnabled()) {
      throw new Error("AlpacaBrokerProvider is not configured");
    }
    const params = new URLSearchParams({
      response_type: "code",
      client_id:     this.clientId!,
      redirect_uri:  this.redirectUri!,
      scope:         this.scope,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Sign userId into a short-lived state token. Verified server-side on the
   * OAuth callback so a stolen code cannot be redeemed against a different
   * account. 10-minute window matches Alpaca's auth-code TTL.
   */
  signState(userId: string, openerOrigin = ""): string {
    const secret = this.clientSecret!;
    const nonce  = crypto.randomBytes(8).toString("hex");
    const expiry = Date.now() + 10 * 60 * 1000;
    // `|` is reserved as our payload field separator; strip it from the
    // caller-supplied origin so it cannot smuggle extra fields into the
    // signed blob.
    const safeOrigin = openerOrigin.replace(/\|/g, "");
    const payload = `${userId}|${nonce}|${expiry}|${safeOrigin}`;
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
  }

  /**
   * Reverses `signState`. Returns `{userId, openerOrigin}` on success;
   * null on tamper / expiry. `openerOrigin` is "" when none was bound at
   * signing time (back-compat for older state tokens still in flight).
   */
  verifyState(state: string): { userId: string; openerOrigin: string } | null {
    if (!this.clientSecret) return null;
    const [payloadB64, sig] = state.split(".");
    if (!payloadB64 || !sig) return null;
    let payload: string;
    try { payload = Buffer.from(payloadB64, "base64url").toString("utf8"); }
    catch { return null; }
    const expected = crypto.createHmac("sha256", this.clientSecret).update(payload).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const [userId, _nonce, expiryStr, openerOrigin = ""] = payload.split("|");
    const expiry = Number(expiryStr);
    if (!userId || !expiry || Date.now() > expiry) return null;
    return { userId, openerOrigin };
  }

  /** Exchange an authorization code for an access token. */
  exchangeCode(code: string): Promise<AlpacaOAuthTokenResponse> {
    if (!this.isEnabled()) {
      return Promise.reject(new Error("AlpacaBrokerProvider is not configured"));
    }
    const body = new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      client_id:     this.clientId!,
      client_secret: this.clientSecret!,
      redirect_uri:  this.redirectUri!,
    }).toString();
    return this.postToken(body, "token exchange");
  }

  /**
   * Refresh an OAuth access token using a previously-issued refresh token.
   * Used by `AlpacaTokenRefresher` so customers' live trading keeps working
   * past `oauthExpiresAt` without forcing them back through the consent
   * popup. Alpaca's refresh endpoint mirrors the standard OAuth2 contract:
   * POST `/oauth/token` with `grant_type=refresh_token`.
   */
  refresh(refreshToken: string): Promise<AlpacaOAuthTokenResponse> {
    if (!this.isEnabled()) {
      return Promise.reject(new Error("AlpacaBrokerProvider is not configured"));
    }
    if (!refreshToken) {
      return Promise.reject(new Error("Missing refresh_token"));
    }
    const body = new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      client_id:     this.clientId!,
      client_secret: this.clientSecret!,
    }).toString();
    return this.postToken(body, "token refresh");
  }

  private postToken(body: string, label: string): Promise<AlpacaOAuthTokenResponse> {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: TOKEN_HOST,
        path:     TOKEN_PATH,
        method:   "POST",
        headers: {
          "Content-Type":   "application/x-www-form-urlencoded",
          "Content-Length": String(Buffer.byteLength(body)),
          "Accept":         "application/json",
        },
      }, res => {
        let raw = "";
        res.on("data", c => { raw += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (res.statusCode && res.statusCode >= 400) {
              const errMsg = String(parsed["error_description"] ?? parsed["error"] ?? `HTTP ${res.statusCode}`);
              logger.warn({ status: res.statusCode, error: parsed["error"], op: label }, `AlpacaBrokerProvider: ${label} failed`);
              reject(new Error(errMsg));
              return;
            }
            if (typeof parsed["access_token"] !== "string") {
              reject(new Error(`Alpaca OAuth (${label}) response missing access_token`));
              return;
            }
            resolve(parsed as unknown as AlpacaOAuthTokenResponse);
          } catch {
            reject(new Error(`Alpaca OAuth (${label}): non-JSON response — ${raw.slice(0, 200)}`));
          }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

export const alpacaBrokerProvider = new AlpacaBrokerProvider();
