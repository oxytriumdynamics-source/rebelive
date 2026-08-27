import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../shared/utils/logger';

/**
 * Runs every hour.
 * Finds product variants below their lowStockThreshold and logs an alert.
 * In production, this can be extended to send email/Slack notifications.
 */
export function startLowStockAlertJob(): void {
  cron.schedule('0 * * * *', async () => {
    logger.info('[Job] Running low-stock alert job...');

    const lowStockVariants = await prisma.productVariant.findMany({
      where: {
        isActive: true,
        stockQty: { gt: 0 },
        // Find where stockQty <= lowStockThreshold — using raw comparison via filter
      },
      include: { product: { select: { name: true, slug: true } } },
    });

    // Filter: stockQty <= lowStockThreshold (Prisma doesn't support column comparison natively)
    const alerts = lowStockVariants.filter((v) => v.stockQty <= v.lowStockThreshold);

    if (alerts.length === 0) {
      logger.info('[Job] No low-stock variants found.');
      return;
    }

    logger.warn(`[Job] ⚠️  ${alerts.length} variants are running low:`);
    for (const variant of alerts) {
      logger.warn(
        `[Job]  - ${variant.product.name} (${variant.name} | SKU: ${variant.sku}) — Stock: ${variant.stockQty} / Threshold: ${variant.lowStockThreshold}`,
      );
    }

    // TODO: Send email/Slack/webhook notifications to admins here
    logger.info('[Job] Low-stock alert job complete.');
  });

  logger.info('✅ [Job] Low-stock alert job scheduled (every hour)');
}
