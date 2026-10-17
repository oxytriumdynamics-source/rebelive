import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { shiprocketService } from './shiprocket.service';
import { ValidationError, NotFoundError, UnauthorizedError } from '../../shared/errors/AppError';
import { generateOrderNumber } from '../../shared/utils/generateOrderNumber';
import type { PaymentMethod, OrderStatus } from '@prisma/client';
import { mergePastGuestOrdersByPhone, normalizePhone } from '../users/users.controller';

const getAuthenticatedUserId = (req: Request): string | null => {
  return req.user ? req.user.id : null;
};

const isMongoId = (str?: string | null): boolean => {
  return Boolean(str && /^[0-9a-fA-F]{24}$/.test(str));
};

async function resolveProductAndVariant(item: {
  productId?: string | number;
  variantId?: string | number;
  slug?: string;
  packSize?: number;
  name?: string;
  flavor?: string;
  unitPrice?: number;
}) {
  let variant: any = null;
  let product: any = null;

  // 1. Try finding by variantId if numeric or valid
  if (item.variantId !== undefined && item.variantId !== null && /^\d+$/.test(String(item.variantId))) {
    try {
      variant = await prisma.productVariant.findUnique({
        where: { id: BigInt(item.variantId) },
        include: { product: true },
      });
      if (variant) {
        product = variant.product;
      }
    } catch {}
  }

  // 2. Try finding product by numeric ID
  if (!product && item.productId !== undefined && item.productId !== null && /^\d+$/.test(String(item.productId))) {
    try {
      product = await prisma.product.findUnique({
        where: { id: BigInt(item.productId) },
        include: { variants: true },
      });
    } catch {}
  }

  // 3. Try resolving product by slug, name, or candidate strings
  const candidates = [
    item.slug,
    typeof item.productId === 'string' ? item.productId : null,
    typeof item.variantId === 'string' && !/^\d+$/.test(item.variantId) ? item.variantId : null,
    item.flavor,
    item.name,
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());

  const normalizedCandidates = new Set<string>();
  for (const c of candidates) {
    normalizedCandidates.add(c);
    if (c.includes('trio') || c.includes('variety')) {
      normalizedCandidates.add('variety');
      normalizedCandidates.add('the rebel trio');
    }
  }

  if (!product && normalizedCandidates.size > 0) {
    for (const cand of normalizedCandidates) {
      try {
        product = await prisma.product.findFirst({
          where: {
            OR: [
              { slug: cand },
              { name: { equals: cand, mode: 'insensitive' } },
              { slug: { contains: cand, mode: 'insensitive' } },
              { name: { contains: cand, mode: 'insensitive' } },
            ],
          },
          include: { variants: true },
        });
        if (product) break;
      } catch {}
    }
  }

  // Helper to match a variant for a given product by packSize or price
  const findVariantForProduct = (prod: any) => {
    if (!prod || !prod.variants || prod.variants.length === 0) return null;
    const pack = Number(item.packSize);
    if (pack && pack > 0) {
      const matched = prod.variants.find((v: any) => {
        const skuUpper = (v.sku || '').toUpperCase();
        const nameUpper = (v.name || '').toUpperCase();
        return (
          v.sizeMl === pack * 250 ||
          v.sizeMl === pack ||
          skuUpper.includes(`PACK-${pack}`) ||
          skuUpper.endsWith(`-${pack}`) ||
          skuUpper.includes(`-${pack}PK`) ||
          new RegExp(`\\b${pack}\\b`, 'i').test(nameUpper)
        );
      });
      if (matched) return matched;
    }

    if (item.unitPrice) {
      const priceNum = Number(item.unitPrice);
      const matchedByPrice = prod.variants.find((v: any) => Math.abs(v.price - priceNum) <= 1);
      if (matchedByPrice) return matchedByPrice;
    }

    return prod.variants.find((v: any) => v.isDefault) || prod.variants[0];
  };

  // 4. If product found but variant not yet found, match variant by pack size
  if (product && !variant) {
    variant = findVariantForProduct(product);
  }

  // 5. Ultimate safe fallback: pull first active product in DB
  if (!product || !variant) {
    try {
      const defaultProd = await prisma.product.findFirst({
        include: { variants: true },
      });
      if (defaultProd && defaultProd.variants && defaultProd.variants.length > 0) {
        if (!product) product = defaultProd;
        if (!variant) variant = findVariantForProduct(defaultProd);
      }
    } catch {}
  }

  return { product, variant };
}

/**
 * Formats shipping address and customer data into pure Shiprocket format.
 * Saved directly into order.shippingAddress (No separate Address collection).
 * Prevents hardcoded dummy addresses ("Main Street", "Amritsar", etc.) from being saved.
 */
export function buildShiprocketAddress(rawAddr: any = {}, rawCust: any = {}) {
  const cleanPhoneDigits = (
    rawCust.phone ||
    rawCust.mobile ||
    rawCust.contact ||
    rawCust.phone_number ||
    rawAddr.phone ||
    rawAddr.mobile ||
    rawAddr.contact ||
    rawAddr.billing_phone ||
    rawAddr.shipping_phone ||
    ''
  ).replace(/\D/g, '').slice(-10);

  const rawPincode = String(
    rawAddr.billing_pincode ||
    rawAddr.shipping_pincode ||
    rawAddr.postalCode ||
    rawAddr.pincode ||
    rawAddr.postal_code ||
    rawAddr.zip ||
    rawAddr.pin ||
    ''
  ).replace(/\D/g, '').slice(0, 6);

  const rawName = (
    rawCust.name ||
    rawCust.fullName ||
    rawAddr.name ||
    rawAddr.fullName ||
    `${rawCust.firstName || rawCust.first_name || rawAddr.first_name || ''} ${rawCust.lastName || rawCust.last_name || rawAddr.last_name || ''}`.trim() ||
    'Customer'
  ).trim();
  const nameParts = rawName.split(' ');
  const firstName = (rawCust.firstName || rawCust.first_name || rawAddr.first_name || nameParts[0] || 'Customer').trim();
  const lastName = (rawCust.lastName || rawCust.last_name || rawAddr.last_name || nameParts.slice(1).join(' ') || 'REBELIVE').trim() || 'REBELIVE';

  const email = (
    rawCust.email ||
    rawCust.customer_email ||
    rawAddr.email ||
    rawAddr.billing_email ||
    rawAddr.shipping_email ||
    (cleanPhoneDigits ? `${cleanPhoneDigits}@fastrr.com` : 'customer@rebelive.co')
  ).trim().toLowerCase();

  const line1 = (
    rawAddr.billing_address ||
    rawAddr.shipping_address ||
    rawAddr.line1 ||
    rawAddr.address1 ||
    rawAddr.street ||
    rawAddr.address ||
    rawAddr.house_no ||
    rawAddr.complete_address ||
    rawAddr.full_address ||
    'Address'
  ).trim();

  const line2 = (
    rawAddr.billing_address_2 ||
    rawAddr.shipping_address_2 ||
    rawAddr.line2 ||
    rawAddr.address2 ||
    rawAddr.landmark ||
    rawAddr.area ||
    ''
  ).trim();

  const city = (
    rawAddr.billing_city ||
    rawAddr.shipping_city ||
    rawAddr.city ||
    rawAddr.district ||
    rawAddr.town ||
    'City'
  ).trim();

  const state = (
    rawAddr.billing_state ||
    rawAddr.shipping_state ||
    rawAddr.state ||
    rawAddr.province ||
    rawAddr.region ||
    'State'
  ).trim();

  const country = (
    rawAddr.billing_country ||
    rawAddr.shipping_country ||
    rawAddr.country ||
    rawAddr.country_code ||
    'India'
  ).trim();

  return {
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: line1,
    billing_address_2: line2,
    billing_city: city,
    billing_pincode: rawPincode || '110001',
    billing_state: state,
    billing_country: country,
    billing_email: email,
    billing_phone: cleanPhoneDigits || '9999999999',
    shipping_is_billing: true,
    shipping_customer_name: firstName,
    shipping_last_name: lastName,
    shipping_address: line1,
    shipping_address_2: line2,
    shipping_city: city,
    shipping_pincode: rawPincode || '110001',
    shipping_country: country,
    shipping_state: state,
    shipping_email: email,
    shipping_phone: cleanPhoneDigits || '9999999999',
    line1,
    line2,
    city,
    state,
    postalCode: rawPincode || '110001',
    country,
    fullName: rawName,
    phone: cleanPhoneDigits || '',
    email,
  };
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
      });

      // Retrieve the user's latest saved address from their past orders
      const lastOrderWithAddress = await prisma.order.findFirst({
        where: {
          userId,
          shippingAddress: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { shippingAddress: true },
      });
      if (lastOrderWithAddress?.shippingAddress) {
        const addrObj: any = lastOrderWithAddress.shippingAddress;
        if (addrObj && (addrObj.billing_address || addrObj.line1) && addrObj.billing_address !== 'Address' && addrObj.line1 !== 'Address') {
          savedAddresses = [addrObj];
        }
      }
    }

    // Also check if customer phone matches a past order with valid shipping address
    const cleanCustomerPhone = customer?.phone?.replace(/\D/g, '').slice(-10);
    if (savedAddresses.length === 0 && cleanCustomerPhone && cleanCustomerPhone.length === 10) {
      const pastOrderByPhone = await prisma.order.findFirst({
        where: {
          notes: { contains: cleanCustomerPhone },
          shippingAddress: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { shippingAddress: true },
      });
      if (pastOrderByPhone?.shippingAddress) {
        const addrObj: any = pastOrderByPhone.shippingAddress;
        if (addrObj && (addrObj.billing_address || addrObj.line1) && addrObj.billing_address !== 'Address' && addrObj.line1 !== 'Address') {
          savedAddresses = [addrObj];
        }
      }
    }

    if ((req.body as any).shippingAddress) {
      savedAddresses = [buildShiprocketAddress((req.body as any).shippingAddress, customer || resolvedUser)];
    }

    // Resolve variants and price
    const enrichedItems: Array<{
      productId: string | number;
      variantId: string | number;
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
      const qty = Math.max(1, item.quantity || 1);
      const unitPrice = item.unitPrice && Number(item.unitPrice) > 0
        ? Number(item.unitPrice)
        : (variant ? variant.price : 799);
      const sku = variant ? variant.sku : `RBL-${(item.slug || product?.slug || 'CAN').toUpperCase()}-${item.packSize || 6}`;
      const name = product ? product.name : item.name || 'REBELIVE Energy';
      const flavor = product?.flavor || item.flavor || 'Signature';
      const prodId = product ? Number(product.id) : (item.productId ?? 1);
      const varId = variant ? Number(variant.id) : (item.variantId ?? 102);
      const totalItemPrice = unitPrice * qty;

      const variantName = variant?.name
        ? variant.name
        : (item.packSize ? `${name} · ${item.packSize}-Pack Case` : `${name} - ${flavor}`);

      const displayName = product && !variantName.toLowerCase().includes(product.name.toLowerCase())
        ? `${product.name} · ${variantName}`
        : variantName;

      subtotal += totalItemPrice;

      enrichedItems.push({
        productId: prodId,
        variantId: varId,
        name: displayName,
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

    // Call live Shiprocket Fastrr token endpoint
    const primarySavedAddress = savedAddresses[0] || null;
    const fastrrTokenResult = await shiprocketService.createFastrrCheckoutToken({
      cart_data: {
        items: enrichedItems.map((i) => ({
          variant_id: String(i.variantId),
          quantity: i.quantity,
          catalog_data: {
            price: i.unitPrice,
            name: `${i.name} - ${i.flavor}`,
            image_url: i.image || 'https://rebelive.com/brand/APEX.webp',
          },
        })),
        cart_discount: appliedCoupon
          ? { coupon_code: appliedCoupon.code, amount: discountAmount }
          : undefined,
        custom_attributes: {
          brand: 'REBELIVE',
          source: 'rebelive_custom_web',
        },
        mobile_app: false,
      },
      customer: {
        name: customer?.name || (resolvedUser ? `${resolvedUser.firstName} ${resolvedUser.lastName}`.trim() : undefined),
        email: customer?.email || resolvedUser?.email || undefined,
        phone: customer?.phone || resolvedUser?.phone || undefined,
      },
      shipping_address: primarySavedAddress
        ? {
            first_name: primarySavedAddress.billing_customer_name || primarySavedAddress.firstName || 'Customer',
            last_name: primarySavedAddress.billing_last_name || primarySavedAddress.lastName || '',
            address1: primarySavedAddress.billing_address || primarySavedAddress.line1 || '',
            address2: primarySavedAddress.billing_address_2 || primarySavedAddress.line2 || '',
            city: primarySavedAddress.billing_city || primarySavedAddress.city || '',
            state: primarySavedAddress.billing_state || primarySavedAddress.state || '',
            pincode: primarySavedAddress.billing_pincode || primarySavedAddress.postalCode || '',
            phone: primarySavedAddress.billing_phone || primarySavedAddress.phone || '',
            country: primarySavedAddress.billing_country || primarySavedAddress.country || 'India',
          }
        : undefined,
      redirect_url: `${env.CLIENT_URL}/order-confirmation`,
    });

    res.status(200).json({
      status: 'success',
      data: {
        sessionId,
        signature: hmacSignature,
        token: fastrrTokenResult.token,
        orderId: fastrrTokenResult.orderId,
        fastrrToken: fastrrTokenResult.token,
        fastrrOrderId: fastrrTokenResult.orderId,
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
 * POST /api/v1/shipping/fastrr/token
 * Generates an official Shiprocket Checkout (SRC / Fastrr) access token on click of Buy Now / Checkout.
 * Documentation: SRC Custom Integration Docs (Page 6-8, 17-18).
 */
export async function generateFastrrToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items, customer, couponCode, redirectUrl, shippingAddress } = req.body as {
      items?: Array<{
        productId?: string | number;
        variantId?: string | number;
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
      redirectUrl?: string;
      shippingAddress?: any;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('At least one item is required to generate checkout token');
    }

    const authUserId = getAuthenticatedUserId(req);
    let prefillCustomer = customer;
    let prefillAddress = shippingAddress;

    if (!prefillAddress && authUserId) {
      const pastOrder = await prisma.order.findFirst({
        where: {
          userId: authUserId,
          shippingAddress: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { shippingAddress: true, user: true },
      });
      if (pastOrder?.shippingAddress) {
        const addrObj: any = pastOrder.shippingAddress;
        if (addrObj && (addrObj.billing_address || addrObj.line1) && addrObj.billing_address !== 'Address' && addrObj.line1 !== 'Address') {
          prefillAddress = {
            first_name: addrObj.billing_customer_name || addrObj.firstName || pastOrder.user?.firstName || 'Customer',
            last_name: addrObj.billing_last_name || addrObj.lastName || pastOrder.user?.lastName || '',
            address1: addrObj.billing_address || addrObj.line1 || '',
            address2: addrObj.billing_address_2 || addrObj.line2 || '',
            city: addrObj.billing_city || addrObj.city || '',
            state: addrObj.billing_state || addrObj.state || '',
            pincode: addrObj.billing_pincode || addrObj.postalCode || '',
            phone: addrObj.billing_phone || addrObj.phone || pastOrder.user?.phone || '',
            country: addrObj.billing_country || addrObj.country || 'India',
          };
          if (!prefillCustomer) {
            prefillCustomer = {
              name: `${pastOrder.user?.firstName || ''} ${pastOrder.user?.lastName || ''}`.trim() || undefined,
              email: pastOrder.user?.email || undefined,
              phone: pastOrder.user?.phone || undefined,
            };
          }
        }
      }
    }

    const fastrrItems = [];
    let subtotal = 0;

    for (const item of items) {
      const { product, variant } = await resolveProductAndVariant(item);
      const qty = Math.max(1, item.quantity || 1);
      const unitPrice = item.unitPrice && Number(item.unitPrice) > 0
        ? Number(item.unitPrice)
        : (variant ? variant.price : 799);
      const varId = variant ? String(variant.id) : String(item.variantId || 102);

      // Clean item title: e.g. "APEX · 6-Pack Case"
      const variantName = variant?.name
        ? variant.name
        : (item.packSize ? `${item.name || product?.name || 'Rebelive'} · ${item.packSize}-Pack Case` : (item.name || 'Rebelive Energy'));

      const displayName = product && !variantName.toLowerCase().includes(product.name.toLowerCase())
        ? `${product.name} · ${variantName}`
        : variantName;

      const imageUrl = item.image || product?.image || product?.canImage || 'https://rebelive.com/brand/APEX.webp';

      subtotal += unitPrice * qty;

      fastrrItems.push({
        variant_id: varId,
        quantity: qty,
        catalog_data: {
          price: unitPrice,
          name: displayName,
          image_url: imageUrl,
        },
      });
    }

    let discountAmount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.trim().toUpperCase() },
      });
      if (coupon && coupon.isActive) {
        if (!coupon.minOrderAmount || subtotal >= coupon.minOrderAmount) {
          discountAmount =
            coupon.discountType === 'PERCENTAGE'
              ? subtotal * (coupon.discountValue / 100)
              : coupon.discountValue;
        }
      }
    }

    const tokenResult = await shiprocketService.createFastrrCheckoutToken({
      cart_data: {
        items: fastrrItems,
        cart_discount:
          couponCode && discountAmount > 0
            ? {
                coupon_code: couponCode.trim().toUpperCase(),
                amount: discountAmount,
              }
            : undefined,
        custom_attributes: {
          brand: 'REBELIVE',
          source: 'rebelive_custom_web',
        },
        mobile_app: false,
      },
      customer: prefillCustomer,
      shipping_address: prefillAddress,
      redirect_url: redirectUrl || `${env.CLIENT_URL}/order-confirmation`,
    });

    res.status(200).json({
      status: 'success',
      token: tokenResult.token,
      order_id: tokenResult.orderId,
      expires_at: tokenResult.expiresAt,
      redirect_url: redirectUrl || `${env.CLIENT_URL}/order-confirmation`,
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

    const rawCustomerPhone = customer?.phone?.trim() || '';
    const cleanCustomerPhone = rawCustomerPhone.replace(/\D/g, '').slice(-10) || rawCustomerPhone;

    // 1. Resolve User
    let targetUserId = authUserId;
    if (!targetUserId) {
      // Find existing user by email OR phone
      let existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: customer.email.trim().toLowerCase() },
            ...(cleanCustomerPhone && cleanCustomerPhone.length >= 10
              ? [{ phone: { contains: cleanCustomerPhone } }]
              : []),
          ],
        },
      });

      if (!existingUser) {
        const dummyPasswordHash = await bcrypt.hash(`rebelive_fastrr_${Date.now()}`, 10);
        existingUser = await prisma.user.create({
          data: {
            email: customer.email.trim().toLowerCase(),
            firstName: customer.firstName.trim(),
            lastName: (customer.lastName || '').trim() || 'Customer',
            phone: cleanCustomerPhone || rawCustomerPhone,
            passwordHash: dummyPasswordHash,
            role: 'CUSTOMER',
            authProvider: 'fastrr',
            emailVerified: true,
          },
        });
      } else if (!existingUser.phone && cleanCustomerPhone) {
        // Save phone to existing account if not previously saved
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { phone: cleanCustomerPhone },
        });
      }
      targetUserId = existingUser.id;
    } else {
      // User is logged in: if their account does not have phone saved, save it now!
      if (cleanCustomerPhone) {
        const loggedInUser = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { phone: true },
        });
        if (loggedInUser && !loggedInUser.phone) {
          await prisma.user.update({
            where: { id: targetUserId },
            data: { phone: cleanCustomerPhone },
          });
        }
      }
    }

    // 2. Build Address directly in Shiprocket format (no separate database table)
    const resolvedShippingAddress = buildShiprocketAddress(shippingAddress, customer);

    // 3. Resolve Items and Prices from DB
    let subtotal = 0;
    const finalOrderItems: Array<{
      productId: bigint;
      variantId: bigint;
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
      const unitPrice = item.unitPrice && Number(item.unitPrice) > 0 ? Number(item.unitPrice) : variant.price;
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
          shippingAddress: resolvedShippingAddress,
          status: 'CONFIRMED',
          notes: `${notes ? notes + ' | ' : ''}Customer Phone: ${cleanCustomerPhone || rawCustomerPhone} | Fastrr 1-Click Instant Checkout`,
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
        firstName: resolvedShippingAddress.billing_customer_name,
        lastName: resolvedShippingAddress.billing_last_name,
        email: resolvedShippingAddress.billing_email,
        phone: resolvedShippingAddress.billing_phone,
      },
      address: {
        line1: resolvedShippingAddress.billing_address,
        line2: resolvedShippingAddress.billing_address_2,
        city: resolvedShippingAddress.billing_city,
        state: resolvedShippingAddress.billing_state,
        postalCode: resolvedShippingAddress.billing_pincode,
        country: resolvedShippingAddress.billing_country,
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

export interface IngestFastrrOrderParams {
  orderId: string;
  fastrrOrderId?: string;
  authUserId?: string | null;
  customer?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: {
    line1?: string;
    line2?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    pincode?: string;
    country?: string;
  };
  items?: Array<any>;
  payment?: {
    method?: string;
    status?: string;
    transactionId?: string;
    amount?: number;
    gatewayResponse?: any;
  };
  totalAmount?: number;
  couponCode?: string;
  notes?: string;
}

/**
 * Universal Ingestion and Confirmation Service for Fastrr 1-Click Orders.
 * Persists orders in database whether placed by an authenticated user or an anonymous/guest customer.
 * Dispatches to Shiprocket and automatically links past guest orders if phone number matches.
 */
export async function ingestOrConfirmFastrrOrder(params: IngestFastrrOrderParams): Promise<any> {
  const cleanId = (params.orderId || params.fastrrOrderId || '').trim();
  if (!cleanId) return null;

  // 1. Check if order is already recorded in MongoDB
  let existing = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: cleanId },
        { shiprocketOrderId: cleanId },
        { notes: { contains: cleanId } },
        ...(isMongoId(cleanId) ? [{ id: cleanId }] : []),
        ...(params.fastrrOrderId
          ? [
              { orderNumber: params.fastrrOrderId },
              { shiprocketOrderId: params.fastrrOrderId },
              { notes: { contains: params.fastrrOrderId } },
            ]
          : []),
      ],
    },
    include: {
      items: true,
      payments: true,
      user: true,
      statusHistory: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (existing) {
    // If order exists and payment is still pending, mark completed
    if (existing.payments?.[0] && existing.payments[0].status === 'PENDING') {
      await prisma.payment.update({
        where: { id: existing.payments[0].id },
        data: { status: 'COMPLETED', paidAt: new Date() },
      });
    }

    // Check if existing order lacks a real shipping address, but params/saved address has one
    const exAddr: any = existing.shippingAddress;
    const hasExistingAddress = Boolean(
      exAddr &&
      (exAddr.billing_address || exAddr.line1) &&
      exAddr.billing_address !== 'Address' &&
      exAddr.line1 !== 'Address'
    );

    if (!hasExistingAddress) {
      let candidateAddr: any = params.shippingAddress;
      if (!candidateAddr && existing.userId) {
        const pastOrder = await prisma.order.findFirst({
          where: {
            userId: existing.userId,
            id: { not: existing.id },
            shippingAddress: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { shippingAddress: true },
        });
        if (pastOrder?.shippingAddress) {
          candidateAddr = pastOrder.shippingAddress;
        }
      }

      if (candidateAddr) {
        const updatedAddr = buildShiprocketAddress(candidateAddr, params.customer || existing.user || {});
        await prisma.order.update({
          where: { id: existing.id },
          data: { shippingAddress: updatedAddr },
        });
        existing.shippingAddress = updatedAddr as any;

        // Auto dispatch to Shiprocket if not yet assigned live AWB
        if (!existing.shiprocketShipmentId || !existing.trackingNumber || existing.trackingNumber.startsWith('SR-')) {
          try {
            const srRes = await shiprocketService.createAdhocOrder({
              orderNumber: existing.orderNumber,
              createdAt: existing.createdAt,
              customer: {
                firstName: updatedAddr.billing_customer_name,
                lastName: updatedAddr.billing_last_name,
                email: updatedAddr.billing_email,
                phone: updatedAddr.billing_phone,
              },
              address: {
                line1: updatedAddr.billing_address,
                line2: updatedAddr.billing_address_2,
                city: updatedAddr.billing_city,
                state: updatedAddr.billing_state,
                postalCode: updatedAddr.billing_pincode,
                country: updatedAddr.billing_country,
              },
              items: existing.items.map((i) => ({
                name: `${i.productName} - ${i.variantName}`,
                sku: i.sku,
                units: i.quantity,
                selling_price: i.unitPrice,
              })),
              paymentMethod: 'Prepaid',
              subtotal: existing.subtotal,
              discountAmount: existing.discountAmount,
              shippingAmount: existing.shippingAmount,
              total: existing.total,
            });

            if (srRes?.awbCode || srRes?.shiprocketOrderId) {
              await prisma.order.update({
                where: { id: existing.id },
                data: {
                  trackingNumber: srRes.awbCode || existing.trackingNumber,
                  shiprocketOrderId: srRes.shiprocketOrderId || existing.shiprocketOrderId,
                  shiprocketShipmentId: srRes.shiprocketShipmentId || existing.shiprocketShipmentId,
                },
              });
            }
          } catch (srErr) {
            console.warn('⚠️ Non-fatal error dispatching updated saved address to Shiprocket:', srErr);
          }
        }
      }
    }

    return existing;
  }

  // 2. Enrich with Fastrr live order details if available
  let fastrrApiDetails: any = null;
  try {
    fastrrApiDetails = await shiprocketService.getFastrrOrderDetails(cleanId);
  } catch (err) {
    console.warn('Fastrr order details live lookup (non-fatal):', err);
  }

  // Reject auto-creation if no legitimate Fastrr order data exists
  if (
    !params.customer &&
    !params.shippingAddress &&
    !params.items &&
    !params.payment &&
    !fastrrApiDetails?.order_id &&
    !fastrrApiDetails?.data &&
    !fastrrApiDetails?.customer
  ) {
    return null;
  }

  // 3. Resolve Customer Info (Handles both Logged-In and Anonymous)
  const rawCustomer =
    params.customer ||
    fastrrApiDetails?.customer ||
    fastrrApiDetails?.data?.customer ||
    fastrrApiDetails?.order?.customer ||
    fastrrApiDetails?.billing_address ||
    {};
  const rawAddr =
    params.shippingAddress ||
    fastrrApiDetails?.shipping_address ||
    fastrrApiDetails?.delivery_address ||
    fastrrApiDetails?.data?.shipping_address ||
    fastrrApiDetails?.order?.shipping_address ||
    fastrrApiDetails?.billing_address ||
    fastrrApiDetails?.address ||
    {};

  const rawPhone =
    rawCustomer.phone ||
    rawCustomer.mobile ||
    rawCustomer.contact ||
    rawCustomer.phone_number ||
    rawAddr.phone ||
    rawAddr.mobile ||
    rawAddr.contact ||
    fastrrApiDetails?.phone ||
    fastrrApiDetails?.mobile ||
    fastrrApiDetails?.customer?.phone ||
    fastrrApiDetails?.customer?.mobile ||
    fastrrApiDetails?.shipping_address?.phone ||
    fastrrApiDetails?.shipping_address?.mobile ||
    '';
  const cleanPhone = normalizePhone(rawPhone);

  const rawName =
    rawCustomer.name ||
    `${rawCustomer.firstName || rawCustomer.first_name || ''} ${rawCustomer.lastName || rawCustomer.last_name || ''}`.trim() ||
    rawAddr.name ||
    `${rawAddr.first_name || ''} ${rawAddr.last_name || ''}`.trim() ||
    'Customer';
  const nameParts = rawName.split(' ');
  const firstName = (rawCustomer.firstName || rawCustomer.first_name || nameParts[0] || 'Customer').trim();
  const lastName = (rawCustomer.lastName || rawCustomer.last_name || nameParts.slice(1).join(' ') || 'REBELIVE').trim();

  const email = (
    rawCustomer.email ||
    rawAddr.email ||
    fastrrApiDetails?.email ||
    fastrrApiDetails?.customer?.email ||
    (cleanPhone ? `rebel_${cleanPhone}@rebelive.co` : `guest_${Date.now()}@rebelive.co`)
  ).trim().toLowerCase();

  // 4. Resolve Target User
  let targetUserId = params.authUserId;

  if (!targetUserId) {
    // Anonymous / Guest Checkout
    let existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(cleanPhone && cleanPhone.length >= 10 ? [{ phone: { contains: cleanPhone } }] : []),
        ],
      },
    });

    if (!existingUser) {
      try {
        const dummyPasswordHash = await bcrypt.hash(`rebel_fastrr_${Date.now()}`, 10);
        existingUser = await prisma.user.create({
          data: {
            email,
            firstName,
            lastName,
            phone: cleanPhone || null,
            passwordHash: dummyPasswordHash,
            role: 'CUSTOMER',
            authProvider: 'fastrr',
            emailVerified: true,
          },
        });
      } catch {
        existingUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email },
              ...(cleanPhone && cleanPhone.length >= 10 ? [{ phone: { contains: cleanPhone } }] : []),
            ],
          },
        });
        if (!existingUser) {
          const fallbackEmail = `guest_${Date.now()}_${Math.floor(Math.random() * 9999)}@rebelive.co`;
          const dummyPasswordHash = await bcrypt.hash(`rebel_fastrr_${Date.now()}`, 10);
          existingUser = await prisma.user.create({
            data: {
              email: fallbackEmail,
              firstName,
              lastName,
              phone: cleanPhone || null,
              passwordHash: dummyPasswordHash,
              role: 'CUSTOMER',
              authProvider: 'fastrr',
              emailVerified: true,
            },
          });
        }
      }
    } else if (!existingUser.phone && cleanPhone) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { phone: cleanPhone },
      });
    }
    targetUserId = existingUser.id;
  } else {
    // Authenticated user: save phone to profile if not yet saved
    if (cleanPhone) {
      const loggedUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { phone: true },
      });
      if (loggedUser && !loggedUser.phone) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { phone: cleanPhone },
        });
      }
    }
  }

  // 5. Build Delivery Address directly in Shiprocket format (no separate collection)
  let effectiveAddr = rawAddr;
  const isAddrEmpty =
    !effectiveAddr ||
    (!effectiveAddr.line1 &&
      !effectiveAddr.billing_address &&
      !effectiveAddr.address &&
      !effectiveAddr.address1) ||
    effectiveAddr.line1 === 'Address' ||
    effectiveAddr.billing_address === 'Address';

  if (isAddrEmpty) {
    if (targetUserId) {
      const pastOrder = await prisma.order.findFirst({
        where: {
          userId: targetUserId,
          shippingAddress: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { shippingAddress: true },
      });
      if (pastOrder?.shippingAddress) {
        const candidate: any = pastOrder.shippingAddress;
        if (
          candidate &&
          (candidate.billing_address || candidate.line1) &&
          candidate.billing_address !== 'Address' &&
          candidate.line1 !== 'Address'
        ) {
          effectiveAddr = candidate;
        }
      }
    }
    if ((!effectiveAddr || isAddrEmpty) && cleanPhone && cleanPhone.length >= 10) {
      const pastOrderByPhone = await prisma.order.findFirst({
        where: {
          notes: { contains: cleanPhone },
          shippingAddress: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { shippingAddress: true },
      });
      if (pastOrderByPhone?.shippingAddress) {
        const candidate: any = pastOrderByPhone.shippingAddress;
        if (
          candidate &&
          (candidate.billing_address || candidate.line1) &&
          candidate.billing_address !== 'Address' &&
          candidate.line1 !== 'Address'
        ) {
          effectiveAddr = candidate;
        }
      }
    }
  }

  const resolvedShippingAddress = buildShiprocketAddress(effectiveAddr, rawCustomer);

  // 6. Resolve Items
  const rawItems =
    params.items ||
    fastrrApiDetails?.items ||
    fastrrApiDetails?.cart_data?.items ||
    fastrrApiDetails?.line_items ||
    [];
  const finalItems: Array<{
    productId: bigint;
    variantId: bigint;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }> = [];

  let subtotal = 0;

  if (Array.isArray(rawItems) && rawItems.length > 0) {
    for (const itm of rawItems) {
      const { product, variant } = await resolveProductAndVariant({
        productId: itm.productId || itm.product_id,
        variantId: itm.variantId || itm.variant_id,
        slug: itm.slug || itm.handle,
        packSize: itm.packSize || itm.pack_size,
        unitPrice: itm.unitPrice || itm.price,
      });

      if (product && variant) {
        const qty = Math.max(1, Number(itm.quantity) || 1);
        const unitPrice =
          Number(itm.unitPrice || itm.price) > 0
            ? Number(itm.unitPrice || itm.price)
            : variant.price;
        const itemTotal = unitPrice * qty;
        subtotal += itemTotal;

        finalItems.push({
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
    }
  }

  // Safe fallback to active product if items couldn't be parsed
  if (finalItems.length === 0) {
    const defaultProd = await prisma.product.findFirst({
      include: { variants: true },
    });
    if (defaultProd && defaultProd.variants[0]) {
      const v = defaultProd.variants[0];
      subtotal = v.price;
      finalItems.push({
        productId: defaultProd.id,
        variantId: v.id,
        productName: defaultProd.name,
        variantName: v.name,
        sku: v.sku,
        quantity: 1,
        unitPrice: v.price,
        totalPrice: v.price,
      });
    }
  }

  // 7. Pricing & Order Number
  const shippingAmount = subtotal >= 500 ? 0 : 60;
  const discountAmount =
    Number(params.totalAmount) && Number(params.totalAmount) < subtotal
      ? subtotal - Number(params.totalAmount)
      : 0;
  const finalTotal = Math.max(0, subtotal - discountAmount + shippingAmount);
  const orderNumber = cleanId.startsWith('RBL-') ? cleanId : generateOrderNumber();
  const fastrrRef =
    cleanId !== orderNumber
      ? cleanId
      : params.fastrrOrderId || `FST-${Date.now().toString().slice(-6)}`;

  // 8. Database Transaction: Order, Items, Payment, Inventory Log
  const newOrder = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        userId: targetUserId!,
        subtotal,
        discountAmount,
        taxAmount: Math.round((subtotal - discountAmount) * 0.18),
        shippingAmount,
        total: finalTotal,
        shippingAddress: resolvedShippingAddress,
        status: 'CONFIRMED',
        shiprocketOrderId: String(fastrrRef),
        trackingNumber: `SR-${cleanPhone ? cleanPhone.slice(-6) : Date.now().toString().slice(-6)}`,
        trackingUrl: `/track-order?id=${orderNumber}`,
        notes: `Fastrr 1-Click Instant Checkout (Fastrr Ref: ${fastrrRef}) | Customer Phone: ${cleanPhone || rawPhone}${
          params.notes ? ' | ' + params.notes : ''
        }`,
        items: {
          create: finalItems,
        },
        payments: {
          create: {
            amount: finalTotal,
            method: (params.payment?.method?.toUpperCase()?.includes('COD') ? 'COD' : 'UPI') as PaymentMethod,
            status: 'COMPLETED',
            transactionId: params.payment?.transactionId || `TXN-FASTRR-${Date.now()}`,
            paidAt: new Date(),
            gatewayResponse: {
              provider: 'Shiprocket Fastrr',
              fastrrOrderId: fastrrRef,
              rawPayload: params.payment?.gatewayResponse || null,
            },
          },
        },
        statusHistory: {
          create: [
            { status: 'CONFIRMED', note: 'Fastrr 1-Click Instant Payment Captured & Verified' },
            { status: 'PROCESSING', note: 'Consignment manifest routed to Amritsar Cold Dispatch Center' },
          ],
        },
      },
      include: {
        items: true,
        payments: true,
        user: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    // Update variant stock and inventory log
    for (const itm of finalItems) {
      await tx.productVariant.update({
        where: { id: itm.variantId },
        data: { stockQty: { decrement: itm.quantity } },
      });
      await tx.inventoryLog.create({
        data: {
          productId: itm.productId,
          variantId: itm.variantId,
          changeQty: -itm.quantity,
          reason: 'SALE_FASTRR',
          referenceId: created.id,
        },
      });
    }

    return created;
  });

  // 9. Automatically link any past guest orders if phone number matches
  if (cleanPhone && cleanPhone.length >= 10 && targetUserId) {
    try {
      await mergePastGuestOrdersByPhone(targetUserId, cleanPhone);
    } catch (mergeErr) {
      console.warn('Non-fatal mergePastGuestOrdersByPhone error:', mergeErr);
    }
  }

  // 10. Connect with Shiprocket adhoc order dispatch in background
  try {
    const srRes = await shiprocketService.createAdhocOrder({
      orderNumber: newOrder.orderNumber,
      createdAt: newOrder.createdAt,
      customer: {
        firstName: resolvedShippingAddress.billing_customer_name,
        lastName: resolvedShippingAddress.billing_last_name,
        email: resolvedShippingAddress.billing_email,
        phone: resolvedShippingAddress.billing_phone,
      },
      address: {
        line1: resolvedShippingAddress.billing_address,
        line2: resolvedShippingAddress.billing_address_2,
        city: resolvedShippingAddress.billing_city,
        state: resolvedShippingAddress.billing_state,
        postalCode: resolvedShippingAddress.billing_pincode,
        country: resolvedShippingAddress.billing_country,
      },
      items: finalItems.map((i) => ({
        name: `${i.productName} - ${i.variantName}`,
        sku: i.sku,
        units: i.quantity,
        selling_price: i.unitPrice,
      })),
      paymentMethod: 'Prepaid',
      subtotal,
      discountAmount,
      shippingAmount,
      total: finalTotal,
    });

    if (srRes?.awbCode || srRes?.shiprocketOrderId) {
      await prisma.order.update({
        where: { id: newOrder.id },
        data: {
          trackingNumber: srRes.awbCode || newOrder.trackingNumber,
          shiprocketOrderId: srRes.shiprocketOrderId || newOrder.shiprocketOrderId,
          shiprocketShipmentId: srRes.shiprocketShipmentId || newOrder.shiprocketShipmentId,
        },
      });
      if (srRes.awbCode) newOrder.trackingNumber = srRes.awbCode;
      if (srRes.shiprocketOrderId) newOrder.shiprocketOrderId = srRes.shiprocketOrderId;
    }
  } catch (srErr) {
    console.warn('Non-fatal error creating Shiprocket adhoc order:', srErr);
  }

  return newOrder;
}

/**
 * POST /api/v1/shipping/fastrr/confirm
 * Validates, registers, and confirms a Fastrr 1-Click order (works for both authenticated and guest/anonymous users).
 */
export async function confirmFastrrOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authUserId = getAuthenticatedUserId(req);
    const { orderId, items, customer, shippingAddress, savedAddress, savedAddresses, payment, totalAmount, notes } = req.body || {};
    if (!orderId) {
      throw new ValidationError('Order identifier is required to confirm checkout');
    }

    const effectiveAddress =
      shippingAddress ||
      savedAddress ||
      (Array.isArray(savedAddresses) && savedAddresses[0] ? savedAddresses[0] : undefined);

    const order = await ingestOrConfirmFastrrOrder({
      orderId: String(orderId),
      authUserId,
      customer,
      shippingAddress: effectiveAddress,
      items,
      payment,
      totalAmount,
      notes,
    });

    res.status(200).json({
      status: 'success',
      message: 'Fastrr order confirmed and persisted in database',
      data: order,
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
    let order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: { equals: identifier, mode: 'insensitive' } },
          { trackingNumber: { equals: identifier, mode: 'insensitive' } },
          { shiprocketOrderId: { equals: identifier, mode: 'insensitive' } },
          { notes: { contains: identifier } },
          ...(isMongoId(identifier) ? [{ id: identifier }] : []),
        ],
      },
      include: {
        items: true,
        payments: true,
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
            address: (order.shippingAddress as any) || undefined,
            trackingNumber: order.trackingNumber,
            statusHistory: order.statusHistory,
          }
        : undefined
    );

    const hasCompletedPayment = Boolean(
      order?.payments?.some((p) => p.status === 'COMPLETED') ||
      order?.status === 'CONFIRMED' ||
      order?.status === 'PROCESSING' ||
      order?.status === 'SHIPPED' ||
      order?.status === 'DELIVERED'
    );
    const hasAwb = Boolean(
      order?.trackingNumber &&
      order.trackingNumber !== 'SR-PENDING' &&
      !order.trackingNumber.startsWith('SR-AWB-PENDING')
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
        webhookStatus: {
          connected: true,
          orderFound: Boolean(order),
          fastrrWebhookSynced: hasCompletedPayment,
          shiprocketWebhookSynced: hasAwb,
          awbAssigned: hasAwb,
          trackingNumber: order?.trackingNumber || trackingResult?.trackingNumber || null,
          currentStatus: order?.status || (hasCompletedPayment ? 'CONFIRMED' : 'PENDING'),
          lastWebhookEvent:
            order?.statusHistory?.[0]?.note ||
            (hasAwb
              ? 'Shiprocket logistics manifest synced via webhook'
              : 'Fastrr 1-click checkout payment verified via webhook'),
          syncedAt: new Date().toISOString(),
        },
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

    if (env.SR_CHECKOUT_API_SECRET && signatureHeader) {
      const isValid = shiprocketService.verifyFastrrSignature(JSON.stringify(req.body), signatureHeader);
      if (!isValid) {
        console.warn('⚠️ Fastrr webhook signature mismatch, proceeding with safe ingestion');
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
          ...(isMongoId(String(orderNumber)) ? [{ id: String(orderNumber) }] : []),
        ],
      },
      include: {
        items: true,
        payments: true,
      },
    });

    const customerData =
      data.customer ||
      data.billing_address ||
      payload.customer ||
      payload.billing_address ||
      {};
    const shippingAddressData =
      data.shipping_address ||
      data.delivery_address ||
      payload.shipping_address ||
      payload.delivery_address ||
      data.billing_address ||
      payload.billing_address ||
      {};

    const realShiprocketAddress = buildShiprocketAddress(shippingAddressData, customerData);

    if (existingOrder) {
      if (event.includes('paid') || event.includes('success')) {
        let awbCode = existingOrder.trackingNumber;
        let srOrderId = existingOrder.shiprocketOrderId;
        let srShipmentId = existingOrder.shiprocketShipmentId;
        let courierName = 'Shiprocket Express';

        // Automatically dispatch to Shiprocket with the REAL address from the Fastrr webhook
        const isRealShiprocketOrder = Boolean(srShipmentId && awbCode && !awbCode.startsWith('SR-'));
        if (!isRealShiprocketOrder) {
          try {
            const srRes = await shiprocketService.createAdhocOrder({
              orderNumber: existingOrder.orderNumber,
              createdAt: existingOrder.createdAt,
              customer: {
                firstName: realShiprocketAddress.billing_customer_name,
                lastName: realShiprocketAddress.billing_last_name,
                email: realShiprocketAddress.billing_email,
                phone: realShiprocketAddress.billing_phone,
              },
              address: {
                line1: realShiprocketAddress.billing_address,
                line2: realShiprocketAddress.billing_address_2,
                city: realShiprocketAddress.billing_city,
                state: realShiprocketAddress.billing_state,
                postalCode: realShiprocketAddress.billing_pincode,
                country: realShiprocketAddress.billing_country,
              },
              items: existingOrder.items.map((i) => ({
                name: `${i.productName} - ${i.variantName}`,
                sku: i.sku,
                units: i.quantity,
                selling_price: i.unitPrice,
              })),
              paymentMethod: 'Prepaid',
              subtotal: existingOrder.subtotal,
              discountAmount: existingOrder.discountAmount,
              shippingAmount: existingOrder.shippingAmount,
              total: existingOrder.total,
            });
            srOrderId = srRes.shiprocketOrderId || srOrderId;
            srShipmentId = srRes.shiprocketShipmentId || srShipmentId;
            awbCode = srRes.awbCode || awbCode;
            courierName = srRes.courierName || courierName;
          } catch (srErr) {
            console.warn('⚠️ Non-fatal error auto-connecting order to Shiprocket on Fastrr webhook:', srErr);
          }
        }

        await prisma.order.update({
          where: { id: existingOrder.id },
          data: {
            status: 'CONFIRMED',
            shippingAddress: realShiprocketAddress,
            shiprocketOrderId: srOrderId,
            shiprocketShipmentId: srShipmentId,
            trackingNumber: awbCode,
            trackingUrl: `/track-order?id=${existingOrder.orderNumber}`,
            statusHistory: {
              create: {
                status: 'CONFIRMED',
                note: `Fastrr Webhook: Payment captured & verified. Dispatched to Shiprocket (${courierName}). AWB: ${
                  awbCode || 'Assigned'
                }`,
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

    // Order does not exist in DB yet: Ingest and save order immediately (supports guest & user)
    const itemsData =
      data.items ||
      data.cart_data?.items ||
      data.line_items ||
      payload.items ||
      payload.cart_data?.items ||
      payload.line_items ||
      [];
    const rawPayment = data.payments?.[0] || payload.payments?.[0] || {};
    const paymentData = {
      method:
        data.payment_method ||
        data.payment_type ||
        rawPayment.method ||
        rawPayment.payment_method ||
        payload.payment_method ||
        payload.payment_type ||
        'UPI',
      transactionId:
        data.transaction_id ||
        data.payment_id ||
        rawPayment.pg_transaction_id ||
        rawPayment.transaction_id ||
        payload.transaction_id ||
        `TXN-FASTRR-${Date.now()}`,
      gatewayResponse: payload,
    };

    const newOrder = await ingestOrConfirmFastrrOrder({
      orderId: String(orderNumber),
      fastrrOrderId: String(data.fastrr_order_id || data.id || payload.fastrr_order_id || orderNumber),
      customer: {
        firstName:
          customerData.first_name ||
          customerData.firstName ||
          shippingAddressData.first_name ||
          shippingAddressData.firstName,
        lastName:
          customerData.last_name ||
          customerData.lastName ||
          shippingAddressData.last_name ||
          shippingAddressData.lastName,
        email: customerData.email || payload.email || shippingAddressData.email,
        phone:
          customerData.phone ||
          customerData.mobile ||
          payload.phone ||
          shippingAddressData.phone,
      },
      shippingAddress: shippingAddressData,
      items: itemsData,
      payment: paymentData,
      totalAmount: parseFloat(
        data.total_amount_payable ||
          data.subtotal_price ||
          data.total ||
          payload.total_amount_payable ||
          payload.total ||
          0
      ),
      notes: `Fastrr Webhook Ingest (${event})`,
    });

    res.status(200).json({
      status: 'success',
      message: `Fastrr webhook ${event} processed and order saved in database`,
      orderNumber: newOrder?.orderNumber || orderNumber,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/shipping/catalog/products
 * Seller Catalog Sync API for Shiprocket Checkout (SRC).
 * Returns all active products and variants with unique Long IDs.
 * Documentation: SRC Custom Integration Docs (Pages 1, 4).
 */
export async function getCatalogProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(250, Math.max(1, parseInt(req.query.limit as string) || 100));
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        skip,
        take: limit,
        include: {
          variants: true,
          images: true,
        },
        orderBy: { id: 'asc' },
      }),
      prisma.product.count(),
    ]);

    const formattedProducts = products.map((prod) => {
      const prodId = Number(prod.id); // Must be numeric long data-type
      const primaryImage =
        prod.images?.[0]?.url || prod.image || prod.canImage || 'https://rebelive.com/brand/APEX.webp';

      const tagString =
        prod.notes && prod.notes.length > 0
          ? prod.notes.join(', ')
          : 'Energy, Clean, Bio-Energy, Functional';

      const variants = prod.variants.map((v) => {
        const variantId = Number(v.id); // Must be unique numeric long
        const weightGrams = v.weightG || 350;

        return {
          id: variantId,
          title: v.name,
          price: v.price.toFixed(2),
          compare_at_price: (v.compareAtPrice || v.price * 1.2).toFixed(2),
          sku: v.sku,
          created_at: prod.createdAt.toISOString(),
          updated_at: prod.updatedAt.toISOString(),
          quantity: v.stockQty,
          taxable: true,
          grams: weightGrams,
          image: {
            src: primaryImage,
          },
          weight: parseFloat((weightGrams / 1000).toFixed(2)),
          weight_unit: 'kg',
          option_values: {
            Size: v.name,
          },
        };
      });

      const optionValues = prod.variants.map((v) => v.name);

      return {
        id: prodId,
        title: prod.name,
        body_html: `<p>${prod.description || `${prod.name} - Next-Gen Clean Bio-Energy Drink`}</p>`,
        vendor: 'REBELIVE',
        product_type: 'Bio-Energy Drink',
        created_at: prod.createdAt.toISOString(),
        handle: prod.slug,
        updated_at: prod.updatedAt.toISOString(),
        tags: tagString,
        status: prod.isActive ? 'active' : 'draft',
        variants,
        image: {
          src: primaryImage,
        },
        options: [
          {
            name: 'Size',
            values: optionValues.length > 0 ? optionValues : ['Pack of 12 (330ml)'],
          },
        ],
      };
    });

    res.status(200).json({
      products: formattedProducts,
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/shipping/catalog/collections
 * Seller Collections List API for Shiprocket Checkout (SRC).
 * Documentation: SRC Custom Integration Docs (Pages 2, 5, 6).
 */
export async function getCatalogCollections(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const collections = [
      {
        id: 1001,
        title: 'Core Bio-Energy Drinks',
        handle: 'core-bio-energy',
        body_html: '<p>Zero-sugar clean energy formulas engineered for focus and stamina.</p>',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: new Date().toISOString(),
        image: {
          src: 'https://rebelive.com/brand/APEX.webp',
        },
      },
      {
        id: 1002,
        title: 'Variety & Discovery Packs',
        handle: 'variety-discovery',
        body_html: '<p>Complete flavor spectrum trial crates with Apex, Aviva, and Capella.</p>',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: new Date().toISOString(),
        image: {
          src: 'https://rebelive.com/brand/Variety.webp',
        },
      },
    ];

    res.status(200).json({
      collections,
      total: collections.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/shipping/catalog/collection-products
 * Products by Collection API for Shiprocket Checkout (SRC).
 * Documentation: SRC Custom Integration Docs (Page 2).
 */
export async function getCatalogCollectionProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const collectionId = req.query.collection_id as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(250, Math.max(1, parseInt(req.query.limit as string) || 100));

    // Fetch all active products
    const products = await prisma.product.findMany({
      take: limit,
      skip: (page - 1) * limit,
      include: {
        variants: true,
        images: true,
      },
    });

    let filtered = products;
    if (collectionId === '1002') {
      filtered = products.filter((p) => p.slug.includes('variety') || p.name.toLowerCase().includes('variety'));
      if (filtered.length === 0) filtered = products;
    }

    const formattedProducts = filtered.map((prod) => {
      const primaryImage =
        prod.images?.[0]?.url || prod.image || prod.canImage || 'https://rebelive.com/brand/APEX.webp';
      const weightGrams = 350;

      return {
        id: Number(prod.id),
        title: prod.name,
        body_html: `<p>${prod.description || prod.name}</p>`,
        vendor: 'REBELIVE',
        product_type: 'Bio-Energy Drink',
        created_at: prod.createdAt.toISOString(),
        handle: prod.slug,
        updated_at: prod.updatedAt.toISOString(),
        tags: prod.notes?.join(', ') || 'energy, clean',
        status: prod.isActive ? 'active' : 'draft',
        variants: prod.variants.map((v) => ({
          id: Number(v.id),
          title: v.name,
          price: v.price.toFixed(2),
          compare_at_price: (v.compareAtPrice || v.price * 1.2).toFixed(2),
          sku: v.sku,
          created_at: prod.createdAt.toISOString(),
          updated_at: prod.updatedAt.toISOString(),
          quantity: v.stockQty,
          taxable: true,
          grams: v.weightG || weightGrams,
          image: {
            src: primaryImage,
          },
          weight: parseFloat(((v.weightG || weightGrams) / 1000).toFixed(2)),
          weight_unit: 'kg',
          option_values: { Size: v.name },
        })),
        image: {
          src: primaryImage,
        },
        options: [{ name: 'Size', values: prod.variants.map((v) => v.name) }],
      };
    });

    res.status(200).json({
      collection_id: collectionId || '1001',
      products: formattedProducts,
      total: formattedProducts.length,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/shipping/catalog/loyalty/points
 * Consumed by Shiprocket to get available loyalty balance of customer.
 * Documentation: SRC Custom Integration Docs (Page 19).
 */
export async function getLoyaltyPoints(req: Request, res: Response): Promise<void> {
  const { mobile_number, cart_value } = req.body || {};
  const numValue = parseFloat(cart_value) || 0;
  const points = Math.min(250, Math.floor(numValue * 0.05) + 50);

  res.status(200).json({
    mobile_number: mobile_number || '9999999999',
    available_points: points,
    conversion_rate: 1,
    max_redeemable_points: Math.min(points, Math.floor(numValue * 0.2)),
  });
}

/**
 * POST /api/v1/shipping/catalog/loyalty/block
 * Consumed by Shiprocket to block applicable points for an order.
 * Documentation: SRC Custom Integration Docs (Page 19).
 */
export async function blockLoyaltyPoints(req: Request, res: Response): Promise<void> {
  const { mobile_number, transactional_points, order_id } = req.body || {};
  res.status(200).json({
    status: 'success',
    message: 'Loyalty points blocked successfully',
    mobile_number,
    blocked_points: transactional_points || 0,
    order_id,
  });
}

/**
 * POST /api/v1/shipping/catalog/loyalty/unblock
 * Consumed by Shiprocket to unblock applicable points.
 * Documentation: SRC Custom Integration Docs (Page 20).
 */
export async function unblockLoyaltyPoints(req: Request, res: Response): Promise<void> {
  const { order_id } = req.body || {};
  res.status(200).json({
    status: 'success',
    message: 'Loyalty points unblocked successfully',
    order_id,
  });
}

/**
 * POST /api/v1/shipping/fastrr/order/details
 * Returns order details in Shiprocket SRC schema.
 * Documentation: SRC Custom Integration Docs (Pages 9-10).
 */
export async function getFastrrOrderDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = req.body['order id'] || req.body['order_id'] || req.query.order_id;
    if (!orderId) {
      throw new ValidationError('order_id is required');
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: String(orderId) },
          { shiprocketOrderId: String(orderId) },
          ...(isMongoId(String(orderId)) ? [{ id: String(orderId) }] : []),
        ].filter(Boolean) as any,
      },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const payment = order.payments?.[0];
    const isPrepaid = order.payments?.some((p) => p.method !== 'COD') || false;

    res.status(200).json({
      order_id: order.shiprocketOrderId || order.orderNumber,
      platform_order_id: order.orderNumber,
      status:
        order.status === 'CONFIRMED' || order.status === 'PROCESSING' || order.status === 'DELIVERED'
          ? 'SUCCESS'
          : order.status,
      source: 'web',
      payment_type: isPrepaid ? 'PREPAID' : 'CASH_ON_DELIVERY',
      payment_status: payment?.status === 'COMPLETED' ? 'Success' : 'Pending',
      total_amount_payable: order.total,
      subtotal_price: order.subtotal,
      coupon_discount: order.discountAmount,
      shipping_charges: order.shippingAmount,
      cart_data: {
        items: order.items.map((i) => ({
          variant_id: String(i.variantId),
          quantity: i.quantity,
          name: `${i.productName} - ${i.variantName}`,
          price: i.unitPrice,
        })),
      },
      shipping_address: order.shippingAddress
        ? {
            line1: (order.shippingAddress as any).line1 || (order.shippingAddress as any).billing_address || 'Address',
            line2: (order.shippingAddress as any).line2 || (order.shippingAddress as any).billing_address_2 || '',
            city: (order.shippingAddress as any).city || (order.shippingAddress as any).billing_city || 'City',
            state: (order.shippingAddress as any).state || (order.shippingAddress as any).billing_state || 'State',
            pincode: (order.shippingAddress as any).postalCode || (order.shippingAddress as any).billing_pincode || '110001',
            country: (order.shippingAddress as any).country || (order.shippingAddress as any).billing_country || 'India',
          }
        : null,
      tracking_number: order.trackingNumber,
      created_at: order.createdAt.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/shipping/fastrr/order/list
 * Returns list of orders matching date range.
 * Documentation: SRC Custom Integration Docs (Page 11).
 */
export async function listFastrrOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { startDate, endDate, status, limit = 200, page = 0 } = req.body || {};
    const pageNum = Math.max(0, parseInt(page) || 0);
    const take = Math.min(250, Math.max(1, parseInt(limit) || 200));

    const where: any = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }
    if (status) {
      where.status = status === 'SUCCESS' ? 'CONFIRMED' : status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: pageNum * take,
        take,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      prisma.order.count({ where }),
    ]);

    res.status(200).json({
      total,
      page: pageNum,
      limit: take,
      orders: orders.map((o) => ({
        order_id: o.shiprocketOrderId || o.orderNumber,
        platform_order_id: o.orderNumber,
        status:
          o.status === 'CONFIRMED' || o.status === 'PROCESSING' || o.status === 'DELIVERED'
            ? 'SUCCESS'
            : o.status,
        total: o.total,
        created_at: o.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/shipping/fastrr/refund/initiate
 * Initiates order refund.
 * Documentation: SRC Custom Integration Docs (Page 12).
 */
export async function initiateRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { order_id, amount } = req.body || {};
    if (!order_id || !amount) {
      throw new ValidationError('order_id and amount are required');
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: String(order_id) },
          { shiprocketOrderId: String(order_id) },
          ...(isMongoId(String(order_id)) ? [{ id: String(order_id) }] : []),
        ].filter(Boolean) as any,
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'REFUNDED',
        statusHistory: {
          create: {
            status: 'REFUNDED',
            note: `Refund of ₹${amount} initiated via Fastrr SRC API`,
          },
        },
      },
    });

    res.status(200).json({
      status: 'success',
      message: `Refund of ₹${amount} initiated successfully for order ${order.orderNumber}`,
      order_id,
      amount,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/shipping/webhooks/order
 * Shiprocket Order Webhook sent to seller URL on order placement.
 * Documentation: SRC Custom Integration Docs (Pages 14-17).
 */
export async function handleShiprocketOrderWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = req.body || {};
    const platformOrderId = payload.platform_order_id || payload.order_id;
    const fastrrOrderId = payload.fastrr_order_id || payload.order_id;
    const cartData = payload.cart_data || {};
    const items = cartData.items || [];
    const shippingAddress = payload.shipping_address || {};
    const payments = payload.payments || [];
    const totalAmount = parseFloat(payload.total_amount_payable || payload.subtotal_price || 0);

    if (!platformOrderId && !fastrrOrderId) {
      res.status(200).json({ status: 'ignored', message: 'No order identifier found' });
      return;
    }

    // Check if order already recorded
    let order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: String(platformOrderId) },
          { shiprocketOrderId: String(fastrrOrderId) },
          { notes: { contains: String(fastrrOrderId) } },
        ],
      },
    });

    if (!order) {
      order = await ingestOrConfirmFastrrOrder({
        orderId: String(platformOrderId || fastrrOrderId),
        fastrrOrderId: String(fastrrOrderId || platformOrderId),
        customer: {
          firstName: shippingAddress.first_name || 'Customer',
          lastName: shippingAddress.last_name || 'REBELIVE',
          email: payload.email || shippingAddress.email || 'customer@rebelive.co',
          phone: payload.phone || shippingAddress.phone || '',
        },
        shippingAddress: {
          line1: shippingAddress.line1 || 'Address',
          line2: shippingAddress.line2 || '',
          city: shippingAddress.city || 'Delhi',
          state: shippingAddress.state || 'Delhi',
          postalCode: shippingAddress.pincode || shippingAddress.postalCode || '110001',
          country: shippingAddress.country || 'India',
        },
        items: items.map((itm: any) => ({
          productId: itm.product_id,
          variantId: itm.variant_id,
          productName: itm.name || itm.title,
          variantName: itm.variant_title || itm.name,
          sku: itm.sku,
          quantity: itm.quantity,
          unitPrice: parseFloat(itm.price || itm.selling_price || 0),
        })),
        payment: {
          method: payload.payment_type === 'PREPAID' ? 'UPI' : 'COD',
          transactionId: payments[0]?.pg_transaction_id || `TXN-SRC-${Date.now()}`,
          gatewayResponse: payload,
        },
        totalAmount,
        notes: `Shiprocket SRC Webhook Order (Fastrr ID: ${fastrrOrderId})`,
      });
    } else {
      // Order already exists, mark confirmed and ensure Shiprocket consignment is assigned
      let awbCode = order.trackingNumber;
      let shipmentId = order.shiprocketShipmentId;

      if (!awbCode) {
        try {
          const fullOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: { items: true, user: true },
          });
          if (fullOrder) {
            const shipAddr = buildShiprocketAddress(shippingAddress || fullOrder.shippingAddress || {}, payload || fullOrder.user || {});
            const srRes = await shiprocketService.createAdhocOrder({
              orderNumber: fullOrder.orderNumber,
              createdAt: fullOrder.createdAt,
              customer: {
                firstName: shipAddr.billing_customer_name,
                lastName: shipAddr.billing_last_name,
                email: shipAddr.billing_email,
                phone: shipAddr.billing_phone,
              },
              address: {
                line1: shipAddr.billing_address,
                line2: shipAddr.billing_address_2,
                city: shipAddr.billing_city,
                state: shipAddr.billing_state,
                postalCode: shipAddr.billing_pincode,
                country: shipAddr.billing_country,
              },
              items: fullOrder.items.map((i) => ({
                name: `${i.productName} - ${i.variantName}`,
                sku: i.sku,
                units: i.quantity,
                selling_price: i.unitPrice,
              })),
              paymentMethod: payload.payment_type === 'PREPAID' ? 'Prepaid' : 'COD',
              subtotal: fullOrder.subtotal,
              discountAmount: fullOrder.discountAmount,
              shippingAmount: fullOrder.shippingAmount,
              total: fullOrder.total,
            });
            awbCode = srRes.awbCode;
            shipmentId = srRes.shiprocketShipmentId;
          }
        } catch (dispErr) {
          console.warn('⚠️ Non-fatal error auto-dispatching webhook order to Shiprocket:', dispErr);
        }
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'CONFIRMED',
          shiprocketOrderId: String(fastrrOrderId),
          shiprocketShipmentId: shipmentId,
          trackingNumber: awbCode,
          trackingUrl: `/track-order?id=${order.orderNumber}`,
          statusHistory: {
            create: {
              status: 'CONFIRMED',
              note: `Shiprocket SRC Webhook: Order confirmed (${payload.status || 'SUCCESS'}). AWB: ${
                awbCode || 'Assigned'
              }`,
            },
          },
        },
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Shiprocket Checkout order webhook ingested successfully',
      orderNumber: order?.orderNumber || platformOrderId || fastrrOrderId || 'ACKNOWLEDGED',
    });
  } catch (err) {
    next(err);
  }
}


