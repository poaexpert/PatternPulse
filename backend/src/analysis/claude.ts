// Claude AI removed — use technicalAnalysis.ts for free analysis
export interface ChartAnalysis {
  trend: {
    direction: 'UP' | 'DOWN' | 'SIDEWAYS';
    strength: 'STRONG' | 'MODERATE' | 'WEAK';
    structure: string;
  };
  topBottomSignal: {
    type: 'TOP' | 'BOTTOM' | 'NONE';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string;
  };
  keyLevels: {
    support: number[];
    resistance: number[];
    keyLevel: number | null;
  };
  patterns: {
    name: string;
    implication: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    completion: 'COMPLETE' | 'FORMING' | 'PARTIAL';
    target: number | null;
  }[];
  swingSetup: {
    exists: boolean;
    direction: 'LONG' | 'SHORT' | 'NONE';
    entry: number | null;
    stopLoss: number | null;
    target1: number | null;
    target2: number | null;
    riskReward: number | null;
    timeframe: string;
    description: string;
  };
  indicators: {
    rsiSignal: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL' | 'DIVERGENCE_BULLISH' | 'DIVERGENCE_BEARISH';
    macdSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    volumeSignal: 'SURGE' | 'DECLINING' | 'NORMAL';
    summary: string;
  };
  signalStrength: number;
  summary: string;
  warnings: string[];
  analysedAt: Date;
  source: 'image' | 'data';
}

export function getClient() { return null; }
export async function analyzeChartImage(): Promise<ChartAnalysis> {
  throw new Error('Claude AI removed. Use technicalAnalysis.ts instead.');
}
export async function analyzeChartData(): Promise<ChartAnalysis> {
  throw new Error('Claude AI removed. Use technicalAnalysis.ts instead.');
}
