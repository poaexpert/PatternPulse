import { OHLCVBar } from '../data/market';

export interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
  date: Date;
  volume: number;
  significance: number; // 1-10 based on how many bars it dominated
}

export interface Divergence {
  type: 'BULLISH' | 'BEARISH' | 'HIDDEN_BULLISH' | 'HIDDEN_BEARISH';
  priceSwing1: number;
  priceSwing2: number;
  indicatorSwing1: number;
  indicatorSwing2: number;
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  barsAgo: number;
  description: string;
}

export interface SwingAnalysis {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  lastSwingHigh: SwingPoint | null;
  lastSwingLow: SwingPoint | null;
  currentTrend: 'UP' | 'DOWN' | 'SIDEWAYS';
  trendStrength: number; // 1-10
  rsiDivergences: Divergence[];
  nearSwingHigh: boolean; // price within 2% of last swing high
  nearSwingLow: boolean;  // price within 2% of last swing low
  potentialTop: boolean;  // near high AND bearish divergence
  potentialBottom: boolean; // near low AND bullish divergence
  topConfidence: number;   // 0-100
  bottomConfidence: number; // 0-100
  fibLevels: { level: number; price: number; label: string }[];
}

/**
 * Detect swing highs and lows in bar data using multiple lookback periods.
 * A bar[i] is a swing high if bars[i].high > all highs in [i-lookback, i) AND > all highs in (i, i+lookback].
 * Uses lookbacks 3, 5, 8 to assign significance.
 */
export function detectSwingPoints(
  bars: OHLCVBar[],
  lookback = 5
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  if (!bars || bars.length < lookback * 2 + 1) {
    return { highs, lows };
  }

  const lookbacks = [3, 5, 8];

  // Build significance maps: index -> significance score
  const highSignificance: Record<number, number> = {};
  const lowSignificance: Record<number, number> = {};

  for (const lb of lookbacks) {
    for (let i = lb; i < bars.length - lb; i++) {
      const currentHigh = bars[i].high;
      const currentLow = bars[i].low;

      // Check swing high
      let isSwingHigh = true;
      for (let j = i - lb; j < i; j++) {
        if (bars[j].high >= currentHigh) {
          isSwingHigh = false;
          break;
        }
      }
      if (isSwingHigh) {
        for (let j = i + 1; j <= i + lb; j++) {
          if (bars[j].high >= currentHigh) {
            isSwingHigh = false;
            break;
          }
        }
      }

      if (isSwingHigh) {
        // Higher significance for larger lookbacks (lb 3 = +1, lb 5 = +2, lb 8 = +3)
        const sigAdd = lb === 3 ? 1 : lb === 5 ? 2 : 3;
        highSignificance[i] = (highSignificance[i] ?? 0) + sigAdd;
      }

      // Check swing low
      let isSwingLow = true;
      for (let j = i - lb; j < i; j++) {
        if (bars[j].low <= currentLow) {
          isSwingLow = false;
          break;
        }
      }
      if (isSwingLow) {
        for (let j = i + 1; j <= i + lb; j++) {
          if (bars[j].low <= currentLow) {
            isSwingLow = false;
            break;
          }
        }
      }

      if (isSwingLow) {
        const sigAdd = lb === 3 ? 1 : lb === 5 ? 2 : 3;
        lowSignificance[i] = (lowSignificance[i] ?? 0) + sigAdd;
      }
    }
  }

  // Build SwingPoint arrays from detected indices
  for (const [idxStr, rawSig] of Object.entries(highSignificance)) {
    const i = parseInt(idxStr, 10);
    // Scale significance to 1-10 (max raw = 1+2+3=6)
    const significance = Math.min(10, Math.round((rawSig / 6) * 10));
    highs.push({
      index: i,
      price: bars[i].high,
      type: 'HIGH',
      date: bars[i].date,
      volume: bars[i].volume,
      significance,
    });
  }

  for (const [idxStr, rawSig] of Object.entries(lowSignificance)) {
    const i = parseInt(idxStr, 10);
    const significance = Math.min(10, Math.round((rawSig / 6) * 10));
    lows.push({
      index: i,
      price: bars[i].low,
      type: 'LOW',
      date: bars[i].date,
      volume: bars[i].volume,
      significance,
    });
  }

  // Sort by index
  highs.sort((a, b) => a.index - b.index);
  lows.sort((a, b) => a.index - b.index);

  return { highs, lows };
}

/**
 * Detect RSI divergences by comparing last 2 swing highs (bearish) and last 2 swing lows (bullish).
 */
export function detectRSIDivergence(bars: OHLCVBar[], rsiValues: number[]): Divergence[] {
  const divergences: Divergence[] = [];

  if (!bars || bars.length < 10 || !rsiValues || rsiValues.length < 10) {
    return divergences;
  }

  // Align RSI to bars — rsiValues may be shorter (shifted right due to period warmup)
  // Assume rsiValues[i] corresponds to bars[bars.length - rsiValues.length + i]
  const offset = bars.length - rsiValues.length;

  const { highs, lows } = detectSwingPoints(bars);

  // Filter swing points that have RSI data
  const highsWithRSI = highs.filter((h) => h.index >= offset);
  const lowsWithRSI = lows.filter((l) => l.index >= offset);

  // ── Bearish divergence: last 2 swing highs ─────────────────────────────────
  if (highsWithRSI.length >= 2) {
    const h1 = highsWithRSI[highsWithRSI.length - 2]; // earlier swing high
    const h2 = highsWithRSI[highsWithRSI.length - 1]; // more recent swing high

    const rsiH1 = rsiValues[h1.index - offset];
    const rsiH2 = rsiValues[h2.index - offset];

    if (rsiH1 !== undefined && rsiH2 !== undefined) {
      // Bearish: price higher high, RSI lower high
      if (h2.price > h1.price && rsiH2 < rsiH1) {
        const rsiDiff = Math.abs(rsiH1 - rsiH2);
        const strength: 'STRONG' | 'MODERATE' | 'WEAK' =
          rsiDiff > 5 ? 'STRONG' : rsiDiff >= 2 ? 'MODERATE' : 'WEAK';
        divergences.push({
          type: 'BEARISH',
          priceSwing1: h1.price,
          priceSwing2: h2.price,
          indicatorSwing1: rsiH1,
          indicatorSwing2: rsiH2,
          strength,
          barsAgo: bars.length - 1 - h2.index,
          description: `Bearish divergence: price made higher high (${h1.price.toFixed(2)} → ${h2.price.toFixed(2)}) but RSI made lower high (${rsiH1.toFixed(1)} → ${rsiH2.toFixed(1)}). Momentum weakening at top.`,
        });
      }

      // Hidden bearish: price lower high, RSI higher high (continuation down)
      if (h2.price < h1.price && rsiH2 > rsiH1) {
        const rsiDiff = Math.abs(rsiH2 - rsiH1);
        const strength: 'STRONG' | 'MODERATE' | 'WEAK' =
          rsiDiff > 5 ? 'STRONG' : rsiDiff >= 2 ? 'MODERATE' : 'WEAK';
        divergences.push({
          type: 'HIDDEN_BEARISH',
          priceSwing1: h1.price,
          priceSwing2: h2.price,
          indicatorSwing1: rsiH1,
          indicatorSwing2: rsiH2,
          strength,
          barsAgo: bars.length - 1 - h2.index,
          description: `Hidden bearish divergence: price made lower high (${h1.price.toFixed(2)} → ${h2.price.toFixed(2)}) but RSI made higher high (${rsiH1.toFixed(1)} → ${rsiH2.toFixed(1)}). Downtrend continuation signal.`,
        });
      }
    }
  }

  // ── Bullish divergence: last 2 swing lows ──────────────────────────────────
  if (lowsWithRSI.length >= 2) {
    const l1 = lowsWithRSI[lowsWithRSI.length - 2]; // earlier swing low
    const l2 = lowsWithRSI[lowsWithRSI.length - 1]; // more recent swing low

    const rsiL1 = rsiValues[l1.index - offset];
    const rsiL2 = rsiValues[l2.index - offset];

    if (rsiL1 !== undefined && rsiL2 !== undefined) {
      // Bullish: price lower low, RSI higher low
      if (l2.price < l1.price && rsiL2 > rsiL1) {
        const rsiDiff = Math.abs(rsiL2 - rsiL1);
        const strength: 'STRONG' | 'MODERATE' | 'WEAK' =
          rsiDiff > 5 ? 'STRONG' : rsiDiff >= 2 ? 'MODERATE' : 'WEAK';
        divergences.push({
          type: 'BULLISH',
          priceSwing1: l1.price,
          priceSwing2: l2.price,
          indicatorSwing1: rsiL1,
          indicatorSwing2: rsiL2,
          strength,
          barsAgo: bars.length - 1 - l2.index,
          description: `Bullish divergence: price made lower low (${l1.price.toFixed(2)} → ${l2.price.toFixed(2)}) but RSI made higher low (${rsiL1.toFixed(1)} → ${rsiL2.toFixed(1)}). Momentum strengthening at bottom.`,
        });
      }

      // Hidden bullish: price higher low, RSI lower low (continuation up)
      if (l2.price > l1.price && rsiL2 < rsiL1) {
        const rsiDiff = Math.abs(rsiL1 - rsiL2);
        const strength: 'STRONG' | 'MODERATE' | 'WEAK' =
          rsiDiff > 5 ? 'STRONG' : rsiDiff >= 2 ? 'MODERATE' : 'WEAK';
        divergences.push({
          type: 'HIDDEN_BULLISH',
          priceSwing1: l1.price,
          priceSwing2: l2.price,
          indicatorSwing1: rsiL1,
          indicatorSwing2: rsiL2,
          strength,
          barsAgo: bars.length - 1 - l2.index,
          description: `Hidden bullish divergence: price made higher low (${l1.price.toFixed(2)} → ${l2.price.toFixed(2)}) but RSI made lower low (${rsiL1.toFixed(1)} → ${rsiL2.toFixed(1)}). Uptrend continuation signal.`,
        });
      }
    }
  }

  return divergences;
}

/**
 * Calculate Fibonacci retracement levels between a swing high and swing low.
 */
function calculateFibLevels(
  swingHigh: number,
  swingLow: number
): { level: number; price: number; label: string }[] {
  const range = swingHigh - swingLow;
  const fibRatios = [
    { level: 0, label: '0% (Low)' },
    { level: 0.236, label: '23.6%' },
    { level: 0.382, label: '38.2%' },
    { level: 0.5, label: '50%' },
    { level: 0.618, label: '61.8% (Golden)' },
    { level: 0.786, label: '78.6%' },
    { level: 1, label: '100% (High)' },
  ];

  return fibRatios.map(({ level, label }) => ({
    level,
    price: swingLow + range * level,
    label,
  }));
}

/**
 * Main function: analyze swing structure, trend, divergences, and reversal potential.
 */
export function analyzeSwings(
  bars: OHLCVBar[],
  rsiValues: number[],
  currentPrice: number
): SwingAnalysis {
  const { highs: swingHighs, lows: swingLows } = detectSwingPoints(bars);

  // Last swing high and low
  const lastSwingHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : null;
  const lastSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;

  // ── Trend determination ────────────────────────────────────────────────────
  let currentTrend: 'UP' | 'DOWN' | 'SIDEWAYS' = 'SIDEWAYS';
  let trendStrength = 5;

  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const prevHigh = swingHighs[swingHighs.length - 2];
    const prevLow = swingLows[swingLows.length - 2];

    const higherHighs = lastSwingHigh !== null && lastSwingHigh.price > prevHigh.price;
    const higherLows = lastSwingLow !== null && lastSwingLow.price > prevLow.price;
    const lowerHighs = lastSwingHigh !== null && lastSwingHigh.price < prevHigh.price;
    const lowerLows = lastSwingLow !== null && lastSwingLow.price < prevLow.price;

    if (higherHighs && higherLows) {
      currentTrend = 'UP';
      // Strength based on magnitude of moves
      const highGain =
        lastSwingHigh !== null
          ? ((lastSwingHigh.price - prevHigh.price) / prevHigh.price) * 100
          : 0;
      trendStrength = Math.min(10, Math.max(5, Math.round(5 + highGain)));
    } else if (lowerHighs && lowerLows) {
      currentTrend = 'DOWN';
      const lowDrop =
        lastSwingLow !== null
          ? ((prevLow.price - lastSwingLow.price) / prevLow.price) * 100
          : 0;
      trendStrength = Math.min(10, Math.max(5, Math.round(5 + lowDrop)));
    } else {
      currentTrend = 'SIDEWAYS';
      trendStrength = 3;
    }
  } else if (swingHighs.length >= 1 && swingLows.length >= 1 && lastSwingHigh && lastSwingLow) {
    // Only one swing high/low each — use simple price vs levels
    if (currentPrice > lastSwingHigh.price * 0.98) {
      currentTrend = 'UP';
      trendStrength = 5;
    } else if (currentPrice < lastSwingLow.price * 1.02) {
      currentTrend = 'DOWN';
      trendStrength = 5;
    }
  }

  // ── RSI divergence detection ───────────────────────────────────────────────
  const rsiDivergences = detectRSIDivergence(bars, rsiValues);

  // ── Proximity checks ───────────────────────────────────────────────────────
  const nearSwingHigh =
    lastSwingHigh !== null && Math.abs(currentPrice - lastSwingHigh.price) / lastSwingHigh.price <= 0.02;
  const nearSwingLow =
    lastSwingLow !== null && Math.abs(currentPrice - lastSwingLow.price) / lastSwingLow.price <= 0.02;

  // Current RSI (last value)
  const currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

  // ── Bearish/bullish divergence flags ──────────────────────────────────────
  const hasBearishDivergence = rsiDivergences.some(
    (d) => d.type === 'BEARISH' && d.barsAgo <= 10
  );
  const hasBullishDivergence = rsiDivergences.some(
    (d) => d.type === 'BULLISH' && d.barsAgo <= 10
  );

  const potentialTop = nearSwingHigh && (hasBearishDivergence || currentRSI > 70);
  const potentialBottom = nearSwingLow && (hasBullishDivergence || currentRSI < 30);

  // ── Confidence scoring ─────────────────────────────────────────────────────
  let topConfidence = 0;
  let bottomConfidence = 0;

  if (nearSwingHigh) {
    topConfidence += 25;
    if (currentRSI > 70) topConfidence += 20;
    if (currentRSI > 80) topConfidence += 15;
    if (hasBearishDivergence) {
      const div = rsiDivergences.find((d) => d.type === 'BEARISH');
      if (div?.strength === 'STRONG') topConfidence += 30;
      else if (div?.strength === 'MODERATE') topConfidence += 20;
      else topConfidence += 10;
    }
    // Volume check: if last bar has lower volume (exhaustion)
    if (bars.length >= 3) {
      const lastVol = bars[bars.length - 1].volume;
      const prevVol = bars[bars.length - 2].volume;
      if (lastVol < prevVol * 0.7) topConfidence += 10; // volume declining = exhaustion
    }
  }

  if (nearSwingLow) {
    bottomConfidence += 25;
    if (currentRSI < 30) bottomConfidence += 20;
    if (currentRSI < 20) bottomConfidence += 15;
    if (hasBullishDivergence) {
      const div = rsiDivergences.find((d) => d.type === 'BULLISH');
      if (div?.strength === 'STRONG') bottomConfidence += 30;
      else if (div?.strength === 'MODERATE') bottomConfidence += 20;
      else bottomConfidence += 10;
    }
    if (bars.length >= 3) {
      const lastVol = bars[bars.length - 1].volume;
      const prevVol = bars[bars.length - 2].volume;
      if (lastVol > prevVol * 1.5) bottomConfidence += 10; // volume surge = capitulation
    }
  }

  topConfidence = Math.min(100, topConfidence);
  bottomConfidence = Math.min(100, bottomConfidence);

  // ── Fibonacci levels ───────────────────────────────────────────────────────
  let fibLevels: { level: number; price: number; label: string }[] = [];
  if (lastSwingHigh && lastSwingLow) {
    fibLevels = calculateFibLevels(lastSwingHigh.price, lastSwingLow.price);
  }

  return {
    swingHighs,
    swingLows,
    lastSwingHigh,
    lastSwingLow,
    currentTrend,
    trendStrength,
    rsiDivergences,
    nearSwingHigh,
    nearSwingLow,
    potentialTop,
    potentialBottom,
    topConfidence,
    bottomConfidence,
    fibLevels,
  };
}
