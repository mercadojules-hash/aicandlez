import React, { useState, useEffect } from 'react';
import './_group.css';
import { Shield, Activity, Clock, Zap, Target, Lock, Server, Cpu } from 'lucide-react';

const ASSETS = [
  { symbol: 'BTC/USD', name: 'Bitcoin', direction: 'LONG', conf: 88, score: 92, mtf: ['green', 'green', 'green'], state: 'READY', reason: 'Execution clear', risk: 'High', signal: 'MTF aligned', pnl: '+412.18' },
  { symbol: 'ETH/USD', name: 'Ethereum', direction: 'LONG', conf: 82, score: 85, mtf: ['green', 'amber', 'green'], state: 'WAITING', reason: 'Awaiting 15m close', risk: 'Med', signal: 'Volume breakout', pnl: '+184.50' },
  { symbol: 'SOL/USD', name: 'Solana', direction: 'SHORT', conf: 78, score: 79, mtf: ['red', 'red', 'amber'], state: 'READY', reason: 'Execution clear', risk: 'High', signal: 'EMA+RSI confirmed', pnl: '-42.10' },
  { symbol: 'AVAX/USD', name: 'Avalanche', direction: 'LONG', conf: 74, score: 75, mtf: ['green', 'green', 'amber'], state: 'GATED', reason: 'Risk limit active', risk: 'Med', signal: 'Support bounce', pnl: '0.00' },
  { symbol: 'NVDA', name: 'Nvidia Corp', direction: 'LONG', conf: 85, score: 88, mtf: ['green', 'green', 'green'], state: 'READY', reason: 'Execution clear', risk: 'Low', signal: 'Trend continuation', pnl: '+890.20' },
  { symbol: 'LINK/USD', name: 'Chainlink', direction: 'SHORT', conf: 68, score: 65, mtf: ['red', 'amber', 'red'], state: 'WAITING', reason: 'Volume unconfirmed', risk: 'Med', signal: 'Resistance rejection', pnl: '0.00' },
];

const REASONING = [
  { time: '14:22:10', asset: 'BTC/USD', action: 'Confirmed LONG setup — all timeframes aligned. Queueing paper execution.', delta: '+4%' },
  { time: '14:21:45', asset: 'SOL/USD', action: 'Held off LONG SOL — 15m trend not yet confirmed. Awaiting next candle.', delta: '-2%' },
  { time: '14:20:12', asset: 'ETH/USD', action: 'Volume profile shifting bullish. Upgrading confidence score.', delta: '+5%' },
  { time: '14:18:30', asset: 'AVAX/USD', action: 'Risk limits reached for high-beta exposure. Gating execution.', delta: '0%' },
  { time: '14:15:00', asset: 'NVDA', action: 'Equity market open confirmed strong bid. Maintaining LONG.', delta: '+1%' }
];

const EXCHANGES = [
  { name: 'Kraken', status: 'CONNECTED', ro: true },
  { name: 'Binance', status: 'NOT CONNECTED', ro: false },
  { name: 'Coinbase', status: 'CONNECTED', ro: true },
  { name: 'Bybit', status: 'NOT CONNECTED', ro: false },
  { name: 'OKX', status: 'NOT CONNECTED', ro: false },
  { name: 'KuCoin', status: 'NOT CONNECTED', ro: false },
];

function MicroSparkline({ color }: { color: string }) {
  return (
    <svg width="100%" height="40" viewBox="0 0 120 40" preserveAspectRatio="none" className="opacity-80">
      <path
        d="M0 30 Q 10 25, 20 28 T 40 20 T 60 25 T 80 15 T 100 18 T 120 5"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PulseGrid() {
  const [time, setTime] = useState('14:23:45 UTC');

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setTime(`${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}:${d.getUTCSeconds().toString().padStart(2,'0')} UTC`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(var(--bg-pure))] text-[hsl(var(--text-primary))] font-sans overflow-x-hidden selection:bg-[hsl(var(--neon-brand)_/_0.3)]">
      
      {/* 1. Operator Pulse */}
      <header className="w-full border-b border-subtle bg-[hsl(var(--bg-pure))] scan-line-container">
        <div className="max-w-[1600px] mx-auto px-4 h-12 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-6">
            <span className="font-bold tracking-widest text-white flex items-center gap-2">
              <Zap className="w-3 h-3 text-[hsl(var(--neon-brand))]" />
              AICANDLEZ
            </span>
            <span className="text-[hsl(var(--neon-brand))]">{time}</span>
            <div className="flex items-center gap-2 text-[hsl(var(--text-muted))]">
              <span>NYC·US</span>
              <span>•</span>
              <span>SESSION: 04:12:00</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[hsl(var(--neon-brand))] animate-pulse-dot" />
              <span className="text-[hsl(var(--neon-brand))]">ENGINE ONLINE</span>
            </div>
            <span className="text-[hsl(var(--text-muted))]">1/3 SLOTS USED</span>
            <span className="bg-[hsl(var(--neon-brand)_/_0.1)] text-[hsl(var(--neon-brand))] px-2 py-0.5 rounded uppercase tracking-wider">
              AI TRADING PRO · 12 SLOTS
            </span>
            <div className="flex gap-4">
              <span>PAPER BAL: $124,500.00</span>
              <span className="text-[hsl(var(--neon-brand))]">P&L: +$1,444.88</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-8 flex flex-col gap-12">
        
        {/* 2. AI Intelligence Overview */}
        <section className="flex flex-col items-center justify-center py-8 text-center border-b border-subtle border-opacity-50">
          <div className="inline-flex items-center justify-center gap-3 px-4 py-1.5 rounded-full border border-[hsl(var(--neon-brand)_/_0.3)] bg-[hsl(var(--neon-brand)_/_0.05)] text-[hsl(var(--neon-brand))] text-sm font-mono mb-6 uppercase tracking-widest">
            <Shield className="w-4 h-4" /> Paper Mode Active
          </div>
          <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-4 leading-tight">
            AI confidence <span className="text-[hsl(var(--neon-brand))] font-mono font-medium">78%</span> · 4 high-conviction opportunities.
          </h1>
          <p className="text-[hsl(var(--text-muted))] font-mono text-sm max-w-3xl leading-relaxed">
            2 MARKETS IN LOW-VOL REGIME · MTF AGREEMENT: STRONG ON 5m/15m/1H · WAITING FOR VOLUME CONFIRMATION ON ALTS.
          </p>
        </section>

        {/* 3. TOP 6 AI OPPORTUNITY CARDS */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ASSETS.map((asset, i) => (
              <div key={i} className="bg-[hsl(var(--bg-panel))] border border-subtle p-6 rounded-lg relative overflow-hidden flex flex-col group hover:border-[hsl(var(--neon-brand)_/_0.3)] transition-colors duration-500">
                {/* Header */}
                <div className="flex justify-between items-start mb-8 relative z-10">
                  <div>
                    <h3 className="text-xl font-bold font-mono tracking-tight">{asset.symbol}</h3>
                    <p className="text-[hsl(var(--text-muted))] text-sm">{asset.name}</p>
                  </div>
                  <div className={`px-3 py-1 text-xs font-bold font-mono rounded ${asset.direction === 'LONG' ? 'bg-[hsl(var(--neon-brand)_/_0.1)] text-[hsl(var(--neon-brand))]' : 'bg-[hsl(var(--status-red)_/_0.1)] text-[hsl(var(--status-red))]'}`}>
                    {asset.direction}
                  </div>
                </div>

                {/* Centerpiece: Confidence */}
                <div className="flex-1 flex flex-col items-center justify-center py-6 relative z-10">
                  <div className="relative w-48 h-48 flex items-center justify-center">
                    <div className="absolute inset-0 glow-ring opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
                    <div className="absolute inset-1 inner-circle flex flex-col items-center justify-center">
                      <span className="text-7xl font-light font-mono tracking-tighter text-white">{asset.conf}</span>
                      <span className="text-xs font-mono text-[hsl(var(--neon-brand))] uppercase tracking-widest mt-1">Confidence</span>
                    </div>
                  </div>
                </div>

                {/* Micro chart */}
                <div className="h-10 w-full mb-6 mt-4">
                   <MicroSparkline color={asset.direction === 'LONG' ? 'hsl(var(--neon-brand))' : 'hsl(var(--status-red))'} />
                </div>

                {/* Footer Data */}
                <div className="space-y-4 font-mono text-xs relative z-10">
                  <div className="flex justify-between items-center pb-3 border-b border-subtle">
                    <span className="text-[hsl(var(--text-muted))]">OPP SCORE</span>
                    <span className="text-white">{asset.score}/100</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-subtle">
                    <span className="text-[hsl(var(--text-muted))]">MTF ALIGN</span>
                    <div className="flex gap-1">
                      {asset.mtf.map((c, j) => (
                        <div key={j} className={`w-6 h-1.5 rounded-sm ${c === 'green' ? 'bg-[hsl(var(--neon-brand))]' : c === 'amber' ? 'bg-[hsl(var(--status-amber))]' : 'bg-[hsl(var(--status-red))]'}`} />
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-subtle">
                    <span className="text-[hsl(var(--text-muted))]">SIGNAL</span>
                    <span className="text-white">{asset.signal}</span>
                  </div>
                  
                  <div className="pt-2">
                    <button className="w-full py-3 bg-[hsl(var(--bg-pure))] border border-subtle text-[hsl(var(--text-muted))] hover:text-white hover:border-white transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                      <Target className="w-4 h-4" /> Queue Paper Trade
                    </button>
                    <div className="text-center mt-3 text-[10px] text-[hsl(var(--text-muted))]">
                      STATE: <span className={asset.state === 'READY' ? 'text-[hsl(var(--neon-brand))]' : 'text-[hsl(var(--status-amber))]'}>{asset.state}</span> ({asset.reason})
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. AI Reasoning Console */}
        <section className="bg-[hsl(var(--bg-panel))] border border-subtle p-8 rounded-lg">
          <div className="flex items-center gap-3 mb-8">
            <Cpu className="w-5 h-5 text-[hsl(var(--neon-brand))]" />
            <h2 className="text-lg font-mono tracking-widest uppercase">AI Reasoning Feed</h2>
          </div>
          <div className="space-y-4 font-mono text-sm">
            {REASONING.map((r, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 border-l-2 border-[hsl(var(--border-subtle))] hover:border-[hsl(var(--neon-brand)_/_0.5)] bg-[hsl(var(--bg-pure)_/_0.5)] transition-colors">
                <div className="w-32 shrink-0 text-[hsl(var(--text-muted))]">{r.time}</div>
                <div className="w-24 shrink-0 font-bold">{r.asset}</div>
                <div className="flex-1 text-[hsl(var(--text-primary))] leading-relaxed">{r.action}</div>
                <div className={`w-16 text-right font-bold ${r.delta.startsWith('+') ? 'text-[hsl(var(--neon-brand))]' : r.delta === '0%' ? 'text-[hsl(var(--text-muted))]' : 'text-[hsl(var(--status-red))]'}`}>
                  {r.delta}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Portfolio Intelligence */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[hsl(var(--bg-panel))] border border-subtle p-8 rounded-lg flex flex-col">
             <div className="flex items-center justify-between mb-8">
               <h2 className="text-lg font-mono tracking-widest uppercase flex items-center gap-3">
                 <Activity className="w-5 h-5 text-[hsl(var(--neon-brand))]" />
                 Paper Portfolio
               </h2>
               <span className="font-mono text-2xl">$124,500.00</span>
             </div>
             
             <div className="flex-1 border border-subtle bg-[hsl(var(--bg-pure)_/_0.5)] relative flex items-center justify-center p-4">
               {/* Abstract chart placeholder */}
               <svg width="100%" height="160" viewBox="0 0 400 160" preserveAspectRatio="none">
                 <path d="M0 140 Q 50 120, 100 130 T 200 80 T 300 90 T 400 20" fill="none" stroke="hsl(var(--neon-brand))" strokeWidth="2" />
                 <path d="M0 140 Q 50 120, 100 130 T 200 80 T 300 90 T 400 20 L 400 160 L 0 160 Z" fill="url(#grad)" opacity="0.1" />
                 <defs>
                   <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="0%" stopColor="hsl(var(--neon-brand))" />
                     <stop offset="100%" stopColor="transparent" />
                   </linearGradient>
                 </defs>
               </svg>
             </div>
          </div>
          
          <div className="bg-[hsl(var(--bg-panel))] border border-subtle p-8 rounded-lg">
            <h2 className="text-sm font-mono tracking-widest uppercase text-[hsl(var(--text-muted))] mb-6">Open Paper Positions</h2>
            <div className="space-y-4">
              {ASSETS.slice(0,3).map((a,i) => (
                <div key={i} className="flex justify-between items-center font-mono text-sm pb-4 border-b border-subtle last:border-0 last:pb-0">
                  <div>
                    <div className="font-bold">{a.symbol}</div>
                    <div className="text-[10px] text-[hsl(var(--text-muted))] mt-1">{a.direction} · ENTRY CONF: {a.conf - 4}%</div>
                  </div>
                  <div className={`text-right ${a.pnl.startsWith('+') ? 'text-[hsl(var(--neon-brand))]' : 'text-[hsl(var(--status-red))]'}`}>
                    {a.pnl}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Exchange Awareness */}
        <section className="bg-[hsl(var(--bg-panel))] border border-subtle p-8 rounded-lg">
          <div className="flex items-center gap-3 mb-8">
            <Server className="w-5 h-5 text-[hsl(var(--neon-brand))]" />
            <h2 className="text-lg font-mono tracking-widest uppercase">Exchange Connections</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {EXCHANGES.map((ex, i) => (
              <div key={i} className="p-4 border border-subtle bg-[hsl(var(--bg-pure)_/_0.5)] flex items-center justify-between">
                <span className="font-mono text-sm">{ex.name}</span>
                {ex.status === 'CONNECTED' ? (
                  <span className="text-[10px] font-mono text-[hsl(var(--neon-brand))] px-2 py-1 bg-[hsl(var(--neon-brand)_/_0.1)] rounded">
                    CONNECTED · READ-ONLY
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-[hsl(var(--text-muted))]">NOT CONNECTED</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[hsl(var(--text-muted))]">
            <Lock className="w-3 h-3" />
            <span>Withdrawal permissions are never requested. Security promise maintained.</span>
          </div>
        </section>

      </main>

      {/* 7. Risk State + Operator Telemetry */}
      <footer className="w-full border-t border-subtle bg-[hsl(var(--bg-panel))] py-4 mt-8">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-wrap items-center justify-between text-xs font-mono gap-y-4">
          <div className="flex items-center gap-6">
            <span className="text-[hsl(var(--text-muted))]">PLATFORM LIVE SLOTS: <span className="text-white">1/3 USED</span></span>
            <span className="text-[hsl(var(--text-muted))]">DRAWDOWN GUARD: <span className="text-[hsl(var(--neon-brand))]">ACTIVE</span></span>
            <span className="text-[hsl(var(--text-muted))]">RISK GAUGE: <span className="text-white">NORMAL</span></span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-[hsl(var(--text-muted))] flex items-center gap-2">
              <Clock className="w-3 h-3" /> LAST ENGINE TICK: 42ms AGO
            </span>
            <span className="text-[hsl(var(--text-muted))]">QUEUE: 0</span>
            <span className="text-[hsl(var(--text-muted))]">LATENCY: <span className="text-[hsl(var(--neon-brand))]">12ms</span></span>
          </div>
        </div>
      </footer>

    </div>
  );
}
