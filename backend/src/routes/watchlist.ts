import { Router, Request, Response } from 'express';
import { store } from '../store';

const router = Router();

/**
 * GET /api/watchlist
 * Returns all watchlist items.
 */
router.get('/', (req: Request, res: Response) => {
  const watchlist = store.getWatchlist();
  res.json({ success: true, count: watchlist.length, watchlist });
});

/**
 * POST /api/watchlist
 * Add a symbol to the watchlist.
 * Body: { symbol, notes?, alertPrice?, stopLoss?, targetPrice? }
 */
router.post('/', (req: Request, res: Response) => {
  const { symbol, notes, alertPrice, stopLoss, targetPrice, name } = req.body;

  if (!symbol) {
    return res.status(400).json({ success: false, message: 'symbol is required' });
  }

  const item = store.addToWatchlist({
    symbol: symbol.toUpperCase(),
    name,
    notes,
    alertPrice: alertPrice !== undefined ? parseFloat(alertPrice) : undefined,
    stopLoss: stopLoss !== undefined ? parseFloat(stopLoss) : undefined,
    targetPrice: targetPrice !== undefined ? parseFloat(targetPrice) : undefined,
  });

  return res.status(201).json({ success: true, item });
});

/**
 * DELETE /api/watchlist/:symbol
 * Remove a symbol from the watchlist.
 */
router.delete('/:symbol', (req: Request, res: Response) => {
  const { symbol } = req.params;
  const removed = store.removeFromWatchlist(symbol);
  if (!removed) {
    return res.status(404).json({ success: false, message: `${symbol} not found in watchlist` });
  }
  return res.json({ success: true, message: `${symbol.toUpperCase()} removed from watchlist` });
});

/**
 * PUT /api/watchlist/:symbol
 * Update a watchlist item (notes, alertPrice, stopLoss, targetPrice).
 */
router.put('/:symbol', (req: Request, res: Response) => {
  const { symbol } = req.params;
  const updates = req.body;

  // Prevent overwriting key fields
  delete updates.symbol;
  delete updates.addedAt;

  const updated = store.updateWatchlistItem(symbol, updates);
  if (!updated) {
    return res.status(404).json({ success: false, message: `${symbol} not found in watchlist` });
  }
  return res.json({ success: true, item: updated });
});

export default router;
