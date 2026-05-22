import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────
// We stub everything that would otherwise reach a real Postgres, the real
// Alpaca token endpoint, or the structured pino logger. The vault is the
// real in-memory CredentialVault — that is the point of the integration:
// prove that refresh actually re-encrypts through the same code path live
// callers use.

const { updateCalls, refreshStub, auditEntries } = vi.hoisted(() => ({
  updateCalls:  [] as Array<{ id: string; set: Record<string, unknown> }>,
  refreshStub:  vi.fn(),
  auditEntries: [] as Array<{ userId: string; type: string; payload: unknown }>,
}));

vi.mock("drizzle-orm", () => ({
  eq:  (col: { name: string }, value: unknown) => ({ col: col?.name, value }),
  and: (..._args: unknown[]) => ({ kind: "and" }),
}));

vi.mock("@workspace/db", () => {
  const userExchangeConnectionsTable = {
    id:        { name: "id" },
    userId:    { name: "userId" },
    exchange:  { name: "exchange" },
    status:    { name: "status" },
  };

  const db = {
    update(_table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(clause: { value: string }) {
              updateCalls.push({ id: clause.value, set: values });
              return Promise.resolve();
            },
          };
        },
      };
    },
    select() {
      return {
        from(_table: unknown) {
          return {
            where(_clause: unknown) {
              return Promise.resolve([]);
            },
          };
        },
      };
    },
  };

  return { db, userExchangeConnectionsTable };
});

vi.mock("../AlpacaBrokerProvider.js", () => ({
  alpacaBrokerProvider: {
    isEnabled: () => true,
    refresh:   refreshStub,
  },
}));

vi.mock("../../telemetry/AuditLogger.js", () => ({
  auditLogger: {
    append(userId: string, type: string, payload: unknown) {
      auditEntries.push({ userId, type, payload });
    },
  },
}));

vi.mock("../../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Imports under test ────────────────────────────────────────────────────────
// Imported *after* the mocks so the module wires through the stubs.

import { ensureFreshAlpacaCreds } from "../AlpacaTokenRefresher.js";
import { vault, type ExchangeCredentials } from "../../vault/CredentialVault.js";
import type { UserExchangeConnection } from "@workspace/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user_test_1";

function makeRow(overrides: Partial<UserExchangeConnection> = {}): UserExchangeConnection {
  return {
    id:             "row_1",
    userId:         USER_ID,
    exchange:       "Alpaca",
    status:         "active",
    encryptedBlob:  "",
    lastError:      null,
    lastVerifiedAt: null,
    createdAt:      new Date(),
    updatedAt:      new Date(),
    // The schema has more nullable columns the refresher never touches —
    // cast through `unknown` so tests don't depend on every column.
  } as unknown as UserExchangeConnection;
  void overrides;
}

function makeCreds(overrides: Partial<ExchangeCredentials> = {}): ExchangeCredentials {
  return {
    apiKey:            "",
    apiSecret:         "",
    oauthAccessToken:  "access-old",
    oauthRefreshToken: "refresh-old",
    oauthExpiresAt:    Date.now() + 60 * 60 * 1000,
    oauthScope:        "account:write trading",
    ...overrides,
  };
}

beforeEach(() => {
  updateCalls.length = 0;
  auditEntries.length = 0;
  refreshStub.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AlpacaTokenRefresher.ensureFreshAlpacaCreds", () => {
  it("does not refresh when access token is well outside the 10-minute buffer", async () => {
    const row   = makeRow();
    const creds = makeCreds({ oauthExpiresAt: Date.now() + 60 * 60 * 1000 });

    const result = await ensureFreshAlpacaCreds(USER_ID, row, creds);

    expect(result).toBe(creds);
    expect(refreshStub).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("refreshes when access token is within the 10-minute buffer, re-encrypts, persists, audits", async () => {
    const row   = makeRow();
    const creds = makeCreds({ oauthExpiresAt: Date.now() + 5 * 60 * 1000 });

    refreshStub.mockResolvedValueOnce({
      access_token:  "access-new",
      token_type:    "Bearer",
      refresh_token: "refresh-new",
      expires_in:    3600,
      scope:         "account:write trading",
    });

    const result = await ensureFreshAlpacaCreds(USER_ID, row, creds);

    expect(refreshStub).toHaveBeenCalledTimes(1);
    expect(refreshStub).toHaveBeenCalledWith("refresh-old");

    expect(result.oauthAccessToken).toBe("access-new");
    expect(result.oauthRefreshToken).toBe("refresh-new");
    expect(result.oauthExpiresAt).toBeGreaterThan(Date.now());

    // DB row updated to active + re-encrypted blob that the real vault can
    // round-trip back to the new credentials.
    expect(updateCalls).toHaveLength(1);
    const upd = updateCalls[0]!;
    expect(upd.id).toBe(row.id);
    expect(upd.set["status"]).toBe("active");
    expect(upd.set["lastError"]).toBeNull();
    expect(typeof upd.set["encryptedBlob"]).toBe("string");

    const roundTripped = vault.decryptBlob(USER_ID, upd.set["encryptedBlob"] as string);
    expect(roundTripped?.oauthAccessToken).toBe("access-new");
    expect(roundTripped?.oauthRefreshToken).toBe("refresh-new");

    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]!.type).toBe("CREDENTIAL_STORED");
  });

  it("keeps the prior refresh_token when Alpaca omits one on refresh response", async () => {
    const row   = makeRow();
    const creds = makeCreds({ oauthExpiresAt: Date.now() + 60_000 });

    refreshStub.mockResolvedValueOnce({
      access_token: "access-new",
      token_type:   "Bearer",
      expires_in:   3600,
    });

    const result = await ensureFreshAlpacaCreds(USER_ID, row, creds);
    expect(result.oauthRefreshToken).toBe("refresh-old");
  });

  it("marks the row errored and re-throws when the refresh HTTP call fails", async () => {
    const row   = makeRow();
    const creds = makeCreds({ oauthExpiresAt: Date.now() + 60_000 });

    refreshStub.mockRejectedValueOnce(new Error("invalid_grant"));

    await expect(ensureFreshAlpacaCreds(USER_ID, row, creds)).rejects.toThrow(
      /Alpaca OAuth refresh failed: invalid_grant/,
    );

    expect(updateCalls).toHaveLength(1);
    const upd = updateCalls[0]!;
    expect(upd.id).toBe(row.id);
    expect(upd.set["status"]).toBe("error");
    expect(String(upd.set["lastError"])).toMatch(/invalid_grant/);

    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]!.type).toBe("AUTH_FAILURE");
  });

  it("is a no-op for non-Alpaca rows even if their token would be expiring", async () => {
    const row = makeRow({ exchange: "Kraken" } as Partial<UserExchangeConnection>);
    // Force exchange override since `makeRow` ignores overrides via cast.
    (row as { exchange: string }).exchange = "Kraken";

    const creds = makeCreds({ oauthExpiresAt: Date.now() - 1000 });

    const result = await ensureFreshAlpacaCreds(USER_ID, row, creds);

    expect(result).toBe(creds);
    expect(refreshStub).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    expect(auditEntries).toHaveLength(0);
  });

  it("is a no-op when the connection has no refresh_token (pasted-key path)", async () => {
    const row   = makeRow();
    const creds = makeCreds({
      oauthAccessToken:  "access-old",
      oauthRefreshToken: undefined,
      oauthExpiresAt:    Date.now() + 60_000,
    });

    const result = await ensureFreshAlpacaCreds(USER_ID, row, creds);

    expect(result).toBe(creds);
    expect(refreshStub).not.toHaveBeenCalled();
  });

  it("refreshes at the exact boundary (expiresAt - now === REFRESH_BUFFER_MS)", async () => {
    // REFRESH_BUFFER_MS is 10 min. The needsRefresh predicate uses `<=`,
    // so the boundary must trigger a refresh. Lock the threshold in.
    const row   = makeRow();
    const creds = makeCreds({ oauthExpiresAt: Date.now() + 10 * 60 * 1000 });

    refreshStub.mockResolvedValueOnce({
      access_token: "access-boundary",
      token_type:   "Bearer",
      expires_in:   3600,
    });

    const result = await ensureFreshAlpacaCreds(USER_ID, row, creds);
    expect(refreshStub).toHaveBeenCalledTimes(1);
    expect(result.oauthAccessToken).toBe("access-boundary");
  });

  it("under load: concurrent callers for the same row share a single refresh (single-flight)", async () => {
    // Critical-path guarantee. Two live orders that both trip the buffer
    // must not race two /oauth/token calls — Alpaca will invalidate the
    // older refresh_token, knocking the customer into an "errored" state.
    const row   = makeRow();
    const creds = makeCreds({ oauthExpiresAt: Date.now() + 5 * 60 * 1000 });

    let resolveRefresh!: (v: unknown) => void;
    refreshStub.mockImplementationOnce(
      () => new Promise(res => { resolveRefresh = res; }),
    );

    const N = 5;
    const inflight = Array.from({ length: N }, () =>
      ensureFreshAlpacaCreds(USER_ID, row, creds),
    );

    // Let microtasks settle so the second..Nth callers attach to the
    // already-in-flight promise before the first one resolves.
    await new Promise(r => setImmediate(r));

    resolveRefresh({
      access_token: "access-shared",
      token_type:   "Bearer",
      expires_in:   3600,
    });

    const results = await Promise.all(inflight);

    expect(refreshStub).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveLength(1);
    for (const r of results) {
      expect(r.oauthAccessToken).toBe("access-shared");
    }
  });

  it("after a single-flight refresh completes, a later call beyond the buffer is a no-op", async () => {
    // Guards against an in-flight entry leaking past completion.
    const row   = makeRow();
    const creds = makeCreds({ oauthExpiresAt: Date.now() + 5 * 60 * 1000 });

    refreshStub.mockResolvedValueOnce({
      access_token: "access-1",
      token_type:   "Bearer",
      expires_in:   3600,
    });

    const refreshed = await ensureFreshAlpacaCreds(USER_ID, row, creds);
    expect(refreshStub).toHaveBeenCalledTimes(1);

    // Second call uses fresh creds well outside the buffer → no refresh.
    const again = await ensureFreshAlpacaCreds(USER_ID, row, refreshed);
    expect(again).toBe(refreshed);
    expect(refreshStub).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when expiresAt is unknown (older blobs without expires_in)", async () => {
    const row   = makeRow();
    const creds = makeCreds({ oauthExpiresAt: undefined });

    const result = await ensureFreshAlpacaCreds(USER_ID, row, creds);

    expect(result).toBe(creds);
    expect(refreshStub).not.toHaveBeenCalled();
  });
});
