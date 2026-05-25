import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { CandleData } from '../../types';

interface StockChartProps {
  symbol: string;
  height?: number;
  showVolume?: boolean;
  showEMAs?: boolean;
}

interface IndicatorData {
  ema9?: { time: number; value: number }[];
  ema20?: { time: number; value: number }[];
  ema50?: { time: number; value: number }[];
  vwap?: { time: number; value: number }[];
}

// Generate mock candle data for when backend is unavailable
function generateMockCandles(symbol: string, count = 100): CandleData[] {
  const seed = symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 1);
  const basePrice = 100 + (seed % 400);
  const candles: CandleData[] = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);

  for (let i = count; i >= 0; i--) {
    const time = now - i * 60 * 60; // hourly
    const change = (Math.random() - 0.48) * price * 0.02;
    const open = price;
    price = Math.max(1, price + change);
    const high = Math.max(open, price) * (1 + Math.random() * 0.005);
    const low = Math.min(open, price) * (1 - Math.random() * 0.005);
    const volume = Math.floor(1_000_000 + Math.random() * 10_000_000);

    candles.push({ time, open, high, low, close: price, volume });
  }
  return candles;
}

function generateMockEMAs(candles: CandleData[], period: number): { time: number; value: number }[] {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  return candles.map((c) => {
    ema = c.close * k + ema * (1 - k);
    return { time: c.time, value: ema };
  });
}

export default function StockChart({ symbol, height = 300, showVolume = true, showEMAs = true }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const seriesRef = useRef<unknown>(null);
  const volSeriesRef = useRef<unknown>(null);
  const ema9Ref = useRef<unknown>(null);
  const ema20Ref = useRef<unknown>(null);
  const ema50Ref = useRef<unknown>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ price: number; time: string; change: number } | null>(null);

  useEffect(() => {
    let chart: unknown = null;

    const initChart = async () => {
      if (!containerRef.current) return;

      try {
        // Dynamically import lightweight-charts
        const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');

        const container = containerRef.current;
        const chartHeight = showVolume ? Math.floor(height * 0.72) : height;

        chart = createChart(container, {
          width: container.clientWidth,
          height: chartHeight,
          layout: {
            background: { type: ColorType.Solid, color: '#111318' },
            textColor: '#64748b',
            fontSize: 11,
          },
          grid: {
            vertLines: { color: '#1e2028', style: 1 },
            horzLines: { color: '#1e2028', style: 1 },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: '#2d303e', labelBackgroundColor: '#1e2028' },
            horzLine: { color: '#2d303e', labelBackgroundColor: '#1e2028' },
          },
          rightPriceScale: {
            borderColor: '#1e2028',
            textColor: '#64748b',
          },
          timeScale: {
            borderColor: '#1e2028',
            textColor: '#64748b',
            timeVisible: true,
            secondsVisible: false,
          },
        });

        chartRef.current = chart;

        // Candlestick series
        const candleSeries = (chart as ReturnType<typeof createChart>).addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderUpColor: '#10b981',
          borderDownColor: '#ef4444',
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        });
        seriesRef.current = candleSeries;

        // Volume series
        let volumeSeries: unknown = null;
        if (showVolume) {
          volumeSeries = (chart as ReturnType<typeof createChart>).addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
          });
          (chart as ReturnType<typeof createChart>).priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
          volSeriesRef.current = volumeSeries;
        }

        // EMA lines
        let ema9Series: unknown = null;
        let ema20Series: unknown = null;
        let ema50Series: unknown = null;

        if (showEMAs) {
          ema9Series = (chart as ReturnType<typeof createChart>).addLineSeries({
            color: '#06b6d4',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          ema20Series = (chart as ReturnType<typeof createChart>).addLineSeries({
            color: '#8b5cf6',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          ema50Series = (chart as ReturnType<typeof createChart>).addLineSeries({
            color: '#f59e0b',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          ema9Ref.current = ema9Series;
          ema20Ref.current = ema20Series;
          ema50Ref.current = ema50Series;
        }

        // Fetch data
        let candles: CandleData[];
        let indicators: IndicatorData = {};

        try {
          const [candleRes, indicatorRes] = await Promise.allSettled([
            axios.get<CandleData[]>(`/api/stock/${symbol}/history`),
            axios.get<IndicatorData>(`/api/stock/${symbol}/indicators`),
          ]);

          if (candleRes.status === 'fulfilled' && candleRes.value.data.length > 0) {
            candles = candleRes.value.data;
          } else {
            candles = generateMockCandles(symbol);
          }

          if (indicatorRes.status === 'fulfilled') {
            indicators = indicatorRes.value.data;
          }
        } catch {
          candles = generateMockCandles(symbol);
        }

        // Set candlestick data
        const sortedCandles = [...candles].sort((a, b) => (a.time as number) - (b.time as number));

        candleSeries.setData(
          sortedCandles.map((c) => ({
            time: c.time as number,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );

        // Set volume data
        if (volumeSeries && showVolume) {
          (volumeSeries as ReturnType<typeof (chart as ReturnType<typeof createChart>).addHistogramSeries>).setData(
            sortedCandles.map((c) => ({
              time: c.time as number,
              value: c.volume || 0,
              color: c.close >= c.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            }))
          );
        }

        // Set EMA data
        if (showEMAs) {
          const ema9Data = indicators.ema9 || generateMockEMAs(sortedCandles, 9);
          const ema20Data = indicators.ema20 || generateMockEMAs(sortedCandles, 20);
          const ema50Data = indicators.ema50 || generateMockEMAs(sortedCandles, 50);

          if (ema9Series) (ema9Series as ReturnType<typeof (chart as ReturnType<typeof createChart>).addLineSeries>).setData(ema9Data);
          if (ema20Series) (ema20Series as ReturnType<typeof (chart as ReturnType<typeof createChart>).addLineSeries>).setData(ema20Data);
          if (ema50Series) (ema50Series as ReturnType<typeof (chart as ReturnType<typeof createChart>).addLineSeries>).setData(ema50Data);
        }

        // Crosshair handler
        (chart as ReturnType<typeof createChart>).subscribeCrosshairMove((param) => {
          if (param.point && param.seriesData) {
            const data = param.seriesData.get(candleSeries) as { close: number; time: number } | undefined;
            if (data) {
              const firstClose = sortedCandles[0].close;
              setHovered({
                price: data.close,
                time: new Date((param.time as number) * 1000).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
                }),
                change: ((data.close - firstClose) / firstClose) * 100,
              });
            }
          } else {
            setHovered(null);
          }
        });

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
          if (container && chart) {
            (chart as ReturnType<typeof createChart>).applyOptions({ width: container.clientWidth });
          }
        });
        resizeObserver.observe(container);

        (chart as ReturnType<typeof createChart>).timeScale().fitContent();
        setLoading(false);
        setError(null);

        return () => {
          resizeObserver.disconnect();
        };
      } catch (err) {
        console.error('[StockChart] Error:', err);
        setError('Failed to load chart');
        setLoading(false);
      }
    };

    const cleanup = initChart();

    return () => {
      cleanup.then((cleanupFn) => cleanupFn?.());
      if (chart) {
        try {
          (chart as { remove: () => void }).remove();
        } catch {}
      }
      chartRef.current = null;
    };
  }, [symbol, height, showVolume, showEMAs]);

  return (
    <div className="chart-container relative" style={{ height: `${height}px` }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-card rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-terminal-text-secondary">Loading chart...</span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-card rounded-lg">
          <div className="text-center">
            <p className="text-sm text-terminal-red">{error}</p>
            <p className="text-xs text-terminal-text-secondary mt-1">Check backend connection</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full" />
      {showEMAs && !loading && (
        <div className="absolute top-2 left-2 flex items-center gap-3 bg-terminal-bg/80 px-2 py-1 rounded text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#06b6d4] inline-block" /> EMA9</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#8b5cf6] inline-block" /> EMA20</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f59e0b] inline-block" /> EMA50</span>
        </div>
      )}
      {hovered && (
        <div className="absolute top-2 right-2 bg-terminal-bg/90 border border-terminal-border rounded px-2 py-1 text-[10px] text-right">
          <div className="text-terminal-text-secondary">{hovered.time}</div>
          <div className="font-mono text-terminal-text-primary">${hovered.price.toFixed(2)}</div>
          <div className={hovered.change >= 0 ? 'text-terminal-green' : 'text-terminal-red'}>
            {hovered.change >= 0 ? '+' : ''}{hovered.change.toFixed(2)}%
          </div>
        </div>
      )}
    </div>
  );
}
