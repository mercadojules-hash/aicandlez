import React, { useState, useEffect } from 'react';
import { LucideActivity, LucideAlertTriangle, LucideCheckCircle2, LucideChevronRight, LucideClock, LucideCpu, LucideDatabase, LucideGlobe, LucideLineChart, LucideLock, LucideMonitorPlay, LucideNetwork, LucidePieChart, LucideRadar, LucideRadio, LucideServer, LucideShield, LucideTerminal, LucideTimer, LucideTrendingDown, LucideTrendingUp, LucideWifi, LucideZap } from 'lucide-react';
import './_group.css';

const MOCK_OPPORTUNITIES = [
  { symbol: 'BTC/USD', name: 'Bitcoin', direction: 'LONG', conf: 88, score: 92, mtf: ['green', 'green', 'green'], readiness: 'READY', reason: 'Alignment strict', weight: 8.5, quality: 'Volume breakout', sparkline: [10, 12, 11, 14, 15, 14, 18, 17, 20, 22, 24, 25] },
  { symbol: 'ETH/USD', name: 'Ethereum', direction: 'LONG', conf: 82, score: 85, mtf: ['green', 'amber', 'green'], readiness: 'WAITING', reason: '15m confirmation pending', weight: 6.0, quality: 'EMA+RSI confirmed', sparkline: [5, 4, 6, 5, 8, 7, 9, 10, 12, 11, 15, 16] },
  { symbol: 'SOL/USD', name: 'Solana', direction: 'SHORT', conf: 76, score: 79, mtf: ['red', 'red', 'amber'], readiness: 'READY', reason: 'Target zone met', weight: 5.5, quality: 'Momentum decay', sparkline: [30, 28, 29, 25, 24, 26, 22, 20, 19, 18, 15, 12] },
  { symbol: 'NVDA', name: 'Nvidia', direction: 'LONG', conf: 85, score: 88, mtf: ['green', 'green', 'green'], readiness: 'READY', reason: 'MTF aligned', weight: 7.0, quality: 'Trend continuation', sparkline: [100, 102, 101, 105, 108, 107, 110, 115, 114, 118, 120, 125] },
  { symbol: 'AVAX/USD', name: 'Avalanche', direction: 'SHORT', conf: 71, score: 74, mtf: ['amber', 'red', 'red'], readiness: 'GATED', reason: 'Volatility spike detected', weight: 3.5, quality: 'Resistance rejection', sparkline: [40, 42, 41, 38, 35, 36, 32, 30, 28, 29, 25, 22] },
  { symbol: 'LINK/USD', name: 'Chainlink', direction: 'LONG', conf: 68, score: 70, mtf: ['green', 'amber', 'amber'], readiness: 'WAITING', reason: 'Volume below threshold', weight: 4.0, quality: 'Mean reversion', sparkline: [14, 13, 14, 15, 14, 16, 15, 17, 16, 18, 17, 19] },
];

const MOCK_REASONING = [
  { time: '14:22:18', asset: 'BTC/USD', action: 'Confirmed LONG BTC — MTF trend alignment solid across 5m/15m/1H.', delta: '+2.4%' },
  { time: '14:21:05', asset: 'ETH/USD', action: 'Held off LONG ETH — 15m momentum diverging from 1H trend.', delta: '-1.2%' },
  { time: '14:18:42', asset: 'SOL/USD', action: 'Identified SHORT setup on SOL — structural break on 5m confirmed.', delta: '+4.1%' },
  { time: '14:15:30', asset: 'AVAX/USD', action: 'Gating AVAX SHORT — macro volatility expanding beyond acceptable risk limits.', delta: '-3.8%' },
  { time: '14:12:11', asset: 'NVDA', action: 'Initiated tracking NVDA LONG — sustained volume breakout observed.', delta: '+5.5%' },
  { time: '14:09:55', asset: 'LINK/USD', action: 'Downgraded LINK setup — mean reversion lacking follow-through volume.', delta: '-0.9%' },
];

const MOCK_POSITIONS = [
  { asset: 'BTC/USD', type: 'LONG', entryConf: '84%', currentPnL: '+$412.18', status: 'Riding trend' },
  { asset: 'SOL/USD', type: 'SHORT', entryConf: '78%', currentPnL: '+$124.50', status: 'Approaching target' },
  { asset: 'TSLA', type: 'SHORT', entryConf: '72%', currentPnL: '-$87.40', status: 'Monitoring invalidation' },
];

const MOCK_EXCHANGES = [
  { name: 'Kraken', status: 'CONNECTED', type: 'read-only' },
  { name: 'Binance', status: 'CONNECTED', type: 'read-only' },
  { name: 'Coinbase', status: 'NOT CONNECTED', type: '' },
  { name: 'Bybit', status: 'NOT CONNECTED', type: '' },
  { name: 'OKX', status: 'NOT CONNECTED', type: '' },
  { name: 'KuCoin', status: 'NOT CONNECTED', type: '' },
];

export function CommandDeck() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (d: Date) => {
    return d.toISOString().split('T')[1].split('.')[0] + ' UTC';
  };

  const renderSparkline = (data: number[], color: string) => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const height = 24;
    const width = 60;
    const step = width / (data.length - 1);
    
    const points = data.map((val, i) => {
      const x = i * step;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="overflow-visible">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-terminal-black text-gray-300 font-sans selection:bg-neon-green selection:text-black flex flex-col">
      {/* 1. Operator Pulse Header */}
      <header className="bg-terminal-bg border-b border-hairline sticky top-0 z-50 flex items-center px-4 py-1.5 text-xs font-mono tracking-tight overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-neon-green/50 to-transparent opacity-20 animate-scan"></div>
        
        <div className="flex items-center gap-6 w-full max-w-[1800px] mx-auto">
          {/* Brand */}
          <div className="flex items-center gap-2 font-bold text-white tracking-widest shrink-0">
            <LucideTerminal className="w-3.5 h-3.5 text-neon-green" />
            <span>AICANDLEZ</span>
          </div>

          <div className="w-[1px] h-4 bg-hairline shrink-0"></div>

          {/* Clock */}
          <div className="flex items-center gap-2 shrink-0">
            <LucideClock className="w-3 h-3 text-gray-500" />
            <span className="text-gray-400">{formatTime(time)}</span>
          </div>

          <div className="w-[1px] h-4 bg-hairline shrink-0 hidden sm:block"></div>

          {/* Session */}
          <div className="flex items-center gap-4 text-gray-500 hidden md:flex shrink-0">
            <span className="flex items-center gap-1.5"><LucideGlobe className="w-3 h-3" /> NYC·US</span>
            <span className="flex items-center gap-1.5"><LucideMonitorPlay className="w-3 h-3" /> WKS-04</span>
            <span className="flex items-center gap-1.5"><LucideTimer className="w-3 h-3" /> 04:12:00</span>
          </div>

          <div className="w-[1px] h-4 bg-hairline shrink-0 hidden lg:block"></div>

          {/* Engine Status */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse-neon"></div>
            <span className="text-neon-green">ENGINE ONLINE</span>
          </div>

          <div className="w-[1px] h-4 bg-hairline shrink-0"></div>

          {/* Platform Stats */}
          <div className="flex items-center gap-2 hidden lg:flex shrink-0">
            <LucideActivity className="w-3 h-3 text-gray-500" />
            <span className="text-gray-400">PLATFORM SLOTS: 1/3</span>
          </div>

          <div className="w-[1px] h-4 bg-hairline shrink-0 hidden lg:block"></div>

          {/* Plan Badge */}
          <div className="px-2 py-0.5 bg-hairline-green border border-hairline-green text-neon-green rounded flex items-center gap-1.5 shrink-0">
            <LucideShield className="w-3 h-3" />
            AI TRADING PRO · 12 SLOTS
          </div>

          <div className="flex-grow"></div>

          {/* Portfolio Pulse */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">PAPER BAL:</span>
              <span className="text-white">$124,500.00</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">REALIZED (1D):</span>
              <span className="text-neon-green">+$1,240.50</span>
            </div>
          </div>
        </div>
      </header>

      {/* Static Paper Mode Banner */}
      <div className="bg-hairline text-gray-400 text-center py-1 text-[10px] font-mono tracking-widest uppercase border-b border-hairline-green flex items-center justify-center gap-2">
        <LucideLock className="w-3 h-3 text-neon-green" />
        Paper Execution Mode Active — No real funds at risk
      </div>

      <main className="flex-grow w-full max-w-[1800px] mx-auto px-4 py-8 flex flex-col gap-10">
        
        {/* 2. AI Intelligence Overview */}
        <section className="border-l-2 border-neon-green pl-6 py-2">
          <h1 className="text-3xl lg:text-4xl font-light tracking-tight text-white mb-3">
            <span className="font-semibold text-neon-green mr-3">AI confidence: 78%</span>
            · 4 high-conviction opportunities · 2 markets in low-vol regime · MTF agreement: strong on 5m/15m/1H
          </h1>
          <p className="text-gray-400 font-mono text-sm max-w-4xl">
            System is tracking 42 pairs. Volatility expansion detected across major large-caps. Trend-following models are prioritizing continuation setups. Mean-reversion models suppressed.
          </p>
        </section>

        {/* 3. TOP 6 AI OPPORTUNITY CARDS */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <h2 className="text-lg font-mono text-white flex items-center gap-2">
              <LucideRadar className="w-4 h-4 text-neon-green" />
              OPPORTUNITY MATRIX
            </h2>
            <span className="text-xs font-mono text-gray-500">FILTER: HIGH CONVICTION</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-4">
            {MOCK_OPPORTUNITIES.map((opp, idx) => {
              const isLong = opp.direction === 'LONG';
              const dirColor = isLong ? 'text-neon-green' : 'text-status-red';
              const dirBg = isLong ? 'bg-hairline-green' : 'bg-status-red/10';
              const sparkColor = isLong ? '#66FF66' : '#FF4D4D';
              
              return (
                <div key={idx} className="bg-terminal-bg border border-hairline hover:border-hairline-green transition-colors p-5 flex items-center gap-6 relative overflow-hidden group">
                  {/* Subtle bg glow on hover */}
                  <div className="absolute inset-0 bg-gradient-to-r from-neon-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                  {/* Left: Confidence Anchor */}
                  <div className="relative flex flex-col items-center justify-center shrink-0 w-24">
                    <div className="absolute inset-0 border-2 border-hairline rounded-full w-20 h-20 m-auto"></div>
                    <div className={`absolute inset-0 border-t-2 border-r-2 ${isLong ? 'border-neon-green' : 'border-status-red'} rounded-full w-20 h-20 m-auto rotate-45 opacity-50`}></div>
                    <span className={`text-4xl font-mono font-bold ${dirColor} tracking-tighter z-10`}>{opp.conf}</span>
                    <span className="text-[9px] font-mono text-gray-500 mt-1 z-10">CONFIDENCE</span>
                  </div>

                  {/* Middle: Data */}
                  <div className="flex-grow flex flex-col gap-3 z-10">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-mono text-lg font-bold text-white">{opp.symbol}</span>
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${dirBg} ${dirColor} font-bold tracking-wider`}>
                            {opp.direction}
                          </span>
                        </div>
                        <span className="text-sm text-gray-500">{opp.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm text-gray-400 mb-1">SCORE: <span className="text-white">{opp.score}</span>/100</div>
                        <div className="text-xs text-gray-500">{opp.quality}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* MTF Strip */}
                      <div className="flex items-center gap-1.5">
                        {opp.mtf.map((m, i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <div className={`w-6 h-1.5 rounded-sm ${m === 'green' ? 'bg-neon-green' : m === 'amber' ? 'bg-status-amber' : 'bg-status-red'}`}></div>
                            <span className="text-[9px] font-mono text-gray-500">{['5m','15m','1H'][i]}</span>
                          </div>
                        ))}
                      </div>

                      {/* Sparkline */}
                      <div className="flex-grow flex justify-center opacity-70">
                        {renderSparkline(opp.sparkline, sparkColor)}
                      </div>

                      {/* Weighting */}
                      <div className="flex flex-col items-end gap-1 w-20">
                        <div className="w-full h-1.5 bg-gray-800 rounded-sm overflow-hidden">
                          <div className={`h-full ${dirColor === 'text-neon-green' ? 'bg-neon-green' : 'bg-status-red'}`} style={{ width: `${opp.weight * 10}%` }}></div>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">RISK WGT {opp.weight}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Action */}
                  <div className="shrink-0 flex flex-col items-end gap-3 z-10 w-36 border-l border-hairline pl-6">
                    <div className="flex flex-col items-end w-full">
                      <span className={`text-xs font-mono font-bold flex items-center gap-1.5 mb-1 ${opp.readiness === 'READY' ? 'text-neon-green' : opp.readiness === 'WAITING' ? 'text-status-amber' : 'text-gray-500'}`}>
                        {opp.readiness === 'READY' && <LucideCheckCircle2 className="w-3 h-3" />}
                        {opp.readiness === 'WAITING' && <LucideTimer className="w-3 h-3" />}
                        {opp.readiness === 'GATED' && <LucideLock className="w-3 h-3" />}
                        {opp.readiness}
                      </span>
                      <span className="text-[10px] text-gray-500 text-right leading-tight line-clamp-2">{opp.reason}</span>
                    </div>
                    
                    <button className={`w-full py-2 px-3 text-xs font-mono font-bold transition-all border ${
                      opp.readiness === 'READY' 
                        ? 'border-neon-green text-neon-green hover:bg-neon-green hover:text-black cursor-pointer' 
                        : 'border-hairline text-gray-600 cursor-not-allowed'
                    }`}>
                      QUEUE PAPER
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 4. AI Reasoning Console */}
          <section className="lg:col-span-2 flex flex-col gap-4">
             <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h2 className="text-lg font-mono text-white flex items-center gap-2">
                <LucideCpu className="w-4 h-4 text-gray-400" />
                AI REASONING CONSOLE
              </h2>
              <span className="flex items-center gap-2 text-xs font-mono text-neon-green">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse-neon"></div>
                LIVE FEED
              </span>
            </div>

            <div className="bg-terminal-bg border border-hairline p-1">
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono text-left">
                  <thead className="text-gray-600 text-[10px] uppercase border-b border-hairline">
                    <tr>
                      <th className="py-2 px-3 font-normal w-24">TIME (UTC)</th>
                      <th className="py-2 px-3 font-normal w-24">ASSET</th>
                      <th className="py-2 px-3 font-normal">ACTION / LOGIC</th>
                      <th className="py-2 px-3 font-normal text-right w-20">Δ CONF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline text-gray-400">
                    {MOCK_REASONING.map((log, i) => (
                      <tr key={i} className="hover:bg-gray-900/50 transition-colors">
                        <td className="py-2.5 px-3 text-gray-500">{log.time}</td>
                        <td className="py-2.5 px-3 text-white">{log.asset}</td>
                        <td className="py-2.5 px-3">{log.action}</td>
                        <td className={`py-2.5 px-3 text-right ${log.delta.startsWith('+') ? 'text-neon-green' : 'text-status-red'}`}>{log.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 5. Portfolio Intelligence */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h2 className="text-lg font-mono text-white flex items-center gap-2">
                <LucideBriefcase className="w-4 h-4 text-gray-400" />
                PORTFOLIO INTEL
              </h2>
            </div>

            <div className="bg-terminal-bg border border-hairline p-5 flex flex-col gap-6">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-xs font-mono text-gray-500 mb-1">PAPER EQUITY</div>
                  <div className="text-3xl font-mono text-white font-light">$124,500<span className="text-gray-500 text-xl">.00</span></div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-gray-500 mb-1">REALIZED (1D)</div>
                  <div className="text-lg font-mono text-neon-green">+$1,240.50</div>
                </div>
              </div>

              <div className="h-16 w-full opacity-60 border-b border-hairline pb-4">
                {/* Simplified SVG Equity Curve */}
                <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path d="M0,35 Q10,38 20,25 T40,15 T60,20 T80,5 T100,10" fill="none" stroke="#66FF66" strokeWidth="1" />
                  <path d="M0,40 L0,35 Q10,38 20,25 T40,15 T60,20 T80,5 T100,10 L100,40 Z" fill="url(#grad)" opacity="0.1" />
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#66FF66" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <div>
                <div className="text-xs font-mono text-gray-500 mb-3 uppercase tracking-wider">OPEN PAPER POSITIONS ({MOCK_POSITIONS.length})</div>
                <div className="flex flex-col gap-3">
                  {MOCK_POSITIONS.map((pos, i) => (
                    <div key={i} className="flex items-center justify-between text-sm font-mono">
                      <div className="flex items-center gap-2">
                        <span className={`w-1 h-4 ${pos.type === 'LONG' ? 'bg-neon-green' : 'bg-status-red'}`}></span>
                        <span className="text-white">{pos.asset}</span>
                        <span className="text-xs text-gray-500">in @ {pos.entryConf}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{pos.status}</span>
                        <span className={pos.currentPnL.startsWith('+') ? 'text-neon-green' : 'text-status-red'}>{pos.currentPnL}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* 6. Exchange Awareness */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <h2 className="text-lg font-mono text-white flex items-center gap-2">
              <LucideNetwork className="w-4 h-4 text-gray-400" />
              EXCHANGE TOPOLOGY
            </h2>
            <span className="text-xs font-mono text-gray-500">ROUTING DISABLED IN PAPER MODE</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {MOCK_EXCHANGES.map((ex, i) => {
              const isConnected = ex.status === 'CONNECTED';
              return (
                <div key={i} className={`p-4 border ${isConnected ? 'border-hairline bg-terminal-bg' : 'border-hairline/50 bg-black'} flex flex-col gap-2`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-mono text-sm ${isConnected ? 'text-white' : 'text-gray-600'}`}>{ex.name}</span>
                    {isConnected && <LucideWifi className="w-3 h-3 text-neon-green" />}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-[10px] font-mono ${isConnected ? 'text-neon-green' : 'text-gray-600'}`}>{ex.status}</span>
                    {ex.type && <span className="text-[9px] font-mono text-gray-500">{ex.type}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-gray-500 flex items-center justify-end gap-1.5">
              <LucideShield className="w-3 h-3" />
              Withdrawal permissions are never requested. Security promise maintained.
            </span>
          </div>
        </section>

      </main>

      {/* 7. Risk State + Operator Telemetry Strip */}
      <footer className="bg-terminal-bg border-t border-hairline mt-auto sticky bottom-0 z-50 px-4 py-2 text-xs font-mono text-gray-500 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 w-full max-w-[1800px] mx-auto">
          <div className="flex items-center gap-2">
            <LucideRadio className="w-3 h-3 text-neon-green animate-pulse" />
            <span className="text-gray-400">LATENCY TO ENGINE: <span className="text-white">12ms</span></span>
          </div>
          
          <div className="w-[1px] h-3 bg-hairline"></div>
          
          <div className="flex items-center gap-2">
            <LucideDatabase className="w-3 h-3" />
            <span>LAST ENGINE TICK: <span className="text-white">0.4s ago</span></span>
          </div>

          <div className="w-[1px] h-3 bg-hairline"></div>

          <div className="flex items-center gap-2">
            <LucideLineChart className="w-3 h-3 text-status-amber" />
            <span>DRAWDOWN GUARD: <span className="text-status-amber">ACTIVE (5%)</span></span>
          </div>

          <div className="w-[1px] h-3 bg-hairline"></div>

          <div className="flex items-center gap-2">
            <LucidePieChart className="w-3 h-3" />
            <span>PORTFOLIO RISK: <span className="text-white">LOW (12% EXPOSED)</span></span>
          </div>

          <div className="w-[1px] h-3 bg-hairline"></div>

          <div className="flex items-center gap-2">
            <LucideActivity className="w-3 h-3" />
            <span>PLATFORM LIVE SLOTS: <span className="text-white">1/3 USED</span></span>
          </div>
          
           <div className="w-[1px] h-3 bg-hairline hidden md:block"></div>

           <div className="flex items-center gap-2 hidden md:flex">
            <LucideZap className="w-3 h-3" />
            <span>AI EXEC QUEUE: <span className="text-white">0</span></span>
          </div>

        </div>
      </footer>
    </div>
  );
}

// Quick missing Lucide icon fix to avoid import errors if some aren't perfectly named
function LucideBriefcase(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
}
