import React, { useState, useEffect } from 'react';
import { LucideActivity, LucideAlertTriangle, LucideCheckCircle2, LucideChevronRight, LucideClock, LucideCpu, LucideDatabase, LucideGlobe, LucideLineChart, LucideLock, LucideMonitorPlay, LucideNetwork, LucidePieChart, LucideRadar, LucideRadio, LucideServer, LucideShield, LucideTerminal, LucideTimer, LucideTrendingDown, LucideTrendingUp, LucideWifi, LucideZap, LucideSearch, LucideStar, LucideFilter, LucideBarChart2 } from 'lucide-react';
import './_group.css';

const MAJOR_OPPS = [
  { symbol: 'BTC', assetClass: 'MAJOR', name: 'Bitcoin', direction: 'LONG', conf: 91, score: 92, mtf: ['green', 'green', 'green', 'green'], readiness: 'READY', reason: 'Alignment strict; execution clear', vol: 'NORMAL', sparkline: [10, 12, 11, 14, 15, 14, 18, 17, 20, 22, 24, 25], momentum: 3, quality: 'Volume breakout', exchanges: ['CB', 'KRK', 'BIN'], reasoning: 'Trend resumption probable; awaiting 15m confirmation', latency: '42ms', regime: 'TRENDING' },
  { symbol: 'ETH', assetClass: 'MAJOR', name: 'Ethereum', direction: 'LONG', conf: 85, score: 85, mtf: ['green', 'amber', 'green', 'amber'], readiness: 'WAITING', reason: '15m confirmation pending', vol: 'ELEVATED', sparkline: [5, 4, 6, 5, 8, 7, 9, 10, 12, 11, 15, 16], momentum: 2, quality: 'EMA+RSI confirmed', exchanges: ['CB', 'BIN'], reasoning: 'Volume profile shifting bullish; upgrading confidence', latency: '38ms', regime: 'BREAKOUT' },
  { symbol: 'SOL', assetClass: 'MAJOR', name: 'Solana', direction: 'SHORT', conf: 82, score: 79, mtf: ['red', 'red', 'amber', 'red'], readiness: 'READY', reason: 'Target zone met', vol: 'NORMAL', sparkline: [30, 28, 29, 25, 24, 26, 22, 20, 19, 18, 15, 12], momentum: 3, quality: 'Momentum decay', exchanges: ['KRK', 'BIN', 'BYB'], reasoning: 'Structural break on 5m confirmed; resistance held', latency: '45ms', regime: 'EXHAUSTED' },
  { symbol: 'XRP', assetClass: 'MAJOR', name: 'Ripple', direction: 'LONG', conf: 78, score: 76, mtf: ['green', 'amber', 'green', 'green'], readiness: 'WAITING', reason: 'News catalyst pending', vol: 'NORMAL', sparkline: [5, 5.2, 5.1, 5.4, 5.3, 5.6, 5.5, 5.8, 5.7, 6.0, 5.9, 6.2], momentum: 2, quality: 'Volume accumulation', exchanges: ['BIN', 'KRK'], reasoning: 'Technical setup valid but fundamental gate active', latency: '40ms', regime: 'BREAKOUT' },
  { symbol: 'ADA', assetClass: 'MAJOR', name: 'Cardano', direction: 'LONG', conf: 75, score: 72, mtf: ['amber', 'green', 'green', 'green'], readiness: 'READY', reason: 'Flag breakout', vol: 'LOW VOL', sparkline: [3.1, 3.15, 3.14, 3.2, 3.18, 3.25, 3.24, 3.3, 3.28, 3.35, 3.32, 3.4], momentum: 2, quality: 'Breakout retest', exchanges: ['CB', 'BIN'], reasoning: 'Clean technical breakout with sector tailwinds', latency: '38ms', regime: 'BREAKOUT' },
  { symbol: 'DOGE', assetClass: 'MAJOR', name: 'Dogecoin', direction: 'SHORT', conf: 69, score: 65, mtf: ['red', 'amber', 'red', 'amber'], readiness: 'WAITING', reason: 'Awaiting VWAP cross', vol: 'ELEVATED', sparkline: [20, 22, 21, 19, 18, 20, 17, 16, 15, 14, 12, 10], momentum: 1, quality: 'Trend exhaustion', exchanges: ['KRK', 'BYB'], reasoning: 'Momentum diverging; shorts staging', latency: '48ms', regime: 'EXHAUSTED' },
  { symbol: 'AVAX', assetClass: 'MAJOR', name: 'Avalanche', direction: 'SHORT', conf: 67, score: 64, mtf: ['amber', 'red', 'red', 'red'], readiness: 'GATED', reason: 'Volatility spike detected', vol: 'ELEVATED', sparkline: [40, 42, 41, 38, 35, 36, 32, 30, 28, 29, 25, 22], momentum: 2, quality: 'Resistance rejection', exchanges: ['CB', 'KRK'], reasoning: 'Risk limits reached for high-beta exposure', latency: '51ms', regime: 'RANGING' },
  { symbol: 'LINK', assetClass: 'MAJOR', name: 'Chainlink', direction: 'LONG', conf: 64, score: 60, mtf: ['green', 'amber', 'amber', 'green'], readiness: 'WAITING', reason: 'Volume below threshold', vol: 'LOW VOL', sparkline: [14, 13, 14, 15, 14, 16, 15, 17, 16, 18, 17, 19], momentum: 1, quality: 'Mean reversion', exchanges: ['BIN', 'BYB'], reasoning: 'Mean reversion lacking follow-through volume', latency: '39ms', regime: 'RANGING' },
  { symbol: 'MATIC', assetClass: 'MAJOR', name: 'Polygon', direction: 'SHORT', conf: 62, score: 58, mtf: ['amber', 'red', 'amber', 'red'], readiness: 'READY', reason: 'Lower high confirmed', vol: 'LOW VOL', sparkline: [15, 14, 14.5, 13, 12.5, 13, 12, 11.5, 12, 11, 10.5, 10], momentum: 2, quality: 'Trend continuation', exchanges: ['CB', 'KRK', 'BIN'], reasoning: 'Clear structural breakdown; target $0.85', latency: '44ms', regime: 'TRENDING' },
  { symbol: 'ATOM', assetClass: 'MAJOR', name: 'Cosmos', direction: 'LONG', conf: 58, score: 55, mtf: ['amber', 'amber', 'green', 'amber'], readiness: 'WAITING', reason: 'Consolidation incomplete', vol: 'LOW VOL', sparkline: [10, 10.2, 10.1, 10.4, 10.3, 10.5, 10.4, 10.7, 10.6, 10.9, 10.8, 11.0], momentum: 1, quality: 'Support bounce', exchanges: ['CB', 'BYB'], reasoning: 'Building base for next leg up; low conviction', latency: '47ms', regime: 'RANGING' }
];

const ALT_OPPS = [
  { symbol: 'ARB', assetClass: 'ALT', name: 'Arbitrum', direction: 'LONG', conf: 89, score: 88, mtf: ['green', 'green', 'green', 'green'], readiness: 'READY', reason: 'MTF aligned; L2 flow', vol: 'ELEVATED', sparkline: [100, 102, 101, 105, 108, 107, 110, 115, 114, 118, 120, 125], momentum: 3, quality: 'Trend continuation', exchanges: ['BIN', 'OKX'], reasoning: 'L2 volume rotation confirmed strong bid', latency: '35ms', regime: 'TRENDING' },
  { symbol: 'INJ', assetClass: 'ALT', name: 'Injective', direction: 'SHORT', conf: 84, score: 82, mtf: ['red', 'red', 'amber', 'red'], readiness: 'READY', reason: 'Key support broken', vol: 'NORMAL', sparkline: [25, 24.5, 24.8, 24, 23.5, 23.8, 23, 22.5, 22.8, 22, 21.5, 21], momentum: 3, quality: 'Momentum decay', exchanges: ['BIN', 'KUC'], reasoning: 'Distribution pattern complete; targeting gap fill', latency: '36ms', regime: 'TRENDING' },
  { symbol: 'SUI', assetClass: 'ALT', name: 'Sui Network', direction: 'LONG', conf: 81, score: 78, mtf: ['green', 'amber', 'green', 'amber'], readiness: 'WAITING', reason: 'Awaiting VWAP reclaim', vol: 'LOW VOL', sparkline: [17, 17.2, 17.1, 17.5, 17.4, 17.8, 17.7, 18, 17.9, 18.2, 18.1, 18.5], momentum: 2, quality: 'Mean reversion', exchanges: ['CB', 'BYB'], reasoning: 'Slow grind higher; needs volume to confirm', latency: '34ms', regime: 'RANGING' },
  { symbol: 'PEPE', assetClass: 'ALT', name: 'Pepe', direction: 'LONG', conf: 78, score: 75, mtf: ['amber', 'green', 'green', 'green'], readiness: 'READY', reason: 'Flag breakout', vol: 'NORMAL', sparkline: [3.1, 3.15, 3.14, 3.2, 3.18, 3.25, 3.24, 3.3, 3.28, 3.35, 3.32, 3.4], momentum: 2, quality: 'Breakout retest', exchanges: ['BIN', 'OKX'], reasoning: 'Clean technical breakout with meme rotation', latency: '38ms', regime: 'BREAKOUT' },
  { symbol: 'FET', assetClass: 'ALT', name: 'Fetch.ai', direction: 'SHORT', conf: 75, score: 72, mtf: ['amber', 'red', 'red', 'amber'], readiness: 'GATED', reason: 'News imminent', vol: 'ELEVATED', sparkline: [14, 13.8, 13.9, 13.5, 13.2, 13.4, 13, 12.8, 12.9, 12.5, 12.2, 12], momentum: 2, quality: 'Resistance rejection', exchanges: ['BIN'], reasoning: 'Gating due to macro AI sector event risk', latency: '37ms', regime: 'RANGING' },
  { symbol: 'TAO', assetClass: 'ALT', name: 'Bittensor', direction: 'LONG', conf: 73, score: 70, mtf: ['green', 'green', 'amber', 'red'], readiness: 'WAITING', reason: 'Pullback to 20EMA', vol: 'NORMAL', sparkline: [300, 305, 302, 310, 308, 315, 312, 320, 318, 325, 322, 330], momentum: 1, quality: 'Trend continuation', exchanges: ['KUC', 'OKX'], reasoning: 'Awaiting optimal entry on mean reversion', latency: '36ms', regime: 'TRENDING' },
  { symbol: 'RNDR', assetClass: 'ALT', name: 'Render', direction: 'LONG', conf: 70, score: 68, mtf: ['amber', 'amber', 'green', 'green'], readiness: 'READY', reason: 'Base building complete', vol: 'LOW VOL', sparkline: [13, 13.2, 13.1, 13.5, 13.4, 13.8, 13.7, 14, 13.9, 14.2, 14.1, 14.5], momentum: 1, quality: 'Volume accumulation', exchanges: ['BIN', 'CB'], reasoning: 'Quiet accumulation phase ending; ready to execute', latency: '39ms', regime: 'BREAKOUT' },
  { symbol: 'OP', assetClass: 'ALT', name: 'Optimism', direction: 'SHORT', conf: 67, score: 65, mtf: ['red', 'amber', 'red', 'green'], readiness: 'WAITING', reason: 'Unlock data pending', vol: 'ELEVATED', sparkline: [45, 44.8, 44.9, 44.5, 44.2, 44.4, 44, 43.8, 43.9, 43.5, 43.2, 43], momentum: 2, quality: 'Market regime shift', exchanges: ['BIN', 'BYB'], reasoning: 'Broader index weakness; awaiting token unlock', latency: '33ms', regime: 'EXHAUSTED' },
  { symbol: 'TIA', assetClass: 'ALT', name: 'Celestia', direction: 'LONG', conf: 64, score: 60, mtf: ['green', 'amber', 'amber', 'amber'], readiness: 'GATED', reason: 'Correlation limit hit', vol: 'NORMAL', sparkline: [37, 37.5, 37.2, 38, 37.8, 38.5, 38.2, 39, 38.8, 39.5, 39.2, 40], momentum: 1, quality: 'Support bounce', exchanges: ['BIN', 'OKX'], reasoning: 'Too much modular exposure in portfolio; gated', latency: '35ms', regime: 'RANGING' },
  { symbol: 'JTO', assetClass: 'ALT', name: 'Jito', direction: 'SHORT', conf: 60, score: 55, mtf: ['amber', 'red', 'amber', 'green'], readiness: 'READY', reason: 'Sympathy play to SOL', vol: 'NORMAL', sparkline: [11, 10.8, 10.9, 10.5, 10.2, 10.4, 10, 9.8, 9.9, 9.5, 9.2, 9], momentum: 1, quality: 'Momentum decay', exchanges: ['BIN', 'CB'], reasoning: 'Relative weakness vs L1 leader; short preferred', latency: '40ms', regime: 'TRENDING' }
];

const MOCK_REASONING = [
  { time: '14:22:18', asset: 'BTC', action: 'BTC funding flipped negative on Binance perps; LONG execution clear.', delta: '+2.4%' },
  { time: '14:21:05', asset: 'ETH', action: 'Held off LONG ETH — gas spiking, DeFi flow building but unconfirmed.', delta: '-1.2%' },
  { time: '14:18:42', asset: 'SOL', action: 'Identified SHORT setup on SOL — structural break on 5m confirmed.', delta: '+4.1%' },
  { time: '14:15:30', asset: 'AVAX', action: 'Gating AVAX SHORT — altcoin volatility expanding beyond acceptable risk limits.', delta: '-3.8%' },
  { time: '14:12:11', asset: 'ARB', action: 'Initiated tracking ARB LONG — L2 rotation volume breakout observed.', delta: '+5.5%' },
  { time: '14:09:55', asset: 'LINK', action: 'Downgraded LINK setup — mean reversion lacking follow-through volume.', delta: '-0.9%' },
  { time: '14:05:22', asset: 'TAO', action: 'Executed PAPER SHORT TAO — AI narrative exhaustion completed, target $210.', delta: '+3.2%' },
  { time: '14:01:10', asset: 'PEPE', action: 'Adjusting PEPE bias to SHORT — internals weakening ahead of perp listings.', delta: '-0.5%' },
];

const MOCK_POSITIONS = [
  { asset: 'BTC', type: 'LONG', entryConf: '84%', currentPnL: '+$412.18', status: 'Riding trend' },
  { asset: 'SOL', type: 'SHORT', entryConf: '78%', currentPnL: '+$124.50', status: 'Approaching target' },
  { asset: 'TAO', type: 'SHORT', entryConf: '72%', currentPnL: '-$87.40', status: 'Monitoring invalidation' },
  { asset: 'ARB', type: 'LONG', entryConf: '81%', currentPnL: '+$215.80', status: 'Trailing stop moved' },
];

const MOCK_EXCHANGES = [
  { name: 'Binance', status: 'CONNECTED', type: 'Read-only' },
  { name: 'Kraken', status: 'CONNECTED', type: 'Read-only' },
  { name: 'Coinbase', status: 'CONNECTED', type: 'Read-only' },
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
    const height = 36;
    const width = 80;
    const step = width / (data.length - 1);
    
    const points = data.map((val, i) => {
      const x = i * step;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="overflow-visible opacity-80">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  const OpportunityCard = ({ opp }: { opp: any }) => {
    const isLong = opp.direction === 'LONG';
    const dirColor = isLong ? 'text-neon-green' : 'text-status-red';
    const dirBg = isLong ? 'bg-neon-green/10 border-neon-green/30' : 'bg-status-red/10 border-status-red/30';
    const sparkColor = isLong ? '#66FF66' : '#FF4D4D';

    return (
      <div className="bg-terminal-bg border border-hairline hover:border-hairline-green transition-colors p-4 flex flex-col gap-3 relative overflow-hidden group h-[300px]">
        {/* Header Row */}
        <div className="flex justify-between items-start z-10">
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-white">{opp.symbol}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{opp.assetClass}</span>
          </div>
          <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${dirBg} ${dirColor} font-bold tracking-wider`}>
            {opp.direction}
          </span>
        </div>

        {/* Middle Row: Confidence & Visuals */}
        <div className="flex items-center gap-4 flex-grow z-10">
          <div className="relative flex flex-col items-center justify-center shrink-0 w-24 h-24">
            <div className="absolute inset-0 glow-ring opacity-30 group-hover:opacity-60 transition-opacity duration-700 pointer-events-none" />
            <div className="absolute inset-1 inner-circle flex flex-col items-center justify-center">
              <span className={`text-4xl font-mono font-light tracking-tighter ${dirColor}`}>{opp.conf}</span>
            </div>
          </div>

          <div className="flex-grow flex flex-col justify-center gap-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-gray-500">REGIME</span>
              <span className="text-white">{opp.regime}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-gray-500">VOLATILITY</span>
              <span className="text-white">{opp.vol}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
               <div className="flex items-center gap-1">
                 {opp.mtf.map((m: string, i: number) => (
                    <div key={i} className={`w-3 h-3 rounded-sm ${m === 'green' ? 'bg-neon-green' : m === 'amber' ? 'bg-status-amber' : 'bg-status-red'}`} title={['5m','15m','1H','4H'][i]}></div>
                 ))}
               </div>
               <div className="flex items-center gap-0.5">
                 {[1,2,3].map(i => (
                    <div key={i} className={`w-1.5 h-3 ${i <= opp.momentum ? dirColor.replace('text-', 'bg-') : 'bg-white/10'}`}></div>
                 ))}
               </div>
            </div>
          </div>
        </div>

        {/* Sparkline & Details */}
        <div className="flex items-end justify-between z-10">
           {renderSparkline(opp.sparkline, sparkColor)}
           <div className="text-right flex flex-col items-end gap-1">
             <div className="flex gap-1 mb-1">
               {opp.exchanges.map((ex: string) => (
                 <span key={ex} className="text-[9px] font-mono text-gray-500 bg-white/5 px-1 rounded">{ex}</span>
               ))}
             </div>
             <span className="text-[10px] font-mono text-gray-400">{opp.quality}</span>
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-500">{opp.latency} · 0.4s</span>
                <span className="text-xs font-mono bg-white/10 text-white px-1.5 rounded">{opp.score}</span>
             </div>
           </div>
        </div>

        {/* Footer: Action & Reasoning */}
        <div className="border-t border-hairline pt-3 mt-1 z-10 flex flex-col gap-2">
          <div className="flex items-center justify-between">
             <span className={`text-[11px] font-mono font-bold flex items-center gap-1.5 ${opp.readiness === 'READY' ? 'text-neon-green' : opp.readiness === 'WAITING' ? 'text-status-amber' : 'text-gray-500'}`}>
                {opp.readiness === 'READY' && <LucideCheckCircle2 className="w-3 h-3" />}
                {opp.readiness === 'WAITING' && <LucideTimer className="w-3 h-3" />}
                {opp.readiness === 'GATED' && <LucideLock className="w-3 h-3" />}
                {opp.readiness}
              </span>
              <button className={`py-1 px-3 text-[10px] font-mono font-bold transition-all border ${
                opp.readiness === 'READY' 
                  ? 'border-neon-green text-neon-green hover:bg-neon-green hover:text-black cursor-pointer' 
                  : 'border-hairline text-gray-600 cursor-not-allowed'
              }`}>
                QUEUE PAPER
              </button>
          </div>
          <span className="text-[10px] italic text-gray-500 leading-tight truncate">{opp.reasoning}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-terminal-black text-gray-300 font-sans selection:bg-neon-green selection:text-black flex flex-col">
      {/* 1. Operator Pulse Header */}
      <header className="bg-terminal-bg border-b border-hairline sticky top-0 z-50 flex items-center px-4 py-1.5 text-xs font-mono tracking-tight overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-neon-green/50 to-transparent opacity-20 animate-scan"></div>
        
        <div className="flex items-center gap-4 md:gap-6 w-full max-w-[2000px] mx-auto">
          {/* Brand */}
          <div className="flex items-center gap-2 font-bold text-white tracking-widest shrink-0">
            <LucideTerminal className="w-3.5 h-3.5 text-neon-green" />
            <span className="hidden sm:inline">AICANDLEZ</span>
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
            <span className="text-neon-green hidden sm:inline">ENGINE ONLINE</span>
          </div>

          <div className="w-[1px] h-4 bg-hairline shrink-0"></div>

          {/* Platform Stats */}
          <div className="flex items-center gap-2 hidden xl:flex shrink-0">
            <LucideActivity className="w-3 h-3 text-gray-500" />
            <span className="text-gray-400">PLATFORM SLOTS: 1/3</span>
          </div>

          <div className="w-[1px] h-4 bg-hairline shrink-0 hidden lg:block"></div>

          {/* Plan Badge */}
          <div className="px-2 py-0.5 bg-hairline-green border border-hairline-green text-neon-green rounded flex items-center gap-1.5 shrink-0">
            <LucideShield className="w-3 h-3" />
            <span className="hidden sm:inline">PRO: CRYPTO · PRIORITY EXEC</span>
            <span className="sm:hidden">PRO</span>
          </div>

          <div className="flex-grow"></div>

          {/* Portfolio Pulse */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 hidden sm:inline">PAPER BAL:</span>
              <span className="text-white">$124,500.00</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 hidden sm:inline">REALIZED (1D):</span>
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

      <main className="flex-grow w-full max-w-[2000px] mx-auto px-4 py-6 flex flex-col gap-8">
        
        {/* 2. Global Asset Intelligence Search Bar */}
        <section className="flex flex-col gap-3">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <LucideSearch className="w-5 h-5 text-neon-green group-focus-within:text-neon-green transition-colors" />
            </div>
            <input 
              type="text" 
              className="w-full bg-terminal-bg border border-hairline focus:border-neon-green text-white font-mono text-sm py-4 pl-12 pr-4 outline-none transition-colors placeholder-gray-600"
              placeholder="Search crypto asset or AI opportunity… (BTC · ETH · SOL · XRP · DOGE · AVAX · LINK · ADA · SUI · PEPE · FET · TAO)"
            />
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center gap-2">
               <button className="text-gray-500 hover:text-white transition-colors" title="Add to watchlist">
                  <LucideStar className="w-4 h-4" />
               </button>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX', 'LINK', 'ADA', 'SUI', 'PEPE', 'FET', 'TAO', 'ARB', 'ATOM', 'MATIC', 'INJ'].slice(0, 14).map(chip => (
                <button key={chip} className="text-[10px] font-mono text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded transition-colors">
                  {chip}
                </button>
              ))}
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <LucideFilter className="w-3.5 h-3.5 text-gray-500" />
              {['All', 'Majors', 'Alts', 'High Confidence (≥75)', 'Ready to Execute', 'Long Bias', 'Short Bias', 'Watchlist'].map((pill, i) => (
                <button key={pill} className={`text-[10px] font-mono px-2.5 py-1 border rounded transition-colors ${i === 3 ? 'border-neon-green text-neon-green bg-neon-green/5' : 'border-hairline text-gray-500 hover:border-gray-500'}`}>
                  {pill}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Dynamic AI Opportunity Matrix */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 relative">
          {/* Majors Column */}
          <div className="flex flex-col gap-4">
             <div className="flex items-center justify-between border-b border-hairline pb-2">
                <h2 className="text-base font-mono text-white flex items-center gap-2">
                  <LucideRadar className="w-4 h-4 text-neon-green" />
                  MAJORS
                  <span className="bg-white/10 text-white text-[10px] px-1.5 py-0.5 rounded ml-2">10</span>
                </h2>
                <span className="text-[10px] font-mono text-gray-500">SORT: CONFIDENCE ↓</span>
             </div>
             
             <div className="flex flex-col gap-4 overflow-y-auto h-[1000px] scrollbar-hide pr-2">
               {MAJOR_OPPS.map((opp, idx) => (
                 <OpportunityCard key={`major-${idx}`} opp={opp} />
               ))}
             </div>
          </div>

          <div className="hidden xl:block absolute top-0 bottom-0 left-1/2 w-[1px] bg-hairline -translate-x-1/2"></div>

          {/* Alts Column */}
          <div className="flex flex-col gap-4">
             <div className="flex items-center justify-between border-b border-hairline pb-2">
                <h2 className="text-base font-mono text-white flex items-center gap-2">
                  <LucideRadar className="w-4 h-4 text-neon-green" />
                  ALTS / EMERGING
                  <span className="bg-white/10 text-white text-[10px] px-1.5 py-0.5 rounded ml-2">10</span>
                </h2>
                <span className="text-[10px] font-mono text-gray-500">SORT: CONFIDENCE ↓</span>
             </div>
             
             <div className="flex flex-col gap-4 overflow-y-auto h-[1000px] scrollbar-hide pl-2 xl:pl-0">
               {ALT_OPPS.map((opp, idx) => (
                 <OpportunityCard key={`alt-${idx}`} opp={opp} />
               ))}
             </div>
          </div>
        </section>

        {/* 5. Lower Terminal Zone */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-6 border-t border-hairline">
           
           {/* Module 1: AI Reasoning Console */}
           <div className="xl:col-span-2 bg-terminal-bg border border-hairline flex flex-col h-72">
             <div className="p-3 border-b border-hairline flex justify-between items-center bg-black/40">
               <h3 className="font-mono text-xs text-white">AI REASONING CONSOLE</h3>
               <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse-neon"></div>
             </div>
             <div className="p-3 overflow-y-auto flex-grow text-[11px] font-mono space-y-2">
               {MOCK_REASONING.map((log, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 hover:bg-white/5 border-l border-transparent hover:border-neon-green transition-colors">
                    <span className="text-gray-500 shrink-0">{log.time}</span>
                    <span className="text-white shrink-0 w-10">{log.asset}</span>
                    <span className="text-gray-400 flex-grow">{log.action}</span>
                    <span className={`shrink-0 text-right ${log.delta.startsWith('+') ? 'text-neon-green' : 'text-status-red'}`}>{log.delta}</span>
                  </div>
               ))}
             </div>
           </div>

           {/* Module 2: Portfolio Intelligence */}
           <div className="bg-terminal-bg border border-hairline flex flex-col h-72">
             <div className="p-3 border-b border-hairline flex justify-between items-center bg-black/40">
               <h3 className="font-mono text-xs text-white">PORTFOLIO INTEL</h3>
             </div>
             <div className="p-4 flex flex-col gap-4">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-[10px] text-gray-500 font-mono mb-1">PAPER EQUITY (USD)</div>
                    <div className="text-xl text-white font-mono">$124,500<span className="text-gray-500">.00</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500 font-mono mb-1">REALIZED</div>
                    <div className="text-sm text-neon-green font-mono">+$1,240.50</div>
                  </div>
                </div>
                <div className="h-12 w-full opacity-60">
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
                <div className="flex flex-col gap-2 mt-auto">
                  {MOCK_POSITIONS.slice(0,3).map((pos, i) => (
                    <div key={i} className="flex justify-between text-[10px] font-mono">
                      <span className="text-gray-400"><span className={pos.type==='LONG'?'text-neon-green':'text-status-red'}>{pos.type.charAt(0)}</span> {pos.asset}</span>
                      <span className={pos.currentPnL.startsWith('+')?'text-neon-green':'text-status-red'}>{pos.currentPnL}</span>
                    </div>
                  ))}
                </div>
             </div>
           </div>

           {/* Module 3: Signal Pipeline */}
           <div className="bg-terminal-bg border border-hairline flex flex-col h-72">
             <div className="p-3 border-b border-hairline flex justify-between items-center bg-black/40">
               <h3 className="font-mono text-xs text-white">SIGNAL PIPELINE</h3>
               <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse-neon"></div>
             </div>
             <div className="p-4 flex flex-col justify-center h-full gap-4">
                {['CANDIDATE: XRP (78%)', 'ANALYZED: DOGE (69%)', 'CONFIRMED: ARB (89%)', 'QUEUED: SOL (82%)'].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${i === 3 ? 'bg-neon-green' : i === 2 ? 'bg-neon-green/60' : i === 1 ? 'bg-neon-green/40' : 'bg-neon-green/20'}`}></div>
                    <span className={`text-xs font-mono ${i >= 2 ? 'text-white' : 'text-gray-500'}`}>{step}</span>
                  </div>
                ))}
             </div>
           </div>

           {/* Module 4: Market Regime */}
           <div className="bg-terminal-bg border border-hairline flex flex-col h-72">
             <div className="p-3 border-b border-hairline flex justify-between items-center bg-black/40">
               <h3 className="font-mono text-xs text-white">MARKET REGIME</h3>
             </div>
             <div className="p-4 flex flex-col gap-4 justify-center h-full">
                {[{a:'BTC', r:'TRENDING', c:'text-neon-green'}, {a:'ETH', r:'BREAKOUT', c:'text-neon-green'}, {a:'SOL', r:'EXHAUSTED', c:'text-status-amber'}].map((m, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-hairline/50 pb-2">
                     <span className="font-mono text-xs text-gray-400">{m.a}</span>
                     <span className={`font-mono text-[10px] ${m.c} bg-white/5 px-2 py-1 rounded`}>{m.r}</span>
                  </div>
                ))}
                <span className="text-[10px] font-mono text-gray-500 italic mt-2">Majors consolidating while Alts show relative strength.</span>
             </div>
           </div>

           {/* Module 5: Exchange Topology */}
           <div className="xl:col-span-2 bg-terminal-bg border border-hairline flex flex-col h-48">
             <div className="p-3 border-b border-hairline flex justify-between items-center bg-black/40">
               <h3 className="font-mono text-xs text-white">EXCHANGE TOPOLOGY</h3>
             </div>
             <div className="p-4 flex flex-col justify-between h-full">
               <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                 {MOCK_EXCHANGES.map((ex, i) => (
                    <div key={i} className={`p-2 border ${ex.status === 'CONNECTED' ? 'border-hairline bg-white/5' : 'border-hairline/30'} flex flex-col gap-1`}>
                      <span className={`font-mono text-[10px] ${ex.status === 'CONNECTED' ? 'text-white' : 'text-gray-600'}`}>{ex.name}</span>
                      <span className={`font-mono text-[9px] ${ex.status === 'CONNECTED' ? 'text-neon-green' : 'text-gray-700'}`}>{ex.status}</span>
                    </div>
                 ))}
               </div>
               <span className="text-[9px] font-mono text-gray-500 flex items-center justify-end gap-1 mt-2">
                 <LucideShield className="w-3 h-3" /> Withdrawal permissions are never requested.
               </span>
             </div>
           </div>

           {/* Module 6: Risk Heatmap */}
           <div className="bg-terminal-bg border border-hairline flex flex-col h-48">
             <div className="p-3 border-b border-hairline flex justify-between items-center bg-black/40">
               <h3 className="font-mono text-xs text-white">RISK HEATMAP</h3>
             </div>
             <div className="p-4 grid grid-cols-4 gap-1 h-full">
                {Array.from({length: 16}).map((_, i) => {
                   const intensity = [0.1, 0.2, 0.3, 0.6, 0.8, 0.2, 0.1, 0.4, 0.9, 0.3, 0.2, 0.1, 0.5, 0.7, 0.2, 0.1][i];
                   const color = intensity > 0.7 ? 'bg-status-red' : intensity > 0.4 ? 'bg-status-amber' : 'bg-neon-green';
                   return (
                     <div key={i} className={`${color} opacity-${Math.max(20, Math.floor(intensity*100))} rounded-sm`} title={`Risk dimension ${i}`}></div>
                   )
                })}
             </div>
           </div>

           {/* Module 7: AI Throughput */}
           <div className="bg-terminal-bg border border-hairline flex flex-col h-48">
             <div className="p-3 border-b border-hairline flex justify-between items-center bg-black/40">
               <h3 className="font-mono text-xs text-white">AI THROUGHPUT</h3>
               <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse-neon"></div>
             </div>
             <div className="p-4 flex flex-col gap-3 justify-center h-full font-mono text-[10px]">
                <div className="flex justify-between text-gray-400">
                  <span>ENGINE TPS</span><span className="text-white">4,210</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>SIGNALS / MIN</span><span className="text-white">142</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>MTF EVALS / MIN</span><span className="text-white">1,850</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>QUEUE DEPTH</span><span className="text-white">0</span>
                </div>
             </div>
           </div>

           {/* Module 8: Execution Awareness */}
           <div className="bg-terminal-bg border border-hairline flex flex-col h-48">
             <div className="p-3 border-b border-hairline flex justify-between items-center bg-black/40">
               <h3 className="font-mono text-xs text-white">EXEC AWARENESS</h3>
               <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse-neon"></div>
             </div>
             <div className="p-4 flex flex-col gap-3 justify-center h-full font-mono text-[10px]">
                <div className="flex justify-between text-gray-400">
                  <span>PLATFORM TRADES</span><span className="text-white">1,204</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>YOUR SLOT USAGE</span><span className="text-white">1 / 12</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>NEXT ELIGIBLE EXEC</span><span className="text-neon-green">IMMEDIATE</span>
                </div>
                <div className="w-full h-[1px] bg-hairline my-1"></div>
                <div className="flex justify-between text-gray-400">
                  <span>CAPACITY</span><span className="text-neon-green">1/3 PLATFORM SLOTS USED</span>
                </div>
             </div>
           </div>

        </section>

      </main>

      {/* 8. Operator Telemetry Strip */}
      <footer className="bg-terminal-bg border-t border-hairline mt-auto sticky bottom-0 z-50 px-4 py-2 text-xs font-mono text-gray-500 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 w-full max-w-[2000px] mx-auto">
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
        </div>
      </footer>
    </div>
  );
}
