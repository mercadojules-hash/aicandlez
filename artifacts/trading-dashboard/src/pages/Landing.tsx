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
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#050A07", color: "#EAFFEA" }}>

      {/* Top nav */}
      <header className="h-12 flex items-center justify-between px-6 border-b shrink-0 sticky top-0 z-50"
        style={{ background: "rgba(5,10,7,0.95)", borderColor: "#0F1F18", backdropFilter: "blur(10px)" }}>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4" style={{ color: "#66FF66", filter: "drop-shadow(0 0 4px #66FF66)" }} />
          <span className="font-mono text-[13px] font-bold tracking-[0.22em]">
            <span style={{ color: "#4a8a60" }}>AI</span>
            <span style={{ color: "#66FF66", textShadow: "0 0 6px rgba(102,255,102,0.189)" }}>CANDLEZ</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sign-in"
            className="px-3 py-1.5 text-[11px] font-mono font-medium rounded border transition-colors"
            style={{ borderColor: "#0F1F18", color: "#7ab895" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#66FF6660"; e.currentTarget.style.color = "#66FF66"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#0F1F18"; e.currentTarget.style.color = "#7ab895"; }}>
            Sign In
          </Link>
          <Link href="/sign-up"
            className="px-3 py-1.5 text-[11px] font-mono font-medium rounded transition-colors"
            style={{ background: "rgba(102,255,102,0.10)", color: "#66FF66", border: "1px solid rgba(102,255,102,0.30)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(102,255,102,0.18)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(102,255,102,0.10)"; }}>
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-24 flex-1" style={{ minHeight: "70vh" }}>
        {/* Glow orb */}
        <div className="absolute left-1/2 top-32 -translate-x-1/2 w-[600px] h-[300px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(102,255,102,0.10) 0%, transparent 70%)" }} />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-8 text-[9px] font-mono font-bold tracking-[0.2em] uppercase"
          style={{ borderColor: "rgba(102,255,102,0.30)", color: "#66FF66", background: "rgba(102,255,102,0.06)" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#66FF66" }} />
          Live Trading Platform · v1.0
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-mono font-bold tracking-tight mb-6 max-w-4xl leading-[1.1]">
          <span style={{ color: "#EAFFEA" }}>Institutional-Grade</span>
          <br />
          <span style={{ color: "#66FF66", textShadow: "0 0 14px rgba(102,255,102,0.189)" }}>AI Crypto Trading</span>
        </h1>

        <p className="text-[14px] font-mono max-w-xl mb-10 leading-relaxed" style={{ color: "#7ab895" }}>
          19 integrated modules. Real-time signals. Walk-forward validation. Risk-gated execution.
          Built for serious traders who demand institutional infrastructure.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/sign-up"
            className="flex items-center gap-2 px-6 py-3 rounded font-mono text-[12px] font-bold tracking-wide transition-all"
            style={{ background: "linear-gradient(135deg, #00C853, #66FF66)", color: "#000", boxShadow: "0 0 9px rgba(102,255,102,0.147)" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 40px rgba(102,255,102,0.55)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 24px rgba(102,255,102,0.35)"; }}>
            Start Trading <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link href="/sign-in"
            className="flex items-center gap-2 px-6 py-3 rounded font-mono text-[12px] font-medium border transition-colors"
            style={{ borderColor: "#0F1F18", color: "#7ab895" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#1a3a25"; e.currentTarget.style.color = "#aaccaa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#0F1F18"; e.currentTarget.style.color = "#7ab895"; }}>
            Sign In →
          </Link>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-16 pt-8 border-t w-full max-w-lg"
          style={{ borderColor: "#0F1F18" }}>
          {[
            { label: "Modules", value: "19" },
            { label: "Broker", value: "Alpaca" },
            { label: "Assets", value: "BTC · ETH · SOL" },
            { label: "Mode", value: "SIM + LIVE" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[13px] font-mono font-bold" style={{ color: "#66FF66" }}>{s.value}</div>
              <div className="text-[8px] font-mono tracking-widest uppercase" style={{ color: "#3a6a50" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full">
        <h2 className="text-center text-[11px] font-mono font-bold tracking-[0.3em] uppercase mb-10"
          style={{ color: "#3a6a50" }}>
          Platform Capabilities
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.label} className="p-4 rounded border"
              style={{ background: "#0A1410", borderColor: "#0F1F18" }}>
              <div className="flex items-center gap-2 mb-2">
                <f.icon className="w-3.5 h-3.5 shrink-0" style={{ color: "#66FF66" }} />
                <span className="text-[11px] font-mono font-bold" style={{ color: "#7ab895" }}>{f.label}</span>
              </div>
              <p className="text-[10px] font-mono leading-relaxed" style={{ color: "#4a8a60" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA footer */}
      <section className="text-center py-16 px-6 border-t" style={{ borderColor: "#0F1F18" }}>
        <p className="text-[11px] font-mono mb-4" style={{ color: "#4a8a60" }}>
          Paper trading enabled by default. No real funds at risk until you explicitly enable LIVE mode.
        </p>
        <Link href="/sign-up"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded font-mono text-[11px] font-bold border transition-colors"
          style={{ borderColor: "rgba(102,255,102,0.30)", color: "#66FF66", background: "rgba(102,255,102,0.06)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(102,255,102,0.14)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(102,255,102,0.06)"; }}>
          Create Free Account <ArrowRight className="w-3 h-3" />
        </Link>
      </section>

      <footer className="py-6 px-6 text-center border-t" style={{ borderColor: "#0A1410" }}>
        <span className="text-[9px] font-mono tracking-widest uppercase" style={{ color: "#1a3a25" }}>
          AICANDLEZ · Institutional AI Trading Infrastructure
        </span>
      </footer>
    </div>
  );
}
