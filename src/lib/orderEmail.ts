import { prisma } from '../config/database';
import { sendMail } from './mailer';
import { orderConfirmationEmailHtml } from './emailTemplates';
import { logger } from '../shared/utils/logger';

/**
 * Checks whether an email is an authentic, deliverable address
 * (not a synthetic fallback, unroutable domain, or dummy placeholder).
 */
export function isAuthenticEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();

  // Basic RFC-compliant email structure
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return false;

  // Disallow synthetic/placeholder domains
  if (clean.endsWith('@fastrr.com') || clean.endsWith('@shiprocket.com')) return false;

  // Disallow internal dummy email generators
  if (clean.startsWith('rebel_') && clean.endsWith('@rebelive.co')) return false;
  if (clean.startsWith('guest_') && clean.endsWith('@rebelive.co')) return false;
  if (
    clean === 'customer@rebelive.co' ||
    clean === 'noreply@rebelive.co' ||
    clean === 'support@rebelive.com' ||
    clean === 'change-me@rebelive.co'
  ) {
    return false;
  }

  return true;
}

/**
 * Resolves the true authentic customer email for any order, checking:
 * 1. Explicit override (if provided)
 * 2. Shipping address billing / shipping email
 * 3. Linked User record in MongoDB
 * 4. User profile lookup by phone number
 * 5. Past orders with authentic email matching the phone number
 */
export async function resolveOrderCustomerEmail(
  order: any,
  overrideEmail?: string
): Promise<{ email: string | null; isSynthetic: boolean }> {
  // 1. Explicit override
  if (overrideEmail && isAuthenticEmail(overrideEmail)) {
    return { email: overrideEmail.trim().toLowerCase(), isSynthetic: false };
  }

  // 2. Shipping address email
  const addr = (order.shippingAddress || {}) as any;
  const addrEmail = (addr.billing_email || addr.shipping_email || addr.email || '').trim().toLowerCase();
  if (isAuthenticEmail(addrEmail)) {
    return { email: addrEmail, isSynthetic: false };
  }

  // 3. Linked user account
  const userEmail = (order.user?.email || '').trim().toLowerCase();
  if (isAuthenticEmail(userEmail)) {
    return { email: userEmail, isSynthetic: false };
  }

  // Extract phone number from shipping address, user, or notes
  const rawPhone = String(
    addr.billing_phone ||
    addr.shipping_phone ||
    addr.phone ||
    order.user?.phone ||
    order.notes ||
    ''
  );
  const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);

  if (cleanPhone.length === 10) {
    // 4. Look up registered user with matching phone who has an authentic email
    try {
      const matchedUser = await prisma.user.findFirst({
        where: {
          phone: { contains: cleanPhone },
          email: { not: { endsWith: '@fastrr.com' } },
        },
        select: { email: true },
      });

      if (matchedUser?.email && isAuthenticEmail(matchedUser.email)) {
        return { email: matchedUser.email.trim().toLowerCase(), isSynthetic: false };
      }

      // 5. Look up past orders with matching phone and authentic email
      const pastOrder = await prisma.order.findFirst({
        where: {
          OR: [
            { notes: { contains: cleanPhone } },
            { user: { phone: { contains: cleanPhone } } },
          ],
          shippingAddress: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { shippingAddress: true, user: { select: { email: true } } },
      });

      if (pastOrder?.user?.email && isAuthenticEmail(pastOrder.user.email)) {
        return { email: pastOrder.user.email.trim().toLowerCase(), isSynthetic: false };
      }

      const pastAddr = (pastOrder?.shippingAddress || {}) as any;
      const pastAddrEmail = (pastAddr.billing_email || pastAddr.email || '').trim().toLowerCase();
      if (isAuthenticEmail(pastAddrEmail)) {
        return { email: pastAddrEmail, isSynthetic: false };
      }
    } catch (err) {
      logger.warn(`[Order Email] Error resolving email by phone ${cleanPhone}: ${err}`);
    }
  }

  return { email: null, isSynthetic: Boolean(addrEmail || userEmail) };
}

export interface SendOrderEmailOptions {
  overrideEmail?: string;
  forceResend?: boolean;
}

/**
 * Sends a high-converting, branded REBELIVE Order Confirmation Email.
 * Safe and non-blocking: never throws, logs status, and deduplicates to avoid duplicate emails.
 */
export async function sendOrderConfirmationEmail(
  orderIdOrNumber: string,
  options?: SendOrderEmailOptions
): Promise<boolean> {
  const cleanId = String(orderIdOrNumber || '').trim();
  if (!cleanId) return false;

  try {
    const isMongoId = (str?: string | null): boolean => Boolean(str && /^[0-9a-fA-F]{24}$/.test(str));

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: cleanId },
          { shiprocketOrderId: cleanId },
          ...(isMongoId(cleanId) ? [{ id: cleanId }] : []),
        ],
      },
      include: {
        items: true,
        payments: true,
        user: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      logger.warn(`[Order Email] Cannot send confirmation email: Order "${cleanId}" not found in database.`);
      return false;
    }

    // Deduplication check: prevent multiple order confirmation emails unless forceResend is requested
    if (!options?.forceResend) {
      const alreadySent = order.statusHistory.some((h) =>
        h.note && (h.note.includes('Order confirmation email sent to') || h.note.includes('Confirmation email sent to'))
      );
      if (alreadySent) {
        logger.info(`[Order Email] Confirmation email already sent for order #${order.orderNumber}. Skipping.`);
        return true;
      }
    }

    // Resolve authentic recipient email
    const { email: recipientEmail } = await resolveOrderCustomerEmail(order, options?.overrideEmail);

    if (!recipientEmail) {
      logger.info(
        `[Order Email] Order #${order.orderNumber} placed without authentic customer email address. Skipping email dispatch.`
      );
      return false;
    }

    // Determine customer display name
    const addr = (order.shippingAddress || {}) as any;
    const customerName =
      addr.billing_customer_name ||
      addr.shipping_customer_name ||
      addr.name ||
      addr.first_name ||
      order.user?.firstName ||
      'Rebel';

    // Format payment info
    const latestPayment = order.payments?.[0];
    const rawMethod = String(latestPayment?.method || 'UPI');
    let displayMethod = 'UPI / Instant Pay';
    if (rawMethod.includes('COD') || rawMethod.includes('CASH')) {
      displayMethod = 'Cash on Delivery (COD)';
    } else if (rawMethod.includes('CARD')) {
      displayMethod = 'Credit / Debit Card';
    } else if (rawMethod.includes('NET') || rawMethod.includes('BANK')) {
      displayMethod = 'Net Banking';
    } else if (rawMethod.includes('WALLET')) {
      displayMethod = 'Mobile Wallet';
    }

    const displayPaymentStatus =
      latestPayment?.status === 'COMPLETED' || order.status === 'CONFIRMED' || order.status === 'PROCESSING'
        ? 'Verified & Paid'
        : displayMethod.includes('COD')
        ? 'Payable on Delivery'
        : 'Payment Pending';

    // Format items
    const items = (order.items || []).map((i) => ({
      productName: i.productName || 'REBELIVE Beverage',
      variantName: i.variantName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
    }));

    // Generate HTML
    const emailHtml = orderConfirmationEmailHtml({
      customerName,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      paymentMethod: displayMethod,
      paymentStatus: displayPaymentStatus,
      items,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingAmount: order.shippingAmount,
      total: order.total,
      shippingAddress: {
        name: `${addr.billing_customer_name || ''} ${addr.billing_last_name || ''}`.trim() || customerName,
        line1: addr.billing_address || addr.line1,
        line2: addr.billing_address_2 || addr.line2,
        city: addr.billing_city || addr.city,
        state: addr.billing_state || addr.state,
        postalCode: addr.billing_pincode || addr.postalCode,
        country: addr.billing_country || addr.country || 'India',
        phone: addr.billing_phone || addr.shipping_phone || addr.phone || order.user?.phone,
      },
      trackingUrl: `https://www.rebelive.com/track-order?id=${order.orderNumber}`,
    });

    // Send email via Gmail OAuth2 transport
    await sendMail({
      to: recipientEmail,
      subject: `Order Confirmed: #${order.orderNumber} | REBELIVE`,
      html: emailHtml,
    });

    logger.info(`[Order Email] Order confirmation email successfully dispatched to ${recipientEmail} for #${order.orderNumber}`);

    // Record status history entry to log delivery and prevent duplicate emails
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.status,
        note: `Order confirmation email sent to ${recipientEmail}`,
      },
    });

    // If order's saved address had a synthetic/placeholder email, heal it with the authentic email
    const currentAddrEmail = (addr.billing_email || addr.email || '').trim().toLowerCase();
    if (!isAuthenticEmail(currentAddrEmail)) {
      const updatedAddr = {
        ...addr,
        billing_email: recipientEmail,
        shipping_email: recipientEmail,
      };
      await prisma.order.update({
        where: { id: order.id },
        data: { shippingAddress: updatedAddr },
      });
      logger.info(`[Order Email] Healed shippingAddress.billing_email from "${currentAddrEmail}" to authentic "${recipientEmail}" for #${order.orderNumber}`);
    }

    return true;
  } catch (err) {
    logger.error(`[Order Email] Non-fatal error sending order confirmation email for "${cleanId}": ${err}`);
    return false;
  }
}
