import { useQuery } from "@tanstack/react-query";
import { api, type Portfolio as PortfolioData, type SimAccount, type MonthlyFeesResponse } from "@/lib/api";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { EnableLiveCTA } from "@/components/EnableLiveCTA";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortMonthLabel(key: string): string {
  const [, m] = key.split("-");
  const idx = (parseInt(m ?? "0", 10) - 1);
  return MONTH_LABELS[idx] ?? key;
}

// Derives a one-line actionable insight when commissions ate ≥50% of profit
// in any visible month (or any month had fees on a losing/flat result).
// Deterministic: pulls from the same engine bucket data the chart renders,
// plus the lifetime winRate stat. No free-form LLM.
function deriveFeesInsight(
  buckets: MonthlyFeeBucketLite[],
  winRate: number | undefined,
): string | null {
  if (!buckets || buckets.length === 0) return null;
  type Scored = { b: MonthlyFeeBucketLite; ratio: number; losing: boolean };
  const scored: Scored[] = [];
  for (const b of buckets) {
    if (b.feesPaid <= 0) continue;
    if (b.realizedPnL > 0) {
      const ratio = (b.feesPaid / b.realizedPnL) * 100;
      if (ratio >= 50) scored.push({ b, ratio, losing: false });
    } else {
      scored.push({ b, ratio: Infinity, losing: true });
    }
  }
  if (scored.length === 0) return null;
  scored.sort((a, z) => z.ratio - a.ratio);
  const worst = scored[0];
  const monthName = shortMonthLabel(worst.b.month);
  // Engine default minConfidence = 60 (lib/tradingLoop.ts). When a user's
  // realized win rate is weak we nudge higher; otherwise a one-step nudge.
  const suggestThreshold = (winRate ?? 0) < 55 ? 75 : 70;
  const avgTradeFee = worst.b.tradeCount > 0
    ? worst.b.feesPaid / worst.b.tradeCount : 0;
  const tradesLabel = worst.b.tradeCount === 1
    ? "1 trade" : `${worst.b.tradeCount} trades`;
  if (worst.losing) {
    return `Your ${monthName} paid $${worst.b.feesPaid.toFixed(2)} in fees across ${tradesLabel} on a losing month — consider widening signal confidence above ${suggestThreshold} to trade less.`;
  }
  return `Your ${monthName} fees consumed ${worst.ratio.toFixed(0)}% of profit ($${avgTradeFee.toFixed(2)} avg per trade) — consider widening signal confidence above ${suggestThreshold} to trade less.`;
}

type MonthlyFeeBucketLite = { month: string; feesPaid: number; tradeCount: number; realizedPnL: number };

function FeesInsightCallout({ insight }: { insight: string | null }) {
  if (!insight) return null;
  return (
    <div style={{
      marginTop: 10,
      padding: "10px 12px",
      borderRadius: 6,
      border: "1px solid rgba(255,122,61,0.35)",
      background: "rgba(255,122,61,0.06)",
      display: "flex", gap: 8, alignItems: "flex-start",
    }}>
      <span style={{
        fontSize: 8, fontFamily: "monospace", color: "#ff7a3d",
        letterSpacing: "0.16em", textTransform: "uppercase",
        padding: "2px 6px", borderRadius: 3,
        border: "1px solid rgba(255,122,61,0.4)",
        flexShrink: 0, marginTop: 1,
      }}>AI TAKE</span>
      <span style={{
        fontSize: 11, fontFamily: "monospace", color: "#e8c4a8",
        lineHeight: 1.45,
      }}>{insight}</span>
    </div>
  );
}

function FeesMonthlyChart({ data, winRate }: { data: MonthlyFeesResponse | undefined; winRate: number | undefined }) {
  const buckets = data?.months ?? [];
  const insight = deriveFeesInsight(buckets, winRate);
  const hasAny  = buckets.some(b => b.feesPaid > 0 || b.realizedPnL !== 0);
  const peak    = Math.max(
    0,
    ...buckets.map(b => Math.max(b.feesPaid, Math.abs(b.realizedPnL))),
  );

  if (!hasAny) {
    return (
      <div style={{
        marginTop: 12, padding: "10px 12px",
        borderTop: "1px solid #0a1a28",
        fontSize: 9, fontFamily: "monospace", color: "#1e3a50",
        letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "center",
      }}>
        NO LIVE FEES YET · LAST 6 MONTHS
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #0a1a28" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
          letterSpacing: "0.14em", textTransform: "uppercase" }}>
          FEES vs PROFIT · LAST 6 MONTHS
        </span>
        <span style={{ fontSize: 9, fontFamily: "monospace", color: "#3a6080" }}>
          peak ${peak.toFixed(2)}
        </span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${buckets.length}, 1fr)`,
        alignItems: "end",
        gap: 6,
        height: 56,
      }}>
        {buckets.map(b => {
          const profit  = b.realizedPnL;
          const profitH = peak > 0 ? Math.max(profit > 0 ? 2 : 0, Math.round((Math.max(profit, 0) / peak) * 48)) : 0;
          const feeH    = peak > 0 ? Math.max(b.feesPaid > 0 ? 2 : 0, Math.round((b.feesPaid / peak) * 48)) : 0;
          const active  = b.feesPaid > 0 || profit !== 0;
          // Flag: fees ate more than profits (incl. losing months with any fees)
          const overrun = b.feesPaid > 0 && b.feesPaid >= Math.max(profit, 0);
          const ratio   = profit > 0 ? (b.feesPaid / profit) * 100 : null;
          const ratioLabel = ratio !== null
            ? ` · fees ${ratio.toFixed(1)}% of profit`
            : (profit < 0 ? " · losing month" : "");
          const profitColor = profit >= 0 ? "#00ff8a" : "#3a6080";
          const feeColor    = overrun ? "#ff7a3d" : "#3a6080";
          return (
            <div key={b.month} style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
              height: "100%",
            }} title={
              `${shortMonthLabel(b.month)} ${b.month.slice(0,4)} · ` +
              `$${b.feesPaid.toFixed(2)} fees on ` +
              `${profit >= 0 ? "$" : "−$"}${Math.abs(profit).toFixed(2)} profit · ` +
              `${b.tradeCount} trade${b.tradeCount === 1 ? "" : "s"}${ratioLabel}`
            }>
              <div style={{
                display: "flex", alignItems: "flex-end", justifyContent: "center",
                gap: 2, width: "100%", height: "100%",
              }}>
                {profitH > 0 && (
                  <div style={{
                    width: "45%", height: profitH, borderRadius: 2,
                    background: profitColor,
                    boxShadow: active && profit > 0 ? "0 0 6px rgba(0,255,138,0.35)" : "none",
                  }} />
                )}
                {feeH > 0 && (
                  <div style={{
                    width: "45%", height: feeH, borderRadius: 2,
                    background: feeColor,
                    boxShadow: overrun ? "0 0 6px rgba(255,122,61,0.5)" : "none",
                  }} />
                )}
                {profitH === 0 && feeH === 0 && (
                  <div style={{ width: "100%", height: 2, borderRadius: 2, background: "#0d2035" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        display: "flex", justifyContent: "center", gap: 12,
        marginTop: 6, fontSize: 8, fontFamily: "monospace",
        color: "#2a4060", letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        <span><span style={{ color: "#00ff8a" }}>■</span> PROFIT</span>
        <span><span style={{ color: "#3a6080" }}>■</span> FEES</span>
        <span><span style={{ color: "#ff7a3d" }}>■</span> FEES &gt; PROFIT</span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${buckets.length}, 1fr)`,
        gap: 6, marginTop: 6,
      }}>
        {buckets.map(b => (
          <div key={`${b.month}-l`} style={{
            fontSize: 8, fontFamily: "monospace", color: "#2a4060",
            textAlign: "center", letterSpacing: "0.05em",
          }}>
            {shortMonthLabel(b.month).toUpperCase()}
          </div>
        ))}
      </div>
      <FeesInsightCallout insight={insight} />
    </div>
  );
}

function PositionRow({ pos }: { pos: PortfolioData["positions"][number] }) {
  const pnl = pos.unrealizedPnL ?? 0;
  const up  = pnl >= 0;
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      padding:      "12px 0",
      borderBottom: "1px solid #0d2035",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          {pos.symbol}
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060", marginTop: 2 }}>
          {pos.side} · {pos.size} · ENTRY ${pos.entryPrice?.toFixed(2)}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700,
          color: up ? "#00ff8a" : "#ff4466" }}>
          {up ? "+" : ""}${pnl.toFixed(2)}
        </div>
        {pos.currentPrice && (
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060", marginTop: 2 }}>
            NOW ${pos.currentPrice.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { data, isLoading } = useQuery<PortfolioData>({
    queryKey:        ["mobile-portfolio"],
    queryFn:         () => api.get("/mobile/portfolio"),
    refetchInterval: 10_000,
  });

  const { data: simAcc } = useQuery<SimAccount>({
    queryKey:        ["sim-account"],
    queryFn:         () => api.get("/account"),
    refetchInterval: 30_000,
    staleTime:       15_000,
  });

  const { data: monthlyFees } = useQuery<MonthlyFeesResponse>({
    queryKey:        ["sim-account-fees-monthly"],
    queryFn:         () => api.get("/account/fees/monthly?months=6"),
    refetchInterval: 60_000,
    staleTime:       30_000,
  });

  const totalValue = data?.totalValue ?? 100000;
  const openPnL    = data?.openPnL    ?? 0;
  const pnlPositive = openPnL >= 0;
  const positions  = data?.positions ?? [];

  const totalRealized = simAcc?.totalRealized ?? (simAcc as { realizedPnL?: number } | undefined)?.realizedPnL ?? 0;
  const feesPaid      = simAcc?.totalFeesPaid ?? 0;
  const realizedPos   = totalRealized >= 0;

  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <UpgradeBanner />
      <EnableLiveCTA style={{ padding: "0 0 14px" }}/>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
          PAPER ACCOUNT
        </div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Portfolio
        </div>
      </div>

      {/* Total value */}
      <div style={{
        background:   "#050d18",
        border:       "1px solid #0d2035",
        borderRadius: 10,
        padding:      "18px 20px",
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
          TOTAL VALUE (PAPER)
        </div>
        <div style={{ fontSize: 30, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{
          fontSize:  13,
          fontFamily: "monospace",
          fontWeight: 600,
          color:     pnlPositive ? "#00ff8a" : "#ff4466",
          marginTop: 6,
        }}>
          {pnlPositive ? "+" : ""}${openPnL.toFixed(2)} unrealized PnL
        </div>
        <div style={{
          marginTop: 14, paddingTop: 10,
          borderTop: "1px solid #0d2035",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
              letterSpacing: "0.14em" }}>TOTAL REALIZED PNL</div>
            <div style={{
              fontSize: 14, fontFamily: "monospace", fontWeight: 700, marginTop: 3,
              color: realizedPos ? "#00ff8a" : "#ff4466",
            }}>
              {realizedPos ? "+" : ""}${totalRealized.toFixed(2)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50" }}>EXCHANGE</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#3a6080", fontWeight: 700, marginTop: 2 }}>
              {data?.exchange?.toUpperCase() ?? "SIMULATION"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50" }}>MODE</div>
            <div style={{ fontSize: 11, fontFamily: "monospace",
              color: data?.mode === "live" ? "#00ff8a" : "#ffaa00", fontWeight: 700, marginTop: 2 }}>
              {data?.mode?.toUpperCase() ?? "PAPER"}
            </div>
          </div>
          <div title="Lifetime broker commission paid across every closed live trade">
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50" }}>FEES PAID</div>
            <div style={{
              fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginTop: 2,
              color: feesPaid > 0 ? "#e8f4ff" : "#3a6080",
            }}>
              {feesPaid > 0 ? `−$${feesPaid.toFixed(2)}` : "—"}
            </div>
          </div>
        </div>

        <FeesMonthlyChart data={monthlyFees} winRate={simAcc?.winRate} />
      </div>

      {/* Balances */}
      {data?.balances && Object.keys(data.balances).length > 0 && (
        <div style={{
          background: "#050d18", border: "1px solid #0d2035",
          borderRadius: 10, padding: "14px 16px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
            letterSpacing: "0.14em", marginBottom: 10 }}>BALANCES</div>
          {Object.entries(data.balances).map(([asset, amount]) => (
            <div key={asset} style={{ display: "flex", justifyContent: "space-between",
              padding: "6px 0", borderBottom: "1px solid #0a1a28" }}>
              <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
                {asset}
              </span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "#3a6080" }}>
                {typeof amount === "number" ? amount.toFixed(8).replace(/0+$/, "0") : amount}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Positions */}
      <div style={{ background: "#050d18", border: "1px solid #0d2035",
        borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.14em", marginBottom: 4 }}>
          OPEN POSITIONS ({positions.length})
        </div>

        {isLoading && (
          <div style={{ padding: "20px 0", textAlign: "center", fontFamily: "monospace",
            fontSize: 10, color: "#2a4060" }}>LOADING...</div>
        )}

        {!isLoading && positions.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", fontFamily: "monospace",
            fontSize: 10, color: "#1e3a50" }}>NO OPEN POSITIONS</div>
        )}

        {positions.map(pos => <PositionRow key={pos.id} pos={pos} />)}
      </div>
    </div>
  );
}
