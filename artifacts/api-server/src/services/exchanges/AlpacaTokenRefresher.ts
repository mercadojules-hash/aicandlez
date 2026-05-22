import { db } from "@workspace/db";
import { userExchangeConnectionsTable } from "@workspace/db";
import type { UserExchangeConnection } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { alpacaBrokerProvider } from "./AlpacaBrokerProvider.js";
import { vault } from "../vault/CredentialVault.js";
import type { ExchangeCredentials } from "../vault/CredentialVault.js";
import { auditLogger } from "../telemetry/AuditLogger.js";
import { logger } from "../../lib/logger.js";

// ── AlpacaTokenRefresher ──────────────────────────────────────────────────────
//
// Keeps customers' one-click Alpaca OAuth connections alive. The access
// tokens issued by AlpacaBrokerProvider.exchangeCode() expire (typically
// in hours); without refresh, every live AI trade for that customer would
// start 401-ing silently until they reconnect.
//
// Two entry points:
//
//   ensureFreshAlpacaCreds(userId, row, creds)
//     Just-in-time refresh used by live order execution, balance fetches,
//     and re-test paths. If the access token is within REFRESH_BUFFER_MS
//     of expiry and a refresh_token is present, exchange it, re-encrypt
//     the blob, persist, and return the new creds. On failure the row is
//     marked `status: "error"` with `lastError` so the UI can prompt
//     re-auth.
//
//   startAlpacaTokenRefresher()
//     Background sweep (every SCAN_INTERVAL_MS) that finds Alpaca rows
//     whose tokens are nearing expiry and refreshes them proactively.
//     Runs once at boot, then on interval, never throws upstream.
//
// All refreshes write an audit log entry (CREDENTIAL_STORED on success,
// AUTH_FAILURE on failure) so refresh activity is traceable in compliance
// queries.

// Refresh when access token expires in less than this many ms.
const REFRESH_BUFFER_MS = 10 * 60 * 1000;     // 10 min

// Background sweep cadence. Cheap to run — one DB query + at most a
// handful of HTTP roundtrips per pass.
const SCAN_INTERVAL_MS  = 5 * 60 * 1000;      // 5 min

let scheduler: NodeJS.Timeout | null = null;

// In-flight refresh dedupe. Two live orders for the same connection that
// both trip the refresh buffer must not race two `/oauth/token` calls —
// Alpaca may invalidate the older refresh_token when the second exchange
// succeeds, knocking a previously-healthy customer into an "errored"
// state. Keyed by row id so concurrent callers for the same connection
// share one refresh promise; non-overlapping rows still run in parallel.
const inFlightRefreshes = new Map<string, Promise<ExchangeCredentials>>();

/**
 * Returns true when the row needs a refresh: Alpaca exchange, OAuth-issued
 * (refresh_token present), and either no expiry recorded or expiring inside
 * the buffer window.
 */
function needsRefresh(row: { exchange: string }, creds: ExchangeCredentials): boolean {
  if (row.exchange !== "Alpaca") return false;
  if (!creds.oauthAccessToken || !creds.oauthRefreshToken) return false;
  const expiresAt = creds.oauthExpiresAt;
  if (!expiresAt) return false;
  return expiresAt - Date.now() <= REFRESH_BUFFER_MS;
}

/**
 * Refresh an Alpaca OAuth connection in place: hit the token endpoint,
 * re-encrypt the new tokens, update the row, audit. Throws on refresh
 * failure (after marking the row errored) so callers can decide whether
 * to fail their request or proceed.
 */
async function refreshRow(
  userId: string,
  row: UserExchangeConnection,
  creds: ExchangeCredentials,
): Promise<ExchangeCredentials> {
  const refreshToken = creds.oauthRefreshToken!;
  try {
    const token = await alpacaBrokerProvider.refresh(refreshToken);
    const newCreds: ExchangeCredentials = {
      ...creds,
      oauthAccessToken:  token.access_token,
      oauthRefreshToken: token.refresh_token ?? refreshToken,
      oauthExpiresAt:    token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
      oauthScope:        token.scope ?? creds.oauthScope,
    };
    const encryptedBlob = vault.encryptBlob(userId, newCreds);
    const now = new Date();
    await db
      .update(userExchangeConnectionsTable)
      .set({
        encryptedBlob,
        status:         "active",
        lastError:      null,
        lastVerifiedAt: now,
        updatedAt:      now,
      })
      .where(eq(userExchangeConnectionsTable.id, row.id));

    auditLogger.append(
      userId,
      "CREDENTIAL_STORED",
      { exchange: "Alpaca", method: "oauth_refresh", expiresAt: newCreds.oauthExpiresAt ?? null },
      { exchange: "Alpaca" },
    );
    logger.info(
      { userId, exchange: "Alpaca", expiresAt: newCreds.oauthExpiresAt ?? null },
      "AlpacaTokenRefresher: token refreshed",
    );
    return newCreds;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(userExchangeConnectionsTable)
        .set({
          status:    "error",
          lastError: `Alpaca OAuth refresh failed: ${msg}`,
          updatedAt: new Date(),
        })
        .where(eq(userExchangeConnectionsTable.id, row.id));
    } catch (dbErr) {
      logger.warn(
        { userId, err: dbErr instanceof Error ? dbErr.message : String(dbErr) },
        "AlpacaTokenRefresher: failed to mark row errored after refresh failure",
      );
    }
    auditLogger.append(
      userId,
      "AUTH_FAILURE",
      { exchange: "Alpaca", reason: "oauth_refresh_failed", err: msg },
      { exchange: "Alpaca" },
    );
    logger.warn({ userId, err: msg }, "AlpacaTokenRefresher: token refresh failed");
    throw new Error(`Alpaca OAuth refresh failed: ${msg}`);
  }
}

/**
 * Just-in-time helper called from any code path that has already decrypted
 * a row's credentials and is about to use them against Alpaca. Returns the
 * (possibly-refreshed) creds. Non-Alpaca rows and rows that don't need a
 * refresh are returned unchanged.
 *
 * Refresh failures throw — caller decides whether that aborts the request
 * or surfaces a degraded response (`liveUserExecution` treats it as an
 * exchange-reject so the customer gets a notification).
 */
export async function ensureFreshAlpacaCreds(
  userId: string,
  row: UserExchangeConnection,
  creds: ExchangeCredentials,
): Promise<ExchangeCredentials> {
  if (!needsRefresh(row, creds)) return creds;
  const existing = inFlightRefreshes.get(row.id);
  if (existing) return existing;
  const p = refreshRow(userId, row, creds).finally(() => {
    inFlightRefreshes.delete(row.id);
  });
  inFlightRefreshes.set(row.id, p);
  return p;
}

/**
 * Sweep all active Alpaca rows and refresh any whose tokens are within
 * the buffer window. Never throws — per-row failures are isolated.
 */
export async function refreshExpiringAlpacaTokens(): Promise<{
  scanned: number; refreshed: number; failed: number;
}> {
  if (!alpacaBrokerProvider.isEnabled()) {
    return { scanned: 0, refreshed: 0, failed: 0 };
  }
  let rows: UserExchangeConnection[] = [];
  try {
    rows = await db
      .select()
      .from(userExchangeConnectionsTable)
      .where(
        and(
          eq(userExchangeConnectionsTable.exchange, "Alpaca"),
          eq(userExchangeConnectionsTable.status,   "active"),
        ),
      );
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "AlpacaTokenRefresher: scan query failed",
    );
    return { scanned: 0, refreshed: 0, failed: 0 };
  }

  let refreshed = 0;
  let failed    = 0;
  for (const row of rows) {
    const creds = vault.decryptBlob(row.userId, row.encryptedBlob);
    if (!creds) continue;
    if (!needsRefresh(row, creds)) continue;
    try {
      await refreshRow(row.userId, row, creds);
      refreshed += 1;
    } catch {
      failed += 1;
    }
  }
  if (refreshed > 0 || failed > 0) {
    logger.info({ scanned: rows.length, refreshed, failed }, "AlpacaTokenRefresher: sweep complete");
  }
  return { scanned: rows.length, refreshed, failed };
}

/**
 * Start the background sweep. Idempotent. Runs once shortly after boot
 * then on a recurring interval. Both timers are `.unref()`d so they do
 * not keep the process alive during shutdown.
 */
export function startAlpacaTokenRefresher(): void {
  if (scheduler) return;
  if (!alpacaBrokerProvider.isEnabled()) {
    logger.info("AlpacaTokenRefresher: provider disabled — scheduler not started");
    return;
  }
  // First pass shortly after boot so freshly-restarted servers catch up.
  setTimeout(() => {
    refreshExpiringAlpacaTokens().catch(err =>
      logger.warn({ err: err instanceof Error ? err.message : String(err) },
        "AlpacaTokenRefresher: initial sweep failed"),
    );
  }, 30_000).unref();

  scheduler = setInterval(() => {
    refreshExpiringAlpacaTokens().catch(err =>
      logger.warn({ err: err instanceof Error ? err.message : String(err) },
        "AlpacaTokenRefresher: scheduled sweep failed"),
    );
  }, SCAN_INTERVAL_MS);
  scheduler.unref();
  logger.info({ intervalMs: SCAN_INTERVAL_MS, bufferMs: REFRESH_BUFFER_MS }, "AlpacaTokenRefresher: scheduler started");
}

export function stopAlpacaTokenRefresher(): void {
  if (scheduler) {
    clearInterval(scheduler);
    scheduler = null;
  }
}
