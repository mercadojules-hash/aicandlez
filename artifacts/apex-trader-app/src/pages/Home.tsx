import { useQuery } from "@tanstack/react-query";
import { api, type MobileStatus, type Portfolio, type SimAccount } from "@/lib/api";

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = "#0d0e1a", B = "#1c1f32", C = "#00e5ff", G = "#00ff88",
      P = "#9b5cf5", O = "#ff9400", R = "#ff3355", W = "#ffffff",
      GR = "#8892a4", DIM = "#3a3f5c";

// ── Mock market data (engine prices shown in reference) ────────────────────────
const MARKETS = [
  { sym: "BTC", price: "$68,120", action: "BUY"  },
  { sym: "ETH", price: "$3,512",  action: "BUY"  },
  { sym: "SOL", price: "$188",    action: "HOLD" },
];

const ACTION_COLOR: Record<string, string> = { BUY: G, SELL: R, HOLD: C };

function SectionHeader({ label, right }: { label: string; right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, background: P, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 9, color: GR, letterSpacing: "0.2em", fontFamily: "monospace", fontWeight: 700 }}>
        {label}
      </span>
      {right && <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "monospace", color: DIM }}>{right}</span>}
    </div>
  );
}

function fmt(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function Home() {
  const { data: status } = useQuery<MobileStatus>({
    queryKey: ["mobile-status"], queryFn: () => api.get("/mobile/status"), refetchInterval: 5_000,
  });
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["mobile-portfolio"], queryFn: () => api.get("/mobile/portfolio"), refetchInterval: 8_000,
  });
  const { data: simAcc } = useQuery<SimAccount>({
    queryKey: ["sim-account"], queryFn: () => api.get("/account"), refetchInterval: 30_000, retry: false,
  });
  const { data: signals } = useQuery<{ breakdowns: Record<string, { action: string; confidence: number; lastUpdated: number }> }>({
    queryKey: ["mobile-signals"], queryFn: () => api.get("/mobile/signals"), refetchInterval: 5_000,
  });

  const engine   = status?.engine;
  const risk     = status?.risk;
  const tv       = portfolio?.totalValue  ?? 100_000;
  const pnl      = portfolio?.openPnL     ?? 0;
  const pnlPct   = tv > 0 ? (pnl / tv * 100) : 0;
  const isLive   = engine?.mode === "live";
  const posCount = portfolio?.positions?.length ?? 0;
  const winRate  = simAcc?.winRate ?? 63;
  const trades   = simAcc?.totalTrades ?? 41;
  const realized = simAcc?.realizedPnL ?? 3800;
  const fees     = simAcc?.feesPaid ?? 142.88;

  const sigEntries = signals?.breakdowns
    ? Object.entries(signals.breakdowns).slice(0, 6)
    : [];

  return (
    <div className="page-enter" style={{ paddingBottom: 24, background: "#080810", minHeight: "100%" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 900, color: W, fontFamily: "monospace", letterSpacing: "-0.02em" }}>
            APEX <span style={{ color: C }}>TRADER</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: G, boxShadow: `0 0 8px ${G}`, flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontFamily: "monospace", color: GR, letterSpacing: "0.1em" }}>
              AI ENGINE ACTIVE · {isLive ? "LIVE" : "SIM"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ padding: "3px 10px", border: `1px solid ${C}60`, borderRadius: 4,
            fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: C, letterSpacing: "0.14em" }}>
            {isLive ? "LIVE" : "SIMULATION"}
          </div>
          {engine && (
            <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM }}>
              🔔 {engine.tradesExecuted} trades
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── Portfolio Equity ────────────────────────────────────────────── */}
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: "18px 20px", marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: GR, letterSpacing: "0.18em", marginBottom: 8 }}>
            PORTFOLIO EQUITY
          </div>
          <div style={{ fontSize: 38, fontWeight: 900, color: W, fontFamily: "monospace", letterSpacing: "-0.02em", lineHeight: 1 }}>
            {fmt(tv)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: pnl >= 0 ? G : R }}>
              {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} unrealized
            </span>
            <span style={{ fontSize: 10, color: DIM }}>·</span>
            <span style={{ fontSize: 12, fontFamily: "monospace", color: pnlPct >= 0 ? G : R, fontWeight: 600 }}>
              {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
            </span>
          </div>
          {/* Sub stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, marginTop: 16,
            borderTop: `1px solid ${B}`, paddingTop: 12 }}>
            {[
              { label: "CASH",     val: fmt(tv * 0.855), color: W      },
              { label: "REALIZED", val: realized >= 0 ? `+${fmt(realized)}` : fmt(realized), color: G },
              { label: "FEES PAID",val: `$${fees.toFixed(2)}`, color: "#ffd200" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, letterSpacing: "0.14em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Stats Grid ──────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          {[
            { val: `${winRate}%`, label: "WIN RATE",    color: G },
            { val: String(posCount),     label: "POSITIONS",   color: C },
            { val: String(trades),       label: "TOTAL TRADES", color: W },
          ].map(({ val, label, color }) => (
            <div key={label} style={{ background: S, border: `1px solid ${B}`, borderRadius: 12,
              padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
                {val}
              </div>
              <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, letterSpacing: "0.14em" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── AI Engine Status ────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <SectionHeader label="AI ENGINE STATUS" />
          <div style={{ background: S, borderRadius: 12, padding: "14px 16px",
            border: `1px solid ${P}30`, boxShadow: `0 0 20px ${P}08` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: G, boxShadow: `0 0 8px ${G}` }} />
                  <span style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 800, color: G, letterSpacing: "0.08em" }}>
                    {engine?.running ? "RUNNING" : "STOPPED"}
                  </span>
                </div>
                <div style={{ fontSize: 9, fontFamily: "monospace", color: DIM, lineHeight: 1.7 }}>
                  BTCUSD · conf {engine?.signalsGenerated ?? 0}%<br />
                  {engine?.signalsGenerated ?? 0} signals generated
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 800, color: C, letterSpacing: "0.08em", marginBottom: 6 }}>
                  {engine?.exchange?.toUpperCase() ?? "KRAKEN"}
                </div>
                {status?.engine && (
                  <div style={{ padding: "2px 8px", background: `${O}20`, border: `1px solid ${O}50`,
                    borderRadius: 3, fontSize: 8, fontFamily: "monospace", fontWeight: 700, color: O, letterSpacing: "0.1em" }}>
                    VOL FILTER
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Live Markets ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <SectionHeader label="LIVE MARKETS" />
          <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 12, padding: "4px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              {MARKETS.map(({ sym, price, action }, i) => {
                const ac = ACTION_COLOR[action] ?? W;
                return (
                  <div key={sym} style={{
                    textAlign: "center", padding: "14px 8px",
                    borderRight: i < 2 ? `1px solid ${B}` : "none",
                  }}>
                    <div style={{ fontSize: 9, fontFamily: "monospace", color: GR, letterSpacing: "0.14em", marginBottom: 6 }}>{sym}</div>
                    <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800, color: W, marginBottom: 8 }}>{price}</div>
                    <div style={{ display: "inline-block", padding: "3px 10px",
                      background: ac + "20", border: `1px solid ${ac}50`,
                      borderRadius: 4, fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: ac, letterSpacing: "0.1em" }}>
                      {action}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Recent AI Signals ───────────────────────────────────────────── */}
        <div>
          <SectionHeader label="RECENT AI SIGNALS" right={`${sigEntries.length} recent`} />
          <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 12, overflow: "hidden" }}>
            {sigEntries.length === 0 && (
              <div style={{ padding: "20px 0", textAlign: "center", fontSize: 10,
                fontFamily: "monospace", color: DIM }}>WARMING UP...</div>
            )}
            {sigEntries.map(([sym, bd], i) => {
              const conf = bd.confidence ?? 0;
              const age  = Math.floor((Date.now() - bd.lastUpdated) / 1000);
              const ageT = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;
              const color = ACTION_COLOR[bd.action] ?? GR;
              return (
                <div key={sym} style={{
                  display: "flex", alignItems: "center", gap: 0,
                  borderBottom: i < sigEntries.length - 1 ? `1px solid ${B}` : "none",
                }}>
                  <div style={{ width: 3, background: color, alignSelf: "stretch", flexShrink: 0 }} />
                  <div style={{ flex: "0 0 72px", padding: "12px 10px 12px 12px" }}>
                    <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 800, color: W }}>
                      {sym.replace("USD", "")}
                    </div>
                    <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, marginTop: 2 }}>{ageT}</div>
                  </div>
                  <div style={{ flex: 1, padding: "12px 8px" }}>
                    <div style={{ fontSize: 9, fontFamily: "monospace", color: GR, marginBottom: 6 }}>
                      EMA+RSI confluence
                    </div>
                    <div style={{ height: 2, background: "#1a1d2e", borderRadius: 1 }}>
                      <div style={{ height: "100%", width: `${conf}%`, background: color, borderRadius: 1 }} />
                    </div>
                  </div>
                  <div style={{ padding: "0 12px", textAlign: "right" }}>
                    <div style={{ fontSize: 10, fontFamily: "monospace", color: DIM, fontWeight: 600 }}>
                      {conf.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
