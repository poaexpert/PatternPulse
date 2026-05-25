/**
 * Technical indicators implemented from scratch for PatternPulse.
 * All functions handle edge cases gracefully (return empty array / null when not enough data).
 */

// ─── Simple Moving Average ────────────────────────────────────────────────────
export function calculateSMA(closes: number[], period: number): number[] {
  if (!closes || closes.length < period) return [];
  const result: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

// ─── Exponential Moving Average ──────────────────────────────────────────────
export function calculateEMA(closes: number[], period: number): number[] {
  if (!closes || closes.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];

  // Seed with SMA of first `period` bars
  const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(seed);

  for (let i = period; i < closes.length; i++) {
    result.push(closes[i] * k + result[result.length - 1] * (1 - k));
  }
  return result;
}

// ─── RSI (Wilder's smoothing) ─────────────────────────────────────────────────
export function calculateRSI(closes: number[], period = 14): number[] {
  if (!closes || closes.length < period + 1) return [];

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  if (gains.length < period) return [];

  // Initial averages (simple average for first period)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const rsiValues: number[] = [];

  // First RSI value
  const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0));

  // Wilder's smoothing for subsequent values
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }

  return rsiValues;
}

// ─── MACD (12, 26, 9) ─────────────────────────────────────────────────────────
export function calculateMACD(closes: number[]): { value: number; signal: number; histogram: number }[] {
  if (!closes || closes.length < 35) return []; // need at least 26 + 9

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  // Align: ema26 starts at index 25 of closes, ema12 starts at index 11
  // ema26.length = closes.length - 25
  // ema12.length = closes.length - 11
  // macdLine aligns from the start of ema26
  const offset = 26 - 12; // = 14 bars difference
  const macdLine: number[] = [];

  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }

  if (macdLine.length < 9) return [];

  // Signal line = 9-period EMA of MACD line
  const signalLine = calculateEMA(macdLine, 9);
  const signalOffset = 9 - 1; // index offset into macdLine

  const result: { value: number; signal: number; histogram: number }[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    const macdVal = macdLine[i + signalOffset];
    const sigVal = signalLine[i];
    result.push({
      value: macdVal,
      signal: sigVal,
      histogram: macdVal - sigVal,
    });
  }

  return result;
}

// ─── Bollinger Bands (20, 2) ──────────────────────────────────────────────────
export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2
): { upper: number; middle: number; lower: number; width: number; percentB: number }[] {
  if (!closes || closes.length < period) return [];

  const result: { upper: number; middle: number; lower: number; width: number; percentB: number }[] = [];

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);

    const upper = mean + stdDevMultiplier * sd;
    const lower = mean - stdDevMultiplier * sd;
    const width = mean !== 0 ? (upper - lower) / mean : 0;
    const percentB = upper !== lower ? (closes[i] - lower) / (upper - lower) : 0.5;

    result.push({ upper, middle: mean, lower, width, percentB });
  }

  return result;
}

// ─── ATR (Average True Range) ─────────────────────────────────────────────────
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number[] {
  if (!highs || highs.length < period + 1) return [];

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return [];

  // Initial ATR: simple average
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [atr];

  // Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push(atr);
  }

  return result;
}

// ─── Volume Ratio ─────────────────────────────────────────────────────────────
export function calculateVolumeRatio(volumes: number[], currentVolume: number, period = 20): number {
  if (!volumes || volumes.length === 0) return 1;
  const slice = volumes.slice(-Math.min(period, volumes.length));
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
  return avg > 0 ? currentVolume / avg : 1;
}

// ─── VWAP (simplified using daily OHLCV) ─────────────────────────────────────
export function calculateVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[]
): number[] {
  if (!highs || highs.length === 0) return [];

  const result: number[] = [];
  let cumulativePV = 0;
  let cumulativeVol = 0;

  for (let i = 0; i < highs.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    cumulativePV += typicalPrice * volumes[i];
    cumulativeVol += volumes[i];
    result.push(cumulativeVol > 0 ? cumulativePV / cumulativeVol : typicalPrice);
  }

  return result;
}

// ─── Stochastic RSI ───────────────────────────────────────────────────────────
export function calculateStochRSI(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14
): { k: number; d: number }[] {
  const rsiValues = calculateRSI(closes, rsiPeriod);
  if (rsiValues.length < stochPeriod) return [];

  const kValues: number[] = [];

  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    const k = high !== low ? ((rsiValues[i] - low) / (high - low)) * 100 : 50;
    kValues.push(k);
  }

  if (kValues.length < 3) return kValues.map((k) => ({ k, d: k }));

  // D = 3-period SMA of K
  const result: { k: number; d: number }[] = [];
  for (let i = 2; i < kValues.length; i++) {
    const d = (kValues[i - 2] + kValues[i - 1] + kValues[i]) / 3;
    result.push({ k: kValues[i], d });
  }

  return result;
}

// ─── BB Squeeze Detection (BB inside Keltner Channel) ────────────────────────
export function detectSqueeze(highs: number[], lows: number[], closes: number[]): boolean {
  if (!closes || closes.length < 20) return false;

  const bb = calculateBollingerBands(closes, 20, 2);
  if (bb.length === 0) return false;

  const atr = calculateATR(highs, lows, closes, 20);
  if (atr.length === 0) return false;

  const latestBB = bb[bb.length - 1];
  const latestATR = atr[atr.length - 1];
  const latestClose = closes[closes.length - 1];

  // Keltner channel (1.5x ATR)
  const ema20 = calculateEMA(closes, 20);
  if (ema20.length === 0) return false;
  const mid = ema20[ema20.length - 1];
  const kcUpper = mid + 1.5 * latestATR;
  const kcLower = mid - 1.5 * latestATR;

  // Squeeze: BB inside KC
  return latestBB.upper < kcUpper && latestBB.lower > kcLower;
}

// ─── Momentum Score (-10 to +10) ─────────────────────────────────────────────
export function calculateMomentumScore(closes: number[]): number {
  if (!closes || closes.length < 20) return 0;

  let score = 0;

  // 5-day return
  if (closes.length >= 5) {
    const ret5 = (closes[closes.length - 1] / closes[closes.length - 5] - 1) * 100;
    if (ret5 > 5) score += 3;
    else if (ret5 > 2) score += 2;
    else if (ret5 > 0) score += 1;
    else if (ret5 < -5) score -= 3;
    else if (ret5 < -2) score -= 2;
    else if (ret5 < 0) score -= 1;
  }

  // 20-day return
  if (closes.length >= 20) {
    const ret20 = (closes[closes.length - 1] / closes[closes.length - 20] - 1) * 100;
    if (ret20 > 10) score += 3;
    else if (ret20 > 5) score += 2;
    else if (ret20 > 0) score += 1;
    else if (ret20 < -10) score -= 3;
    else if (ret20 < -5) score -= 2;
    else if (ret20 < 0) score -= 1;
  }

  // RSI momentum
  const rsi = calculateRSI(closes, 14);
  if (rsi.length > 0) {
    const latestRSI = rsi[rsi.length - 1];
    if (latestRSI > 70) score += 2;
    else if (latestRSI > 60) score += 1;
    else if (latestRSI < 30) score -= 2;
    else if (latestRSI < 40) score -= 1;
  }

  // EMA alignment (bullish stack: 9 > 20 > 50)
  const ema9 = calculateEMA(closes, 9);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  if (ema9.length > 0 && ema20.length > 0 && ema50.length > 0) {
    const e9 = ema9[ema9.length - 1];
    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    if (e9 > e20 && e20 > e50) score += 2;
    else if (e9 < e20 && e20 < e50) score -= 2;
  }

  // Clamp to -10..+10
  return Math.max(-10, Math.min(10, score));
}

// ─── Fibonacci Retracement Levels ────────────────────────────────────────────
export function calculateFibLevels(
  swingHigh: number,
  swingLow: number
): { level: number; price: number; label: string }[] {
  const range = swingHigh - swingLow;
  const fibs = [
    { level: 0, label: '0% (Low)' },
    { level: 0.236, label: '23.6%' },
    { level: 0.382, label: '38.2%' },
    { level: 0.5, label: '50%' },
    { level: 0.618, label: '61.8%' },
    { level: 0.786, label: '78.6%' },
    { level: 1, label: '100% (High)' },
    { level: 1.272, label: '127.2% (Ext)' },
    { level: 1.618, label: '161.8% (Ext)' },
  ];

  return fibs.map(({ level, label }) => ({
    level,
    price: swingLow + range * level,
    label,
  }));
}
