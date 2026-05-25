import { useStore } from '../../store';
import { formatPercent, getChangeColor } from '../../utils/formatters';

interface SparklineProps {
  change: number;
  color: string;
}

function Sparkline({ change, color }: SparklineProps) {
  // Generate a plausible sparkline based on the direction/magnitude of change
  const points = generateSparklinePoints(change);
  const minY = Math.min(...points);
  const maxY = Math.max(...points);
  const range = maxY - minY || 1;
  const w = 80;
  const h = 30;

  const pathD = points
    .map((y, i) => {
      const x = (i / (points.length - 1)) * w;
      const scaledY = h - ((y - minY) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x},${scaledY}`;
    })
    .join(' ');

  const areaD = pathD + ` L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-20 h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`}/>
      <path d={pathD} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function generateSparklinePoints(endChange: number): number[] {
  const numPoints = 20;
  const points: number[] = [];
  let current = 100;

  for (let i = 0; i < numPoints - 1; i++) {
    const noise = (Math.random() - 0.5) * 0.5;
    const trend = (endChange / 100 / numPoints) * (i / numPoints);
    current += noise + trend;
    points.push(current);
  }
  // Ensure end point reflects actual change
  points.push(100 + endChange * 0.3);
  return points;
}

interface IndexCardProps {
  symbol: string;
  name: string;
  change: number;
  level?: number;
  isVix?: boolean;
}

function IndexCard({ symbol, name, change, level, isVix }: IndexCardProps) {
  const isPositive = change >= 0;
  const color = isVix
    ? change > 20 ? '#ef4444' : '#10b981'
    : isPositive ? '#10b981' : '#ef4444';

  const changeColor = isVix
    ? change > 20 ? 'text-terminal-red' : 'text-terminal-green'
    : getChangeColor(isPositive ? 1 : -1);

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4 flex items-center justify-between hover:border-terminal-border-light transition-colors">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-terminal-text-primary">{symbol}</span>
          <span className="text-xs text-terminal-text-secondary truncate hidden sm:block">{name}</span>
        </div>
        {level !== undefined && (
          <span className="text-lg font-bold font-mono text-terminal-text-primary">
            {level.toFixed(2)}
          </span>
        )}
        <div className={`flex items-center gap-1 text-sm font-semibold ${changeColor}`}>
          <span>{isPositive ? '▲' : '▼'}</span>
          <span>{formatPercent(Math.abs(change))}</span>
        </div>
      </div>
      <div className="shrink-0 ml-3">
        <Sparkline change={change} color={color} />
      </div>
    </div>
  );
}

export default function MarketOverview() {
  const { marketStatus } = useStore();

  const spyChange = marketStatus?.spyChange ?? 0.42;
  const qqqChange = marketStatus?.qqqChange ?? -0.18;
  const iwmChange = marketStatus?.iwmChange ?? 0.33;
  const vixLevel = marketStatus?.vixLevel ?? 18.5;

  // Approximate index levels (in a real app these would come from the API)
  const spyLevel = 478.5 * (1 + spyChange / 100);
  const qqqLevel = 412.3 * (1 + qqqChange / 100);
  const iwmLevel = 198.7 * (1 + iwmChange / 100);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <IndexCard
        symbol="SPY"
        name="S&P 500 ETF"
        change={spyChange}
        level={spyLevel}
      />
      <IndexCard
        symbol="QQQ"
        name="Nasdaq 100 ETF"
        change={qqqChange}
        level={qqqLevel}
      />
      <IndexCard
        symbol="IWM"
        name="Russell 2000 ETF"
        change={iwmChange}
        level={iwmLevel}
      />
      <IndexCard
        symbol="VIX"
        name="Volatility Index"
        change={vixLevel - 18}
        level={vixLevel}
        isVix
      />
    </div>
  );
}
