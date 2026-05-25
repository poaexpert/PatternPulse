import express from 'express';
import cors from 'cors';
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

// Routes
import scannerRouter from './routes/scanner';
import alertsRouter from './routes/alerts';
import watchlistRouter from './routes/watchlist';
import notificationsRouter from './routes/notifications';
import marketRouter from './routes/market';
import analysisRouter from './routes/analysis';

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
app.use('/api', marketRouter); // exposes /api/stock/:symbol/* routes

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

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

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
