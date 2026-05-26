import { Router, Request, Response } from 'express';
import { analyzeSymbolWithTA } from '../analysis/technicalAnalysis';
import { fetchHistoricalData } from '../data/market';
import { store } from '../store';
import { logError } from '../utils/logger';

const router = Router();

// ── Symbol normalizer ─────────────────────────────────────────────────────────
// Converts broker-format futures symbols (e.g. SICN26, GCM26, ESH25) to
// Yahoo Finance format (SIN26.CMX, GCM26.CMX, ESH25.CME, etc.)

const CONTINUOUS_MAP: Record<string, string> = {
  SI: 'SI=F', GC: 'GC=F', HG: 'HG=F', PL: 'PL=F', PA: 'PA=F',
  CL: 'CL=F', BZ: 'BZ=F', NG: 'NG=F', RB: 'RB=F', HO: 'HO=F',
  ES: 'ES=F', NQ: 'NQ=F', YM: 'YM=F', RTY: 'RTY=F', MES: 'MES=F',
  MNQ: 'MNQ=F', MYM: 'MYM=F',
  ZN: 'ZN=F', ZB: 'ZB=F', ZT: 'ZT=F', ZF: 'ZF=F',
  ZC: 'ZC=F', ZS: 'ZS=F', ZW: 'ZW=F', ZM: 'ZM=F', ZL: 'ZL=F',
  KC: 'KC=F', CT: 'CT=F', SB: 'SB=F', CC: 'CC=F', OJ: 'OJ=F',
  LE: 'LE=F', GF: 'GF=F', HE: 'HE=F',
  '6E': '6E=F', '6J': '6J=F', '6B': '6B=F', '6C': '6C=F', '6S': '6S=F',
  BTC: 'BTC=F', ETH: 'ETH=F', VX: 'VX=F',
};

// CME exchange suffix by root symbol
const EXCHANGE_SUFFIX: Record<string, string> = {
  SI: '.CMX', GC: '.CMX', HG: '.CMX', PL: '.NYM', PA: '.NYM',
  CL: '.NYM', BZ: '.NYM', NG: '.NYM', RB: '.NYM', HO: '.NYM',
  ZC: '.CBT', ZS: '.CBT', ZW: '.CBT', ZM: '.CBT', ZL: '.CBT',
  KC: '.NYB', CT: '.NYB', SB: '.NYB', CC: '.NYB',
};

function normalizeSymbol(raw: string): string[] {
  const sym = raw.trim().toUpperCase();

  // Already in Yahoo Finance format
  if (sym.includes('=F') || sym.includes('.')) return [sym];

  // Match broker month-contract format: ROOT(optional C for continuous)MONTHYEAR2
  // e.g. SICN26 → SI + C(skip) + N + 26, GCM26 → GC + M + 26, ESH25 → ES + H + 25
  const monthCodes = 'FGHJKMNQUVXZ';
  const re = new RegExp(`^([A-Z]{2,4}?)C?([${monthCodes}])(\\d{2})$`);
  const match = sym.match(re);

  if (match) {
    const [, root, month, year] = match;
    const suffix = EXCHANGE_SUFFIX[root] ?? '';
    const specific = `${root}${month}${year}${suffix}`;
    const continuous = CONTINUOUS_MAP[root] ?? `${root}=F`;
    // Return specific contract first, then continuous as fallback
    return [specific, continuous];
  }

  // Bare root (no month/year) → continuous contract
  if (CONTINUOUS_MAP[sym]) return [CONTINUOUS_MAP[sym]];

  return [sym]; // pass through
}

/**
 * POST /api/analysis/image
 */
router.post('/image', (_req: Request, res: Response) => {
  return res.status(400).json({
    success: false,
    message: 'Image analysis removed. Enter the ticker symbol below to get free technical analysis.',
  });
});

/**
 * POST /api/analysis/chart/:symbol
 */
router.post('/chart/:symbol', async (req: Request, res: Response) => {
  try {
    const rawSymbol = req.params.symbol.toUpperCase();
    const candidates = normalizeSymbol(rawSymbol);

    let bars: Awaited<ReturnType<typeof fetchHistoricalData>> = [];
    let usedSymbol = rawSymbol;

    for (const candidate of candidates) {
      bars = await fetchHistoricalData(candidate, '3mo');
      if (bars.length >= 20) {
        usedSymbol = candidate;
        break;
      }
    }

    if (bars.length < 20) {
      const hasAvKey = !!process.env.ALPHA_VANTAGE_KEY;
      const tried = candidates.join(', ');
      return res.status(422).json({
        success: false,
        message: hasAvKey
          ? `Could not fetch data for ${rawSymbol} (tried: ${tried}). Check the symbol. For futures use SI=F, GC=F, ES=F or specific contracts like SIN26.CMX.`
          : `Could not fetch data for ${rawSymbol} (tried: ${tried}). Yahoo Finance may be blocking this server. For reliable data, add a free ALPHA_VANTAGE_KEY in Railway environment variables (free at alphavantage.co).`,
      });
    }

    const analysis = await analyzeSymbolWithTA(usedSymbol, bars);
    const result = { ...analysis, symbol: rawSymbol, resolvedSymbol: usedSymbol };
    store.addAnalysis(result);

    return res.json({ success: true, analysis: result });
  } catch (err) {
    logError('Chart data analysis failed', err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, message: `Analysis failed: ${message}` });
  }
});

/**
 * GET /api/analysis/history
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
