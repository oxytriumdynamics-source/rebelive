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

const app = express();

// ─── Trust Proxy (for rate limiting behind nginx/load balancer) ─
app.set('trust proxy', 1);

// ─── Security ─────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: [env.CLIENT_URL, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
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
