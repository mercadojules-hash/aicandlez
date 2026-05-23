import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────
// This smoke test proves the wiring landed in Task #103: a forced
// `healthy_to_unhealthy` outage event flowing through
// `notifyExchangeOutage` actually invokes `sendOperatorAlert` with a
// stable dedupe key, and the `exchange_outage_email_enabled` user pref
// suppresses the page when toggled off.

const { prefsState, operatorAlertMock, pushMock } = vi.hoisted(() => ({
  prefsState:        { email: true, push: true },
  operatorAlertMock: vi.fn(async (_payload: unknown) => undefined),
  pushMock:          vi.fn(async (_userId: string, _msg: unknown) => undefined),
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: { name: string }, value: unknown) => ({ col: col?.name, value }),
}));

vi.mock("@workspace/db", () => {
  const userSettingsTable = {
    userId:                       { name: "userId" },
    exchangeOutageEmailEnabled:   { name: "exchangeOutageEmailEnabled" },
    exchangeOutagePushEnabled:    { name: "exchangeOutagePushEnabled" },
  };
  const db = {
    select(_cols: unknown) {
      return {
        from(_t: unknown) {
          return {
            where(_w: unknown) {
              return {
                async limit(_n: number) {
                  return [{ email: prefsState.email, push: prefsState.push }];
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, userSettingsTable };
});

vi.mock("../../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../lib/notifications.js", () => ({
  sendOperatorAlert: operatorAlertMock,
}));

vi.mock("../../notifications/NotificationDispatcher.js", () => ({
  NotificationDispatcher: { sendToUser: pushMock },
}));

import { notifyExchangeOutage } from "../ExchangeHealthMonitor.js";

beforeEach(() => {
  prefsState.email = true;
  prefsState.push  = true;
  operatorAlertMock.mockClear();
  pushMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("notifyExchangeOutage → sendOperatorAlert wiring", () => {
  it("pages the on-call inbox with the expected subject/body and dedupeKey on a forced healthy_to_unhealthy event", async () => {
    await notifyExchangeOutage({
      userId:     "user_forced_outage_123",
      exchange:   "Kraken",
      transition: "healthy_to_unhealthy",
      reason:     "forced outage for smoke test",
      at:         new Date("2026-05-23T12:00:00.000Z"),
    });

    expect(operatorAlertMock).toHaveBeenCalledTimes(1);
    const payload = operatorAlertMock.mock.calls[0]![0] as {
      subject:   string;
      body:      string;
      dedupeKey: string;
      context?:  Record<string, unknown>;
    };

    expect(payload.subject).toBe("⚠️ Kraken connection lost");
    expect(payload.body).toContain("Live execution paused on Kraken.");
    expect(payload.body).toContain("forced outage for smoke test");
    // Stable shape: exchange-outage:<userId>:<exchange>:<transition>
    expect(payload.dedupeKey).toBe(
      "exchange-outage:user_forced_outage_123:Kraken:healthy_to_unhealthy",
    );
    expect(payload.context).toMatchObject({
      userId:     "user_forced_outage_123",
      exchange:   "Kraken",
      transition: "healthy_to_unhealthy",
      reason:     "forced outage for smoke test",
      at:         "2026-05-23T12:00:00.000Z",
    });
  });

  it("uses a distinct dedupeKey transition segment for the recovery event", async () => {
    await notifyExchangeOutage({
      userId:     "user_forced_outage_123",
      exchange:   "Kraken",
      transition: "unhealthy_to_healthy",
    });

    expect(operatorAlertMock).toHaveBeenCalledTimes(1);
    const payload = operatorAlertMock.mock.calls[0]![0] as { subject: string; dedupeKey: string };
    expect(payload.subject).toBe("✅ Kraken connection restored");
    expect(payload.dedupeKey).toBe(
      "exchange-outage:user_forced_outage_123:Kraken:unhealthy_to_healthy",
    );
  });

  it("suppresses the operator-alert page when exchange_outage_email_enabled is OFF", async () => {
    prefsState.email = false;
    prefsState.push  = true;

    await notifyExchangeOutage({
      userId:     "user_muted_email",
      exchange:   "Binance",
      transition: "healthy_to_unhealthy",
      reason:     "forced outage for smoke test",
    });

    expect(operatorAlertMock).not.toHaveBeenCalled();
    // Push pref is still on, so the push path should still fire — this
    // guards against a regression that conflates the two channels.
    expect(pushMock).toHaveBeenCalledTimes(1);
  });
});
