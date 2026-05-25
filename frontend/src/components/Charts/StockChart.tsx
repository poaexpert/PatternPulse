import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { CandleData } from '../../types';

interface StockChartProps {
  symbol: string;
  height?: number;
  showVolume?: boolean;
  showEMAs?: boolean;
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

function generateEMA(candles: CandleData[], period: number): { time: number; value: number }[] {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  return candles.map((c) => {
    ema = c.close * k + ema * (1 - k);
    return { time: c.time as number, value: ema };
  });
}

export default function StockChart({ symbol, height = 300, showVolume = true, showEMAs = true }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<{ remove: () => void } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredInfo, setHoveredInfo] = useState<{ price: number; time: string; change: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const initChart = async () => {
      try {
        const lwc = await import('lightweight-charts');
        const { createChart, ColorType, CrosshairMode } = lwc;

        if (cancelled || !containerRef.current) return;

        const container = containerRef.current;
        const chartHeight = showVolume ? Math.floor(height * 0.72) : height;

        const chart = createChart(container, {
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
          rightPriceScale: { borderColor: '#1e2028', textColor: '#64748b' },
          timeScale: {
            borderColor: '#1e2028',
            textColor: '#64748b',
            timeVisible: true,
            secondsVisible: false,
          },
        });

        chartInstanceRef.current = chart;

        // Candlestick series
        const candleSeries = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderUpColor: '#10b981',
          borderDownColor: '#ef4444',
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        });

        // Volume series
        let volumeSeries: ReturnType<typeof chart.addHistogramSeries> | null = null;
        if (showVolume) {
          volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
          });
          chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }

        // EMA lines
        let ema9Series: ReturnType<typeof chart.addLineSeries> | null = null;
        let ema20Series: ReturnType<typeof chart.addLineSeries> | null = null;
        let ema50Series: ReturnType<typeof chart.addLineSeries> | null = null;

        if (showEMAs) {
          ema9Series = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
          ema20Series = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
          ema50Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        }

        // Fetch data
        let candles: CandleData[];

        try {
          const candleRes = await axios.get<CandleData[]>(`/api/stock/${symbol}/history`);
          candles = candleRes.data.length > 0 ? candleRes.data : generateMockCandles(symbol);
        } catch {
          candles = generateMockCandles(symbol);
        }

        if (cancelled) return;

        const sortedCandles = [...candles].sort((a, b) => (a.time as number) - (b.time as number));

        // Set candlestick data
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
        if (volumeSeries) {
          volumeSeries.setData(
            sortedCandles.map((c) => ({
              time: c.time as number,
              value: c.volume ?? 0,
              color: c.close >= c.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            }))
          );
        }

        // Set EMA data
        if (showEMAs && ema9Series && ema20Series && ema50Series) {
          ema9Series.setData(generateEMA(sortedCandles, 9));
          ema20Series.setData(generateEMA(sortedCandles, 20));
          ema50Series.setData(generateEMA(sortedCandles, 50));
        }

        // Crosshair hover handler
        const firstClose = sortedCandles[0]?.close ?? 0;
        chart.subscribeCrosshairMove((param) => {
          if (param.point && param.time && param.seriesData.size > 0) {
            const barData = param.seriesData.get(candleSeries);
            if (barData && 'close' in barData) {
              const closePrice = (barData as { close: number }).close;
              setHoveredInfo({
                price: closePrice,
                time: new Date((param.time as number) * 1000).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
                }),
                change: firstClose > 0 ? ((closePrice - firstClose) / firstClose) * 100 : 0,
              });
            }
          } else {
            setHoveredInfo(null);
          }
        });

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
          if (!cancelled && container) {
            chart.applyOptions({ width: container.clientWidth });
          }
        });
        resizeObserver.observe(container);

        chart.timeScale().fitContent();
        if (!cancelled) {
          setLoading(false);
          setError(null);
        }

        return () => {
          resizeObserver.disconnect();
        };
      } catch (err) {
        if (!cancelled) {
          console.error('[StockChart] Error:', err);
          setError('Failed to load chart');
          setLoading(false);
        }
      }
    };

    const cleanupPromise = initChart();

    return () => {
      cancelled = true;
      cleanupPromise.then((fn) => fn?.());
      if (chartInstanceRef.current) {
        try { chartInstanceRef.current.remove(); } catch { /* ignore */ }
        chartInstanceRef.current = null;
      }
    };
  }, [symbol, height, showVolume, showEMAs]);

  return (
    <div className="chart-container relative rounded-lg overflow-hidden" style={{ minHeight: `${height}px` }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-card">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-terminal-text-secondary">Loading chart...</span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-card">
          <div className="text-center">
            <p className="text-sm text-terminal-red">{error}</p>
            <p className="text-xs text-terminal-text-secondary mt-1">Check backend connection</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full" />
      {showEMAs && !loading && !error && (
        <div className="absolute top-2 left-2 flex items-center gap-3 bg-terminal-bg/80 backdrop-blur-sm px-2 py-1 rounded text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#06b6d4] inline-block rounded" /> EMA9</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#8b5cf6] inline-block rounded" /> EMA20</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f59e0b] inline-block rounded" /> EMA50</span>
        </div>
      )}
      {hoveredInfo && (
        <div className="absolute top-2 right-2 bg-terminal-bg/90 border border-terminal-border rounded px-2 py-1 text-[10px] text-right pointer-events-none">
          <div className="text-terminal-text-secondary">{hoveredInfo.time}</div>
          <div className="font-mono text-terminal-text-primary font-semibold">${hoveredInfo.price.toFixed(2)}</div>
          <div className={hoveredInfo.change >= 0 ? 'text-terminal-green' : 'text-terminal-red'}>
            {hoveredInfo.change >= 0 ? '+' : ''}{hoveredInfo.change.toFixed(2)}%
          </div>
        </div>
      )}
    </div>
  );
}
