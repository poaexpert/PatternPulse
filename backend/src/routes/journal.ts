import { Router, Request, Response } from 'express';
import { store } from '../store';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, journal: store.getJournal() });
});

router.post('/', (req: Request, res: Response) => {
  const { symbol, direction, status, entryPrice, exitPrice, stopLoss, target, size, entryDate, exitDate, pnl, pnlPercent, setup, notes, tags } = req.body;
  if (!symbol || !direction || !entryDate) {
    return res.status(400).json({ success: false, message: 'symbol, direction, and entryDate are required' });
  }
  const entry = store.addJournalEntry({
    symbol: String(symbol).toUpperCase(),
    direction,
    status: status ?? 'OPEN',
    entryPrice: entryPrice ?? null,
    exitPrice: exitPrice ?? null,
    stopLoss: stopLoss ?? null,
    target: target ?? null,
    size: size ?? null,
    entryDate: String(entryDate),
    exitDate: exitDate ?? null,
    pnl: pnl ?? null,
    pnlPercent: pnlPercent ?? null,
    setup: setup ?? '',
    notes: notes ?? '',
    tags: tags ?? [],
  });
  return res.json({ success: true, entry });
});

router.put('/:id', (req: Request, res: Response) => {
  const updated = store.updateJournalEntry(req.params.id, req.body);
  if (!updated) return res.status(404).json({ success: false, message: 'Entry not found' });
  return res.json({ success: true, entry: updated });
});

router.delete('/:id', (req: Request, res: Response) => {
  const ok = store.deleteJournalEntry(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'Entry not found' });
  return res.json({ success: true });
});

export default router;
