import { Router, Request, Response } from 'express';
import { store } from '../store';
import { testAlert } from '../alerts/checker';

const router = Router();

/**
 * GET /api/alerts
 * Returns all configured alerts.
 */
router.get('/', (req: Request, res: Response) => {
  const alerts = store.getAlerts();
  res.json({ success: true, count: alerts.length, alerts });
});

/**
 * POST /api/alerts
 * Create a new alert.
 * Body: Alert fields without id, createdAt, triggerCount
 */
router.post('/', (req: Request, res: Response) => {
  const { symbol, conditionType, threshold, notifyMethods, active, note } = req.body;

  if (!symbol || !conditionType || threshold === undefined) {
    return res.status(400).json({
      success: false,
      message: 'symbol, conditionType, and threshold are required',
    });
  }

  const validConditions = [
    'PRICE_ABOVE', 'PRICE_BELOW', 'PERCENT_CHANGE_UP', 'PERCENT_CHANGE_DOWN',
    'VOLUME_SURGE', 'RSI_ABOVE', 'RSI_BELOW', 'SCAN_MATCH',
  ];

  if (!validConditions.includes(conditionType)) {
    return res.status(400).json({
      success: false,
      message: `Invalid conditionType. Must be one of: ${validConditions.join(', ')}`,
    });
  }

  const alert = store.addAlert({
    symbol: symbol.toUpperCase(),
    conditionType,
    threshold: parseFloat(threshold),
    notifyMethods: notifyMethods || ['browser'],
    active: active !== undefined ? Boolean(active) : true,
    note,
  });

  return res.status(201).json({ success: true, alert });
});

/**
 * PUT /api/alerts/:id
 * Update an existing alert.
 */
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  // Prevent overwriting protected fields
  delete updates.id;
  delete updates.createdAt;
  delete updates.triggerCount;

  const updated = store.updateAlert(id, updates);
  if (!updated) {
    return res.status(404).json({ success: false, message: `Alert ${id} not found` });
  }
  return res.json({ success: true, alert: updated });
});

/**
 * DELETE /api/alerts/:id
 * Delete an alert.
 */
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = store.deleteAlert(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: `Alert ${id} not found` });
  }
  return res.json({ success: true, message: `Alert ${id} deleted` });
});

/**
 * POST /api/alerts/test/:id
 * Manually trigger a test notification for an alert.
 */
router.post('/test/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const alert = store.getAlerts().find((a) => a.id === id);
  if (!alert) {
    return res.status(404).json({ success: false, message: `Alert ${id} not found` });
  }

  try {
    const ok = await testAlert(id);
    return res.json({ success: ok, message: ok ? 'Test notification sent' : 'Failed to send test' });
  } catch (err) {
    return res.status(500).json({ success: false, message: `Test failed: ${err}` });
  }
});

export default router;
