import { useEffect, useState } from "react";
import type { EngineStatus } from "./types";

interface Props { engine: EngineStatus | undefined; breakdowns?: any[] }

interface Warning { msg: string; level: "high" | "med" | "ok" }

function assess(engine: EngineStatus | undefined, bds: any[]) {
  const warnings: Warning[] = [];
  let score = 0;

  const avgConf      = bds.length ? bds.reduce((s: number, b: any) => s + b.avgConfidence, 0) / bds.length : 50;
  const volOk        = bds.filter((b: any) => b.volumeConfirmed).length;
  const volatile     = bds.filter((b: any) => b.marketCondition === "volatile").length;
  const buys         = bds.filter((b: any) => b.agreedAction === "BUY").length;
  const sells        = bds.filter((b: any) => b.agreedAction === "SELL").length;
  const mtfConfirmed = bds.filter((b: any) => b.mtfConfirmed).length;

  if (engine?.killSwitch) {
    score = 100;
    warnings.push({ msg: "KILL SWITCH ACTIVE — all execution halted", level: "high" });
  }
  if (avgConf < 40) {
    score += 35; warnings.push({ msg: "Low conviction across all assets", level: "high" });
  } else if (avgConf < 55) {
    score += 18; warnings.push({ msg: "Below-average AI conviction detected", level: "med" });
  }
  if (volatile >= 3) {
    score += 25; warnings.push({ msg: `${volatile} assets in volatile regime`, level: "high" });
  } else if (volatile >= 1) {
    score += 10; warnings.push({ msg: `${volatile} asset(s) showing volatility`, level: "med" });
  }
  if (volOk < bds.length * 0.4) {
    score += 20; warnings.push({ msg: "Volume confirmation below threshold", level: "med" });
  }
  if (Math.abs(buys - sells) <= 1 && bds.length >= 4) {
    score += 12; warnings.push({ msg: "Signal divergence — mixed directional bias", level: "med" });
  }
  if ((engine?.tradesBlocked ?? 0) > 200) {
    score += 15; warnings.push({ msg: "Elevated trade block rate this session", level: "med" });
  }
  if (mtfConfirmed === 0 && bds.length > 0) {
    score += 10; warnings.push({ msg: "No MTF-confirmed signals currently", level: "med" });
  }
  if (warnings.length === 0) {
    warnings.push({ msg: "Market environment within normal parameters", level: "ok" });
  }

  const risk  = Math.min(100, Math.max(4, score));
  const level = risk >= 50 ? "HIGH" : risk >= 22 ? "MEDIUM" : "LOW";
  const color = level === "HIGH" ? "#ff3355" : level === "MEDIUM" ? "#ffaa00" : "#00ff8a";
  return { level, color, risk, warnings: warnings.slice(0, 3) };
}

const warnColor = (l: Warning["level"]) =>
  l === "high" ? "#ff3355" : l === "med" ? "#ffaa00" : "#00ff8a70";

export function AIThreatMonitor({ engine, breakdowns = [] }: Props) {
  const t = assess(engine, breakdowns);

  const [animRisk, setAnimRisk] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setAnimRisk((p) => { const d = t.risk - p; return Math.abs(d) < 0.2 ? t.risk : p + d * 0.1; });
    }, 60);
    return () => clearInterval(id);
  }, [t.risk]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#080808", border: "1px solid #181818" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomColor: "#181818", background: "#050505" }}>
        <div className="flex-1">
          <div className="text-[10px] font-bold tracking-[0.2em] font-mono" style={{ color: "#00aaff" }}>
            AI THREAT MONITOR
          </div>
          <div className="text-[8px] font-mono text-[#2a4050] tracking-[0.1em] mt-0.5">
            AUTONOMOUS RISK ENVIRONMENT ANALYSIS
          </div>
        </div>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded font-mono tracking-[0.1em]"
          style={{ background: `${t.color}12`, color: t.color, border: `1px solid ${t.color}30` }}
        >
          {t.level}
        </span>
      </div>

      <div className="p-3">
        {/* Risk bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[9px] font-mono mb-1.5">
            <span className="text-[#2a4050] tracking-[0.1em]">ENVIRONMENTAL RISK</span>
            <span style={{ color: t.color }} className="font-bold">{t.level}</span>
          </div>
          <div className="rounded-sm overflow-hidden" style={{ height: 7, background: "#111111" }}>
            <div
              className="h-full rounded-sm"
              style={{
                width: `${Math.min(100, animRisk)}%`,
                background: `linear-gradient(90deg, ${t.color}50, ${t.color})`,
                boxShadow: `0 0 6px ${t.color}50`,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>

        {/* Warnings */}
        <div className="space-y-1.5 mb-3">
          {t.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-2.5 py-2 rounded border"
              style={{ background: `${warnColor(w.level)}07`, borderColor: `${warnColor(w.level)}20` }}
            >
              <span style={{ color: warnColor(w.level), fontSize: 10, flexShrink: 0, lineHeight: 1.4 }}>
                {w.level === "high" ? "⚠" : w.level === "med" ? "●" : "✓"}
              </span>
              <span className="text-[10px] font-mono leading-snug" style={{ color: warnColor(w.level) + "cc" }}>
                {w.msg}
              </span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-3 gap-2 pt-2.5 border-t"
          style={{ borderTopColor: "#111111" }}
        >
          {[
            { label: "BLOCKED",  value: engine?.tradesBlocked ?? 0, color: "#ff3355" },
            { label: "SYMBOLS",  value: breakdowns.length,           color: "#00aaff" },
            { label: "MTF OK",   value: breakdowns.filter((b: any) => b.mtfConfirmed).length, color: "#00ff8a" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="text-[8px] font-mono text-[#2a4050] tracking-[0.08em] mb-0.5">{label}</div>
              <div className="text-[16px] font-bold font-mono tabular-nums" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
