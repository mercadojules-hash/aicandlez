import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[] }

export function OpportunityScanner({ breakdowns }: Props) {
  const opps = breakdowns
    .filter((b) => b.agreedAction !== "HOLD" && b.mtfConfirmed)
    .sort((a, b) => b.avgConfidence - a.avgConfidence);

  const watching = breakdowns
    .filter((b) => b.agreedAction === "HOLD" || !b.mtfConfirmed)
    .sort((a, b) => b.avgConfidence - a.avgConfidence);

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <div className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">
          AI OPPORTUNITY SCANNER
        </span>
        {opps.length > 0 ? (
          <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded font-mono"
            style={{ background: "#00ff8812", color: "#00ff88", border: "1px solid #00ff8830" }}>
            {opps.length} SIGNAL{opps.length !== 1 ? "S" : ""}
          </span>
        ) : (
          <span className="ml-auto text-[8px] font-mono text-[#0E2235]">
            {breakdowns.length} TRACKED
          </span>
        )}
      </div>

      <div className="p-2 space-y-1">
        {opps.length === 0 && watching.length === 0 ? (
          <div className="text-center text-[9px] text-[#0E2235] py-4 font-mono animate-pulse">
            SCANNING MARKETS…
          </div>
        ) : (
          <>
            {/* ── Active signals (MTF confirmed, non-HOLD) ──────────────── */}
            {opps.map((b) => {
              const color = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
              const lbl   = b.symbol.replace("USD", "");
              const isBuy = b.agreedAction === "BUY";
              return (
                <div
                  key={b.symbol}
                  className="rounded px-2 py-2 border"
                  style={{
                    background: isBuy ? "#00ff8806" : "#ff336606",
                    borderColor: isBuy ? "#00ff8820" : "#ff336620",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-5 h-5 rounded text-[8px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: color + "18", color, boxShadow: `0 0 6px ${color}40` }}
                    >
                      {lbl.slice(0, 3)}
                    </div>
                    <span className="text-[9px] font-bold" style={{ color }}>{lbl}</span>
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide"
                      style={{
                        background: isBuy ? "#00ff8812" : "#ff336612",
                        color: isBuy ? "#00ff88" : "#ff3366",
                        border: `1px solid ${isBuy ? "#00ff8830" : "#ff336630"}`,
                      }}
                    >
                      {b.agreedAction}
                    </span>
                    {b.volumeConfirmed ? (
                      <span className="text-[7px] font-mono" style={{ color: "#00ff8870" }}>✓ VOL</span>
                    ) : (
                      <span className="text-[7px] font-mono" style={{ color: "#ff225560" }}>✗ VOL</span>
                    )}
                    <span className="ml-auto text-[8px] font-mono text-[#1e5070]">
                      {b.avgConfidence.toFixed(0)}%
                    </span>
                  </div>
                  <div className="conf-bar-track">
                    <div
                      className="conf-bar-fill"
                      style={{
                        width: `${Math.min(100, b.avgConfidence)}%`,
                        background: isBuy ? "#00ff88" : "#ff3366",
                        color: isBuy ? "#00ff88" : "#ff3366",
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[7px] font-mono text-[#1a4060]">
                    <span>MTF CONFIRMED</span>
                    {b.marketCondition && (
                      <span style={{ color: "#1e5070" }}>· {b.marketCondition.toUpperCase()}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ── Watching list ─────────────────────────────────────────── */}
            {watching.length > 0 && (
              <>
                <div className="text-[7px] text-[#0E2235] uppercase tracking-[0.2em] pt-1 pb-0.5 font-mono">
                  Watching ({watching.length})
                </div>
                {watching.map((b) => {
                  const color = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
                  const lbl   = b.symbol.replace("USD", "");
                  const condColor =
                    b.marketCondition === "trending" ? "#ffb80060" :
                    b.marketCondition === "volatile" ? "#ff225560" : "#1e4060";
                  return (
                    <div
                      key={b.symbol}
                      className="flex items-center gap-2 px-2 py-1.5 rounded border border-[#0A1E30]"
                    >
                      <div
                        className="w-4 h-4 rounded text-[7px] font-bold flex items-center justify-center shrink-0"
                        style={{ background: color + "12", color }}
                      >
                        {lbl.slice(0, 3)}
                      </div>
                      <span className="text-[9px] font-mono text-[#1e4060]">{lbl}</span>
                      <span className="text-[8px] font-mono" style={{ color: condColor }}>
                        {b.marketCondition ? b.marketCondition.toUpperCase() : ""}
                      </span>
                      {b.volumeConfirmed ? (
                        <span className="text-[7px] font-mono" style={{ color: "#00ff8850" }}>✓</span>
                      ) : (
                        <span className="text-[7px] font-mono" style={{ color: "#ff225540" }}>✗</span>
                      )}
                      <span className="ml-auto text-[8px] font-mono text-[#1e4060]">
                        {b.avgConfidence.toFixed(0)}%
                      </span>
                      <span className="text-[7px] font-mono text-[#0E2235]">HOLD</span>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
