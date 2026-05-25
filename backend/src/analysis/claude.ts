import Anthropic from '@anthropic-ai/sdk';
import { OHLCVBar } from '../data/market';
import { IndicatorValues } from '../types';

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
  signalStrength: number; // 1-10
  summary: string;
  warnings: string[];
  analysedAt: Date;
  source: 'image' | 'data';
}

let client: Anthropic | null = null;

function initClient(): Anthropic | null {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function getClient(): Anthropic | null {
  return initClient();
}

const ANALYSIS_PROMPT = (context?: string) => `You are an elite professional trader and technical analyst with 20+ years of experience trading stocks, futures, and options. Analyze this chart with extreme precision.

${context ? `Trader's note: ${context}\n\n` : ''}Focus your analysis on:

1. **TOP/BOTTOM DETECTION**: Is price near a significant reversal point?
   - RSI divergences (price vs momentum)
   - Volume climax/selling exhaustion
   - Pattern completions at key levels
   - Extended moves from moving averages (mean reversion setups)

2. **SWING TRADE SETUP**: High-probability entry if one exists
   - Clear direction (LONG/SHORT)
   - Specific entry zone
   - Stop loss below/above key structural level
   - Target 1 (minimum 1.5:1 R:R) and Target 2 (2.5:1+ R:R)

3. **KEY PRICE LEVELS**: Exact support/resistance prices visible on this chart

4. **MARKET STRUCTURE**: Is price making higher highs/lows (bullish) or lower highs/lows (bearish)?

5. **CHART PATTERNS**: Any recognizable patterns with completion status

Respond in this EXACT JSON format (no other text):
{
  "trend": { "direction": "UP|DOWN|SIDEWAYS", "strength": "STRONG|MODERATE|WEAK", "structure": "description" },
  "topBottomSignal": { "type": "TOP|BOTTOM|NONE", "confidence": "HIGH|MEDIUM|LOW", "reasoning": "specific technical reasons" },
  "keyLevels": { "support": [price1, price2], "resistance": [price1, price2], "keyLevel": price_or_null },
  "patterns": [{ "name": "pattern name", "implication": "BULLISH|BEARISH|NEUTRAL", "completion": "COMPLETE|FORMING|PARTIAL", "target": price_or_null }],
  "swingSetup": { "exists": true/false, "direction": "LONG|SHORT|NONE", "entry": price_or_null, "stopLoss": price_or_null, "target1": price_or_null, "target2": price_or_null, "riskReward": number_or_null, "timeframe": "Daily|4H|1H|etc", "description": "setup description" },
  "indicators": { "rsiSignal": "OVERSOLD|OVERBOUGHT|NEUTRAL|DIVERGENCE_BULLISH|DIVERGENCE_BEARISH", "macdSignal": "BULLISH|BEARISH|NEUTRAL", "volumeSignal": "SURGE|DECLINING|NORMAL", "summary": "indicator summary" },
  "signalStrength": 1-10,
  "summary": "2-3 sentence actionable trader summary",
  "warnings": ["risk or caveat"]
}`;

function parseAnalysisResponse(text: string, source: 'image' | 'data'): ChartAnalysis {
  // Extract JSON from the response - handle potential markdown code blocks
  let jsonText = text.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  // Find the JSON object
  const jsonStart = jsonText.indexOf('{');
  const jsonEnd = jsonText.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    jsonText = jsonText.slice(jsonStart, jsonEnd + 1);
  }

  const parsed = JSON.parse(jsonText);

  // Validate and normalize the parsed data with fallbacks
  return {
    trend: {
      direction: parsed.trend?.direction ?? 'SIDEWAYS',
      strength: parsed.trend?.strength ?? 'WEAK',
      structure: parsed.trend?.structure ?? 'Unable to determine market structure',
    },
    topBottomSignal: {
      type: parsed.topBottomSignal?.type ?? 'NONE',
      confidence: parsed.topBottomSignal?.confidence ?? 'LOW',
      reasoning: parsed.topBottomSignal?.reasoning ?? 'No significant reversal signal detected',
    },
    keyLevels: {
      support: Array.isArray(parsed.keyLevels?.support) ? parsed.keyLevels.support : [],
      resistance: Array.isArray(parsed.keyLevels?.resistance) ? parsed.keyLevels.resistance : [],
      keyLevel: parsed.keyLevels?.keyLevel ?? null,
    },
    patterns: Array.isArray(parsed.patterns)
      ? parsed.patterns.map((p: { name?: string; implication?: string; completion?: string; target?: number | null }) => ({
          name: p.name ?? 'Unknown',
          implication: p.implication ?? 'NEUTRAL',
          completion: p.completion ?? 'PARTIAL',
          target: p.target ?? null,
        }))
      : [],
    swingSetup: {
      exists: parsed.swingSetup?.exists ?? false,
      direction: parsed.swingSetup?.direction ?? 'NONE',
      entry: parsed.swingSetup?.entry ?? null,
      stopLoss: parsed.swingSetup?.stopLoss ?? null,
      target1: parsed.swingSetup?.target1 ?? null,
      target2: parsed.swingSetup?.target2 ?? null,
      riskReward: parsed.swingSetup?.riskReward ?? null,
      timeframe: parsed.swingSetup?.timeframe ?? 'Daily',
      description: parsed.swingSetup?.description ?? 'No swing setup identified',
    },
    indicators: {
      rsiSignal: parsed.indicators?.rsiSignal ?? 'NEUTRAL',
      macdSignal: parsed.indicators?.macdSignal ?? 'NEUTRAL',
      volumeSignal: parsed.indicators?.volumeSignal ?? 'NORMAL',
      summary: parsed.indicators?.summary ?? 'Indicators are neutral',
    },
    signalStrength: typeof parsed.signalStrength === 'number' ? Math.min(10, Math.max(1, Math.round(parsed.signalStrength))) : 5,
    summary: parsed.summary ?? 'Analysis complete. No strong signals detected.',
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    analysedAt: new Date(),
    source,
  };
}

export async function analyzeChartImage(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
  context?: string
): Promise<ChartAnalysis> {
  const anthropic = initClient();
  if (!anthropic) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Please set it in your environment variables.');
  }

  const prompt = ANALYSIS_PROMPT(context);

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response received from Claude');
  }

  try {
    return parseAnalysisResponse(textBlock.text, 'image');
  } catch (err) {
    throw new Error(`Failed to parse Claude's analysis response: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function analyzeChartData(
  symbol: string,
  ohlcv: OHLCVBar[],
  indicators: IndicatorValues,
  timeframe?: string
): Promise<ChartAnalysis> {
  const anthropic = initClient();
  if (!anthropic) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Please set it in your environment variables.');
  }

  // Use last 50 bars
  const bars = ohlcv.slice(-50);

  // Format bars as a table
  const barTable = bars
    .map((b) => {
      const dateStr = b.date instanceof Date ? b.date.toISOString().split('T')[0] : String(b.date);
      return `${dateStr} | O:${b.open.toFixed(2)} H:${b.high.toFixed(2)} L:${b.low.toFixed(2)} C:${b.close.toFixed(2)} V:${b.volume.toLocaleString()}`;
    })
    .join('\n');

  // Format indicators
  const indicatorText = [
    indicators.rsi14 !== undefined ? `RSI(14): ${indicators.rsi14.toFixed(2)}` : null,
    indicators.macd ? `MACD: ${indicators.macd.value.toFixed(3)}, Signal: ${indicators.macd.signal.toFixed(3)}, Hist: ${indicators.macd.histogram.toFixed(3)}` : null,
    indicators.bb ? `BB: Upper ${indicators.bb.upper.toFixed(2)}, Mid ${indicators.bb.middle.toFixed(2)}, Lower ${indicators.bb.lower.toFixed(2)}, %B: ${indicators.bb.percentB.toFixed(2)}` : null,
    indicators.ema9 !== undefined ? `EMA9: ${indicators.ema9.toFixed(2)}` : null,
    indicators.ema20 !== undefined ? `EMA20: ${indicators.ema20.toFixed(2)}` : null,
    indicators.ema50 !== undefined ? `EMA50: ${indicators.ema50.toFixed(2)}` : null,
    indicators.ema200 !== undefined ? `EMA200: ${indicators.ema200.toFixed(2)}` : null,
    indicators.vwap !== undefined ? `VWAP: ${indicators.vwap.toFixed(2)}` : null,
    indicators.atr !== undefined ? `ATR: ${indicators.atr.toFixed(2)}` : null,
    indicators.volumeRatio !== undefined ? `Volume Ratio: ${indicators.volumeRatio.toFixed(2)}x avg` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const currentBar = bars[bars.length - 1];
  const currentPrice = currentBar?.close ?? 0;

  const dataPrompt = `You are an elite professional trader and technical analyst with 20+ years of experience trading stocks, futures, and options. Analyze this market data with extreme precision.

Symbol: ${symbol}
Timeframe: ${timeframe ?? 'Daily'}
Current Price: ${currentPrice.toFixed(2)}

=== OHLCV DATA (Last ${bars.length} bars) ===
Date       | OHLCV
${barTable}

=== CURRENT INDICATOR VALUES ===
${indicatorText || 'No indicator data available'}

Focus your analysis on:

1. **TOP/BOTTOM DETECTION**: Is price near a significant reversal point?
   - RSI divergences (price vs momentum)
   - Volume climax/selling exhaustion
   - Pattern completions at key levels
   - Extended moves from moving averages (mean reversion setups)

2. **SWING TRADE SETUP**: High-probability entry if one exists
   - Clear direction (LONG/SHORT)
   - Specific entry zone
   - Stop loss below/above key structural level
   - Target 1 (minimum 1.5:1 R:R) and Target 2 (2.5:1+ R:R)

3. **KEY PRICE LEVELS**: Exact support/resistance levels from the data

4. **MARKET STRUCTURE**: Is price making higher highs/lows (bullish) or lower highs/lows (bearish)?

5. **CHART PATTERNS**: Any recognizable patterns with completion status

Respond in this EXACT JSON format (no other text):
{
  "trend": { "direction": "UP|DOWN|SIDEWAYS", "strength": "STRONG|MODERATE|WEAK", "structure": "description" },
  "topBottomSignal": { "type": "TOP|BOTTOM|NONE", "confidence": "HIGH|MEDIUM|LOW", "reasoning": "specific technical reasons" },
  "keyLevels": { "support": [price1, price2], "resistance": [price1, price2], "keyLevel": price_or_null },
  "patterns": [{ "name": "pattern name", "implication": "BULLISH|BEARISH|NEUTRAL", "completion": "COMPLETE|FORMING|PARTIAL", "target": price_or_null }],
  "swingSetup": { "exists": true/false, "direction": "LONG|SHORT|NONE", "entry": price_or_null, "stopLoss": price_or_null, "target1": price_or_null, "target2": price_or_null, "riskReward": number_or_null, "timeframe": "Daily|4H|1H|etc", "description": "setup description" },
  "indicators": { "rsiSignal": "OVERSOLD|OVERBOUGHT|NEUTRAL|DIVERGENCE_BULLISH|DIVERGENCE_BEARISH", "macdSignal": "BULLISH|BEARISH|NEUTRAL", "volumeSignal": "SURGE|DECLINING|NORMAL", "summary": "indicator summary" },
  "signalStrength": 1-10,
  "summary": "2-3 sentence actionable trader summary",
  "warnings": ["risk or caveat"]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: dataPrompt,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response received from Claude');
  }

  try {
    return parseAnalysisResponse(textBlock.text, 'data');
  } catch (err) {
    throw new Error(`Failed to parse Claude's analysis response: ${err instanceof Error ? err.message : String(err)}`);
  }
}
