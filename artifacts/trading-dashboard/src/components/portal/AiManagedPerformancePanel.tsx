/**
 * AiManagedPerformancePanel — Category A headline customer surface.
 *
 * Renders the "AICandlez Managed Performance" KPIs from
 * `GET /api/user/managed-performance` (AI-trading-only, scoped to the
 * authoritative `ai_allocated_capital` baseline). Visible to ALL roles —
 * NOT admin-gated. Includes an inline AI Allocated Capital set/edit control
 * wired to `PUT /api/user/ai-capital`.
 *
 * Transport: all data flows through `useManagedPerformance` / `useAiCapital`
 * / `useSetAiCapital`, which use the artifact `authFetch` per the locked
 * cross-origin invariant. No generated hooks.
 *
 * Styling mirrors the locked PortalCustomerShell token system (neon-green
 * #66FF66, hairline borders, IBM Plex Mono). No new design language; no
 * emojis.
 */

import { memo, useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import {
  useManagedPerformance,
  useAiCapital,
  useSetAiCapital,
  type EraStats,
  type ManagedPerformanceEras,
} from "../../hooks/useManagedPerformance";

// Token mirror of PortalCustomerShell's `T` — kept local so this panel
// doesn't import the full shell module graph just for color constants.
const T = {
  BG_TERMINAL: "#050A07",
  BORDER:      "#2A3D33",
  NEON:        "#66FF66",
  RED:         "#FF4D4D",
  AMBER:       "#FFB020",
  TEXT_0:      "#FFFFFF",
  TEXT_1:      "#C5D2CB",
  TEXT_2:      "#A4B5AD",
  TEXT_3:      "#93A39B",
  FONT_MONO:   "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
  TRACK_LABEL: "0.10em",
  TRACK_TITLE: "0.18em",
} as const;

function usd(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function signedUsd(v: number): string {
  return `${v >= 0 ? "+" : "−"}${usd(Math.abs(v))}`;
}
function signedPct(v: number): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
}
// Nullable variants — a `null` from the server means "unavailable" (no healthy
// live exchange / no declared baseline) and MUST render a dash, never a fake 0.
function usdOrDash(v: number | null): string {
  return v == null ? "—" : usd(v);
}
function signedUsdOrDash(v: number | null): string {
  return v == null ? "—" : signedUsd(v);
}
function signedPctOrDash(v: number | null): string {
  return v == null ? "—" : signedPct(v);
}

function Kpi({
  label, value, tone, hint,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "muted";
  hint?: string;
}) {
  const color =
    tone === "pos" ? T.NEON : tone === "neg" ? T.RED : tone === "muted" ? T.TEXT_3 : T.TEXT_0;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 3,
      padding: "10px 12px",
      border: `1px solid ${T.BORDER}`,
      background: "rgba(0,0,0,0.30)",
    }}>
      <span style={{
        fontSize: 8.5, fontWeight: 700, letterSpacing: T.TRACK_LABEL,
        color: T.TEXT_3, whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color,
      }}>
        {value}
      </span>
      {hint && (
        <span style={{ fontSize: 8, color: T.TEXT_3, opacity: 0.7 }}>{hint}</span>
      )}
    </div>
  );
}

// ── Strategy-era comparison ──────────────────────────────────────────────────
// Legacy (pre June 6, 2026 · 1h max-hold) vs Current (June 6, 2026+ ·
// TP10/SL2/Trail5/6h). Pre/post-fix performance is materially different and is
// reported side-by-side so the impact of the exit-engine correction is
// measurable. All figures null-safe — a dash never a fabricated number.
function netTone(v: number): "pos" | "neg" | undefined {
  return v > 0 ? "pos" : v < 0 ? "neg" : undefined;
}
function netToneN(v: number | null): "pos" | "neg" | undefined {
  return v == null ? undefined : v > 0 ? "pos" : v < 0 ? "neg" : undefined;
}

function EraCell({
  value, tone, head,
}: {
  value: string;
  tone?: "pos" | "neg";
  head?: boolean;
}) {
  const color = head
    ? T.NEON
    : tone === "pos" ? T.NEON : tone === "neg" ? T.RED : T.TEXT_0;
  return (
    <span style={{
      padding: "7px 10px",
      fontSize: head ? 8.5 : 11.5,
      fontWeight: 700,
      letterSpacing: head ? T.TRACK_LABEL : undefined,
      fontVariantNumeric: "tabular-nums",
      color,
      borderLeft: `1px solid ${T.BORDER}`,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}>
      {value}
    </span>
  );
}

function EraMetricRow({
  label, legacy, current, legacyTone, currentTone,
}: {
  label: string;
  legacy: string;
  current: string;
  legacyTone?: "pos" | "neg";
  currentTone?: "pos" | "neg";
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1.2fr 1fr 1fr",
      borderTop: `1px solid ${T.BORDER}`,
    }}>
      <span style={{
        padding: "7px 10px",
        fontSize: 8.5, fontWeight: 700, letterSpacing: T.TRACK_LABEL,
        color: T.TEXT_3, whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {label}
      </span>
      <EraCell value={legacy} tone={legacyTone} />
      <EraCell value={current} tone={currentTone} />
    </div>
  );
}

function EraExitReasons({ era }: { era: EraStats }) {
  if (era.exitReasons.length === 0) {
    return (
      <span style={{ fontSize: 9, color: T.TEXT_3, opacity: 0.7 }}>
        No closed trades in this era.
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {era.exitReasons.map((r) => (
        <div key={r.reason} style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: 8, fontSize: 9.5,
        }}>
          <span style={{ color: T.TEXT_2, letterSpacing: T.TRACK_LABEL }}>
            {r.reason}
          </span>
          <span style={{ color: T.TEXT_3, fontVariantNumeric: "tabular-nums" }}>
            {r.count} · {signedUsd(r.netPnl)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EraComparison({ eras }: { eras: ManagedPerformanceEras }) {
  const { legacy, current } = eras;
  const pf = (v: number | null) => (v != null ? v.toFixed(2) : "—");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 8, flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: T.TRACK_LABEL, color: T.NEON,
        }}>
          STRATEGY ERA COMPARISON
        </span>
        <span style={{ fontSize: 8, color: T.TEXT_3, letterSpacing: T.TRACK_LABEL }}>
          SPLIT ON {eras.boundaryLabel.toUpperCase()}
        </span>
      </div>

      <div style={{ border: `1px solid ${T.BORDER}`, background: "rgba(0,0,0,0.30)" }}>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr" }}>
          <span style={{ padding: "7px 10px" }} />
          <EraCell head value="LEGACY" />
          <EraCell head value="CURRENT" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr" }}>
          <span style={{ padding: "0 10px 7px" }} />
          <span style={{
            padding: "0 10px 7px", fontSize: 7.5, color: T.TEXT_3,
            borderLeft: `1px solid ${T.BORDER}`, lineHeight: 1.3,
          }}>
            PRE · 1H MAX-HOLD
          </span>
          <span style={{
            padding: "0 10px 7px", fontSize: 7.5, color: T.TEXT_3,
            borderLeft: `1px solid ${T.BORDER}`, lineHeight: 1.3,
          }}>
            TP10 · SL2 · TRAIL5 · 6H
          </span>
        </div>

        <EraMetricRow
          label="NET P&L"
          legacy={signedUsd(legacy.netProfit)}
          current={signedUsd(current.netProfit)}
          legacyTone={netTone(legacy.netProfit)}
          currentTone={netTone(current.netProfit)}
        />
        <EraMetricRow
          label="ROI"
          legacy={signedPctOrDash(legacy.roiPct)}
          current={signedPctOrDash(current.roiPct)}
          legacyTone={netToneN(legacy.roiPct)}
          currentTone={netToneN(current.roiPct)}
        />
        <EraMetricRow
          label="WIN RATE"
          legacy={legacy.winRatePct != null ? `${legacy.winRatePct.toFixed(1)}%` : "—"}
          current={current.winRatePct != null ? `${current.winRatePct.toFixed(1)}%` : "—"}
        />
        <EraMetricRow
          label="PROFIT FACTOR"
          legacy={pf(legacy.profitFactor)}
          current={pf(current.profitFactor)}
        />
        <EraMetricRow
          label="AVG WINNER"
          legacy={usdOrDash(legacy.avgWinner)}
          current={usdOrDash(current.avgWinner)}
          legacyTone={legacy.avgWinner != null ? "pos" : undefined}
          currentTone={current.avgWinner != null ? "pos" : undefined}
        />
        <EraMetricRow
          label="AVG LOSER"
          legacy={usdOrDash(legacy.avgLoser)}
          current={usdOrDash(current.avgLoser)}
          legacyTone={legacy.avgLoser != null ? "neg" : undefined}
          currentTone={current.avgLoser != null ? "neg" : undefined}
        />
        <EraMetricRow
          label="BEST TRADE"
          legacy={signedUsdOrDash(legacy.bestTrade)}
          current={signedUsdOrDash(current.bestTrade)}
          legacyTone={netToneN(legacy.bestTrade)}
          currentTone={netToneN(current.bestTrade)}
        />
        <EraMetricRow
          label="WORST TRADE"
          legacy={signedUsdOrDash(legacy.worstTrade)}
          current={signedUsdOrDash(current.worstTrade)}
          legacyTone={netToneN(legacy.worstTrade)}
          currentTone={netToneN(current.worstTrade)}
        />
        <EraMetricRow
          label="CLOSED TRADES"
          legacy={`${legacy.closedTrades} (${legacy.wins}W·${legacy.losses}L)`}
          current={`${current.closedTrades} (${current.wins}W·${current.losses}L)`}
        />
      </div>

      {/* Exit-reason distribution per era */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 8,
      }}>
        <div style={{
          padding: "8px 10px", border: `1px solid ${T.BORDER}`,
          background: "rgba(0,0,0,0.30)", display: "flex",
          flexDirection: "column", gap: 6,
        }}>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: T.TRACK_LABEL, color: T.TEXT_3,
          }}>
            LEGACY EXIT REASONS
          </span>
          <EraExitReasons era={legacy} />
        </div>
        <div style={{
          padding: "8px 10px", border: `1px solid ${T.BORDER}`,
          background: "rgba(0,0,0,0.30)", display: "flex",
          flexDirection: "column", gap: 6,
        }}>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: T.TRACK_LABEL, color: T.TEXT_3,
          }}>
            CURRENT EXIT REASONS
          </span>
          <EraExitReasons era={current} />
        </div>
      </div>

      <span style={{ fontSize: 7.5, color: T.TEXT_3, opacity: 0.7, lineHeight: 1.4 }}>
        ROI shown relative to the current AI capital baseline. Net P&amp;L, profit
        factor, win rate and avg winner/loser are the directly comparable era metrics.
      </span>
    </div>
  );
}

export const AiManagedPerformancePanel = memo(function AiManagedPerformancePanel() {
  const { data, isLoading, isError } = useManagedPerformance();
  const { data: capital } = useAiCapital();
  const { setAiCapital, isPending } = useSetAiCapital();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  // Seed the editor with the current declared allocation whenever it loads
  // or changes (and the user isn't mid-edit).
  useEffect(() => {
    if (!editing) {
      const cur = capital?.aiAllocatedCapital;
      setDraft(cur != null ? String(cur) : "");
    }
  }, [capital?.aiAllocatedCapital, editing]);

  const saveCapital = async () => {
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount < 0) {
      setMsg("INVALID AMOUNT");
      setTimeout(() => setMsg(null), 2500);
      return;
    }
    try {
      await setAiCapital(amount);
      setMsg("SAVED");
      setEditing(false);
    } catch {
      setMsg("SAVE FAILED");
    }
    setTimeout(() => setMsg(null), 2500);
  };

  const headerBar = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, padding: "10px 12px", borderBottom: `1px solid ${T.BORDER}`,
    }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        fontSize: 11, fontWeight: 700, letterSpacing: T.TRACK_TITLE, color: T.NEON,
      }}>
        <Cpu size={13} color={T.NEON} />
        AICANDLEZ MANAGED PERFORMANCE
      </span>
      {data && (
        <span style={{ fontSize: 8.5, color: T.TEXT_3, letterSpacing: T.TRACK_LABEL }}>
          AI-TRADING ONLY
        </span>
      )}
    </div>
  );

  return (
    <section style={{
      background: T.BG_TERMINAL,
      border: `1px solid ${T.BORDER}`,
      fontFamily: T.FONT_MONO,
    }}>
      {headerBar}

      {isLoading && (
        <div style={{ padding: "16px 12px", fontSize: 11, color: T.TEXT_3 }}>
          Loading managed performance…
        </div>
      )}

      {isError && !isLoading && (
        <div style={{ padding: "16px 12px", fontSize: 11, color: T.AMBER }}>
          Managed performance unavailable — retrying.
        </div>
      )}

      {data && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* AI Allocated Capital set/edit control */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, flexWrap: "wrap",
            padding: "10px 12px", border: `1px solid ${T.BORDER}`,
            background: "rgba(0,0,0,0.30)",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: T.TRACK_LABEL, color: T.TEXT_3 }}>
                AI ALLOCATED CAPITAL
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: T.TEXT_0 }}>
                {usd(data.baseline.startingAiCapital)}
              </span>
              {data.baseline.source === "paper-default" && (
                <span style={{ fontSize: 8, color: T.AMBER, opacity: 0.85 }}>
                  No allocation declared — using paper baseline.
                </span>
              )}
              {data.live.hasLiveExchange && (
                <span style={{ fontSize: 8, color: T.TEXT_3, opacity: 0.75 }}>
                  This is your Starting Live Capital baseline — enter your
                  verified amount.
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editing ? (
                <>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: 120, padding: "6px 8px",
                      background: "#000", border: `1px solid ${T.BORDER}`,
                      color: T.TEXT_0, fontFamily: T.FONT_MONO, fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void saveCapital()}
                    disabled={isPending}
                    style={{
                      padding: "6px 12px", cursor: isPending ? "default" : "pointer",
                      background: "rgba(102,255,102,0.08)",
                      border: `1px solid ${T.NEON}`, color: T.NEON,
                      fontFamily: T.FONT_MONO, fontSize: 10, fontWeight: 700,
                      letterSpacing: T.TRACK_LABEL, opacity: isPending ? 0.6 : 1,
                    }}
                  >
                    {isPending ? "SAVING…" : "SAVE"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setMsg(null); }}
                    style={{
                      padding: "6px 12px", cursor: "pointer",
                      background: "transparent", border: `1px solid ${T.BORDER}`,
                      color: T.TEXT_2, fontFamily: T.FONT_MONO, fontSize: 10,
                      fontWeight: 700, letterSpacing: T.TRACK_LABEL,
                    }}
                  >
                    CANCEL
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  style={{
                    padding: "6px 12px", cursor: "pointer",
                    background: "transparent", border: `1px solid ${T.BORDER}`,
                    color: T.TEXT_1, fontFamily: T.FONT_MONO, fontSize: 10,
                    fontWeight: 700, letterSpacing: T.TRACK_LABEL,
                  }}
                >
                  {data.baseline.source === "allocated" ? "EDIT" : "SET ALLOCATION"}
                </button>
              )}
              {msg && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: T.TRACK_LABEL,
                  color: msg === "SAVED" ? T.NEON : T.AMBER,
                }}>
                  {msg}
                </span>
              )}
            </div>
          </div>

          {/* ── LIVE ACCOUNT (real broker-sourced) ──────────────────────── */}
          {/* Primary surface for live customers: real exchange cash + the
              market value of AICandlez-managed live positions. Shown whenever
              the customer has a healthy live exchange. */}
          {data.live.hasLiveExchange ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: T.TRACK_LABEL, color: T.NEON,
                }}>
                  LIVE ACCOUNT
                </span>
                {data.live.exchanges.length > 0 && (
                  <span style={{ fontSize: 8, color: T.TEXT_3, letterSpacing: T.TRACK_LABEL }}>
                    {data.live.exchanges.join(" · ").toUpperCase()}
                  </span>
                )}
              </div>
              {data.live.balanceError && (
                <div style={{ fontSize: 9, color: T.AMBER, lineHeight: 1.4 }}>
                  Live balance temporarily unavailable — values may be
                  incomplete. Retrying.
                </div>
              )}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 8,
              }}>
                <Kpi
                  label="STARTING LIVE CAPITAL"
                  value={usdOrDash(data.live.startingLiveCapital)}
                  tone={data.live.startingLiveCapital == null ? "muted" : undefined}
                  hint={data.live.startingLiveCapital == null ? "Set allocation above" : undefined}
                />
                <Kpi
                  label="LIVE CASH BALANCE"
                  value={usdOrDash(data.live.liveCashBalance)}
                  hint="USD + USDC"
                />
                <Kpi
                  label="OPEN TRADE VALUE"
                  value={usd(data.live.openTradeValue)}
                  hint={`${data.live.openLivePositions} live open`}
                />
                <Kpi
                  label="LIVE ACCOUNT VALUE"
                  value={usdOrDash(data.live.liveAccountValue)}
                  hint="cash + open trades"
                />
                <Kpi
                  label="NET LIFETIME PROFIT"
                  value={signedUsdOrDash(data.live.netLifetimeProfit)}
                  tone={
                    data.live.netLifetimeProfit == null
                      ? "muted"
                      : data.live.netLifetimeProfit >= 0 ? "pos" : "neg"
                  }
                  hint="since starting capital"
                />
                <Kpi
                  label="LIVE ROI"
                  value={signedPctOrDash(data.live.liveRoiPct)}
                  tone={
                    data.live.liveRoiPct == null
                      ? "muted"
                      : data.live.liveRoiPct >= 0 ? "pos" : "neg"
                  }
                  hint="since starting capital"
                />
              </div>
            </div>
          ) : (
            <div style={{
              padding: "10px 12px", border: `1px solid ${T.BORDER}`,
              background: "rgba(0,0,0,0.30)", fontSize: 9.5, color: T.TEXT_3,
            }}>
              {data.live.balanceError
                ? "Live balance unavailable — retrying."
                : "Connect a live exchange to see your live account value."}
            </div>
          )}

          {/* AI-trading model (virtual baseline) — section label so the
              virtual figures below are never mistaken for the live account. */}
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: T.TRACK_LABEL, color: T.TEXT_3,
          }}>
            AI TRADING PERFORMANCE
          </span>

          {/* Headline KPI grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8,
          }}>
            {!data.live.hasLiveExchange && (
              <Kpi
                label="CURRENT AI CAPITAL"
                value={usd(data.currentAiCapital)}
              />
            )}
            <Kpi
              label="NET TRADING PROFIT"
              value={signedUsd(data.netTradingProfit)}
              tone={data.netTradingProfit >= 0 ? "pos" : "neg"}
            />
            <Kpi
              label="NET TRADING ROI"
              value={signedPct(data.netTradingRoiPct)}
              tone={data.netTradingRoiPct >= 0 ? "pos" : "neg"}
            />
            <Kpi
              label="REALIZED P&L"
              value={signedUsd(data.realizedProfit)}
              tone={data.realizedProfit >= 0 ? "pos" : "neg"}
            />
            <Kpi
              label="UNREALIZED P&L"
              value={signedUsd(data.unrealizedProfit)}
              tone={data.unrealizedProfit >= 0 ? "pos" : "neg"}
            />
            {!data.live.hasLiveExchange && (
              <Kpi
                label="CASH AVAILABLE"
                value={usd(data.cashAvailable)}
              />
            )}
            <Kpi
              label="CAPITAL DEPLOYED"
              value={usd(data.capitalDeployed)}
              hint="Σ open position size"
            />
            {!data.live.hasLiveExchange && (
              <Kpi
                label="OPEN TRADE VALUE"
                value={usd(data.openTradeValue)}
              />
            )}
          </div>

          {/* Window + trade-stat row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 8,
          }}>
            <Kpi
              label="TODAY"
              value={signedUsd(data.windows.today)}
              tone={data.windows.today >= 0 ? "pos" : "neg"}
            />
            <Kpi
              label="THIS WEEK"
              value={signedUsd(data.windows.week)}
              tone={data.windows.week >= 0 ? "pos" : "neg"}
            />
            <Kpi
              label="THIS MONTH"
              value={signedUsd(data.windows.month)}
              tone={data.windows.month >= 0 ? "pos" : "neg"}
            />
            <Kpi
              label="OPEN POSITIONS"
              value={String(data.openPositions)}
            />
            <Kpi
              label="CLOSED TRADES"
              value={String(data.closedTrades)}
            />
            <Kpi
              label="WIN RATE"
              value={`${data.winRatePct.toFixed(1)}%`}
              hint={`${data.wins}W · ${data.losses}L`}
            />
            <Kpi
              label="PROFIT FACTOR"
              value={data.profitFactor != null ? data.profitFactor.toFixed(2) : "—"}
            />
            <Kpi
              label="AVG WINNER"
              value={usd(data.avgWinner)}
              tone="pos"
            />
            <Kpi
              label="AVG LOSER"
              value={usd(data.avgLoser)}
              tone="neg"
            />
            <Kpi
              label="BEST TRADE"
              value={data.bestTrade != null ? signedUsd(data.bestTrade) : "—"}
              tone={data.bestTrade != null && data.bestTrade >= 0 ? "pos" : "neg"}
            />
            <Kpi
              label="WORST TRADE"
              value={data.worstTrade != null ? signedUsd(data.worstTrade) : "—"}
              tone={data.worstTrade != null && data.worstTrade >= 0 ? "pos" : "neg"}
            />
          </div>

          {/* Legacy vs Current strategy-era comparison */}
          <EraComparison eras={data.eras} />
        </div>
      )}
    </section>
  );
});
