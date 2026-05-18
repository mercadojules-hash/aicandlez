/**
 * Signal panels — Top 20 Crypto (left) + Top 20 Equity (right).
 *
 * Exposes:
 *   • CryptoSignalsPanel  — single panel, used when bar+panel are stacked
 *   • EquitySignalsPanel  — single panel
 *   • SignalsRow          — convenience wrapper rendering both side-by-side
 *
 * Centerpiece data row. With filter=ALL, rows are grouped LONG-then-SHORT with
 * a divider for strong visual separation.
 */

import { useMemo, useState } from "react";
import { Bitcoin, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import type { EngineStatus, SymBreakdown } from "../types";
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

  const breakdowns = engine?.symbolBreakdowns ?? {};

  const classified = useMemo(() => {
    const longs:  Array<{ spec: TickerSpec; breakdown?: SymBreakdown }> = [];
    const shorts: Array<{ spec: TickerSpec; breakdown?: SymBreakdown }> = [];
    for (const t of tickers) {
      const b = breakdowns[t.symbol];
      if (resolveDirection(t.symbol, b) === "LONG") longs.push({ spec: t, breakdown: b });
      else                                          shorts.push({ spec: t, breakdown: b });
    }
    return { longs, shorts };
  }, [tickers, breakdowns]);

  const counts = { l: classified.longs.length, s: classified.shorts.length };

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
            <span style={{ color: N.LONG }}>L {counts.l}</span>
            <span style={{ color: N.SHORT }}>S {counts.s}</span>
          </div>
          <FilterTab label="ALL"   active={filter === "ALL"}   color={N.BRAND} onClick={() => setFilter("ALL")} />
          <FilterTab label="LONG"  active={filter === "LONG"}  color={N.LONG}  onClick={() => setFilter("LONG")} />
          <FilterTab label="SHORT" active={filter === "SHORT"} color={N.SHORT} onClick={() => setFilter("SHORT")} />
        </div>
      </header>

      {/* Rows — grouped LONG → SHORT for ALL view */}
      <div className="blotter-scroll" style={{ maxHeight: 940 }}>
        {(filter === "ALL" || filter === "LONG") && classified.longs.length > 0 && (
          <>
            <GroupDivider label="LONG SETUPS"  count={classified.longs.length}  color={N.LONG}  icon={<TrendingUp   className="w-3 h-3" />} />
            {classified.longs.map(({ spec, breakdown }) => (
              <SignalRow key={spec.symbol} spec={spec} breakdown={breakdown} />
            ))}
          </>
        )}
        {(filter === "ALL" || filter === "SHORT") && classified.shorts.length > 0 && (
          <>
            <GroupDivider label="SHORT SETUPS" count={classified.shorts.length} color={N.SHORT} icon={<TrendingDown className="w-3 h-3" />} />
            {classified.shorts.map(({ spec, breakdown }) => (
              <SignalRow key={spec.symbol} spec={spec} breakdown={breakdown} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function GroupDivider({
  label, count, color, icon,
}: { label: string; count: number; color: string; icon: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{
        background: `linear-gradient(90deg, ${color}18 0%, #000 60%)`,
        borderTop:    `1px solid ${color}30`,
        borderBottom: `1px solid ${color}30`,
        fontFamily: N.FONT_MONO,
      }}
    >
      <span style={{ color, filter: `drop-shadow(0 0 4px ${color}80)`, display: "inline-flex" }}>{icon}</span>
      <span className="text-[9px] font-extrabold tracking-[0.28em]"
        style={{ color, textShadow: `0 0 6px ${color}60` }}>{label}</span>
      <span className="text-[8.5px] font-bold tracking-[0.18em]" style={{ color: N.TEXT_3 }}>· {count}</span>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}40, transparent)` }} />
    </div>
  );
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

/* ── PUBLIC EXPORTS ─────────────────────────────────────────────────────── */

export function CryptoSignalsPanel({ engine }: { engine?: EngineStatus }) {
  return (
    <SignalsPanel
      label="TOP 20 CRYPTO SIGNALS"
      sub="LONG · SHORT · UNLIMITED AI EXECUTION"
      icon={<Bitcoin className="w-3.5 h-3.5" />}
      brand={N.BRAND}
      tickers={CRYPTO_20}
      engine={engine}
    />
  );
}

export function EquitySignalsPanel({ engine }: { engine?: EngineStatus }) {
  return (
    <SignalsPanel
      label="TOP 20 EQUITY SIGNALS"
      sub="LONG · SHORT · UNLIMITED AI EXECUTION"
      icon={<BarChart3 className="w-3.5 h-3.5" />}
      brand={N.BRAND_BRT}
      tickers={EQUITIES_20}
      engine={engine}
    />
  );
}

export function SignalsRow({ engine }: { engine?: EngineStatus }) {
  return (
    <section className="grid gap-2 px-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <CryptoSignalsPanel engine={engine} />
      <EquitySignalsPanel engine={engine} />
    </section>
  );
}
