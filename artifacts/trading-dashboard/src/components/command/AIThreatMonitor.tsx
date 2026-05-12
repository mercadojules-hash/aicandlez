import { useEffect, useState } from "react";
import type { EngineStatus } from "./types";

interface Props { engine: EngineStatus | undefined; breakdowns?: any[] }

interface ThreatWarning { msg: string; level: "high" | "medium" | "low" }

function assessThreats(engine: EngineStatus | undefined, breakdowns: any[]): {
  level: "HIGH" | "MEDIUM" | "LOW";
  color: string;
  bg: string;
  border: string;
  envRisk: number;
  warnings: ThreatWarning[];
} {
  const warnings: ThreatWarning[] = [];
  let score = 0;

  const avgConf = breakdowns.length
    ? breakdowns.reduce((s: number, b: any) => s + b.avgConfidence, 0) / breakdowns.length
    : 50;

  const volConfirmed = breakdowns.filter((b: any) => b.volumeConfirmed).length;
  const buyCount     = breakdowns.filter((b: any) => b.agreedAction === "BUY").length;
  const sellCount    = breakdowns.filter((b: any) => b.agreedAction === "SELL").length;
  const volatileCount = breakdowns.filter((b: any) => b.marketCondition === "volatile").length;

  if (avgConf < 45) {
    score += 35;
    warnings.push({ msg: "Low conviction market conditions detected", level: "high" });
  }
  if (volConfirmed < breakdowns.length / 2) {
    score += 20;
    warnings.push({ msg: "Volume confirmation below threshold", level: "medium" });
  }
  if (volatileCount >= 2) {
    score += 25;
    warnings.push({ msg: `${volatileCount} assets in volatile regime`, level: "high" });
  }
  if (Math.abs(buyCount - sellCount) <= 1 && breakdowns.length >= 4) {
    score += 15;
    warnings.push({ msg: "Mixed signal divergence across assets", level: "medium" });
  }
  if (engine?.tradesBlocked && engine.tradesBlocked > 100) {
    score += 15;
    warnings.push({ msg: "Elevated trade block rate detected", level: "medium" });
  }
  if (engine?.killSwitch) {
    score = 100;
    warnings.unshift({ msg: "KILL SWITCH ACTIVE — all execution halted", level: "high" });
  }

  if (warnings.length === 0) {
    warnings.push({ msg: "Market environment within normal parameters", level: "low" });
  }

  const clampedScore = Math.min(100, Math.max(5, score));
  const level = score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
  const color  = level === "HIGH" ? "#ff3366" : level === "MEDIUM" ? "#ffb800" : "#00ff88";
  const bg     = level === "HIGH" ? "#ff336608" : level === "MEDIUM" ? "#ffb80008" : "#00ff8808";
  const border = level === "HIGH" ? "#ff336630" : level === "MEDIUM" ? "#ffb80030" : "#00ff8830";

  return { level, color, bg, border, envRisk: clampedScore, warnings: warnings.slice(0, 3) };
}

export function AIThreatMonitor({ engine, breakdowns = [] }: Props) {
  const threat = assessThreats(engine, breakdowns);
  const [animRisk, setAnimRisk] = useState(0);

  useEffect(() => {
    const target = threat.envRisk;
    const id = setInterval(() => {
      setAnimRisk((prev) => {
        const diff = target - prev;
        return Math.abs(diff) < 0.2 ? target : prev + diff * 0.1;
      });
    }, 60);
    return () => clearInterval(id);
  }, [threat.envRisk]);

  const warnColor = (level: ThreatWarning["level"]) =>
    level === "high" ? "#ff3366" : level === "medium" ? "#ffb800" : "#00ff8870";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#030d18", border: "1px solid #0D2235" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderBottomColor: "#0D2235", background: "#020a14" }}
      >
        <span className="text-[8px] font-bold tracking-[0.2em] text-[#00aaff]">
          AI THREAT MONITOR
        </span>
        <span className="text-[7px] font-mono text-[#1a3850] tracking-[0.06em]">
          AUTONOMOUS RISK ENVIRONMENT ANALYSIS
        </span>
        <span
          className="ml-auto text-[7px] font-bold px-1.5 py-0.5 rounded font-mono tracking-[0.08em]"
          style={{
            background: threat.bg,
            color: threat.color,
            border: `1px solid ${threat.border}`,
          }}
        >
          {threat.level}
        </span>
      </div>

      <div className="p-3">
        {/* Environmental risk bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[8px] font-mono mb-1">
            <span className="text-[#1a3850] tracking-[0.1em]">ENVIRONMENTAL RISK</span>
            <span style={{ color: threat.color }}>{threat.level}</span>
          </div>
          <div className="rounded-sm overflow-hidden" style={{ height: 6, background: "#0a1820" }}>
            <div
              className="h-full rounded-sm transition-all duration-300"
              style={{
                width: `${Math.min(100, animRisk)}%`,
                background: `linear-gradient(90deg, ${threat.color}60, ${threat.color})`,
                boxShadow: `0 0 8px ${threat.color}60`,
              }}
            />
          </div>
        </div>

        {/* Warning items */}
        <div className="space-y-1.5">
          {threat.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-2 py-1.5 rounded border"
              style={{
                background: `${warnColor(w.level)}08`,
                borderColor: `${warnColor(w.level)}25`,
              }}
            >
              <span className="text-[8px] shrink-0" style={{ color: warnColor(w.level) }}>
                {w.level === "high" ? "⚠" : w.level === "medium" ? "●" : "✓"}
              </span>
              <span className="text-[8px] font-mono" style={{ color: warnColor(w.level) + "cc" }}>
                {w.msg}
              </span>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t" style={{ borderTopColor: "#0a1820" }}>
          {[
            { label: "BLOCKED", value: engine?.tradesBlocked ?? 0, color: "#ff3366" },
            { label: "SYMBOLS", value: breakdowns.length, color: "#00aaff" },
            { label: "MTF OK",  value: breakdowns.filter((b: any) => b.mtfConfirmed).length, color: "#00ff88" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="text-[7px] font-mono text-[#1a3850] tracking-[0.08em] mb-0.5">{label}</div>
              <div className="text-[11px] font-bold font-mono" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
