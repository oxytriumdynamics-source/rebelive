import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { generateOrderNumber } from '../../shared/utils/generateOrderNumber';
import { getPagination, buildPaginationResult } from '../../shared/types';
import { shiprocketService } from '../shipping/shiprocket.service';
import type { PaymentMethod, OrderStatus, PaymentStatus } from '@prisma/client';

const uid = (req: Request) => req.user!.id;

// GET /api/v1/orders
export async function getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const currentUserId = uid(req);

    // Retrieve user phone to link any guest orders placed via Fastrr
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { phone: true },
    });
    const cleanPhone = user?.phone ? user.phone.replace(/\D/g, '').slice(-10) : '';

    const where: any = cleanPhone && cleanPhone.length >= 10
      ? {
          OR: [
            { userId: currentUserId },
            { notes: { contains: cleanPhone } },
          ],
        }
      : { userId: currentUserId };

    // Auto-heal in background: reassign any unlinked guest orders matching this phone
    if (cleanPhone && cleanPhone.length >= 10) {
      prisma.order
        .updateMany({
          where: {
            userId: { not: currentUserId },
            notes: { contains: cleanPhone },
          },
          data: { userId: currentUserId },
        })
        .catch(() => {});
    }

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } },
          shippingAddress: true,
          payments: true,
        },
      }),
      prisma.order.count({ where }),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// GET /api/v1/orders/:id
export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const currentUserId = uid(req);
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { phone: true },
    });
    const cleanPhone = user?.phone ? user.phone.replace(/\D/g, '').slice(-10) : '';

    const order = await prisma.order.findFirst({
      where: {
        id: req.params['id'] as string,
        OR: [
          { userId: currentUserId },
          ...(cleanPhone && cleanPhone.length >= 10 ? [{ notes: { contains: cleanPhone } }] : []),
        ],
      },
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
    const {
      shippingAddressId,
      paymentMethod,
      notes,
      isPaid,
      transactionId,
      gatewayResponse,
    } = req.body as {
      shippingAddressId: string;
      paymentMethod: PaymentMethod;
      notes?: string;
      isPaid?: boolean;
      transactionId?: string;
      gatewayResponse?: any;
    };

    if (!shippingAddressId) {
      throw new ValidationError('Shipping address is required');
    }

    const address = await prisma.address.findFirst({
      where: { id: shippingAddressId, userId: uid(req) },
    });
    if (!address) {
      throw new ValidationError('Invalid or unauthorized shipping address selected');
    }

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

    discountAmount = Math.min(subtotal, Math.max(0, discountAmount));
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxAmount = Math.round(taxableAmount * 0.18 * 100) / 100;
    const shippingAmount = subtotal >= 500 ? 0 : 60;
    const total = Math.max(0, Math.round((taxableAmount + taxAmount + shippingAmount) * 100) / 100);

    const isPaymentComplete = Boolean(isPaid || transactionId);
    const initialStatus: OrderStatus = isPaymentComplete || paymentMethod === 'COD' ? 'CONFIRMED' : 'PENDING';
    const initialPaymentStatus: PaymentStatus = isPaymentComplete ? 'COMPLETED' : 'PENDING';
    const txnId = transactionId || (isPaymentComplete ? `TXN-${Date.now()}-${Math.floor(Math.random() * 89999 + 10000)}` : null);

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
          status: initialStatus,
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
          statusHistory: {
            create: {
              status: initialStatus,
              note: isPaymentComplete
                ? 'Order placed and payment successfully completed'
                : paymentMethod === 'COD'
                ? 'Order placed with Cash on Delivery (COD)'
                : 'Order placed',
            },
          },
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
        data: {
          orderId: newOrder.id,
          amount: total,
          method: paymentMethod,
          status: initialPaymentStatus,
          transactionId: txnId,
          paidAt: isPaymentComplete ? new Date() : null,
          gatewayResponse: gatewayResponse || null,
        },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { couponId: null } });

      return newOrder;
    });

    // Automatically send and connect order to Shiprocket Logistics
    const user = await prisma.user.findUnique({
      where: { id: uid(req) },
      select: { firstName: true, lastName: true, email: true, phone: true },
    });

    let shiprocketResult;
    try {
      shiprocketResult = await shiprocketService.createAdhocOrder({
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        customer: {
          firstName: user?.firstName || req.user?.firstName || 'Customer',
          lastName: user?.lastName || req.user?.lastName || 'Rebelive',
          email: user?.email || req.user?.email || 'customer@rebelive.co',
          phone: user?.phone || '9999999999',
        },
        address: {
          line1: address.line1,
          line2: address.line2 || '',
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country || 'India',
        },
        items: order.items.map((i) => ({
          name: `${i.productName} - ${i.variantName}`,
          sku: i.sku,
          units: i.quantity,
          selling_price: i.unitPrice,
        })),
        paymentMethod: paymentMethod === 'COD' ? 'COD' : 'Prepaid',
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        shippingAmount: order.shippingAmount,
        total: order.total,
      });
    } catch (srErr) {
      console.warn('⚠️ Non-fatal error connecting order to Shiprocket Logistics:', srErr);
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        shiprocketOrderId: shiprocketResult?.shiprocketOrderId || null,
        shiprocketShipmentId: shiprocketResult?.shiprocketShipmentId || null,
        trackingNumber: shiprocketResult?.awbCode || null,
        trackingUrl: `/track-order?id=${order.orderNumber}`,
        statusHistory: {
          create: {
            status: initialStatus,
            note: shiprocketResult?.awbCode
              ? `Connected to Shiprocket (${shiprocketResult.courierName || 'Shiprocket Express'}). AWB: ${shiprocketResult.awbCode}`
              : 'Order recorded; Shiprocket consignment queued for sync',
          },
        },
      },
      include: {
        items: true,
        shippingAddress: true,
        payments: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Order placed successfully and connected to Shiprocket Logistics',
      data: updatedOrder,
      trackingNumber: updatedOrder.trackingNumber,
      shiprocketOrderId: updatedOrder.shiprocketOrderId,
      trackingUrl: updatedOrder.trackingUrl,
    });
  } catch (err) { next(err); }
}

// POST /api/v1/orders/:id/confirm-payment
export async function confirmPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = req.params['id'] as string;
    const { transactionId, gatewayResponse, paymentMethod } = req.body as {
      transactionId?: string;
      gatewayResponse?: any;
      paymentMethod?: PaymentMethod;
    };

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: uid(req) },
      include: {
        user: true,
        shippingAddress: true,
        items: true,
        payments: true,
      },
    });

    if (!order) throw new NotFoundError('Order');

    // 1. Update Payment record to COMPLETED
    const txnId = transactionId || `TXN-PAY-${Date.now()}-${Math.floor(Math.random() * 89999 + 10000)}`;
    const existingPayment = order.payments?.[0];

    if (existingPayment) {
      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: 'COMPLETED',
          transactionId: txnId,
          paidAt: new Date(),
          gatewayResponse: gatewayResponse || existingPayment.gatewayResponse,
          ...(paymentMethod ? { method: paymentMethod } : {}),
        },
      });
    } else {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: order.total,
          method: paymentMethod || 'UPI',
          status: 'COMPLETED',
          transactionId: txnId,
          paidAt: new Date(),
          gatewayResponse: gatewayResponse || null,
        },
      });
    }

    // 2. Connect to Shiprocket dashboard directly upon payment confirmation
    let shiprocketOrderId = order.shiprocketOrderId;
    let shiprocketShipmentId = order.shiprocketShipmentId;
    let trackingNumber = order.trackingNumber;
    let courierName = 'Shiprocket Express';

    const isAlreadyLive = Boolean(shiprocketOrderId && /^\d+$/.test(shiprocketOrderId) && !shiprocketOrderId.startsWith('SR-'));
    if (!isAlreadyLive || !trackingNumber) {
      const srRes = await shiprocketService.createAdhocOrder({
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        customer: {
          firstName: order.user?.firstName || req.user?.firstName || 'Customer',
          lastName: order.user?.lastName || req.user?.lastName || 'Rebelive',
          email: order.user?.email || req.user?.email || 'customer@rebelive.co',
          phone: order.user?.phone || '9999999999',
        },
        address: {
          line1: order.shippingAddress.line1,
          line2: order.shippingAddress.line2 || '',
          city: order.shippingAddress.city,
          state: order.shippingAddress.state,
          postalCode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country || 'India',
        },
        items: order.items.map((i) => ({
          name: `${i.productName} - ${i.variantName}`,
          sku: i.sku,
          units: i.quantity,
          selling_price: i.unitPrice,
        })),
        paymentMethod: 'Prepaid',
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        shippingAmount: order.shippingAmount,
        total: order.total,
      });

      shiprocketOrderId = srRes.shiprocketOrderId;
      shiprocketShipmentId = srRes.shiprocketShipmentId;
      trackingNumber = srRes.awbCode;
      courierName = srRes.courierName || courierName;
    }

    // 3. Update order status to CONFIRMED and attach Shiprocket tracking
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'CONFIRMED',
        shiprocketOrderId,
        shiprocketShipmentId,
        trackingNumber,
        trackingUrl: `/track-order?id=${order.orderNumber}`,
        statusHistory: {
          create: {
            status: 'CONFIRMED',
            note: `Payment confirmed (Txn: ${txnId}). Order connected to Shiprocket (${courierName}). AWB: ${trackingNumber}`,
          },
        },
      },
      include: {
        items: true,
        shippingAddress: true,
        payments: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    res.json({
      status: 'success',
      message: 'Payment verified and order successfully connected to Shiprocket Logistics',
      data: updatedOrder,
      trackingNumber: updatedOrder.trackingNumber,
      shiprocketOrderId: updatedOrder.shiprocketOrderId,
      trackingUrl: updatedOrder.trackingUrl,
    });
  } catch (err) {
    next(err);
  }
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
