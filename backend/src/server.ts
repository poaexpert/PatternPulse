import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

// Load env as early as possible
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

import { config } from './config';
import { startScheduler, setSocketIO, isMarketHours, isPreMarket } from './scheduler';
import { store } from './store';
import { runFullScan } from './scanners';
import { log, logError } from './utils/logger';
import { initTelegram } from './notifications/telegram';

// Routes
import scannerRouter from './routes/scanner';
import alertsRouter from './routes/alerts';
import watchlistRouter from './routes/watchlist';
import notificationsRouter from './routes/notifications';
import marketRouter from './routes/market';
import analysisRouter from './routes/analysis';
import journalRouter from './routes/journal';
import adminRouter from './routes/admin';
import stripeRouter, { stripeWebhookHandler } from './routes/stripe';

const app = express();
const server = createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Stripe webhook needs raw body BEFORE express.json() parses it
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger (dev only)
if (config.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    log(`${req.method} ${req.path}`);
    next();
  });
}

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/scanner', scannerRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/market', marketRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/journal', journalRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api', marketRouter); // exposes /api/stock/:symbol/* routes

// ── Bot proxy (/bot/* → ChartSpyder Python service on port 8081) ──────────────
app.use('/bot', async (req: express.Request, res: express.Response) => {
  try {
    const botUrl = `http://127.0.0.1:${process.env.BOT_PORT ?? '8081'}${req.path}`;
    const response = await axios({
      method: req.method as 'get' | 'post' | 'put' | 'delete',
      url: botUrl,
      data: req.body,
      params: req.query,
      timeout: 10000,
    });
    res.status(response.status).json(response.data);
  } catch (err: any) {
    if (err.response) res.status(err.response.status).json(err.response.data);
    else res.status(502).json({ success: false, message: 'Bot service unavailable' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    lastScanTime: store.getLastScanTime(),
    scanInProgress: store.isScanInProgress(),
    totalSignals: store.getScanResults().length,
    marketHours: isMarketHours(),
    preMarket: isPreMarket(),
    analysisEnabled: !!process.env.ANTHROPIC_API_KEY,
  });
});

// API 404 handler (only applies to /api/* routes)
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

// Serve React frontend in production (Railway deployment)
if (config.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  // Let React Router handle all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logError('Unhandled error', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  log(`Client connected: ${socket.id}`);

  // Send current state immediately on connect
  const currentResults = store.getScanResults();
  socket.emit('scan_results', currentResults);
  socket.emit('market_status', {
    isMarketHours: isMarketHours(),
    isPreMarket: isPreMarket(),
    lastScanTime: store.getLastScanTime(),
    scanInProgress: store.isScanInProgress(),
    totalSignals: currentResults.length,
  });

  // Manual scan trigger from client
  socket.on('trigger_scan', async () => {
    if (store.isScanInProgress()) {
      socket.emit('scan_error', { message: 'Scan already in progress' });
      return;
    }

    io.emit('scan_started', { timestamp: new Date() });
    store.setScanInProgress(true);

    try {
      const results = await runFullScan();
      store.setScanResults(results);
      store.setLastScanTime(new Date());
      io.emit('scan_results', results);
      io.emit('scan_complete', { count: results.length, timestamp: new Date() });
    } catch (err) {
      logError('Socket-triggered scan failed', err);
      socket.emit('scan_error', { message: String(err) });
    } finally {
      store.setScanInProgress(false);
    }
  });

  // Client can subscribe to specific symbols for live updates
  socket.on('subscribe_symbol', (symbol: string) => {
    socket.join(`symbol:${symbol.toUpperCase()}`);
    log(`Client ${socket.id} subscribed to ${symbol.toUpperCase()}`);
  });

  socket.on('unsubscribe_symbol', (symbol: string) => {
    socket.leave(`symbol:${symbol.toUpperCase()}`);
  });

  socket.on('disconnect', () => {
    log(`Client disconnected: ${socket.id}`);
  });

  socket.on('error', (err) => {
    logError(`Socket error for ${socket.id}`, err);
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
setSocketIO(io);

// Always initialize Telegram from config — overrides any persisted store value
initTelegram(config.TELEGRAM_BOT_TOKEN);
store.updateNotificationSettings({
  telegram: {
    enabled: true,
    botToken: config.TELEGRAM_BOT_TOKEN,
    chatId: config.TELEGRAM_CHAT_ID,
  },
});
log(`Telegram bot initialized — chat ID: ${config.TELEGRAM_CHAT_ID}`);

// Start the cron scheduler
startScheduler();

// Start listening
server.listen(config.PORT, () => {
  log(`PatternPulse backend running on port ${config.PORT}`);
  log(`Environment: ${config.NODE_ENV}`);
  log(`Health check: http://localhost:${config.PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

export { io };
