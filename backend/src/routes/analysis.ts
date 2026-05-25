import { Router, Request, Response } from 'express';
import { analyzeSymbolWithTA } from '../analysis/technicalAnalysis';
import { fetchHistoricalData } from '../data/market';
import { store } from '../store';
import { logError } from '../utils/logger';

const router = Router();

/**
 * POST /api/analysis/image
 * Image analysis has been removed in favour of free technical analysis.
 */
router.post('/image', (_req: Request, res: Response) => {
  return res.status(400).json({
    success: false,
    message: 'Image analysis removed. Enter the ticker symbol below to get free technical analysis.',
  });
});

/**
 * POST /api/analysis/chart/:symbol
 * Fetch historical data for a symbol and analyse with the pure TA engine.
 */
router.post('/chart/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const bars = await fetchHistoricalData(symbol, '3mo');

    if (bars.length < 20) {
      return res.status(422).json({
        success: false,
        message: 'Not enough historical data for analysis.',
      });
    }

    const analysis = await analyzeSymbolWithTA(symbol, bars);
    store.addAnalysis({ ...analysis, symbol });

    return res.json({ success: true, analysis: { ...analysis, symbol } });
  } catch (err) {
    logError('Chart data analysis failed', err);
    const message = err instanceof Error ? err.message : String(err);
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
