import { Router, Request, Response } from 'express';
import multer from 'multer';
import { analyzeChartImage, analyzeChartData, getClient } from '../analysis/claude';
import { fetchHistoricalData } from '../data/market';
import * as indicators from '../indicators';
import { store } from '../store';
import { logError } from '../utils/logger';

const router = Router();

// Multer configuration: in-memory storage, max 10MB, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Images only'));
    }
  },
});

/**
 * POST /api/analysis/image
 * Upload a chart image and receive Claude AI analysis.
 * Accepts multipart/form-data with `image` file field and optional `context` text field.
 */
router.post('/image', upload.single('image'), async (req: Request, res: Response) => {
  try {
    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Claude AI is not configured. Please set ANTHROPIC_API_KEY in your environment variables. Get your API key at console.anthropic.com.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded. Please send a multipart/form-data request with an "image" field.',
      });
    }

    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    const context = typeof req.body.context === 'string' ? req.body.context : undefined;

    const analysis = await analyzeChartImage(imageBase64, mimeType, context);

    // Store in history
    store.addAnalysis(analysis);

    return res.json({ success: true, analysis });
  } catch (err) {
    logError('Chart image analysis failed', err);
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ success: false, message });
    }

    return res.status(500).json({
      success: false,
      message: `Analysis failed: ${message}`,
    });
  }
});

/**
 * POST /api/analysis/chart/:symbol
 * Fetch historical data for a symbol and analyze with Claude AI.
 */
router.post('/chart/:symbol', async (req: Request, res: Response) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Claude AI is not configured. Please set ANTHROPIC_API_KEY in your environment variables. Get your API key at console.anthropic.com.',
      });
    }

    const symbol = req.params.symbol.toUpperCase();
    const timeframe = typeof req.body.timeframe === 'string' ? req.body.timeframe : 'Daily';
    const period = (req.body.period as '1mo' | '3mo' | '6mo' | '1y') ?? '3mo';

    // Fetch historical data
    const ohlcv = await fetchHistoricalData(symbol, period);

    if (!ohlcv || ohlcv.length < 20) {
      return res.status(400).json({
        success: false,
        message: `Insufficient historical data for ${symbol}. Received ${ohlcv?.length ?? 0} bars.`,
      });
    }

    // Calculate indicators
    const closes = ohlcv.map((b) => b.close);
    const highs = ohlcv.map((b) => b.high);
    const lows = ohlcv.map((b) => b.low);
    const volumes = ohlcv.map((b) => b.volume);

    const rsiArr = indicators.calculateRSI(closes, 14);
    const macdArr = indicators.calculateMACD(closes);
    const bbArr = indicators.calculateBollingerBands(closes, 20, 2);
    const ema9Arr = indicators.calculateEMA(closes, 9);
    const ema20Arr = indicators.calculateEMA(closes, 20);
    const ema50Arr = indicators.calculateEMA(closes, 50);
    const ema200Arr = indicators.calculateEMA(closes, 200);
    const atrArr = indicators.calculateATR(highs, lows, closes, 14);

    // Volume ratio
    const avgVolArr = indicators.calculateSMA(volumes, 20);
    const avgVol = avgVolArr.length > 0 ? avgVolArr[avgVolArr.length - 1] : 0;
    const lastVol = volumes[volumes.length - 1] ?? 0;
    const volumeRatio = avgVol > 0 ? lastVol / avgVol : 1;

    const lastMacd = macdArr.length > 0 ? macdArr[macdArr.length - 1] : null;
    const lastBb = bbArr.length > 0 ? bbArr[bbArr.length - 1] : null;

    const indicatorValues = {
      rsi14: rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : undefined,
      macd: lastMacd
        ? {
            value: lastMacd.value,
            signal: lastMacd.signal,
            histogram: lastMacd.histogram,
          }
        : undefined,
      bb: lastBb
        ? {
            upper: lastBb.upper,
            middle: lastBb.middle,
            lower: lastBb.lower,
            width: lastBb.width,
            percentB: lastBb.percentB,
          }
        : undefined,
      ema9: ema9Arr.length > 0 ? ema9Arr[ema9Arr.length - 1] : undefined,
      ema20: ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : undefined,
      ema50: ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : undefined,
      ema200: ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : undefined,
      atr: atrArr.length > 0 ? atrArr[atrArr.length - 1] : undefined,
      volumeRatio,
    };

    const analysis = await analyzeChartData(symbol, ohlcv, indicatorValues, timeframe);

    // Store in history (with symbol)
    store.addAnalysis({ ...analysis, symbol });

    return res.json({ success: true, analysis, symbol, barsAnalyzed: ohlcv.length });
  } catch (err) {
    logError('Chart data analysis failed', err);
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ success: false, message });
    }

    return res.status(500).json({
      success: false,
      message: `Analysis failed: ${message}`,
    });
  }
});

/**
 * GET /api/analysis/history
 * Return the last 20 analyses from the store.
 */
router.get('/history', (_req: Request, res: Response) => {
  try {
    const history = store.getAnalysisHistory().slice(0, 20);
    return res.json({ success: true, history, count: history.length });
  } catch (err) {
    logError('Failed to retrieve analysis history', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve history' });
  }
});

/**
 * DELETE /api/analysis/history
 * Clear all analysis history.
 */
router.delete('/history', (_req: Request, res: Response) => {
  try {
    store.clearAnalysisHistory();
    return res.json({ success: true, message: 'Analysis history cleared' });
  } catch (err) {
    logError('Failed to clear analysis history', err);
    return res.status(500).json({ success: false, message: 'Failed to clear history' });
  }
});

export default router;
