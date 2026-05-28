/**
 * executionGateway — Phase 5 (Task #210) unit suite.
 *
 * Pins the Phase 4 telemetry chain contract through the single entry
 * point `executeCustomerOrder`:
 *   - ACCEPTED emitted on every call (before downstream placement)
 *   - REJECTED emitted on both legacy failure and uncaught exception
 *   - correlationId is echoed back in the result (and re-stamped onto
 *     the inner LiveUserOrderRequest so downstream sees the same id)
 *   - hydration (position_filled stream + LIVE_TRADES_HYDRATED) is
 *     NOT emitted from the gateway (deferred to caller post-persist)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const emitTelemetryMock = vi.fn();
const placeMock         = vi.fn();
const loggerMock        = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

vi.mock("../executionTelemetry.js", async () => {
  const actual = await vi.importActual<typeof import("../executionTelemetry.js")>(
    "../executionTelemetry.js",
  );
  return {
    ...actual,
    emit: emitTelemetryMock,
  };
});

vi.mock("../liveUserExecution.js", () => ({
  placeLiveAutoOrderForUser: placeMock,
  isCustomerLiveExecutionEnabled: () => false,
}));

vi.mock("../logger.js", () => ({ logger: loggerMock }));

const { executeCustomerOrder } = await import("../executionGateway.js");

interface EmittedRow {
  tag:               string;
  correlationId:     string;
  rejectionReason?:  string;
  persistenceResult: string;
  trigger:           string;
}

function rowsByTag(tag: string): EmittedRow[] {
  return emitTelemetryMock.mock.calls
    .map((c) => c[0] as EmittedRow)
    .filter((r) => r.tag === tag);
}

beforeEach(() => {
  emitTelemetryMock.mockReset();
  placeMock.mockReset();
  loggerMock.warn.mockClear();
  loggerMock.info.mockClear();
});

describe("executeCustomerOrder — telemetry contract", () => {
  it("emits EXECUTION_GATEWAY_ACCEPTED with the client correlationId on success", async () => {
    placeMock.mockResolvedValueOnce({
      success: true, exchange: "Kraken", exchangeOrderId: "X1",
      fillPrice: 50000, quantity: 0.002,
    });

    const result = await executeCustomerOrder({
      trigger: "manual",
      userId:  "u1", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
      correlationId: "corr-fixed-1",
    });

    expect(result.correlationId).toBe("corr-fixed-1");
    expect(result.trigger).toBe("manual");
    const accepted = rowsByTag("EXECUTION_GATEWAY_ACCEPTED");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.correlationId).toBe("corr-fixed-1");
    expect(accepted[0]?.trigger).toBe("manual");
    // Gateway does NOT emit POSITION_PERSISTED or LIVE_TRADES_HYDRATED.
    expect(rowsByTag("POSITION_PERSISTED")).toHaveLength(0);
    expect(rowsByTag("LIVE_TRADES_HYDRATED")).toHaveLength(0);
    // Downstream call received the resolved correlationId.
    expect(placeMock.mock.calls[0]?.[0]?.correlationId).toBe("corr-fixed-1");
  });

  it("mints a fresh correlationId when none is supplied (UUID v4 shape)", async () => {
    placeMock.mockResolvedValueOnce({ success: true, exchange: "Kraken" });

    const result = await executeCustomerOrder({
      trigger: "ai",
      userId:  "u1", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
    });

    expect(result.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("emits EXECUTION_REJECTED with the same correlationId on legacy failure (and ACCEPTED still fires)", async () => {
    placeMock.mockResolvedValueOnce({
      success: false, errorCode: "no_connection", error: "no exchange",
    });

    const r = await executeCustomerOrder({
      trigger: "manual",
      userId:  "u1", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
      correlationId: "corr-rej-1",
    });

    expect(r.success).toBe(false);
    // ACCEPTED must fire on every call, regardless of downstream outcome.
    const accepted = rowsByTag("EXECUTION_GATEWAY_ACCEPTED");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.correlationId).toBe("corr-rej-1");
    const rejected = rowsByTag("EXECUTION_REJECTED");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.correlationId).toBe("corr-rej-1");
    expect(rejected[0]?.rejectionReason).toBe("no_connection");
    expect(rejected[0]?.persistenceResult).toBe("skipped");
  });

  it("emits EXECUTION_REJECTED with rejectionReason='uncaught_exception' on throw and rethrows (ACCEPTED still fires)", async () => {
    placeMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      executeCustomerOrder({
        trigger: "ai",
        userId:  "u1", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
        correlationId: "corr-throw-1",
      }),
    ).rejects.toThrow("boom");

    const accepted = rowsByTag("EXECUTION_GATEWAY_ACCEPTED");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.correlationId).toBe("corr-throw-1");
    const rejected = rowsByTag("EXECUTION_REJECTED");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.correlationId).toBe("corr-throw-1");
    expect(rejected[0]?.rejectionReason).toBe("uncaught_exception");
  });

  it("emits EXECUTION_GATEWAY_ACCEPTED BEFORE invoking placeLiveAutoOrderForUser (ordering invariant)", async () => {
    const order: string[] = [];
    emitTelemetryMock.mockImplementation((row) => {
      order.push(`tel:${(row as { tag: string }).tag}`);
    });
    placeMock.mockImplementation(async () => {
      order.push("place");
      return { success: true, exchange: "Kraken" };
    });

    await executeCustomerOrder({
      trigger: "manual",
      userId:  "u1", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
      correlationId: "corr-order-1",
    });

    expect(order[0]).toBe("tel:EXECUTION_GATEWAY_ACCEPTED");
    expect(order).toContain("place");
    expect(order.indexOf("tel:EXECUTION_GATEWAY_ACCEPTED"))
      .toBeLessThan(order.indexOf("place"));
  });

  it("minted correlationId is consistent across ACCEPTED row, downstream call, and result", async () => {
    placeMock.mockResolvedValueOnce({ success: true, exchange: "Kraken" });

    const result = await executeCustomerOrder({
      trigger: "ai",
      userId:  "u1", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
    });

    const acceptedCid =
      (rowsByTag("EXECUTION_GATEWAY_ACCEPTED")[0])?.correlationId;
    const downstreamCid = placeMock.mock.calls[0]?.[0]?.correlationId;
    expect(acceptedCid).toBe(result.correlationId);
    expect(downstreamCid).toBe(result.correlationId);
  });

  it("ACCEPTED.trigger reflects gateway input ('manual' vs 'ai')", async () => {
    placeMock.mockResolvedValue({ success: true, exchange: "Kraken" });

    await executeCustomerOrder({
      trigger: "ai",
      userId:  "u1", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
      correlationId: "corr-ai-1",
    });
    await executeCustomerOrder({
      trigger: "manual",
      userId:  "u1", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
      correlationId: "corr-manual-1",
    });

    const triggers = rowsByTag("EXECUTION_GATEWAY_ACCEPTED").map((r) => r.trigger);
    expect(triggers).toEqual(["ai", "manual"]);
  });
});
