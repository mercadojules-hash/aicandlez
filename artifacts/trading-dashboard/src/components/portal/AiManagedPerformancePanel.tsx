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

          {/* Headline KPI grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8,
          }}>
            <Kpi
              label="CURRENT AI CAPITAL"
              value={usd(data.currentAiCapital)}
            />
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
            <Kpi
              label="CASH AVAILABLE"
              value={usd(data.cashAvailable)}
            />
            <Kpi
              label="CAPITAL DEPLOYED"
              value={usd(data.capitalDeployed)}
              hint="Σ open position size"
            />
            <Kpi
              label="OPEN TRADE VALUE"
              value={usd(data.openTradeValue)}
            />
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
        </div>
      )}
    </section>
  );
});
