import { useState } from "react";
import { Chart } from "@/components/Chart";
import { SignalPanel } from "@/components/SignalPanel";
import { RiskControls } from "@/components/RiskControls";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { TradeHistory } from "@/components/TradeHistory";

export default function Dashboard() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("15m");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 h-full">
      {/* Left Column: Chart + Bottom Panels */}
      <div className="flex flex-col gap-4 min-h-0">
        <div className="flex-1 min-h-[400px] border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur relative">
          <Chart symbol={symbol} timeframe={timeframe} onSymbolChange={setSymbol} onTimeframeChange={setTimeframe} />
        </div>
        
        <div className="h-[280px] shrink-0 grid grid-cols-1 md:grid-cols-2 gap-4">
          <PortfolioPanel />
          <TradeHistory />
        </div>
      </div>

      {/* Right Column: Signal + Risk */}
      <div className="flex flex-col gap-4 overflow-y-auto pr-1">
        <SignalPanel symbol={symbol} timeframe={timeframe} />
        <RiskControls />
      </div>
    </div>
  );
}