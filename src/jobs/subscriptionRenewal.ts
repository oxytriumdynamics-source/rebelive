import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../shared/utils/logger';
import { generateOrderNumber } from '../shared/utils/generateOrderNumber';

/**
 * Runs every day at 6 AM.
 * Processes subscriptions where nextDeliveryAt <= now and status = ACTIVE.
 * Creates an order for each due subscription and updates nextDeliveryAt.
 */
export function startSubscriptionRenewalJob(): void {
  cron.schedule('0 6 * * *', async () => {
    logger.info('[Job] Running subscription renewal job...');

    const dueSubscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        nextDeliveryAt: { lte: new Date() },
      },
      include: {
        plan: true,
        variant: { include: { product: true } },
        address: true,
        user: true,
      },
    });

    logger.info(`[Job] Found ${dueSubscriptions.length} due subscriptions`);

    for (const sub of dueSubscriptions) {
      try {
        if (sub.variant.stockQty < sub.quantity) {
          logger.warn(`[Job] Skipping subscription ${sub.id} — insufficient stock for ${sub.variant.sku}`);
          continue;
        }

        const unitPrice = sub.variant.price;
        const totalPrice = unitPrice * sub.quantity;
        const discountMultiplier = 1 - sub.plan.discountPercent / 100;
        const discountAmount = totalPrice * (sub.plan.discountPercent / 100);
        const taxAmount = (totalPrice - discountAmount) * 0.18;
        const total = (totalPrice - discountAmount + taxAmount);

        await prisma.$transaction(async (tx) => {
          // Create order
          await tx.order.create({
            data: {
              orderNumber: generateOrderNumber(),
              userId: sub.userId,
              subtotal: totalPrice,
              discountAmount,
              taxAmount,
              shippingAmount: 0, // free shipping for subscriptions
              total,
              shippingAddressId: sub.addressId,
              status: 'CONFIRMED',
              notes: `Auto-renewal for subscription ${sub.id}`,
              items: {
                create: {
                  productId: sub.variant.productId,
                  variantId: sub.variantId,
                  productName: sub.variant.product.name,
                  variantName: sub.variant.name,
                  sku: sub.variant.sku,
                  quantity: sub.quantity,
                  unitPrice,
                  totalPrice,
                },
              },
              statusHistory: { create: { status: 'CONFIRMED', note: 'Subscription auto-renewal' } },
            },
          });

          // Deduct stock
          await tx.productVariant.update({
            where: { id: sub.variantId },
            data: { stockQty: { decrement: sub.quantity } },
          });

          // Calculate next delivery
          const days: Record<string, number> = { WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30, BIMONTHLY: 60 };
          const nextDeliveryAt = new Date(Date.now() + (days[sub.plan.frequency] ?? 30) * 86400000);

          // Update subscription
          await tx.subscription.update({
            where: { id: sub.id },
            data: { lastDeliveredAt: new Date(), nextDeliveryAt },
          });
        });

        logger.info(`[Job] Renewed subscription ${sub.id} for user ${sub.userId}`);
      } catch (err) {
        logger.error(`[Job] Failed to renew subscription ${sub.id}:`, err);
      }
    }

    logger.info('[Job] Subscription renewal job complete.');
  });

  logger.info('✅ [Job] Subscription renewal job scheduled (daily at 6:00 AM)');
}
