import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { useGetCandles, getGetCandlesQueryKey } from '@workspace/api-client-react';

interface ChartProps {
  symbol: string;
  timeframe: string;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: string) => void;
}

export function Chart({ symbol, timeframe, onSymbolChange, onTimeframeChange }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

  const { data: candles, isLoading } = useGetCandles(
    { symbol, timeframe, limit: 500 },
    { query: { queryKey: getGetCandlesQueryKey({ symbol, timeframe, limit: 500 }), refetchInterval: 5000 } }
  );

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: 'rgba(43, 49, 57, 0.5)' },
        horzLines: { color: 'rgba(43, 49, 57, 0.5)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(139, 148, 158, 0.5)', width: 1, style: 1 },
        horzLine: { color: 'rgba(139, 148, 158, 0.5)', width: 1, style: 1 },
      },
      timeScale: {
        borderColor: 'rgba(43, 49, 57, 1)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(43, 49, 57, 1)',
        autoScale: true,
      },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff88',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#00ff88',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' as const },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (candles && candleSeriesRef.current && volumeSeriesRef.current) {
      const formattedData = candles.map(c => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const volumeData = candles.map(c => ({
        time: c.time as any,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0, 255, 136, 0.3)' : 'rgba(239, 68, 68, 0.3)'
      }));

      candleSeriesRef.current.setData(formattedData);
      volumeSeriesRef.current.setData(volumeData);
    }
  }, [candles]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <div className="flex bg-card/80 backdrop-blur border border-border/50 rounded p-1">
          {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map(s => (
            <button
              key={s}
              onClick={() => onSymbolChange(s)}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                symbol === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.replace('USDT', '')}
            </button>
          ))}
        </div>
        <div className="flex bg-card/80 backdrop-blur border border-border/50 rounded p-1">
          {['1m', '5m', '15m', '1H', '1D'].map(tf => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-1 text-xs font-bold rounded transition-colors ${
                timeframe === tf ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (!candles || candles.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-background/20 backdrop-blur-sm">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      <div ref={chartContainerRef} className="flex-1 w-full h-full" />
    </div>
  );
}
