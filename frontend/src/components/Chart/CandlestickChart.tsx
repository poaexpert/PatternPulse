import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  createChart,
  CrosshairMode,
  LineStyle,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SwingSetup {
  exists: boolean;
  direction: string;
  entry?: number | null;
  stopLoss?: number | null;
  target1?: number | null;
  target2?: number | null;
}

interface CandlestickChartProps {
  symbol: string;
  timeframe?: string;
  swingSetup?: SwingSetup;
  height?: number;
}

// Map timeframe to history API param
function getHistoryParam(tf: string): { interval?: string; period?: string } {
  if (tf === '15m') return { interval: '15m' };
  if (tf === '1h') return { interval: 'h' };
  if (tf === '4h') return { interval: '4h' };
  return { period: '3mo' };
}

// Convert a date string or ISO string to UTCTimestamp (seconds)
function toTs(dateStr: string): UTCTimestamp {
  return Math.floor(new Date(dateStr).getTime() / 1000) as UTCTimestamp;
}

const CHART_THEME = {
  bg: '#0a0e1a',
  border: '#1e2740',
  text: '#8892a4',
  up: '#4ade80',
  down: '#f87171',
  ema9: '#f59e0b',
  ema20: '#38bdf8',
  ema50: '#a78bfa',
  volume: '#374151',
};

export default function CandlestickChart({ symbol, timeframe = '1d', swingSetup, height = 300 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [barCount, setBarCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Destroy old chart if exists
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleRef.current = null;
    }

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_THEME.bg },
        textColor: CHART_THEME.text,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_THEME.border },
        horzLines: { color: CHART_THEME.border },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#4ade8055', labelBackgroundColor: '#1e2740' },
        horzLine: { color: '#4ade8055', labelBackgroundColor: '#1e2740' },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: timeframe !== '1d',
        secondsVisible: false,
        rightOffset: 8,
      },
      width: container.offsetWidth,
      height,
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: CHART_THEME.up,
      downColor: CHART_THEME.down,
      borderUpColor: CHART_THEME.up,
      borderDownColor: CHART_THEME.down,
      wickUpColor: CHART_THEME.up,
      wickDownColor: CHART_THEME.down,
    });
    candleRef.current = candleSeries;

    const ema9Series = chart.addLineSeries({
      color: CHART_THEME.ema9,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const ema20Series = chart.addLineSeries({
      color: CHART_THEME.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const ema50Series = chart.addLineSeries({
      color: CHART_THEME.ema50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const volumeSeries = chart.addHistogramSeries({
      color: CHART_THEME.volume,
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // Fetch OHLCV data
    const { interval, period } = getHistoryParam(timeframe);
    const sym = encodeURIComponent(symbol);
    const url = interval
      ? `/api/stock/${sym}/history?interval=${interval}`
      : `/api/stock/${sym}/history?period=${period}`;

    setLoading(true);
    setError(null);

    axios.get<{ bars: OHLCVBar[] }>(url)
      .then(({ data }) => {
        const bars = data.bars ?? [];
        if (bars.length < 5) {
          setError('Not enough data to display chart');
          setLoading(false);
          return;
        }

        // Candlestick data
        const candleData = bars.map((b) => ({
          time: toTs(b.date),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        }));

        // Volume data
        const volData = bars.map((b) => ({
          time: toTs(b.date),
          value: b.volume,
          color: b.close >= b.open ? '#4ade8030' : '#f8717130',
        }));

        // EMA calculations
        const ema = (closes: number[], period: number) => {
          const k = 2 / (period + 1);
          const result: number[] = [];
          let val = closes[0];
          for (const c of closes) {
            val = c * k + val * (1 - k);
            result.push(val);
          }
          return result;
        };

        const closes = bars.map((b) => b.close);
        const e9 = ema(closes, 9);
        const e20 = ema(closes, 20);
        const e50 = ema(closes, 50);

        const ema9Data = bars.map((b, i) => ({ time: toTs(b.date), value: e9[i] }));
        const ema20Data = bars.map((b, i) => ({ time: toTs(b.date), value: e20[i] }));
        const ema50Data = bars.map((b, i) => ({ time: toTs(b.date), value: e50[i] }));

        candleSeries.setData(candleData);
        volumeSeries.setData(volData);
        ema9Series.setData(ema9Data.slice(9));
        ema20Series.setData(ema20Data.slice(20));
        ema50Series.setData(ema50Data.slice(50));

        // Entry / Stop / Target price lines
        if (swingSetup?.exists && swingSetup.direction !== 'NONE') {
          const isLong = swingSetup.direction === 'LONG';
          if (swingSetup.entry != null) {
            candleSeries.createPriceLine({
              price: swingSetup.entry,
              color: '#22d3ee',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'ENTRY',
            });
          }
          if (swingSetup.stopLoss != null) {
            candleSeries.createPriceLine({
              price: swingSetup.stopLoss,
              color: '#f87171',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: 'STOP',
            });
          }
          if (swingSetup.target1 != null) {
            candleSeries.createPriceLine({
              price: swingSetup.target1,
              color: isLong ? '#4ade80' : '#f87171',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: 'T1',
            });
          }
          if (swingSetup.target2 != null) {
            candleSeries.createPriceLine({
              price: swingSetup.target2,
              color: isLong ? '#4ade80' : '#f87171',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: 'T2',
            });
          }
        }

        chart.timeScale().fitContent();
        setBarCount(bars.length);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load chart data');
        setLoading(false);
      });

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      if (entries[0] && chartRef.current) {
        chartRef.current.applyOptions({ width: entries[0].contentRect.width });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  return (
    <div className="bg-[#0a0e1a] rounded-xl border border-terminal-border overflow-hidden">
      {/* Chart header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-terminal-text-primary font-mono">{symbol}</span>
          <span className="text-[10px] text-terminal-text-secondary bg-terminal-border/50 px-1.5 py-0.5 rounded">{timeframe.toUpperCase()}</span>
          {!loading && barCount > 0 && (
            <span className="text-[10px] text-terminal-text-secondary">{barCount} bars</span>
          )}
        </div>
        {/* EMA legend */}
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ background: CHART_THEME.ema9 }} />EMA9</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ background: CHART_THEME.ema20 }} />EMA20</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ background: CHART_THEME.ema50 }} />EMA50</span>
        </div>
      </div>

      {/* Chart container */}
      <div className="relative">
        <div ref={containerRef} style={{ height }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e1a]/80">
            <div className="flex items-center gap-2 text-terminal-text-secondary text-xs">
              <div className="w-3 h-3 border border-terminal-cyan/50 border-t-terminal-cyan rounded-full animate-spin" />
              Loading chart…
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e1a]/80">
            <p className="text-terminal-text-secondary text-xs">{error}</p>
          </div>
        )}
      </div>

      {/* Price line legend if swing setup */}
      {swingSetup?.exists && swingSetup.direction !== 'NONE' && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-terminal-border text-[10px]">
          {swingSetup.entry != null && <span className="flex items-center gap-1 text-terminal-cyan"><span className="w-4 border-t border-dashed border-terminal-cyan inline-block" />Entry {swingSetup.entry.toFixed(2)}</span>}
          {swingSetup.stopLoss != null && <span className="flex items-center gap-1 text-terminal-red"><span className="w-4 border-t border-dotted border-terminal-red inline-block" />Stop {swingSetup.stopLoss.toFixed(2)}</span>}
          {swingSetup.target1 != null && <span className="flex items-center gap-1 text-terminal-green"><span className="w-4 border-t border-dotted border-terminal-green inline-block" />T1 {swingSetup.target1.toFixed(2)}</span>}
          {swingSetup.target2 != null && <span className="flex items-center gap-1 text-terminal-green">T2 {swingSetup.target2.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}
