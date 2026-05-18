/**
 * SignalsRow — Top 20 Crypto Signals (left) + Top 20 Equity Signals (right).
 *
 * Centerpiece data row of the institutional dashboard. Long + short capable.
 */

import { useMemo, useState } from "react";
import { Bitcoin, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import type { EngineStatus } from "../types";
import type { TickerSpec } from "./tickers";
import { CRYPTO_20, EQUITIES_20 } from "./tickers";
import { SignalRow, resolveDirection } from "./SignalRow";
import { N } from "./theme";

type Filter = "ALL" | "LONG" | "SHORT";

interface PanelProps {
  label:    string;
  sub:      string;
  icon:     React.ReactNode;
  brand:    string;
  tickers:  TickerSpec[];
  engine?:  EngineStatus;
}

function SignalsPanel({ label, sub, icon, brand, tickers, engine }: PanelProps) {
  const [filter, setFilter] = useState<Filter>("ALL");

  // We can use engine breakdowns to bias real-LONG vs real-SHORT routing
  const breakdowns = engine?.symbolBreakdowns ?? {};

  const filteredCount = useMemo(() => {
    let l = 0, s = 0;
    for (const t of tickers) {
      if (resolveDirection(t.symbol, breakdowns[t.symbol]) === "LONG") l++;
      else                                                              s++;
    }
    return { l, s };
  }, [tickers, breakdowns]);

  return (
    <div
      style={{
        background:   N.SURFACE_1,
        border:       `1px solid ${N.BORDER}`,
        borderRadius: 6,
        overflow:     "hidden",
        fontFamily:   N.FONT_MONO,
      }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-3 py-2"
        style={{
          background:   `linear-gradient(180deg, ${brand}08 0%, ${N.BG} 100%)`,
          borderBottom: `1px solid ${N.BORDER}`,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: brand, display: "inline-flex", filter: `drop-shadow(0 0 4px ${brand}60)` }}>
            {icon}
          </span>
          <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: N.TEXT_0 }}>
            {label}
          </span>
          <span className="text-[8.5px] font-semibold tracking-[0.14em]" style={{ color: N.TEXT_3 }}>
            · {sub}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-[8.5px] font-bold tracking-[0.14em] mr-2">
            <span style={{ color: N.LONG }}>L {filteredCount.l}</span>
            <span style={{ color: N.SHORT }}>S {filteredCount.s}</span>
          </div>
          <FilterTab label="ALL"   active={filter === "ALL"}   color={N.BRAND} onClick={() => setFilter("ALL")} />
          <FilterTab label="LONG"  active={filter === "LONG"}  color={N.LONG}  onClick={() => setFilter("LONG")} />
          <FilterTab label="SHORT" active={filter === "SHORT"} color={N.SHORT} onClick={() => setFilter("SHORT")} />
        </div>
      </header>

      {/* Column headers */}
      <div
        className="grid items-center px-3 py-1.5 text-[8.5px] font-bold tracking-[0.14em]"
        style={{
          gridTemplateColumns: "78px 110px 64px 1fr 1fr 1fr 1fr 60px 132px",
          gap: 6,
          color: N.TEXT_3,
          borderBottom: `1px solid ${N.BORDER}`,
          background: N.SURFACE_1,
        }}
      >
        <div>TICKER</div>
        <div>15M TREND</div>
        <div>SIGNAL</div>
        <div className="text-right">ENTRY</div>
        <div className="text-right">STOP</div>
        <div className="text-right">TARGET</div>
        <div className="text-right">LIVE</div>
        <div className="text-right">CONF</div>
        <div className="text-right pr-1">ACTION</div>
      </div>

      {/* Rows */}
      <div className="blotter-scroll" style={{ maxHeight: 660 }}>
        {tickers.map(spec => (
          <FilteredSignalRow key={spec.symbol} spec={spec} breakdown={breakdowns[spec.symbol]} filter={filter} />
        ))}
      </div>
    </div>
  );
}

/* Wrap SignalRow so the LONG/SHORT filter uses the same shared
   resolveDirection() that the row itself uses — guarantees the filter
   and the displayed side never disagree. */
function FilteredSignalRow({
  spec, breakdown, filter,
}: {
  spec: TickerSpec;
  breakdown: import("../types").SymBreakdown | undefined;
  filter: Filter;
}) {
  if (filter !== "ALL" && resolveDirection(spec.symbol, breakdown) !== filter) {
    return null;
  }
  return <SignalRow spec={spec} breakdown={breakdown} />;
}

function FilterTab({
  label, active, color, onClick,
}: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[8.5px] font-bold tracking-[0.18em] px-2 py-1 rounded transition-all"
      style={{
        color:      active ? color : N.TEXT_2,
        background: active ? `${color}1a` : "transparent",
        border:     `1px solid ${active ? color + "55" : "transparent"}`,
        boxShadow:  active ? `0 0 8px ${color}35` : "none",
        fontFamily: N.FONT_MONO,
      }}
    >
      {label}
    </button>
  );
}

/* ── EXPORT ─────────────────────────────────────────────────────────────── */

export function SignalsRow({ engine }: { engine?: EngineStatus }) {
  return (
    <section className="grid gap-2 px-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <SignalsPanel
        label="TOP 20 CRYPTO SIGNALS"
        sub="LONG · SHORT · AI EXECUTION"
        icon={<Bitcoin className="w-3.5 h-3.5" />}
        brand={N.BRAND}
        tickers={CRYPTO_20}
        engine={engine}
      />
      <SignalsPanel
        label="TOP 20 EQUITY SIGNALS"
        sub="LONG · SHORT · AI EXECUTION"
        icon={<BarChart3 className="w-3.5 h-3.5" />}
        brand={N.BRAND_BRT}
        tickers={EQUITIES_20}
        engine={engine}
      />
    </section>
  );
}

/* Silence unused imports if tree-shaken differently */
void TrendingUp; void TrendingDown;
