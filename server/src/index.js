import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { globalLimiter } from './middleware/rateLimiter.js';
import { logger, httpLogger } from './utils/logger.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import schoolRoutes from './routes/school.routes.js';
import auditRoutes from './routes/audit.routes.js';
import superadminRoutes from './routes/superadmin/index.js';
import schoolAdminRoutes from './routes/school/index.js';
import { startScheduler } from './utils/scheduler.js';
import docsRoutes from './routes/docs.routes.js';
import prisma from './utils/prisma.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Trust proxy only for loopback (avoid express-rate-limit permissive trust proxy error)
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [])],
      },
    },
  })
);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(hpp());
app.use(cookieParser());
app.use((req, res, next) => {
  req.id = randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(express.json({
  limit: '100kb',
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));

morgan.token('request-id', (req) => req.id || '-');
app.use(morgan(':request-id :method :url :status :response-time ms', { stream: httpLogger }));

app.use(globalLimiter);

app.use('/api', async (req, res, next) => {
  const isMaintenanceExempt = req.path === '/health'
    || req.path.startsWith('/superadmin')
    || req.path === '/docs/openapi.json'
    || req.path === '/auth/csrf-token'
    || req.path === '/auth/login'
    || req.path === '/auth/logout'
    || req.path === '/auth/refresh'
    || req.path === '/school/payments/paystack/webhook';
  if (isMaintenanceExempt) return next();
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'maintenanceMode' } });
    if (setting?.value === true) return res.status(503).json({ success: false, error: 'Service is temporarily unavailable for maintenance', requestId: req.id });
    next();
  } catch (err) { next(err); }
});

// Health check (unauthenticated)
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', ts: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/superadmin', schoolRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/superadmin/audit-logs', auditRoutes);
app.use('/api/school', schoolAdminRoutes);

// Serve built frontend from the backend (same-origin, required for httpOnly cookie auth)
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found', requestId: req.id });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;
let server;

if (import.meta.url === `file://${process.argv[1]}`) {
  server = app.listen(PORT, () => {
    logger.info(`School management server listening on port ${PORT}`);
    startScheduler();
  });
}

function shutdown() {
  logger.info('Shutting down gracefully...');
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (err) => {
  logger.error(err);
  process.exit(1);
});

export { app };
