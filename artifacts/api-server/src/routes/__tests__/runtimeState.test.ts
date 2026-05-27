/**
 * runtimeState aggregator tests (Task #198).
 *
 * Fixture-based: we mock the @workspace/db query builder + Task #197's
 * loadBalanceForRow so we can exercise the four required shape +
 * auto-promotion branches without standing up real Postgres or a real
 * exchange adapter. This pins the contract Task #199 (switcher UI) and
 * Task #200 (auto-promotion mutation + ARM gate) will consume.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type AnyRow = Record<string, unknown>;

let connectionsRows: AnyRow[] = [];
let settingsRow: { activeRuntimeExchange: string | null } | null = null;
const balanceByExchange = new Map<string, {
  ok: boolean;
  totalEquityUSD: number;
  balances: Record<string, { free: number; locked: number; total: number }>;
  lastUpdated: number;
  error?: string;
}>();

// Drizzle query-builder mock — only supports the two SELECT chains used
// by the aggregator. Disambiguates by what was passed to .from().
const userExchangeConnectionsSentinel = Symbol("uec");
const userSettingsSentinel            = Symbol("us");

function makeSelectFor(table: symbol) {
  if (table === userSettingsSentinel) {
    return {
      from: () => ({
        where: () => ({
          limit: async () => (settingsRow ? [settingsRow] : []),
        }),
      }),
    };
  }
  return {
    from: () => ({
      where: async () => connectionsRows,
    }),
  };
}

vi.mock("@workspace/db", () => ({
  db: {
    select: (_cols?: unknown) => ({
      from: (tbl: symbol) => makeSelectFor(tbl).from(),
    }),
  },
  userExchangeConnectionsTable: userExchangeConnectionsSentinel,
  userSettingsTable:            userSettingsSentinel,
}));

vi.mock("drizzle-orm", () => ({
  eq: () => undefined,
}));

vi.mock("../../middlewares/requireAuth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Stub Task #197's hydration path so we don't need vault / adapter / pino.
vi.mock("../userExchanges.js", () => ({
  loadBalanceForRow: vi.fn(async (_userId: string, row: AnyRow) => {
    const exchange = row["exchange"] as string;
    const snap = balanceByExchange.get(exchange);
    if (!snap) {
      return {
        exchange, label: row["label"], tradingMode: row["tradingMode"] ?? "paper",
        ok: false, totalEquityUSD: 0, balances: {}, lastUpdated: 0,
        error: "no balance fixture",
      };
    }
    return {
      exchange, label: row["label"], tradingMode: row["tradingMode"] ?? "paper",
      ...snap,
    };
  }),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { default: router } = await import("../runtimeState.js");

interface Layer {
  route?: {
    path: string;
    stack: Array<{ handle: (req: unknown, res: unknown, next: () => void) => unknown }>;
  };
}
function getHandler(path: string) {
  const stack = (router as unknown as { stack: Layer[] }).stack;
  const layer = stack.find(l => l.route?.path === path);
  if (!layer?.route) throw new Error(`route ${path} not found`);
  const last = layer.route.stack[layer.route.stack.length - 1]!;
  return last.handle as (req: unknown, res: unknown, next: () => void) => Promise<void>;
}

function makeReq() {
  return {
    clerkUserId: "user_1",
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  };
}
function makeRes() {
  const res: { statusCode: number; body: AnyRow | null; status: (n: number) => typeof res; json: (b: AnyRow) => typeof res } = {
    statusCode: 200, body: null,
    status(n) { this.statusCode = n; return this; },
    json(b)   { this.body = b as AnyRow; return this; },
  };
  return res;
}

function connRow(opts: { exchange: string; status?: string; label?: string }) {
  return {
    id:                    `id-${opts.exchange}`,
    userId:                "user_1",
    exchange:              opts.exchange,
    label:                 opts.label ?? "Default",
    encryptedBlob:         "x",
    status:                opts.status ?? "active",
    isDefault:             false,
    tradingMode:           "paper",
    demoMode:              false,
    permissions:           { read: true, trade: true, withdraw: false },
    lastVerifiedAt:        null,
    lastError:             null,
    lastBalanceFetchAt:    null,
    lastBalanceFetchError: null,
    createdAt:             new Date(),
    updatedAt:             new Date(),
  };
}

const handler = getHandler("/user/runtime-state");

beforeEach(() => {
  connectionsRows = [];
  settingsRow     = null;
  balanceByExchange.clear();
});

describe("GET /user/runtime-state", () => {
  it("no connections → mode=paper, autoPromoted=false, liveReady=false", async () => {
    const req = makeReq(); const res = makeRes();
    await handler(req, res, () => {});
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      mode:                  "paper",
      activeExchange:        null,
      autoPromoted:          false,
      liveReady:             false,
      connectedExchanges:    [],
      totalEquityUSD:        0,
      activeRuntimeExchange: null,
    });
  });

  it("one active healthy connection + no explicit choice → auto-promote to live", async () => {
    connectionsRows = [connRow({ exchange: "Kraken" })];
    balanceByExchange.set("Kraken", { ok: true, totalEquityUSD: 1234.56, balances: { USD: { free: 1234.56, locked: 0, total: 1234.56 } }, lastUpdated: Date.now() });
    const req = makeReq(); const res = makeRes();
    await handler(req, res, () => {});
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      mode:           "live",
      activeExchange: "Kraken",
      autoPromoted:   true,
      liveReady:      true,
      totalEquityUSD: 1234.56,
    });
    expect((res.body as AnyRow)["connectedExchanges"]).toHaveLength(1);
  });

  it("activeRuntimeExchange='paper' overrides the auto-promotion rule", async () => {
    connectionsRows = [connRow({ exchange: "Kraken" })];
    balanceByExchange.set("Kraken", { ok: true, totalEquityUSD: 50, balances: {}, lastUpdated: Date.now() });
    settingsRow = { activeRuntimeExchange: "paper" };
    const req = makeReq(); const res = makeRes();
    await handler(req, res, () => {});
    expect(res.body).toMatchObject({
      mode:                  "paper",
      activeExchange:        null,
      autoPromoted:          false,
      liveReady:             false,
      activeRuntimeExchange: "paper",
    });
  });

  it("connection in error state → mode=paper, liveReady=false, connection surfaces error", async () => {
    connectionsRows = [connRow({ exchange: "Coinbase", status: "error" })];
    balanceByExchange.set("Coinbase", { ok: false, totalEquityUSD: 0, balances: {}, lastUpdated: 0, error: "Unauthorized" });
    const req = makeReq(); const res = makeRes();
    await handler(req, res, () => {});
    const body = res.body as AnyRow;
    expect(body["mode"]).toBe("paper");
    expect(body["liveReady"]).toBe(false);
    expect(body["autoPromoted"]).toBe(false);
    expect((body["connectedExchanges"] as AnyRow[])[0]).toMatchObject({
      exchange: "Coinbase",
      status:   "error",
      ok:       false,
      error:    "Unauthorized",
    });
  });
});
