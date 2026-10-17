import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import './config/env'; // Validate env vars on startup
import './config/passport'; // Initialize passport strategies
import { globalLimiter } from './shared/middleware/rateLimiter';
import { errorHandler } from './shared/middleware/errorHandler';
import { env } from './config/env';

// ─── Route Imports ─────────────────────────────────────
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import productsRoutes from './modules/products/products.routes';
import cartRoutes from './modules/cart/cart.routes';
import ordersRoutes from './modules/orders/orders.routes';
import quizRoutes from './modules/quiz/quiz.routes';
import subscriptionsRoutes from './modules/subscriptions/subscriptions.routes';
import supportRoutes from './modules/support/support.routes';
import contentRoutes from './modules/content/content.routes';
import adminRoutes from './modules/admin/admin.routes';
import shippingRoutes from './modules/shipping/shipping.routes';
import {
  handleShiprocketWebhook,
  handleFastrrWebhook,
  handleShiprocketOrderWebhook,
  trackShipment,
} from './modules/shipping/shipping.controller';

const app = express();

// ─── Trust Proxy (for rate limiting behind nginx/load balancer) ─
app.set('trust proxy', 1);

// ─── Security ─────────────────────────────────────────
app.use(helmet());
const allowedOrigins =
  env.NODE_ENV === 'production'
    ? [env.CLIENT_URL].filter(Boolean)
    : [env.CLIENT_URL, 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server or non-browser tools (curl, postman, server webhooks)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        (env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-session-id',
      'x-api-key',
      'x-api-hmac-sha256',
      'x-fastrr-signature',
      'Cache-Control',
      'Pragma',
      'x-cache',
      'If-None-Match',
      'If-Modified-Since',
    ],
    exposedHeaders: ['X-Cache', 'Cache-Control'],
  }),
);

// ─── Compression & Logging ────────────────────────────
app.use(compression());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Body Parsers ─────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Global Rate Limiter ──────────────────────────────
app.use(globalLimiter);

// ─── Health Check ─────────────────────────────────────
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: '🍹 Rebelive API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// ─── Main Server Webhooks (Shifted to Root for Direct Gateway Connectivity) ──
// 1. Shiprocket Tracking Webhook (Couriers scan events & shipment lifecycle)
// Note: Shiprocket rejects URLs containing "shiprocket", "kartrocket", "sr", or "kr".
// Primary Compliant Webhook URL: /webhooks/tracking (or /webhook/tracking)
app.post('/webhooks/tracking', handleShiprocketWebhook);
app.post('/webhook/tracking', handleShiprocketWebhook);
app.post('/webhooks/shiprocket', handleShiprocketWebhook);
app.post('/webhook/shiprocket', handleShiprocketWebhook);
app.get('/webhooks/tracking', (_req, res) => {
  res.status(200).json({
    status: 'active',
    service: 'Shiprocket Tracking Webhook Endpoint',
    method: 'POST',
    acceptedHeaders: ['x-api-key'],
    documentation: 'Configure in Shiprocket Dashboard > Settings > API > Webhooks',
  });
});

// 2. Fastrr (Shiprocket Checkout) Webhooks (Payment & order capture events)
// Primary Webhook URL: /webhooks/fastrr
app.post('/webhooks/fastrr', handleFastrrWebhook);
app.post('/webhook/fastrr', handleFastrrWebhook);
app.post('/webhooks/order', handleShiprocketOrderWebhook);
app.post('/webhook/order', handleShiprocketOrderWebhook);
app.post('/webhooks/fastrr-order', handleShiprocketOrderWebhook);
app.get('/webhooks/fastrr', (_req, res) => {
  res.status(200).json({
    status: 'active',
    service: 'Fastrr Checkout Webhook Endpoint',
    method: 'POST',
    signatureHeader: 'x-api-hmac-sha256',
    documentation: 'Configure in Fastrr Dashboard > Settings > Webhooks',
  });
});
app.get('/webhooks/order', (_req, res) => {
  res.status(200).json({
    status: 'active',
    service: 'Shiprocket Checkout Order Ingestion Webhook Endpoint',
    method: 'POST',
  });
});

// 3. Webhook Order Status Sync (Connected to Order Confirmation Page)
app.get('/webhooks/status/:identifier', trackShipment);
app.get('/api/v1/shipping/order-status/:identifier', trackShipment);

// ─── API Routes ───────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, usersRoutes);
app.use(`${API}/products`, productsRoutes);
app.use(`${API}/cart`, cartRoutes);
app.use(`${API}/orders`, ordersRoutes);
app.use(`${API}/quiz`, quizRoutes);
app.use(`${API}/subscriptions`, subscriptionsRoutes);
app.use(`${API}/support`, supportRoutes);
app.use(`${API}/content`, contentRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/shipping`, shippingRoutes);

// ─── 404 Handler ──────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});

// ─── Global Error Handler ─────────────────────────────
app.use(errorHandler);

export default app;
