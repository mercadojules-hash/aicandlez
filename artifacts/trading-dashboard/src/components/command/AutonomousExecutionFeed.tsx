import { useEffect, useState } from "react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR, ASSETS } from "./types";

interface Props { engine: EngineStatus | undefined }

interface Step {
  id:    string;
  label: string;
  color: string;
  desc:  string;
}

function buildSteps(engine: EngineStatus | undefined): Step[] {
  const bd = engine?.symbolBreakdowns ?? {};
  const syms = Object.keys(bd);
  const allBds = Object.values(bd);

  const topSym = syms.length
    ? syms.reduce((a, b) =>
        (bd[a]?.avgConfidence ?? 0) >= (bd[b]?.avgConfidence ?? 0) ? a : b
      )
    : "BTCUSD";
  const topBd  = bd[topSym];
  const topLbl = topSym.replace("USD", "");
  const topConf = topBd?.avgConfidence?.toFixed(0) ?? "—";
  const topColor = SYMBOL_COLOR[topSym] ?? "#4a8fa8";

  const volCount    = allBds.filter((b) => b.volumeConfirmed).length;
  const trendCount  = allBds.filter((b) => b.marketCondition === "trending").length;
  const buyCount    = allBds.filter((b) => b.agreedAction === "BUY").length;
  const secondSym   = syms.find((s) => s !== topSym && bd[s]?.agreedAction === "BUY") ?? syms[1] ?? "ETHUSD";
  const secondConf  = bd[secondSym]?.avgConfidence?.toFixed(0) ?? "—";
  const secondLbl   = secondSym.replace("USD", "");

  const mtfConfirmed = allBds.filter((b) => b.mtfConfirmed).length;

  return [
    {
      id:    "scanning",
      label: "SCANNING",
      color: "#00aaff",
      desc:  `${topLbl}USD • analyzing momentum clusters`,
    },
    {
      id:    "validating",
      label: "VALIDATING",
      color: "#ffb800",
      desc:  `${secondLbl}USD • MTF alignment ${mtfConfirmed > 0 ? "confirmed" : "pending"} • ${secondConf}%`,
    },
    {
      id:    "routing",
      label: "ROUTING",
      color: "#00aaff",
      desc:  `Selecting optimal simulation execution path`,
    },
    {
      id:    "monitoring",
      label: "MONITORING",
      color: "#00aaff",
      desc:  `${syms[2]?.replace("USD","") ?? "SOL"}USD • volatility ${trendCount > 2 ? "elevated" : "stable"} • risk ${engine?.tradesBlocked && engine.tradesBlocked > 50 ? "elevated" : "normal"}`,
    },
    {
      id:    "filtering",
      label: "FILTERING",
      color: "#00aaff",
      desc:  `Correlation engine ${volCount < 3 ? "rejecting weak setups" : "accepting " + buyCount + " high-conf signals"}`,
    },
    {
      id:    "syncing",
      label: "SYNCHRONIZING",
      color: "#00aaff",
      desc:  `Global AI telemetry synchronized`,
    },
  ];
}

export function AutonomousExecutionFeed({ engine }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [steps, setSteps]         = useState<Step[]>([]);

  useEffect(() => {
    setSteps(buildSteps(engine));
  }, [engine]);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIdx((i) => (i + 1) % 6);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  if (steps.length === 0) return null;

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
          AUTONOMOUS EXECUTION FEED
        </span>
        <span className="text-[7px] font-mono text-[#1a3850] tracking-[0.08em]">
          REAL-TIME AUTONOMOUS EXECUTION TELEMETRY
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="live-dot" style={{ width: 4, height: 4 }} />
          <span className="text-[8px] font-mono" style={{ color: "#00ff8a70" }}>LIVE</span>
        </span>
      </div>

      {/* Steps */}
      <div className="p-3 space-y-0">
        {steps.map((step, i) => {
          const isActive = i === activeIdx;
          return (
            <div
              key={step.id}
              className="flex items-start gap-3 py-2 border-b transition-all duration-500"
              style={{
                borderBottomColor: "#0a1820",
                background: isActive ? `${step.color}06` : "transparent",
              }}
            >
              {/* Bullet */}
              <div className="pt-0.5 shrink-0">
                <div
                  className="rounded-full transition-all duration-500"
                  style={{
                    width: 7,
                    height: 7,
                    background: step.color,
                    boxShadow: isActive ? `0 0 5px ${step.color}, 0 0 16px ${step.color}60` : "none",
                    opacity: isActive ? 1 : 0.35,
                  }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] font-bold font-mono tracking-[0.1em] transition-all duration-500"
                    style={{ color: isActive ? step.color : step.color + "60" }}
                  >
                    {step.label}
                  </span>
                </div>
                <div
                  className="text-[8px] font-mono mt-0.5 transition-all duration-500"
                  style={{ color: isActive ? "#4a7a90" : "#1e3a50" }}
                >
                  {step.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
