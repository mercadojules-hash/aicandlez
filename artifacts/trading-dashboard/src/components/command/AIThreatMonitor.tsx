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
    score += 35; warnings.push({ msg: "Low AI conviction across all tracked assets", level: "high" });
  } else if (avgConf < 55) {
    score += 18; warnings.push({ msg: "Below-average AI conviction — signals weakening", level: "med" });
  }
  if (volatile >= 3) {
    score += 25; warnings.push({ msg: `${volatile} assets in high-volatility regime`, level: "high" });
  } else if (volatile >= 1) {
    score += 10; warnings.push({ msg: `${volatile} asset(s) showing elevated volatility`, level: "med" });
  }
  if (volOk < bds.length * 0.4) {
    score += 20; warnings.push({ msg: "Volume confirmation rate below threshold", level: "med" });
  }
  if (Math.abs(buys - sells) <= 1 && bds.length >= 4) {
    score += 12; warnings.push({ msg: "Signal divergence — no clear directional bias", level: "med" });
  }
  if ((engine?.tradesBlocked ?? 0) > 200) {
    score += 15; warnings.push({ msg: "Elevated AI rejection rate — market conditions unfavorable", level: "med" });
  }
  if (mtfConfirmed === 0 && bds.length > 0) {
    score += 10; warnings.push({ msg: "No multi-timeframe confirmed signals active", level: "med" });
  }
  if (warnings.length === 0) {
    warnings.push({ msg: "Market conditions within normal operating parameters", level: "ok" });
  }

  const risk  = Math.min(100, Math.max(4, score));
  const level = risk >= 50 ? "HIGH" : risk >= 22 ? "MODERATE" : "NORMAL";
  const color = level === "HIGH" ? "#ff3355" : level === "MODERATE" ? "#ffaa00" : "#00ff8a";
  return { level, color, risk, warnings: warnings.slice(0, 3) };
}

const warnColor = (l: Warning["level"]) =>
  l === "high" ? "#ff3355" : l === "med" ? "#ffaa00" : "#00ff8a";

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
    <div className="rounded-lg overflow-hidden" style={{ background: "#000000", border: "1px solid #1c1c1c" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderBottomColor: "#141414", background: "#000000" }}>
        <div className="flex-1">
          <div className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
            MARKET STRESS MONITOR
          </div>
          <div className="text-[8px] font-mono tracking-[0.12em] mt-0.5" style={{ color: "#1a2a35" }}>
            REAL-TIME MARKET RISK ENVIRONMENT ASSESSMENT
          </div>
        </div>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded font-mono tracking-[0.12em]"
          style={{ background: `${t.color}0e`, color: t.color, border: `1px solid ${t.color}28` }}
        >
          {t.level}
        </span>
      </div>

      <div className="p-4">
        {/* Stress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[9px] font-mono mb-2">
            <span className="tracking-[0.12em]" style={{ color: "#2a4458" }}>MARKET STRESS SCORE</span>
            <span className="font-bold text-[13px]" style={{ color: t.color }}>{t.level}</span>
          </div>
          <div className="rounded-sm overflow-hidden" style={{ height: 7, background: "#0a0a0a" }}>
            <div
              className="h-full rounded-sm"
              style={{
                width: `${Math.min(100, animRisk)}%`,
                background: `linear-gradient(90deg, ${t.color}40, ${t.color}cc)`,
                boxShadow: `0 0 4px ${t.color}40`,
                transition: "width 0.3s",
              }}
            />
          </div>
          <div className="flex justify-between text-[7.5px] font-mono mt-1" style={{ color: "#2a4050" }}>
            <span>NORMAL</span>
            <span>MODERATE</span>
            <span>HIGH STRESS</span>
          </div>
        </div>

        {/* Warnings */}
        <div className="space-y-2 mb-4">
          {t.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-3 py-2.5 rounded"
              style={{ background: `${warnColor(w.level)}08`, border: `1px solid ${warnColor(w.level)}1a` }}
            >
              <span style={{ color: warnColor(w.level), fontSize: 12, flexShrink: 0, lineHeight: 1.5 }}>
                {w.level === "high" ? "⚠" : w.level === "med" ? "●" : "✓"}
              </span>
              <span
                className="text-[10px] font-mono leading-snug font-bold"
                style={{ color: `${warnColor(w.level)}cc` }}
              >
                {w.msg}
              </span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-3 gap-2 pt-3"
          style={{ borderTop: "1px solid #0a0a0a" }}
        >
          {[
            { label: "FILTERED",   value: engine?.tradesBlocked ?? 0, color: "#ff8844" },
            { label: "SYMBOLS",    value: breakdowns.length,          color: "#00aaff" },
            { label: "MTF OK",     value: breakdowns.filter((b: any) => b.mtfConfirmed).length, color: "#00ff8a" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="text-center rounded p-2"
              style={{ background: "#050505", border: "1px solid #181818" }}
            >
              <div className="text-[7.5px] font-mono tracking-[0.12em] mb-1" style={{ color: "#2a4050" }}>
                {label}
              </div>
              <div className="text-[18px] font-bold font-mono tabular-nums" style={{ color }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
