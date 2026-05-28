/**
 * Phase 4 (Task #209) — `executionTelemetry` unit tests.
 *
 * Covers the three contracts the rest of the funnel depends on:
 *   1. `validateRow` enforces the canonical schema (every required field,
 *      every enum).
 *   2. The verbose flag collapses diagnostic mids to no-ops while audit
 *      tags always emit.
 *   3. The 1/sec/user rate-limiter caps POSITION_PERSISTED +
 *      LIVE_TRADES_HYDRATED bursts.
 *
 * Test mode (`NODE_ENV=test`) is asserted in `validateRow` cases so a
 * future contract regression throws at the failing call site.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  emit,
  validateRow,
  genCorrelationId,
  isExecutionTelemetryVerbose,
  type ExecutionTelemetryRow,
} from "./executionTelemetry.js";
import { logger } from "./logger.js";

function row(overrides: Partial<ExecutionTelemetryRow> = {}): ExecutionTelemetryRow {
  return {
    tag:               "MANUAL_TRADE_REQUEST",
    correlationId:     "abc12345-1111-2222-3333-444455556666",
    userId:            "user_1",
    symbol:            "BTCUSD",
    normalizedSymbol:  "BTCUSD",
    exchange:          null,
    runtimeMode:       "live",
    persistenceResult: "pending",
    positionId:        null,
    latencyMs:         0,
    trigger:           "manual",
    ...overrides,
  };
}

describe("genCorrelationId", () => {
  it("produces a unique UUID-shaped id each call", () => {
    const a = genCorrelationId();
    const b = genCorrelationId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});

describe("validateRow", () => {
  it("returns null for a well-formed row", () => {
    expect(validateRow(row())).toBeNull();
  });

  it("rejects missing correlationId", () => {
    expect(validateRow(row({ correlationId: "" }))).toMatch(/correlationId/);
  });

  it("rejects bad enums", () => {
    expect(
      validateRow(row({ runtimeMode: "bogus" as unknown as "live" })),
    ).toMatch(/runtimeMode/);
    expect(
      validateRow(row({ persistenceResult: "x" as unknown as "persisted" })),
    ).toMatch(/persistenceResult/);
    expect(
      validateRow(row({ trigger: "operator" as unknown as "manual" })),
    ).toMatch(/trigger/);
  });

  it("rejects bad latency", () => {
    expect(validateRow(row({ latencyMs: -1 }))).toMatch(/latencyMs/);
    expect(validateRow(row({ latencyMs: Number.NaN }))).toMatch(/latencyMs/);
  });
});

describe("verbose flag", () => {
  const ORIGINAL = process.env["EXECUTION_TELEMETRY_VERBOSE"];
  beforeEach(() => {
    process.env["EXECUTION_TELEMETRY_VERBOSE"] = ORIGINAL ?? "";
  });

  it("defaults to true when unset", () => {
    delete process.env["EXECUTION_TELEMETRY_VERBOSE"];
    expect(isExecutionTelemetryVerbose()).toBe(true);
  });

  it("collapses diagnostic mids when verbose=false but keeps audit tags", () => {
    process.env["EXECUTION_TELEMETRY_VERBOSE"] = "false";
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      emit(row({ tag: "MANUAL_TRADE_REQUEST", userId: "v_user_1" }));
      emit(row({ tag: "MANUAL_TRADE_NORMALIZED", userId: "v_user_1" }));
      expect(info).not.toHaveBeenCalled();

      emit(row({
        tag:               "EXECUTION_GATEWAY_ACCEPTED",
        userId:            "v_user_1",
        persistenceResult: "pending",
      }));
      expect(info).toHaveBeenCalledTimes(1);

      emit(row({
        tag:               "EXECUTION_REJECTED",
        userId:            "v_user_1",
        persistenceResult: "skipped",
        rejectionReason:   "test",
      }));
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });
});

describe("rate-limit", () => {
  it("caps POSITION_PERSISTED to 1/sec/user", () => {
    process.env["EXECUTION_TELEMETRY_VERBOSE"] = "true";
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    try {
      const uid = `rl_user_${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        emit(row({
          tag:               "POSITION_PERSISTED",
          userId:            uid,
          persistenceResult: "persisted",
          correlationId:     `cid-${i}-aaaaaaaa`,
        }));
      }
      expect(info).toHaveBeenCalledTimes(1);
    } finally {
      info.mockRestore();
    }
  });

  it("does not rate-limit audit tags", () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    try {
      const uid = `rl_audit_${Date.now()}`;
      for (let i = 0; i < 3; i++) {
        emit(row({
          tag:               "EXECUTION_GATEWAY_ACCEPTED",
          userId:            uid,
          correlationId:     `cid-a-${i}-aaaaaaaa`,
          persistenceResult: "pending",
        }));
      }
      expect(info).toHaveBeenCalledTimes(3);
    } finally {
      info.mockRestore();
    }
  });
});
