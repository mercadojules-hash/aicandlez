import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashJarvisExecutiveServiceToken } from "../../middlewares/requireJarvisServiceAuth.js";

const mocks = vi.hoisted(() => ({
  auditJarvisServiceRequest: vi.fn(async () => undefined),
  buildJarvisExecutiveReport: vi.fn(async () => ({ ok: true, report: "executive" })),
  buildJarvisReport24h: vi.fn(async () => ({ ok: true, report: "24h" })),
  buildJarvisRiskGovernorReport: vi.fn(async () => ({ ok: true, report: "risk" })),
  buildJarvisTradesReport: vi.fn(async () => ({ ok: true, report: "trades" })),
}));

vi.mock("../../lib/jarvisServiceAudit.js", () => ({
  auditJarvisServiceRequest: mocks.auditJarvisServiceRequest,
}));

vi.mock("../../lib/jarvisExecutiveReports.js", () => ({
  buildJarvisExecutiveReport: mocks.buildJarvisExecutiveReport,
  buildJarvisReport24h: mocks.buildJarvisReport24h,
  buildJarvisRiskGovernorReport: mocks.buildJarvisRiskGovernorReport,
  buildJarvisTradesReport: mocks.buildJarvisTradesReport,
}));

const { default: router } = await import("../jarvisExecutiveService.js");

interface Layer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: unknown, res: unknown, next: () => void) => unknown }>;
  };
}

function routeLayer(path: string): Layer {
  const layer = (router as unknown as { stack: Layer[] }).stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route ${path} not found`);
  return layer;
}

function makeReq(opts: { token?: string; method?: string; path?: string; query?: Record<string, string> } = {}) {
  const path = opts.path ?? "/jarvis/service/aicandlez/executive";
  return {
    headers: opts.token ? { authorization: `Bearer ${opts.token}`, "user-agent": "vitest" } : { "user-agent": "vitest" },
    method: opts.method ?? "GET",
    originalUrl: path,
    path,
    query: opts.query ?? {},
    ip: "127.0.0.1",
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  };
}

function makeRes() {
  const res: { statusCode: number; body: unknown; status: (n: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 200,
    body: null,
    status(n) { this.statusCode = n; return this; },
    json(b) { this.body = b; return this; },
  };
  return res;
}

async function runAuth(path: string, req: unknown, res: unknown): Promise<boolean> {
  const auth = routeLayer(path).route!.stack[0]!.handle;
  let nextCalled = false;
  await auth(req, res, () => { nextCalled = true; });
  return nextCalled;
}

async function runFinal(path: string, req: unknown, res: unknown): Promise<void> {
  const stack = routeLayer(path).route!.stack;
  const handler = stack[stack.length - 1]!.handle;
  await handler(req, res, () => undefined);
}

const OLD_ENV = { ...process.env };
const TOKEN = "jarvis-service-token-for-tests";

beforeEach(() => {
  process.env["JARVIS_EXECUTIVE_SERVICE_ENABLED"] = "true";
  process.env["JARVIS_EXECUTIVE_SERVICE_TOKEN_HASH"] = hashJarvisExecutiveServiceToken(TOKEN);
  process.env["JARVIS_EXECUTIVE_SERVICE_SCOPES"] = "aicandlez:read";
  mocks.auditJarvisServiceRequest.mockClear();
  mocks.buildJarvisExecutiveReport.mockClear();
  mocks.buildJarvisReport24h.mockClear();
  mocks.buildJarvisRiskGovernorReport.mockClear();
  mocks.buildJarvisTradesReport.mockClear();
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("Jarvis executive service auth", () => {
  it("missing token = 401", async () => {
    const req = makeReq();
    const res = makeRes();
    const next = await runAuth("/jarvis/service/aicandlez/executive", req, res);
    expect(next).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
    expect(mocks.auditJarvisServiceRequest).toHaveBeenCalledWith(req, expect.objectContaining({
      status: 401,
      outcome: "denied",
      reason: "missing_token",
    }));
  });

  it("invalid token = 401", async () => {
    const req = makeReq({ token: "wrong-token" });
    const res = makeRes();
    const next = await runAuth("/jarvis/service/aicandlez/executive", req, res);
    expect(next).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(mocks.auditJarvisServiceRequest).toHaveBeenCalledWith(req, expect.objectContaining({
      status: 401,
      outcome: "denied",
      reason: "invalid_token",
    }));
  });

  it("missing scope = 403", async () => {
    process.env["JARVIS_EXECUTIVE_SERVICE_SCOPES"] = "something:else";
    const req = makeReq({ token: TOKEN });
    const res = makeRes();
    const next = await runAuth("/jarvis/service/aicandlez/executive", req, res);
    expect(next).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
    expect(mocks.auditJarvisServiceRequest).toHaveBeenCalledWith(req, expect.objectContaining({
      status: 403,
      outcome: "denied",
      reason: "missing_scope",
    }));
  });

  it("valid token + scope = 200", async () => {
    const req = makeReq({ token: TOKEN });
    const res = makeRes();
    const next = await runAuth("/jarvis/service/aicandlez/executive", req, res);
    expect(next).toBe(true);
    await runFinal("/jarvis/service/aicandlez/executive", req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, report: "executive" });
    expect(mocks.buildJarvisExecutiveReport).toHaveBeenCalledTimes(1);
    expect(mocks.auditJarvisServiceRequest).toHaveBeenCalledWith(req, expect.objectContaining({
      status: 200,
      outcome: "allowed",
      action: "jarvis.service.executive.read",
    }));
  });
});

describe("Jarvis executive service route surface", () => {
  it("service route cannot mutate anything", () => {
    const layers = (router as unknown as { stack: Layer[] }).stack.filter((l) => l.route);
    expect(layers).toHaveLength(4);
    for (const layer of layers) {
      expect(layer.route!.methods).toEqual({ get: true });
      expect(layer.route!.methods["post"]).toBeUndefined();
      expect(layer.route!.methods["put"]).toBeUndefined();
      expect(layer.route!.methods["patch"]).toBeUndefined();
      expect(layer.route!.methods["delete"]).toBeUndefined();
    }
  });
});
