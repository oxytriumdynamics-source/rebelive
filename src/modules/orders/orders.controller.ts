import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { generateOrderNumber } from '../../shared/utils/generateOrderNumber';
import { getPagination, buildPaginationResult } from '../../shared/types';
import type { PaymentMethod } from '@prisma/client';

const uid = (req: Request) => req.user!.id;

// GET /api/v1/orders
export async function getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: uid(req) },
        orderBy: { createdAt: 'desc' },
        skip, take,
        include: {
          items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } },
          shippingAddress: true,
          payments: true,
        },
      }),
      prisma.order.count({ where: { userId: uid(req) } }),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// GET /api/v1/orders/:id
export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params['id'] as string, userId: uid(req) },
      include: {
        items: { include: { product: true, variant: true, bundle: true } },
        shippingAddress: true,
        payments: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
        coupon: true,
      },
    });
    if (!order) throw new NotFoundError('Order');
    res.json({ status: 'success', data: order });
  } catch (err) { next(err); }
}

// POST /api/v1/orders
export async function placeOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { shippingAddressId, paymentMethod, notes } = req.body as {
      shippingAddressId: string;
      paymentMethod: PaymentMethod;
      notes?: string;
    };

    const cart = await prisma.cart.findFirst({
      where: { userId: uid(req) },
      include: { items: { include: { variant: true, product: true, bundle: true } }, coupon: true },
    });

    if (!cart || cart.items.length === 0) throw new ValidationError('Your cart is empty');

    let subtotal = 0;
    for (const item of cart.items) {
      if (item.variant.stockQty < item.quantity) {
        throw new ValidationError(`Insufficient stock for ${item.product.name} – ${item.variant.name}`);
      }
      subtotal += item.variant.price * item.quantity;
    }

    let discountAmount = 0;
    if (cart.coupon && cart.coupon.isActive) {
      if (cart.coupon.discountType === 'PERCENTAGE') {
        discountAmount = subtotal * (cart.coupon.discountValue / 100);
      } else {
        discountAmount = cart.coupon.discountValue;
      }
    }

    const taxAmount = (subtotal - discountAmount) * 0.18;
    const shippingAmount = subtotal >= 500 ? 0 : 60;
    const total = subtotal - discountAmount + taxAmount + shippingAmount;

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId: uid(req),
          subtotal,
          discountAmount,
          taxAmount,
          shippingAmount,
          total,
          couponId: cart.couponId ?? null,
          shippingAddressId,
          notes: notes ?? null,
          status: 'PENDING',
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              bundleId: item.bundleId ?? null,
              productName: item.product.name,
              variantName: item.variant.name,
              sku: item.variant.sku,
              quantity: item.quantity,
              unitPrice: item.variant.price,
              totalPrice: item.variant.price * item.quantity,
            })),
          },
          statusHistory: { create: { status: 'PENDING', note: 'Order placed' } },
        },
        include: { items: true, shippingAddress: true },
      });

      for (const item of cart.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { decrement: item.quantity } },
        });
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            changeQty: -item.quantity,
            reason: 'SALE',
            referenceId: newOrder.id,
          },
        });
      }

      if (cart.couponId) {
        await tx.coupon.update({ where: { id: cart.couponId }, data: { usedCount: { increment: 1 } } });
      }

      await tx.payment.create({
        data: { orderId: newOrder.id, amount: total, method: paymentMethod, status: 'PENDING' },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { couponId: null } });

      return newOrder;
    });

    res.status(201).json({ status: 'success', data: order });
  } catch (err) { next(err); }
}

// POST /api/v1/orders/:id/cancel
export async function cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params['id'] as string, userId: uid(req) } });
    if (!order) throw new NotFoundError('Order');
    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw new ValidationError('Order cannot be cancelled at this stage');
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        statusHistory: { create: { status: 'CANCELLED', note: (req.body as { reason?: string }).reason ?? 'Cancelled by customer' } },
      },
    });

    res.json({ status: 'success', message: 'Order cancelled successfully' });
  } catch (err) { next(err); }
}
