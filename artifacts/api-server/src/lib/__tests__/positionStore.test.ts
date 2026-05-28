/**
 * positionStore — Phase 5 (Task #210) unit suite.
 *
 * Pins the Phase 4 chain-preservation invariants:
 *   - rememberCorrelation → resolveCorrelation round-trips correlationId
 *     and the opening trigger (manual|ai) for a positionId.
 *   - resolveCorrelation/resolveTrigger return null after forgetCorrelation.
 *   - notifyFillHydrated emits BOTH the executionStreamBus position_filled
 *     event AND a LIVE_TRADES_HYDRATED telemetry row, in that order, and
 *     swallows any internal throw (telemetry must never break execution).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const emitEventMock = vi.fn();
const loggerMock    = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

vi.mock("../executionStreamBus.js", () => ({
  executionStreamBus: { emitEvent: emitEventMock },
}));
vi.mock("../logger.js", () => ({ logger: loggerMock }));

// Lazy mock for executionTelemetry.emit — we spy on the actual module so
// rememberCorrelation/resolveCorrelation behave normally.
const realTelemetry = await import("../executionTelemetry.js");
const emitSpy = vi.spyOn(realTelemetry, "emit").mockImplementation(() => {});

const positionStore = await import("../positionStore.js");
const {
  notifyFillHydrated,
} = positionStore;
const {
  rememberCorrelation,
  resolveCorrelation,
  resolveTrigger,
  forgetCorrelation,
} = realTelemetry;

beforeEach(() => {
  emitEventMock.mockReset();
  emitSpy.mockClear();
  loggerMock.warn.mockClear();
});

describe("rememberCorrelation / resolveCorrelation / resolveTrigger / forgetCorrelation", () => {
  it("round-trips correlationId + trigger for a positionId", () => {
    rememberCorrelation("pos-1", "corr-1", "manual");
    expect(resolveCorrelation("pos-1")).toBe("corr-1");
    expect(resolveTrigger("pos-1")).toBe("manual");
  });

  it("supports both manual and ai triggers independently", () => {
    rememberCorrelation("pos-m", "corr-m", "manual");
    rememberCorrelation("pos-a", "corr-a", "ai");
    expect(resolveTrigger("pos-m")).toBe("manual");
    expect(resolveTrigger("pos-a")).toBe("ai");
  });

  it("returns null for unknown positionId", () => {
    expect(resolveCorrelation("never-seen")).toBeNull();
    expect(resolveTrigger("never-seen")).toBeNull();
  });

  it("forgetCorrelation drops the mapping (bounds memory)", () => {
    rememberCorrelation("pos-f", "corr-f", "ai");
    expect(resolveCorrelation("pos-f")).toBe("corr-f");
    forgetCorrelation("pos-f");
    expect(resolveCorrelation("pos-f")).toBeNull();
    expect(resolveTrigger("pos-f")).toBeNull();
  });

  it("is a no-op when positionId or correlationId is missing", () => {
    rememberCorrelation(null, "x", "manual");
    rememberCorrelation("y", null, "manual");
    rememberCorrelation(undefined, undefined, "ai");
    expect(resolveCorrelation("y")).toBeNull();
  });
});

describe("notifyFillHydrated — lifecycle ordering invariant", () => {
  it("emits position_filled stream event AND LIVE_TRADES_HYDRATED telemetry, stream first", () => {
    const callOrder: string[] = [];
    emitEventMock.mockImplementation((evt) => callOrder.push(`stream:${evt.type}`));
    emitSpy.mockImplementation((row) => callOrder.push(`tel:${(row as { tag: string }).tag}`));

    notifyFillHydrated({
      trigger:       "manual",
      correlationId: "corr-hyd-1",
      userId:        "u1",
      symbol:        "BTCUSD",
      side:          "BUY",
      sizeUSD:       100,
      fillPrice:     50000,
      quantity:      0.002,
      exchange:      "Kraken",
      positionId:    "pos-hyd-1",
      runtimeMode:   "live",
      latencyMs:     42,
    });

    expect(callOrder).toEqual([
      "stream:position_filled",
      "tel:LIVE_TRADES_HYDRATED",
    ]);

    const tel = emitSpy.mock.calls[0]?.[0] as { tag: string; correlationId: string; positionId: string; trigger: string; runtimeMode: string };
    expect(tel.tag).toBe("LIVE_TRADES_HYDRATED");
    expect(tel.correlationId).toBe("corr-hyd-1");
    expect(tel.positionId).toBe("pos-hyd-1");
    expect(tel.trigger).toBe("manual");
    expect(tel.runtimeMode).toBe("live");
  });

  it("uses runtimeMode='sandbox' and stream mode='test' when sandbox=true", () => {
    notifyFillHydrated({
      trigger:       "ai",
      correlationId: "corr-hyd-sb",
      userId:        "u1",
      symbol:        "BTCUSD",
      side:          "BUY",
      sizeUSD:       100,
      exchange:      "Kraken",
      runtimeMode:   "sandbox",
      sandbox:       true,
    });
    expect(emitEventMock.mock.calls[0]?.[0]?.mode).toBe("test");
    const tel = emitSpy.mock.calls[0]?.[0] as { runtimeMode: string };
    expect(tel.runtimeMode).toBe("sandbox");
  });

  it("swallows internal throws (telemetry must never break execution)", () => {
    emitEventMock.mockImplementationOnce(() => { throw new Error("bus exploded"); });
    expect(() =>
      notifyFillHydrated({
        trigger:       "manual",
        correlationId: "corr-hyd-throw",
        userId:        "u1",
        symbol:        "BTCUSD",
        side:          "BUY",
        sizeUSD:       100,
        runtimeMode:   "live",
      }),
    ).not.toThrow();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "corr-hyd-throw" }),
      expect.stringContaining("notifyFillHydrated failed"),
    );
  });
});
