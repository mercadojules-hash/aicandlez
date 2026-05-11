import type { EngineStatus } from "./types";

interface Props { engine: EngineStatus | undefined }

export function LiveTicker({ engine }: Props) {
  const log   = engine?.recentSignalLog ?? [];
  const items = log.length
    ? log.map((s) => `${s.symbol} → ${s.decision} (${s.confidence.toFixed(0)}%)${s.executedAs ? " ✓ EXECUTED" : ""}`)
    : ["Waiting for first AI tick…"];

  const ticker = [...items, ...items].join("   ·   ");

  return (
    <div className="bg-card border border-border/40 rounded-xl px-4 py-2 overflow-hidden">
      <div className="flex items-center gap-3">
        <span className="text-[9px] font-bold text-primary/70 uppercase tracking-widest shrink-0">LIVE AI</span>
        <div className="flex-1 overflow-hidden">
          <div
            className="whitespace-nowrap text-[10px] font-mono text-muted-foreground/70"
            style={{ animation: "ticker 30s linear infinite" }}
          >
            {ticker}
          </div>
        </div>
        {engine?.running && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        )}
      </div>
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
