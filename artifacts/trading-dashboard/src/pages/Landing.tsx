import { Link } from "wouter";
import { Cpu, TrendingUp, Shield, Zap, BarChart2, Brain, ArrowRight, Activity } from "lucide-react";

const FEATURES = [
  { icon: Brain,     label: "AI Signal Engine",     desc: "EMA + RSI fusion with multi-timeframe confirmation and dynamic confidence scoring." },
  { icon: Shield,    label: "Risk Management",       desc: "Position sizing, kill switch, daily loss limits, and walk-forward overfitting detection." },
  { icon: TrendingUp,label: "Multi-Asset Trading",  desc: "BTC, ETH, SOL on Kraken — paper simulation or live execution with full audit trail." },
  { icon: BarChart2, label: "Strategy Optimizer",   desc: "Grid search over EMA/RSI parameters with out-of-sample validation grading A–F." },
  { icon: Zap,       label: "Sentiment AI",         desc: "News scoring –100 to +100, Fear & Greed index, and AI confidence adjustment ±5–20%." },
  { icon: Activity,  label: "System Verification",  desc: "10-subsystem health check, live signal funnel, and multi-asset correlation matrix." },
];

export default function Landing() {
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#060810", color: "#EAF2FF" }}>

      {/* Top nav */}
      <header className="h-12 flex items-center justify-between px-6 border-b shrink-0 sticky top-0 z-50"
        style={{ background: "rgba(6,8,16,0.95)", borderColor: "#0D2035", backdropFilter: "blur(10px)" }}>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4" style={{ color: "#00eeff", filter: "drop-shadow(0 0 6px #00eeff)" }} />
          <span className="font-mono text-[13px] font-bold tracking-[0.22em]">
            <span style={{ color: "#4a7a90" }}>AI</span>
            <span style={{ color: "#00eeff", textShadow: "0 0 16px #00eeff70" }}>CANDLEZ</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sign-in"
            className="px-3 py-1.5 text-[11px] font-mono font-medium rounded border transition-colors"
            style={{ borderColor: "#0E2235", color: "#7a9eb8" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#00aaff60"; e.currentTarget.style.color = "#00aaff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#0E2235"; e.currentTarget.style.color = "#7a9eb8"; }}>
            Sign In
          </Link>
          <Link href="/sign-up"
            className="px-3 py-1.5 text-[11px] font-mono font-medium rounded transition-colors"
            style={{ background: "#00aaff18", color: "#00aaff", border: "1px solid #00aaff40" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#00aaff28"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#00aaff18"; }}>
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-24 flex-1" style={{ minHeight: "70vh" }}>
        {/* Glow orb */}
        <div className="absolute left-1/2 top-32 -translate-x-1/2 w-[600px] h-[300px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, #00aaff08 0%, transparent 70%)" }} />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-8 text-[9px] font-mono font-bold tracking-[0.2em] uppercase"
          style={{ borderColor: "#00ff8a30", color: "#00ff8a", background: "#00ff8a08" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#00ff8a" }} />
          Live Trading Platform · v1.0
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-mono font-bold tracking-tight mb-6 max-w-4xl leading-[1.1]">
          <span style={{ color: "#EAF2FF" }}>Institutional-Grade</span>
          <br />
          <span style={{ color: "#00aaff", textShadow: "0 0 40px #00aaff40" }}>AI Crypto Trading</span>
        </h1>

        <p className="text-[14px] font-mono max-w-xl mb-10 leading-relaxed" style={{ color: "#6a8ea8" }}>
          19 integrated modules. Real-time signals. Walk-forward validation. Risk-gated execution.
          Built for serious traders who demand institutional infrastructure.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/sign-up"
            className="flex items-center gap-2 px-6 py-3 rounded font-mono text-[12px] font-bold tracking-wide transition-all"
            style={{ background: "linear-gradient(135deg, #0077cc, #00aaff)", color: "#fff", boxShadow: "0 0 24px #00aaff30" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 40px #00aaff50"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 24px #00aaff30"; }}>
            Start Trading <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link href="/sign-in"
            className="flex items-center gap-2 px-6 py-3 rounded font-mono text-[12px] font-medium border transition-colors"
            style={{ borderColor: "#0E2235", color: "#7a9eb8" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#1a3a55"; e.currentTarget.style.color = "#aac8e0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#0E2235"; e.currentTarget.style.color = "#7a9eb8"; }}>
            Sign In →
          </Link>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-16 pt-8 border-t w-full max-w-lg"
          style={{ borderColor: "#0D2035" }}>
          {[
            { label: "Modules", value: "19" },
            { label: "Exchanges", value: "Kraken" },
            { label: "Assets", value: "BTC · ETH · SOL" },
            { label: "Mode", value: "SIM + LIVE" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[13px] font-mono font-bold" style={{ color: "#00aaff" }}>{s.value}</div>
              <div className="text-[8px] font-mono tracking-widest uppercase" style={{ color: "#3a5a70" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full">
        <h2 className="text-center text-[11px] font-mono font-bold tracking-[0.3em] uppercase mb-10"
          style={{ color: "#3a5a70" }}>
          Platform Capabilities
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.label} className="p-4 rounded border"
              style={{ background: "#040A14", borderColor: "#0D2035" }}>
              <div className="flex items-center gap-2 mb-2">
                <f.icon className="w-3.5 h-3.5 shrink-0" style={{ color: "#00aaff" }} />
                <span className="text-[11px] font-mono font-bold" style={{ color: "#7ab8cc" }}>{f.label}</span>
              </div>
              <p className="text-[10px] font-mono leading-relaxed" style={{ color: "#3a5a70" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA footer */}
      <section className="text-center py-16 px-6 border-t" style={{ borderColor: "#0D2035" }}>
        <p className="text-[11px] font-mono mb-4" style={{ color: "#3a5a70" }}>
          Paper trading enabled by default. No real funds at risk until you explicitly enable LIVE mode.
        </p>
        <Link href="/sign-up"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded font-mono text-[11px] font-bold border transition-colors"
          style={{ borderColor: "#00aaff30", color: "#00aaff", background: "#00aaff0c" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#00aaff18"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#00aaff0c"; }}>
          Create Free Account <ArrowRight className="w-3 h-3" />
        </Link>
      </section>

      <footer className="py-6 px-6 text-center border-t" style={{ borderColor: "#0A1820" }}>
        <span className="text-[9px] font-mono tracking-widest uppercase" style={{ color: "#1e3a50" }}>
          AICANDLEZ · Institutional AI Trading Infrastructure
        </span>
      </footer>
    </div>
  );
}
