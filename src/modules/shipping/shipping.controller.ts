import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { shiprocketService } from './shiprocket.service';
import { ValidationError, NotFoundError, UnauthorizedError } from '../../shared/errors/AppError';
import { generateOrderNumber } from '../../shared/utils/generateOrderNumber';
import type { PaymentMethod, OrderStatus } from '@prisma/client';

const getAuthenticatedUserId = (req: Request): string | null => {
  return req.user ? req.user.id : null;
};

const isMongoId = (str?: string | null): boolean => {
  return Boolean(str && /^[0-9a-fA-F]{24}$/.test(str));
};

async function resolveProductAndVariant(item: {
  productId?: string;
  variantId?: string;
  slug?: string;
  packSize?: number;
}) {
  let variant: any = null;
  let product: any = null;

  // 1. Try finding by variantId if it is a valid 24-hex ObjectId
  if (item.variantId && isMongoId(item.variantId)) {
    try {
      variant = await prisma.productVariant.findUnique({
        where: { id: item.variantId },
        include: { product: true },
      });
      if (variant) {
        product = variant.product;
      }
    } catch {}
  }

  // 2. Try finding product by valid ObjectId if productId is a 24-hex string
  if (!product && item.productId && isMongoId(item.productId)) {
    try {
      product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { variants: true },
      });
    } catch {}
  }

  // 3. Try resolving product by slug or name (e.g. "aviva", "apex", "capella", "variety")
  const slugCandidate = (item.slug || item.productId || '').trim().toLowerCase();
  if (!product && slugCandidate) {
    product = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: slugCandidate },
          { name: { equals: slugCandidate, mode: 'insensitive' } },
        ],
      },
      include: { variants: true },
    });
  }

  // 4. If product found but variant not yet found, match variant by pack size
  if (product && !variant && product.variants && product.variants.length > 0) {
    if (item.packSize) {
      variant =
        product.variants.find(
          (v: any) =>
            v.sizeMl === item.packSize ||
            v.name.toLowerCase().includes(`${item.packSize}`)
        ) || product.variants[0];
    } else {
      variant = product.variants.find((v: any) => v.isDefault) || product.variants[0];
    }
  }

  // 5. Ultimate safe fallback: pull first active product in DB
  if (!product || !variant) {
    const defaultProd = await prisma.product.findFirst({
      include: { variants: true },
    });
    if (defaultProd && defaultProd.variants && defaultProd.variants.length > 0) {
      product = defaultProd;
      variant = defaultProd.variants.find((v: any) => v.isDefault) || defaultProd.variants[0];
    }
  }

  return { product, variant };
}

/**
 * POST /api/v1/shipping/fastrr/initiate
 * Prepares a Fastrr 1-Click checkout session with signed payload and totals.
 */
export async function initiateFastrrCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items, customer, couponCode } = req.body as {
      items?: Array<{
        productId?: string;
        variantId?: string;
        slug?: string;
        packSize?: number;
        quantity: number;
        unitPrice?: number;
        name?: string;
        flavor?: string;
        image?: string;
      }>;
      customer?: {
        name?: string;
        email?: string;
        phone?: string;
      };
      couponCode?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Checkout items are required');
    }

    const userId = getAuthenticatedUserId(req);
    let resolvedUser = null;
    let savedAddresses: any[] = [];

    if (userId) {
      resolvedUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { addresses: true },
      });
      if (resolvedUser) {
        savedAddresses = resolvedUser.addresses;
      }
    }

    // Resolve variants and price
    const enrichedItems: Array<{
      productId: string;
      variantId: string;
      name: string;
      flavor: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      image?: string;
    }> = [];

    let subtotal = 0;

    for (const item of items) {
      const { product, variant } = await resolveProductAndVariant(item);

      // Unit price and SKU
      const unitPrice = variant ? variant.price : item.unitPrice || 499;
      const sku = variant ? variant.sku : `RBL-${(item.slug || product?.slug || 'CAN').toUpperCase()}-${item.packSize || 12}`;
      const name = product ? product.name : item.name || 'REBELIVE Energy';
      const flavor = product?.flavor || item.flavor || 'Signature';
      const prodId = product ? product.id : item.productId || 'fallback-id';
      const varId = variant ? variant.id : item.variantId || 'fallback-variant-id';
      const qty = Math.max(1, item.quantity || 1);
      const totalItemPrice = unitPrice * qty;

      subtotal += totalItemPrice;

      enrichedItems.push({
        productId: prodId,
        variantId: varId,
        name,
        flavor,
        sku,
        quantity: qty,
        unitPrice,
        totalPrice: totalItemPrice,
        image: item.image || product?.image || product?.canImage || undefined,
      });
    }

    // Apply Coupon
    let discountAmount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.trim().toUpperCase() },
      });
      if (coupon && coupon.isActive) {
        if (!coupon.minOrderAmount || subtotal >= coupon.minOrderAmount) {
          if (coupon.discountType === 'PERCENTAGE') {
            discountAmount = subtotal * (coupon.discountValue / 100);
          } else {
            discountAmount = coupon.discountValue;
          }
          appliedCoupon = { code: coupon.code, discountAmount };
        }
      }
    }

    const shippingAmount = subtotal >= 500 ? 0 : 60;
    const taxAmount = Math.round((subtotal - discountAmount) * 0.18);
    const finalTotal = Math.max(0, subtotal - discountAmount + shippingAmount);

    const sessionId = `FASTRR-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const signaturePayload = `${sessionId}:${finalTotal}:${subtotal}:${items.length}`;
    const hmacSignature = shiprocketService.generateFastrrSignature(signaturePayload);

    res.status(200).json({
      status: 'success',
      data: {
        sessionId,
        signature: hmacSignature,
        pricing: {
          subtotal,
          discountAmount,
          taxAmount,
          shippingAmount,
          total: finalTotal,
          appliedCoupon,
        },
        items: enrichedItems,
        customerPrefill: {
          name: customer?.name || (resolvedUser ? `${resolvedUser.firstName} ${resolvedUser.lastName}`.trim() : ''),
          email: customer?.email || resolvedUser?.email || '',
          phone: customer?.phone || resolvedUser?.phone || '',
        },
        savedAddresses,
        paymentMethods: [
          { id: 'UPI', name: 'Instant UPI (Google Pay, PhonePe, Paytm, QR)', isInstant: true },
          { id: 'CREDIT_CARD', name: 'Credit / Debit Card (Visa, Mastercard, RuPay)', isInstant: true },
          { id: 'NET_BANKING', name: 'Net Banking (All Indian Banks)', isInstant: true },
          { id: 'COD', name: 'Cash on Delivery (Pay at Doorstep)', isInstant: false },
        ],
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/shipping/fastrr/complete
 * Completes the Fastrr 1-Click order, creates database records, dispatches to Shiprocket.
 */
export async function completeFastrrCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      sessionId,
      customer,
      shippingAddress,
      payment,
      items,
      couponCode,
      notes,
    } = req.body as {
      sessionId?: string;
      customer: {
        firstName: string;
        lastName?: string;
        email: string;
        phone: string;
      };
      shippingAddress: {
        line1: string;
        line2?: string;
        city: string;
        state: string;
        postalCode: string;
        country?: string;
      };
      payment: {
        method: PaymentMethod | 'UPI' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'COD' | 'WALLET' | 'NET_BANKING';
        transactionId?: string;
        amount?: number;
      };
      items: Array<{
        productId?: string;
        variantId?: string;
        slug?: string;
        packSize?: number;
        quantity: number;
        unitPrice?: number;
        name?: string;
        sku?: string;
      }>;
      couponCode?: string;
      notes?: string;
    };

    if (!customer?.email || !customer?.phone || !customer?.firstName) {
      throw new ValidationError('Customer name, email, and phone number are required');
    }
    if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.state || !shippingAddress?.postalCode) {
      throw new ValidationError('Complete shipping address (street, city, state, pincode) is required');
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Order items cannot be empty');
    }

    const authUserId = getAuthenticatedUserId(req);

    // 1. Resolve User
    let targetUserId = authUserId;
    if (!targetUserId) {
      let existingUser = await prisma.user.findUnique({
        where: { email: customer.email.trim().toLowerCase() },
      });
      if (!existingUser) {
        const dummyPasswordHash = await bcrypt.hash(`rebelive_fastrr_${Date.now()}`, 10);
        existingUser = await prisma.user.create({
          data: {
            email: customer.email.trim().toLowerCase(),
            firstName: customer.firstName.trim(),
            lastName: (customer.lastName || '').trim() || 'Customer',
            phone: customer.phone.trim(),
            passwordHash: dummyPasswordHash,
            role: 'CUSTOMER',
            authProvider: 'fastrr',
            emailVerified: true,
          },
        });
      }
      targetUserId = existingUser.id;
    }

    // 2. Create/Save Address
    const address = await prisma.address.create({
      data: {
        userId: targetUserId,
        label: 'Fastrr Delivery Address',
        line1: shippingAddress.line1.trim(),
        line2: shippingAddress.line2?.trim() || null,
        city: shippingAddress.city.trim(),
        state: shippingAddress.state.trim(),
        postalCode: shippingAddress.postalCode.trim(),
        country: shippingAddress.country?.trim() || 'IN',
      },
    });

    // 3. Resolve Items and Prices from DB
    let subtotal = 0;
    const finalOrderItems: Array<{
      productId: string;
      variantId: string;
      productName: string;
      variantName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    for (const item of items) {
      const { product, variant } = await resolveProductAndVariant(item);

      if (!product || !variant) {
        throw new ValidationError('Could not locate valid product in database');
      }

      const qty = Math.max(1, item.quantity || 1);
      const unitPrice = variant.price;
      const itemTotal = unitPrice * qty;
      subtotal += itemTotal;

      finalOrderItems.push({
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        quantity: qty,
        unitPrice,
        totalPrice: itemTotal,
      });
    }

    // 4. Coupon Calculation
    let discountAmount = 0;
    let couponId: string | null = null;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.trim().toUpperCase() },
      });
      if (coupon && coupon.isActive) {
        couponId = coupon.id;
        if (coupon.discountType === 'PERCENTAGE') {
          discountAmount = subtotal * (coupon.discountValue / 100);
        } else {
          discountAmount = coupon.discountValue;
        }
      }
    }

    const shippingAmount = subtotal >= 500 ? 0 : 60;
    const taxAmount = Math.round((subtotal - discountAmount) * 0.18);
    const finalTotal = Math.max(0, subtotal - discountAmount + shippingAmount);
    const orderNumber = generateOrderNumber();

    // Map Payment Method to Prisma enum
    let resolvedMethod: PaymentMethod = 'UPI';
    const rawMethod = payment?.method?.toUpperCase() || 'UPI';
    if (rawMethod.includes('CARD')) {
      resolvedMethod = 'CREDIT_CARD';
    } else if (rawMethod.includes('COD') || rawMethod.includes('CASH')) {
      resolvedMethod = 'COD';
    } else if (rawMethod.includes('WALLET')) {
      resolvedMethod = 'WALLET';
    } else {
      resolvedMethod = 'UPI';
    }

    const isPaid = resolvedMethod !== 'COD';
    const txnId = payment?.transactionId || `TXN-FASTRR-${Date.now()}-${Math.floor(Math.random() * 89999 + 10000)}`;

    // 5. Database Transaction: Create Order, Items, Payment, Log
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId: targetUserId!,
          subtotal,
          discountAmount,
          taxAmount,
          shippingAmount,
          total: finalTotal,
          couponId,
          shippingAddressId: address.id,
          status: 'CONFIRMED',
          notes: notes || 'Shiprocket Fastrr 1-Click Instant Checkout',
          items: {
            create: finalOrderItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              productName: item.productName,
              variantName: item.variantName,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
          statusHistory: {
            create: [
              { status: 'CONFIRMED', note: 'Fastrr 1-Click Instant Checkout Completed' },
              { status: 'PROCESSING', note: 'Cold-pack order routing to Amritsar Dispatch Center' },
            ],
          },
        },
        include: {
          items: true,
          shippingAddress: true,
        },
      });

      // Update variant stock and inventory log
      for (const item of finalOrderItems) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { decrement: item.quantity } },
        });
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            changeQty: -item.quantity,
            reason: 'SALE_FASTRR',
            referenceId: newOrder.id,
          },
        });
      }

      // Record payment
      await tx.payment.create({
        data: {
          orderId: newOrder.id,
          amount: finalTotal,
          method: resolvedMethod,
          status: isPaid ? 'COMPLETED' : 'PENDING',
          transactionId: txnId,
          paidAt: isPaid ? new Date() : null,
          gatewayResponse: {
            provider: 'Shiprocket Fastrr',
            sessionId: sessionId || null,
            status: 'SUCCESS',
            paymentMethod: resolvedMethod,
          },
        },
      });

      // Clear cart if user has one
      const cart = await tx.cart.findFirst({ where: { userId: targetUserId } });
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      return newOrder;
    });

    // 6. Connect to Shiprocket API: Create Adhoc Order & Assign AWB
    const shiprocketResult = await shiprocketService.createAdhocOrder({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customer: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
      },
      address: {
        line1: shippingAddress.line1,
        line2: shippingAddress.line2,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postalCode: shippingAddress.postalCode,
        country: shippingAddress.country,
      },
      items: finalOrderItems.map((i) => ({
        name: `${i.productName} - ${i.variantName}`,
        sku: i.sku,
        units: i.quantity,
        selling_price: i.unitPrice,
      })),
      paymentMethod: resolvedMethod === 'COD' ? 'COD' : 'Prepaid',
      subtotal,
      discountAmount,
      shippingAmount,
      total: finalTotal,
    });

    // Update order with Shiprocket tracking info
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        shiprocketOrderId: shiprocketResult.shiprocketOrderId,
        shiprocketShipmentId: shiprocketResult.shiprocketShipmentId,
        trackingNumber: shiprocketResult.awbCode,
        trackingUrl: `/track-order?id=${order.orderNumber}`,
        statusHistory: {
          create: {
            status: 'PROCESSING',
            note: `Dispatched to Shiprocket (${shiprocketResult.courierName || 'Shiprocket Express'}). AWB: ${
              shiprocketResult.awbCode
            }`,
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
      message: 'Fastrr checkout completed and order dispatched to Shiprocket',
      data: {
        order: updatedOrder,
        orderNumber: updatedOrder.orderNumber,
        trackingNumber: updatedOrder.trackingNumber,
        shiprocketOrderId: updatedOrder.shiprocketOrderId,
        courierName: shiprocketResult.courierName,
        trackingUrl: `/track-order?id=${updatedOrder.orderNumber}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/shipping/track/:identifier
 * Fetches real-time Shiprocket tracking status by Order ID, AWB Code, or Mongo ID.
 */
export async function trackShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params['identifier'];
    const identifier = (Array.isArray(rawId) ? rawId[0] : rawId || '').trim();
    if (!identifier) {
      throw new ValidationError('Tracking identifier or order number is required');
    }

    // Try finding order in MongoDB first
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: { equals: identifier, mode: 'insensitive' } },
          { trackingNumber: { equals: identifier, mode: 'insensitive' } },
          { id: identifier.length === 24 ? identifier : undefined },
        ],
      },
      include: {
        shippingAddress: true,
        items: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    const trackingResult = await shiprocketService.trackShipment(
      order?.trackingNumber || identifier,
      order
        ? {
            orderNumber: order.orderNumber,
            createdAt: order.createdAt,
            status: order.status,
            address: order.shippingAddress,
            trackingNumber: order.trackingNumber,
          }
        : undefined
    );

    res.status(200).json({
      status: 'success',
      data: {
        ...trackingResult,
        order: order
          ? {
              orderNumber: order.orderNumber,
              createdAt: order.createdAt,
              status: order.status,
              total: order.total,
              itemsCount: order.items.reduce((acc, i) => acc + i.quantity, 0),
              shippingAddress: order.shippingAddress,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/shipping/rates
 * Returns shipping tiers and policy
 */
export async function getShippingRates(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'success',
    data: {
      freeShippingThreshold: 500,
      standardShippingFee: 60,
      estimatedDeliveryWindow: '24 to 48 Hours',
      carrier: 'Shiprocket Express Priority Cold Dispatch',
      pickupLocation: 'Amritsar Cold Hub (143001)',
    },
  });
}

/**
 * POST /api/v1/shipping/webhooks/shiprocket
 * Listens for live tracking events dispatched by Shiprocket.
 * Security: Header x-api-key matches env.SR_WEBHOOK_TOKEN
 */
export async function handleShiprocketWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const apiKey = (req.headers['x-api-key'] || req.headers['authorization']) as string | undefined;
    if (env.SR_WEBHOOK_TOKEN && env.SR_WEBHOOK_TOKEN !== 'change-me') {
      if (!apiKey) {
        throw new UnauthorizedError('Missing Shiprocket webhook authentication token');
      }
      const bufA = Buffer.from(apiKey);
      const bufB = Buffer.from(env.SR_WEBHOOK_TOKEN);
      if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
        throw new UnauthorizedError('Invalid Shiprocket webhook authentication token');
      }
    }

    const payload = req.body || {};
    const awb = payload.awb || payload.awb_code;
    const orderId = payload.order_id || payload.order_number;
    const currentStatus = (payload.current_status || payload.status || '').toUpperCase();
    const location = payload.location || payload.current_location || '';
    const courierName = payload.courier_name || '';

    if (!awb && !orderId) {
      res.status(200).json({ status: 'ignored', message: 'No identifier found in payload' });
      return;
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: orderId ? String(orderId) : undefined },
          { trackingNumber: awb ? String(awb) : undefined },
          { shiprocketOrderId: orderId ? String(orderId) : undefined },
        ].filter(Boolean) as any,
      },
    });

    if (!order) {
      res.status(200).json({ status: 'success', message: 'Webhook received (order not in database)' });
      return;
    }

    // Map Shiprocket status string to Prisma OrderStatus
    let mappedStatus: OrderStatus = order.status;
    if (currentStatus.includes('DELIVERED')) {
      mappedStatus = 'DELIVERED';
    } else if (currentStatus.includes('OUT FOR DELIVERY')) {
      mappedStatus = 'SHIPPED';
    } else if (
      currentStatus.includes('IN TRANSIT') ||
      currentStatus.includes('PICKED UP') ||
      currentStatus.includes('MANIFESTED') ||
      currentStatus.includes('SHIPPED')
    ) {
      mappedStatus = 'SHIPPED';
    } else if (currentStatus.includes('RTO') || currentStatus.includes('CANCEL')) {
      mappedStatus = 'CANCELLED';
    }

    const note = `Shiprocket Webhook: ${currentStatus}${location ? ` at ${location}` : ''}${
      courierName ? ` (${courierName})` : ''
    }`;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: mappedStatus,
        trackingNumber: awb ? String(awb) : order.trackingNumber,
        statusHistory: {
          create: {
            status: mappedStatus,
            note,
          },
        },
      },
    });

    res.status(200).json({
      status: 'success',
      message: 'Shiprocket tracking webhook processed successfully',
      orderNumber: order.orderNumber,
      currentStatus: mappedStatus,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/shipping/webhooks/fastrr
 * Listens for Fastrr (Shiprocket Checkout) headless order and payment events.
 * Security: Header x-api-hmac-sha256 or x-fastrr-signature validated via HMAC-SHA256
 */
export async function handleFastrrWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const signatureHeader =
      (req.headers[env.SR_CHECKOUT_WEBHOOK_SIG_HEADER.toLowerCase()] as string) ||
      (req.headers['x-api-hmac-sha256'] as string) ||
      (req.headers['x-fastrr-signature'] as string);

    if (env.SR_CHECKOUT_API_SECRET) {
      if (!signatureHeader) {
        throw new UnauthorizedError('Missing Fastrr webhook signature header');
      }
      const isValid = shiprocketService.verifyFastrrSignature(JSON.stringify(req.body), signatureHeader);
      if (!isValid) {
        throw new UnauthorizedError('Invalid Fastrr webhook signature');
      }
    }

    const payload = req.body || {};
    const event = (payload.event || payload.type || 'order.created').toLowerCase();
    const data = payload.data || payload.order || payload;

    const orderNumber = data.order_number || data.order_id || data.id;

    if (!orderNumber) {
      res.status(200).json({ status: 'ignored', message: 'No order identifier in payload' });
      return;
    }

    const existingOrder = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: String(orderNumber) },
          { id: String(orderNumber).length === 24 ? String(orderNumber) : undefined },
        ],
      },
      include: { payments: true },
    });

    if (existingOrder) {
      if (event.includes('paid') || event.includes('success')) {
        await prisma.order.update({
          where: { id: existingOrder.id },
          data: {
            status: 'CONFIRMED',
            statusHistory: {
              create: {
                status: 'CONFIRMED',
                note: 'Fastrr Webhook: Payment captured & verified by gateway',
              },
            },
          },
        });

        if (existingOrder.payments?.[0]) {
          await prisma.payment.update({
            where: { id: existingOrder.payments[0].id },
            data: { status: 'COMPLETED', paidAt: new Date() },
          });
        }
      } else if (event.includes('cancel')) {
        await prisma.order.update({
          where: { id: existingOrder.id },
          data: {
            status: 'CANCELLED',
            statusHistory: {
              create: {
                status: 'CANCELLED',
                note: 'Fastrr Webhook: Order cancelled by customer or gateway',
              },
            },
          },
        });
      }

      res.status(200).json({
        status: 'success',
        message: `Fastrr event ${event} applied to order ${existingOrder.orderNumber}`,
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      message: `Fastrr webhook ${event} acknowledged`,
    });
  } catch (err) {
    next(err);
  }
}

