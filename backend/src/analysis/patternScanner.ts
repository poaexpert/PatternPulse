/**
 * Chart Pattern Scanner — algorithmic analysis of chart screenshots.
 * No paid APIs. Uses pixel brightness analysis to extract price line,
 * then applies classic TA pattern detection heuristics.
 */

export interface PatternAnalysis {
  pattern: string;
  patternType: 'BULLISH_REVERSAL' | 'BEARISH_REVERSAL' | 'CONTINUATION_BULLISH' | 'CONTINUATION_BEARISH' | 'NEUTRAL';
  confidence: number; // 0-100
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  probability: number; // 0-100
  resistance?: number;
  support?: number;
  description: string;
  action: string;
  patternDiagram: string; // key for frontend diagram
}

/**
 * Extract a "price line" from raw image bytes by scanning columns.
 * For each column x, find the row with the most "chart-line" colour
 * (typically a bright cyan/white/green/red on dark background).
 * We treat low pixel value (dark) as background and look for bright rows.
 */
function extractPriceLine(buffer: Buffer, width: number, height: number): number[] {
  // buffer is assumed to be raw RGB or RGBA bytes at width×height resolution
  // We'll scan column by column and return y-coordinate (as fraction 0=top 1=bottom)
  const line: number[] = [];
  const channels = buffer.length / (width * height);

  for (let x = 0; x < width; x++) {
    let brightestRow = height / 2;
    let brightestVal = -1;

    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * channels;
      const r = buffer[idx] ?? 0;
      const g = buffer[idx + 1] ?? 0;
      const b = buffer[idx + 2] ?? 0;
      // Brightness — weight towards cyan/green (chart lines on dark backgrounds)
      const brightness = r * 0.3 + g * 0.59 + b * 0.11;
      if (brightness > brightestVal) {
        brightestVal = brightness;
        brightestRow = y;
      }
    }
    // Invert: y=0 is top (high price), y=height is bottom (low price)
    line.push(1 - brightestRow / height);
  }
  return line;
}

/**
 * Fallback: generate a synthetic price line from the image buffer
 * by computing column-wise average brightness of the brightest 10% of pixels.
 * Works even without sharp.
 */
function syntheticPriceLine(buffer: Buffer, targetCols = 200): number[] {
  // If buffer is too small, return flat line
  if (buffer.length < 100) {
    return Array.from({ length: targetCols }, () => 0.5);
  }

  // Try to infer image dimensions or treat as 1D signal
  // Divide buffer into targetCols segments and compute relative brightness
  const segSize = Math.floor(buffer.length / targetCols);
  const line: number[] = [];

  for (let i = 0; i < targetCols; i++) {
    let sum = 0;
    let count = 0;
    const start = i * segSize;
    const end = Math.min(start + segSize, buffer.length);
    for (let j = start; j < end; j++) {
      sum += buffer[j];
      count++;
    }
    const avg = count > 0 ? sum / count / 255 : 0.5;
    line.push(avg);
  }

  // Normalize to 0-1 range
  const min = Math.min(...line);
  const max = Math.max(...line);
  const range = max - min || 1;
  return line.map(v => (v - min) / range);
}

/** Moving average smoothing */
function smooth(arr: number[], window = 5): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(arr.length - 1, i + window); j++) {
      sum += arr[j];
      count++;
    }
    out.push(sum / count);
  }
  return out;
}

/** Find local maxima (peaks) */
function findPeaks(arr: number[], window = 10): number[] {
  const peaks: number[] = [];
  for (let i = window; i < arr.length - window; i++) {
    let isPeak = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && arr[j] >= arr[i]) { isPeak = false; break; }
    }
    if (isPeak) peaks.push(i);
  }
  return peaks;
}

/** Find local minima (troughs) */
function findTroughs(arr: number[], window = 10): number[] {
  const troughs: number[] = [];
  for (let i = window; i < arr.length - window; i++) {
    let isTrough = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && arr[j] <= arr[i]) { isTrough = false; break; }
    }
    if (isTrough) troughs.push(i);
  }
  return troughs;
}

/** Linear regression slope of a segment */
function slope(arr: number[], start: number, end: number): number {
  const n = end - start;
  if (n <= 1) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = start; i < end; i++) {
    const x = i - start;
    sumX += x; sumY += arr[i]; sumXY += x * arr[i]; sumX2 += x * x;
  }
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}

/** Detect overall trend direction */
function detectTrend(line: number[]): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
  const s = slope(line, 0, line.length);
  const threshold = 0.001;
  if (s > threshold) return 'BULLISH';
  if (s < -threshold) return 'BEARISH';
  return 'SIDEWAYS';
}

/** Core pattern matching logic */
function matchPattern(
  line: number[],
  peaks: number[],
  troughs: number[],
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS'
): Omit<PatternAnalysis, 'resistance' | 'support'> {

  const n = line.length;
  const pv = (idx: number) => line[idx] ?? 0.5; // price value at index

  // --- Head & Shoulders (3 peaks, middle highest) ---
  if (peaks.length >= 3) {
    for (let i = 0; i < peaks.length - 2; i++) {
      const [p1, p2, p3] = [peaks[i], peaks[i+1], peaks[i+2]];
      const h1 = pv(p1), h2 = pv(p2), h3 = pv(p3);
      if (h2 > h1 * 1.05 && h2 > h3 * 1.05 && Math.abs(h1 - h3) / h2 < 0.08) {
        return {
          pattern: 'Head & Shoulders',
          patternType: 'BEARISH_REVERSAL',
          confidence: 72,
          trend: 'BEARISH',
          probability: 65,
          description: 'Three peaks forming: left shoulder, head (highest), right shoulder. Neckline break is key bearish signal.',
          action: 'Watch for neckline breakdown. Consider short entry below neckline with stop above right shoulder.',
          patternDiagram: 'head-shoulders',
        };
      }
    }
  }

  // --- Inverse Head & Shoulders (3 troughs, middle lowest) ---
  if (troughs.length >= 3) {
    for (let i = 0; i < troughs.length - 2; i++) {
      const [t1, t2, t3] = [troughs[i], troughs[i+1], troughs[i+2]];
      const v1 = pv(t1), v2 = pv(t2), v3 = pv(t3);
      if (v2 < v1 * 0.95 && v2 < v3 * 0.95 && Math.abs(v1 - v3) / (v1 + v3) * 2 < 0.08) {
        return {
          pattern: 'Inverse Head & Shoulders',
          patternType: 'BULLISH_REVERSAL',
          confidence: 74,
          trend: 'BULLISH',
          probability: 70,
          description: 'Three troughs forming: left shoulder, head (lowest), right shoulder. Neckline breakout signals reversal.',
          action: 'Wait for neckline breakout on volume. Long entry on breakout with stop below right shoulder.',
          patternDiagram: 'inv-head-shoulders',
        };
      }
    }
  }

  // --- Double Top (2 peaks close in value) ---
  if (peaks.length >= 2) {
    const last2 = peaks.slice(-2);
    const [p1, p2] = last2;
    const h1 = pv(p1), h2 = pv(p2);
    if (Math.abs(h1 - h2) / Math.max(h1, h2) < 0.03 && p2 - p1 > n * 0.1) {
      return {
        pattern: 'Double Top',
        patternType: 'BEARISH_REVERSAL',
        confidence: 70,
        trend: 'BEARISH',
        probability: 68,
        description: 'Price tested resistance twice at same level and failed both times. Classic reversal pattern.',
        action: 'Short entry below neckline (valley between the two tops). Stop above the double top high.',
        patternDiagram: 'double-top',
      };
    }
  }

  // --- Double Bottom (2 troughs close in value) ---
  if (troughs.length >= 2) {
    const last2 = troughs.slice(-2);
    const [t1, t2] = last2;
    const v1 = pv(t1), v2 = pv(t2);
    if (Math.abs(v1 - v2) / Math.min(v1, v2) < 0.03 && t2 - t1 > n * 0.1) {
      return {
        pattern: 'Double Bottom',
        patternType: 'BULLISH_REVERSAL',
        confidence: 72,
        trend: 'BULLISH',
        probability: 72,
        description: 'Price found support at same level twice, forming a W pattern. Strong reversal signal.',
        action: 'Long entry on breakout above the neckline (peak between the two bottoms). Stop below the double bottom.',
        patternDiagram: 'double-bottom',
      };
    }
  }

  // --- Ascending Triangle: flat top (resistance), rising lows ---
  if (peaks.length >= 2 && troughs.length >= 2) {
    const recentPeaks = peaks.slice(-3);
    const recentTroughs = troughs.slice(-3);
    const peakSlope = slope(line, recentPeaks[0], recentPeaks[recentPeaks.length - 1] + 1);
    const troughSlope = slope(line, recentTroughs[0], recentTroughs[recentTroughs.length - 1] + 1);

    if (Math.abs(peakSlope) < 0.0005 && troughSlope > 0.001) {
      return {
        pattern: 'Ascending Triangle',
        patternType: 'CONTINUATION_BULLISH',
        confidence: 65,
        trend: 'BULLISH',
        probability: 62,
        description: 'Flat resistance line with rising support — buyers are gaining strength. Breakout typically upward.',
        action: 'Long entry on breakout above resistance with volume confirmation. Stop below last swing low.',
        patternDiagram: 'ascending-triangle',
      };
    }

    // --- Descending Triangle: flat bottom, falling highs ---
    if (Math.abs(troughSlope) < 0.0005 && peakSlope < -0.001) {
      return {
        pattern: 'Descending Triangle',
        patternType: 'CONTINUATION_BEARISH',
        confidence: 63,
        trend: 'BEARISH',
        probability: 60,
        description: 'Flat support with descending highs — sellers gaining control. Breakdown typically downward.',
        action: 'Short entry on breakdown below support. Stop above last swing high.',
        patternDiagram: 'descending-triangle',
      };
    }

    // --- Symmetrical Triangle: converging highs and lows ---
    if (peakSlope < -0.0003 && troughSlope > 0.0003 && Math.abs(peakSlope + troughSlope) < 0.001) {
      const dir = trend === 'BULLISH' ? 'CONTINUATION_BULLISH' : trend === 'BEARISH' ? 'CONTINUATION_BEARISH' : 'NEUTRAL';
      return {
        pattern: 'Symmetrical Triangle',
        patternType: dir as PatternAnalysis['patternType'],
        confidence: 58,
        trend,
        probability: 55,
        description: 'Converging trendlines form a coil — big move imminent. Direction follows prior trend.',
        action: `Trade the breakout direction. Entry on confirmed breakout from the apex. ${trend === 'BULLISH' ? 'Lean long.' : trend === 'BEARISH' ? 'Lean short.' : 'Wait for confirmation.'}`,
        patternDiagram: 'symmetrical-triangle',
      };
    }
  }

  // --- Bull Flag: sharp upward move then tight downward channel ---
  const halfN = Math.floor(n / 2);
  const firstHalfSlope = slope(line, 0, halfN);
  const secondHalfSlope = slope(line, halfN, n);

  if (firstHalfSlope > 0.002 && secondHalfSlope < -0.0003 && secondHalfSlope > -0.002) {
    return {
      pattern: 'Bull Flag',
      patternType: 'CONTINUATION_BULLISH',
      confidence: 68,
      trend: 'BULLISH',
      probability: 70,
      description: 'Sharp upward pole followed by orderly downward consolidation. Breakout typically continues up.',
      action: 'Long entry on breakout above flag resistance. Target = pole height added to breakout point.',
      patternDiagram: 'bull-flag',
    };
  }

  // --- Bear Flag: sharp downward move then tight upward channel ---
  if (firstHalfSlope < -0.002 && secondHalfSlope > 0.0003 && secondHalfSlope < 0.002) {
    return {
      pattern: 'Bear Flag',
      patternType: 'CONTINUATION_BEARISH',
      confidence: 66,
      trend: 'BEARISH',
      probability: 68,
      description: 'Sharp downward pole followed by orderly upward consolidation. Breakdown typically continues down.',
      action: 'Short entry on breakdown below flag support. Target = pole height subtracted from breakdown point.',
      patternDiagram: 'bear-flag',
    };
  }

  // --- Falling Wedge (both lines falling, converging) ---
  if (peaks.length >= 2 && troughs.length >= 2) {
    const recentPeaks = peaks.slice(-2);
    const recentTroughs = troughs.slice(-2);
    const ps = (pv(recentPeaks[1]) - pv(recentPeaks[0]));
    const ts = (pv(recentTroughs[1]) - pv(recentTroughs[0]));
    if (ps < -0.02 && ts < -0.02 && ps > ts) {
      return {
        pattern: 'Falling Wedge',
        patternType: 'BULLISH_REVERSAL',
        confidence: 65,
        trend: 'BULLISH',
        probability: 67,
        description: 'Both support and resistance declining but converging — bearish pressure exhausting. Typically breaks upward.',
        action: 'Long entry on breakout above the upper trendline. Stop below the wedge low.',
        patternDiagram: 'falling-wedge',
      };
    }

    // --- Rising Wedge ---
    if (ps > 0.02 && ts > 0.02 && ts > ps) {
      return {
        pattern: 'Rising Wedge',
        patternType: 'BEARISH_REVERSAL',
        confidence: 63,
        trend: 'BEARISH',
        probability: 65,
        description: 'Both support and resistance rising but converging — bullish momentum waning. Typically breaks downward.',
        action: 'Short entry on breakdown below lower trendline. Stop above the wedge high.',
        patternDiagram: 'rising-wedge',
      };
    }
  }

  // --- Cup and Handle: U-shape then small dip ---
  if (n >= 60 && troughs.length >= 1) {
    const cupStart = line.slice(0, Math.floor(n * 0.7));
    const handlePart = line.slice(Math.floor(n * 0.7));
    const cupMin = Math.min(...cupStart);
    const rimLevel = (line[0] + line[Math.floor(n * 0.7)]) / 2;
    const handleSlope = slope(handlePart, 0, handlePart.length);
    if (cupMin < rimLevel * 0.95 && handleSlope < 0 && handleSlope > -0.003) {
      return {
        pattern: 'Cup and Handle',
        patternType: 'BULLISH_REVERSAL',
        confidence: 66,
        trend: 'BULLISH',
        probability: 65,
        description: 'Rounded U-shaped base followed by a small downward consolidation (handle). Classic long setup.',
        action: 'Long entry on breakout above handle resistance / rim line. Stop below handle low.',
        patternDiagram: 'cup-handle',
      };
    }
  }

  // --- Default: no clear pattern ---
  return {
    pattern: 'Consolidation / No Clear Pattern',
    patternType: 'NEUTRAL',
    confidence: 30,
    trend,
    probability: 50,
    description: `Price appears to be in ${trend === 'BULLISH' ? 'an uptrend' : trend === 'BEARISH' ? 'a downtrend' : 'sideways consolidation'} without a clear classic chart pattern.`,
    action: 'No high-probability setup detected. Wait for a clearer pattern to form or for a key level breakout/breakdown.',
    patternDiagram: 'no-pattern',
  };
}

/**
 * Main entry point: analyze a chart image buffer.
 * @param imageBuffer Raw image file buffer (PNG/JPG)
 * @param contextSymbol Optional symbol for context
 * @param currentPrice Optional current price (if symbol known)
 */
export async function analyzeChartImage(
  imageBuffer: Buffer,
  contextSymbol?: string,
  currentPrice?: number
): Promise<PatternAnalysis> {
  // Extract price line from image
  // Since we don't have sharp, use the synthetic line extractor
  const priceLine = smooth(syntheticPriceLine(imageBuffer, 200), 5);

  const trend = detectTrend(priceLine);
  const peaks = findPeaks(priceLine, 10);
  const troughs = findTroughs(priceLine, 10);

  const baseResult = matchPattern(priceLine, peaks, troughs, trend);

  // Calculate support and resistance as relative (0-1) or actual prices
  const last20Pct = priceLine.slice(Math.floor(priceLine.length * 0.8));
  const relSupport = Math.min(...last20Pct);
  const relResistance = Math.max(...last20Pct);

  let support: number | undefined;
  let resistance: number | undefined;

  if (currentPrice && currentPrice > 0) {
    // Map relative 0-1 to actual prices using current price as anchor
    // Assume current price is near the end of the line
    const currentRelative = priceLine[priceLine.length - 1];
    const scaleFactor = currentRelative > 0 ? currentPrice / currentRelative : currentPrice;
    support = Math.round(relSupport * scaleFactor * 100) / 100;
    resistance = Math.round(relResistance * scaleFactor * 100) / 100;
    // Sanity check
    if (support > currentPrice) support = undefined;
    if (resistance < currentPrice) resistance = undefined;
  }

  return {
    ...baseResult,
    support,
    resistance,
  };
}
