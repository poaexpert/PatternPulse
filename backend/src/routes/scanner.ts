import { Router, Request, Response } from 'express';
import { store } from '../store';
import { runFullScan, analyzeSingleStock } from '../scanners';
import { ScanType, Direction } from '../types';
import { log } from '../utils/logger';

const router = Router();

/**
 * GET /api/scanner/results
 * Returns latest scan results with optional filtering.
 * Query params: type (ScanType), direction (LONG|SHORT|NEUTRAL), minStrength (number)
 */
router.get('/results', (req: Request, res: Response) => {
  let results = store.getScanResults();

  const { type, direction, minStrength, symbol } = req.query;

  if (typeof type === 'string' && type) {
    results = results.filter((r) =>
      r.scanTypes.includes(type as ScanType)
    );
  }

  if (typeof direction === 'string' && direction) {
    results = results.filter((r) => r.direction === (direction as Direction));
  }

  if (typeof minStrength === 'string' && minStrength) {
    const min = parseInt(minStrength, 10);
    if (!isNaN(min)) {
      results = results.filter((r) => r.strength >= min);
    }
  }

  if (typeof symbol === 'string' && symbol) {
    results = results.filter((r) =>
      r.symbol.toUpperCase().includes(symbol.toUpperCase())
    );
  }

  res.json({
    success: true,
    count: results.length,
    lastScanTime: store.getLastScanTime(),
    results,
  });
});

/**
 * POST /api/scanner/run
 * Trigger a manual scan immediately (async).
 */
router.post('/run', async (req: Request, res: Response) => {
  if (store.isScanInProgress()) {
    return res.status(409).json({
      success: false,
      message: 'A scan is already in progress',
    });
  }

  // Respond immediately, run scan in background
  res.json({ success: true, message: 'Scan started' });

  log('Manual scan triggered via API');
  store.setScanInProgress(true);

  try {
    const results = await runFullScan();
    store.setScanResults(results);
    store.setLastScanTime(new Date());
    log(`Manual scan complete: ${results.length} signals`);
  } catch (err) {
    log(`Manual scan failed: ${err}`);
  } finally {
    store.setScanInProgress(false);
  }

  return;
});

/**
 * GET /api/scanner/status
 * Returns scan status information.
 */
router.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    inProgress: store.isScanInProgress(),
    lastScanTime: store.getLastScanTime(),
    totalResults: store.getScanResults().length,
  });
});

/**
 * GET /api/scanner/stock/:symbol
 * Get on-demand detailed analysis for a specific symbol.
 */
router.get('/stock/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  if (!symbol) {
    return res.status(400).json({ success: false, message: 'Symbol is required' });
  }

  // Check if we have a recent cached result first
  const cached = store.getScanResults().find(
    (r) => r.symbol.toUpperCase() === symbol.toUpperCase()
  );
  if (cached) {
    // If cached result is < 10 minutes old, return it
    const ageMs = Date.now() - new Date(cached.timestamp).getTime();
    if (ageMs < 600_000) {
      return res.json({ success: true, result: cached, source: 'cache' });
    }
  }

  try {
    const result = await analyzeSingleStock(symbol.toUpperCase());
    if (!result) {
      return res.status(404).json({
        success: false,
        message: `No signals found for ${symbol}, or symbol not found`,
      });
    }
    return res.json({ success: true, result, source: 'live' });
  } catch (err) {
    return res.status(500).json({ success: false, message: `Analysis failed: ${err}` });
  }
});

export default router;
