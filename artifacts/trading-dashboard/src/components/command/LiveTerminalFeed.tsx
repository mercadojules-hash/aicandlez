import { Terminal } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

export function LiveTerminalFeed({ engine }: Props) {
  const log = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 12);

  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
        <Terminal className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Live Terminal Feed</h3>
        <span className="ml-auto text-[10px] text-muted-foreground/40">last 12 signals</span>
      </div>

      <div className="p-3 font-mono text-[10px] space-y-1 bg-black/20 min-h-[8rem]">
        {log.length === 0 ? (
          <div className="text-muted-foreground/30">$ awaiting first signal tick…</div>
        ) : (
          log.map((s) => {
            const color = SYMBOL_COLOR[s.symbol] ?? "#888";
            const ts    = new Date(s.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const tag   = s.executedAs ? `[EXEC:${s.executedAs}]` : s.blockReason ? `[BLOCKED]` : `[SIGNAL]`;
            const tagColor =
              s.executedAs ? "text-emerald-400" :
              s.blockReason ? "text-amber-400/70" :
              "text-muted-foreground/40";
            return (
              <div key={s.id} className="flex items-start gap-2">
                <span className="text-muted-foreground/30 shrink-0">{ts}</span>
                <span className={`shrink-0 ${tagColor}`}>{tag}</span>
                <span style={{ color }} className="shrink-0">{s.symbol}</span>
                <span className={`${
                  s.decision === "BUY"  ? "text-emerald-400" :
                  s.decision === "SELL" ? "text-red-400" :
                  "text-muted-foreground/50"
                }`}>{s.decision}</span>
                <span className="text-muted-foreground/30">{s.confidence.toFixed(0)}%</span>
                {s.blockReason && s.blockReason !== "None" && (
                  <span className="text-amber-400/50 truncate">{s.blockReason}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
