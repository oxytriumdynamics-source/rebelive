import { prisma } from '../config/database';
import { sendMail } from './mailer';
import { orderConfirmationEmailHtml } from './emailTemplates';
import { logger } from '../shared/utils/logger';
import { shiprocketService } from '../modules/shipping/shiprocket.service';

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
 * Dynamically resolves the payment method and payment status for order confirmation communications.
 * Strictly guarantees that COD orders never display 'Verified & Paid' or fallback to UPI.
 */
export function resolveOrderPaymentDisplay(order: any): {
  paymentMethod: 'UPI' | 'Cards' | 'Net Banking' | 'Wallet' | 'Cash on Delivery (COD)';
  paymentStatus: 'Verified & Paid' | 'Payment Pending – COD' | 'Payment Pending' | 'Cancelled';
} {
  const payments = Array.isArray(order.payments) ? order.payments : [];
  const notesUpper = String(order.notes || '').toUpperCase();
  const historyNotesUpper = Array.isArray(order.statusHistory)
    ? order.statusHistory.map((h: any) => String(h.note || '').toUpperCase()).join(' ')
    : '';
  const addr = (order.shippingAddress || {}) as any;
  const addrStrUpper = JSON.stringify(addr).toUpperCase();

  // 1. Thorough check for COD across payments, notes, status history, and address metadata
  const isCodPayment = payments.some((p: any) => {
    const m = String(p.method || '').toUpperCase();
    const txn = String(p.transactionId || '').toUpperCase();
    const gr = JSON.stringify(p.gatewayResponse || {}).toUpperCase();
    return (
      m === 'COD' ||
      m.includes('COD') ||
      m.includes('CASH') ||
      txn.startsWith('COD-') ||
      gr.includes('"COD"') ||
      gr.includes('"CASH ON DELIVERY"') ||
      gr.includes('"ISCOD":TRUE')
    );
  });

  const isCodNotes =
    notesUpper.includes('COD') ||
    notesUpper.includes('CASH ON DELIVERY') ||
    notesUpper.includes('CASH_ON_DELIVERY') ||
    historyNotesUpper.includes('CASH ON DELIVERY') ||
    historyNotesUpper.includes('COD');

  const isCodAddress =
    addr.is_cod === true ||
    addr.isCod === true ||
    String(addr.order_type || addr.payment_type || addr.payment_mode || addr.payment_method || '').toUpperCase().includes('COD') ||
    addrStrUpper.includes('"PAYMENT_METHOD":"COD"') ||
    addrStrUpper.includes('"ORDER_TYPE":"COD"') ||
    addrStrUpper.includes('"PAYMENT_TYPE":"COD"') ||
    addrStrUpper.includes('"IS_COD":TRUE');

  const isCod = isCodPayment || isCodNotes || isCodAddress;

  if (isCod) {
    return {
      paymentMethod: 'Cash on Delivery (COD)',
      paymentStatus: 'Payment Pending – COD',
    };
  }

  // 2. Identify online payment method (UPI, Cards, Net Banking, Wallet)
  const completedPayment = payments.find((p: any) => p.status === 'COMPLETED');
  const primaryPayment = completedPayment || payments[payments.length - 1] || payments[0];

  const rawMethod = String(primaryPayment?.method || '').toUpperCase();
  const gatewayStr = JSON.stringify(primaryPayment?.gatewayResponse || {}).toUpperCase();

  let paymentMethod: 'UPI' | 'Cards' | 'Net Banking' | 'Wallet' | 'Cash on Delivery (COD)' = 'UPI';

  if (
    rawMethod.includes('CARD') ||
    rawMethod.includes('CREDIT') ||
    rawMethod.includes('DEBIT') ||
    gatewayStr.includes('"CARD"') ||
    gatewayStr.includes('CREDIT_CARD') ||
    gatewayStr.includes('DEBIT_CARD') ||
    gatewayStr.includes('VISA') ||
    gatewayStr.includes('MASTERCARD') ||
    gatewayStr.includes('RUPAY')
  ) {
    paymentMethod = 'Cards';
  } else if (
    rawMethod.includes('NET') ||
    rawMethod.includes('BANK') ||
    rawMethod.includes('NB') ||
    gatewayStr.includes('"NETBANKING"') ||
    gatewayStr.includes('"NET_BANKING"') ||
    gatewayStr.includes('"BANK"')
  ) {
    paymentMethod = 'Net Banking';
  } else if (
    rawMethod.includes('WALLET') ||
    gatewayStr.includes('"WALLET"') ||
    gatewayStr.includes('PAYTM') ||
    gatewayStr.includes('MOBIKWIK') ||
    gatewayStr.includes('AMAZONPAY')
  ) {
    paymentMethod = 'Wallet';
  } else {
    // UPI is default for Indian direct payment integrations (GPay, PhonePe, Paytm UPI, etc.)
    paymentMethod = 'UPI';
  }

  // 3. Status determination for online orders
  const isPaid =
    primaryPayment?.status === 'COMPLETED' ||
    Boolean(primaryPayment?.paidAt) ||
    order.status === 'CONFIRMED' ||
    order.status === 'PROCESSING' ||
    order.status === 'SHIPPED' ||
    order.status === 'DELIVERED';

  const isCancelled = order.status === 'CANCELLED' || primaryPayment?.status === 'FAILED';

  let paymentStatus: 'Verified & Paid' | 'Payment Pending – COD' | 'Payment Pending' | 'Cancelled' = 'Verified & Paid';
  if (isCancelled) {
    paymentStatus = 'Cancelled';
  } else if (isPaid) {
    paymentStatus = 'Verified & Paid';
  } else {
    paymentStatus = 'Payment Pending';
  }

  return { paymentMethod, paymentStatus };
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

    // Format payment info with dynamic display mapping
    const { paymentMethod: displayMethod, paymentStatus: displayPaymentStatus } = resolveOrderPaymentDisplay(order);

    // Resolve or fetch order-specific Estimated Delivery Date (EDD)
    let estimatedDelivery = (order as any).estimatedDeliveryText || null;
    if (!estimatedDelivery) {
      try {
        const eddRes = await shiprocketService.getEstimatedDelivery({
          deliveryPostcode: addr.billing_pincode || addr.postalCode,
          isCod: displayMethod.includes('COD'),
          orderDate: order.createdAt,
        });
        estimatedDelivery = eddRes.estimatedDeliveryText;
        await prisma.order
          .update({
            where: { id: order.id },
            data: {
              estimatedDeliveryText: eddRes.estimatedDeliveryText,
              estimatedDeliveryDate: eddRes.estimatedDeliveryDate,
            },
          })
          .catch(() => {});
      } catch (err) {
        estimatedDelivery = new Date(
          new Date(order.createdAt).getTime() + 4 * 24 * 60 * 60 * 1000
        ).toLocaleDateString('en-IN', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }

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
      estimatedDelivery,
      paymentMethod: displayMethod,
      paymentStatus: displayPaymentStatus,
      items,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingAmount: order.shippingAmount,
      total: order.total,
      shippingAddress: {
        name:
          addr.shipping_customer_name ||
          addr.billing_customer_name ||
          addr.fullName ||
          addr.name ||
          (addr.first_name ? `${addr.first_name} ${addr.last_name || ''}`.trim() : null) ||
          `${addr.billing_customer_name || ''} ${addr.billing_last_name || ''}`.trim() ||
          customerName,
        line1:
          addr.shipping_address ||
          addr.billing_address ||
          addr.line1 ||
          addr.address1 ||
          addr.address ||
          '',
        line2:
          addr.shipping_address_2 ||
          addr.billing_address_2 ||
          addr.line2 ||
          addr.address2 ||
          addr.landmark ||
          '',
        city:
          addr.shipping_city ||
          addr.billing_city ||
          addr.city ||
          '',
        state:
          addr.shipping_state ||
          addr.billing_state ||
          addr.state ||
          addr.province ||
          '',
        postalCode:
          addr.shipping_pincode ||
          addr.billing_pincode ||
          addr.postalCode ||
          addr.pincode ||
          addr.postal_code ||
          addr.zip ||
          '',
        country:
          addr.shipping_country ||
          addr.billing_country ||
          addr.country ||
          'India',
        phone:
          addr.shipping_phone ||
          addr.billing_phone ||
          addr.phone ||
          order.user?.phone ||
          '',
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
