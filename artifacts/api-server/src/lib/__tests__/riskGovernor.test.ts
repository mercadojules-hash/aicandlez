import { describe, expect, it } from "vitest";
import {
  computeRiskGovernorDecision,
  type RiskGovernorClosedTrade,
} from "../riskGovernor.js";

const NOW = Date.UTC(2026, 5, 13, 12, 0, 0);
const COOLDOWN = 6 * 60 * 60 * 1000;

function trade(realizedPnL: number, i: number): RiskGovernorClosedTrade {
  return {
    id: `t-${i}`,
    realizedPnL,
    exitTime: NOW - i * 60_000,
  };
}

function decide(args: Partial<Parameters<typeof computeRiskGovernorDecision>[0]> = {}) {
  return computeRiskGovernorDecision({
    enabled: true,
    tradesDesc: [],
    dailyRealizedPnl: 0,
    equityUsd: 10_000,
    nowMs: NOW,
    cooldownMs: COOLDOWN,
    exchangeHealthOk: true,
    globalKillSwitchActive: false,
    ...args,
  });
}

describe("computeRiskGovernorDecision", () => {
  it("defaults to DISABLED and allows entries when feature flag is off", () => {
    const d = decide({ enabled: false, tradesDesc: Array.from({ length: 8 }, (_, i) => trade(-1, i)) });
    expect(d.status).toBe("DISABLED");
    expect(d.blockNewEntries).toBe(false);
  });

  it("pauses after 8 consecutive closed live losses", () => {
    const d = decide({ tradesDesc: Array.from({ length: 8 }, (_, i) => trade(-1, i)) });
    expect(d.status).toBe("PAUSED_CONSECUTIVE_LOSSES");
    expect(d.pauseReason).toBe("consecutive_losses_8");
    expect(d.blockNewEntries).toBe(true);
    expect(d.metrics.consecutiveLosses).toBe(8);
  });

  it("does not pause at 7 consecutive losses", () => {
    const d = decide({ tradesDesc: Array.from({ length: 7 }, (_, i) => trade(-1, i)) });
    expect(d.status).toBe("WATCH");
    expect(d.blockNewEntries).toBe(false);
  });

  it("pauses when rolling 20 win rate is below 35 percent", () => {
    const trades = [
      ...Array.from({ length: 6 }, (_, i) => trade(1, i)),
      ...Array.from({ length: 14 }, (_, i) => trade(-1, i + 6)),
    ];
    const d = decide({ tradesDesc: trades });
    expect(d.status).toBe("PAUSED_ROLLING20_WIN_RATE");
    expect(d.pauseReason).toBe("rolling20_win_rate_below_35");
    expect(d.metrics.rolling20WinRate).toBe(0.3);
  });

  it("does not pause when rolling 20 win rate is exactly 35 percent", () => {
    const trades = [
      ...Array.from({ length: 7 }, (_, i) => trade(1, i)),
      ...Array.from({ length: 13 }, (_, i) => trade(-1, i + 7)),
    ];
    const d = decide({ tradesDesc: trades });
    expect(d.metrics.rolling20WinRate).toBe(0.35);
    expect(d.blockNewEntries).toBe(false);
  });

  it("does not apply rolling20 rule before 20 closed trades", () => {
    const d = decide({ tradesDesc: Array.from({ length: 19 }, (_, i) => trade(i === 0 ? 1 : -1, i)) });
    expect(d.metrics.rolling20WinRate).toBeNull();
    expect(d.pauseReason).not.toBe("rolling20_win_rate_below_35");
  });

  it("pauses when daily realized loss exceeds 5 percent of equity", () => {
    const d = decide({ dailyRealizedPnl: -501, equityUsd: 10_000 });
    expect(d.status).toBe("PAUSED_DAILY_DRAWDOWN");
    expect(d.pauseReason).toBe("daily_realized_loss_gt_5pct");
    expect(d.metrics.dailyRealizedLossPct).toBeCloseTo(5.01);
  });

  it("does not pause when daily realized loss is exactly 5 percent of equity", () => {
    const d = decide({ dailyRealizedPnl: -500, equityUsd: 10_000 });
    expect(d.pauseReason).not.toBe("daily_realized_loss_gt_5pct");
    expect(d.blockNewEntries).toBe(false);
  });

  it("leaves status RESUME_ELIGIBLE after cooldown when clean, but still blocks until override/review", () => {
    const d = decide({
      previous: {
        status: "PAUSED_CONSECUTIVE_LOSSES",
        paused: true,
        pauseReason: "consecutive_losses_8",
        pausedAt: new Date(NOW - COOLDOWN - 1),
        cooldownUntil: new Date(NOW - 1),
        manualOverrideActive: false,
        manualOverrideExpiresAt: null,
      },
      tradesDesc: [trade(1, 0)],
    });
    expect(d.status).toBe("RESUME_ELIGIBLE");
    expect(d.blockNewEntries).toBe(true);
  });

  it("does not become RESUME_ELIGIBLE when exchange health is bad", () => {
    const d = decide({
      exchangeHealthOk: false,
      previous: {
        status: "PAUSED_CONSECUTIVE_LOSSES",
        paused: true,
        pauseReason: "consecutive_losses_8",
        pausedAt: new Date(NOW - COOLDOWN - 1),
        cooldownUntil: new Date(NOW - 1),
        manualOverrideActive: false,
        manualOverrideExpiresAt: null,
      },
      tradesDesc: [trade(1, 0)],
    });
    expect(d.status).toBe("COOLDOWN");
    expect(d.blockNewEntries).toBe(true);
  });

  it("manual override allows entries", () => {
    const d = decide({
      previous: {
        status: "PAUSED_CONSECUTIVE_LOSSES",
        paused: true,
        pauseReason: "consecutive_losses_8",
        pausedAt: new Date(NOW - 1_000),
        cooldownUntil: new Date(NOW + COOLDOWN),
        manualOverrideActive: true,
        manualOverrideExpiresAt: new Date(NOW + COOLDOWN),
      },
      tradesDesc: Array.from({ length: 8 }, (_, i) => trade(-1, i)),
    });
    expect(d.status).toBe("MANUAL_OVERRIDE");
    expect(d.blockNewEntries).toBe(false);
  });
});
