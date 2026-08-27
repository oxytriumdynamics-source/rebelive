import http from 'http';
import app from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/database';
import { connectRedis } from './config/redis';
import { logger } from './shared/utils/logger';
import { startSubscriptionRenewalJob } from './jobs/subscriptionRenewal';
import { startLowStockAlertJob } from './jobs/lowStockAlert';

const PORT = parseInt(env.PORT, 10);

const server = http.createServer(app);

async function bootstrap(): Promise<void> {
  try {
    // 1. Connect to MongoDB via Prisma
    await connectDB();

    // 2. Connect to Redis (optional — won't crash if unavailable)
    await connectRedis();

    // 3. Start background jobs
    startSubscriptionRenewalJob();
    startLowStockAlertJob();

    // 4. Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 [Server] Rebelive API running on http://localhost:${PORT}`);
      logger.info(`📦 [Server] Environment: ${env.NODE_ENV}`);
      logger.info(`🔐 [Server] Google OAuth: ${env.GOOGLE_CALLBACK_URL}`);
    });
  } catch (error) {
    logger.error('❌ [Server] Failed to start:', error);
    process.exit(1);
  }
}

// ─── Graceful Shutdown ────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`\n📴 [Server] ${signal} received — shutting down gracefully...`);
  server.close(async () => {
    await disconnectDB();
    logger.info('✅ [Server] Server shut down cleanly');
    process.exit(0);
  });

  // Force shutdown after 10s
  setTimeout(() => {
    logger.error('❌ [Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('❌ [Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('❌ [Uncaught Exception]:', error);
  process.exit(1);
});

bootstrap();
