// ─── Email HTML Templates ──────────────────────────────
// Clean black-and-white minimal design with REBELIVE logo + panther mascot.
// For emails, remote mail clients (Gmail proxy, Apple Mail, Outlook) require a publicly accessible HTTPS domain.
// Localhost URLs (e.g. http://localhost:3000) will always fail to load in recipient inboxes.

const PRODUCTION_URL = 'https://www.rebelive.com';

const CLIENT_URL =
  process.env.PUBLIC_CLIENT_URL ||
  (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost') && !process.env.CLIENT_URL.includes('127.0.0.1')
    ? process.env.CLIENT_URL
    : PRODUCTION_URL);

// High-definition lossless PNG assets hosted on Cloudinary global CDN for 100% email client compatibility
const LOGO_WHITE =
  process.env.EMAIL_LOGO_WHITE ||
  'https://res.cloudinary.com/hvsvwwbx/image/upload/v1792786099/rebelive/brand/rebelive_wordmark_white_hd.png';

const LOGO_BLACK =
  process.env.EMAIL_LOGO_BLACK ||
  'https://res.cloudinary.com/hvsvwwbx/image/upload/v1792786103/rebelive/brand/rebelive_wordmark_black_hd.png';

const PANTHER_ICON =
  process.env.EMAIL_PANTHER_ICON ||
  'https://res.cloudinary.com/hvsvwwbx/image/upload/v1792786101/rebelive/brand/panther_white_icon_hd.png';

// ─── Base wrapper ──────────────────────────────────────

function baseWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>REBELIVE</title>
</head>
<body style="margin:0; padding:0; background:#ffffff; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border:1px solid #e0e0e0;">

          <!-- ── Header bar (black) ── -->
          <tr>
            <td style="background:#0a0a0a; padding:28px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <!-- REBELIVE wordmark -->
                    <img
                      src="${LOGO_WHITE}"
                      alt="REBELIVE"
                      width="160"
                      height="auto"
                      style="display:block; border:0; max-width:160px;"
                    />
                  </td>
                  <td align="right" valign="middle">
                    <!-- Panther mascot (moscourt) -->
                    <img
                      src="${PANTHER_ICON}"
                      alt="Panther"
                      width="36"
                      height="36"
                      style="display:block; border:0; opacity:0.75;"
                    />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Thin accent rule ── -->
          <tr>
            <td style="height:3px; background:#0a0a0a;"></td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:40px 36px; background:#ffffff;">
              ${content}
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:24px 36px; background:#0a0a0a; border-top:1px solid #1a1a1a;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <img
                      src="${LOGO_WHITE}"
                      alt="REBELIVE"
                      width="100"
                      height="auto"
                      style="display:block; border:0; opacity:0.55;"
                    />
                  </td>
                  <td align="right" valign="middle">
                    <img
                      src="${PANTHER_ICON}"
                      alt="Panther seal"
                      width="22"
                      height="22"
                      style="display:block; border:0; opacity:0.35;"
                    />
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:14px;">
                    <p style="margin:0; font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.25); font-family:Arial,sans-serif;">
                      Wake &middot; Fuel &middot; Rebel &nbsp;&nbsp;&mdash;&nbsp;&nbsp; &copy; ${new Date().getFullYear()} REBELIVE. Automated message &mdash; please do not reply.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- ── Spacer below card ── -->
        <p style="margin:20px 0 0; font-size:10px; color:#aaaaaa; font-family:Arial,sans-serif; letter-spacing:0.1em; text-transform:uppercase;">
          REBELIVE &mdash; rebelive.com
        </p>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ─── Shared inner styles ───────────────────────────────

const S = {
  eyebrow: 'margin:0 0 8px; font-size:10px; letter-spacing:0.28em; text-transform:uppercase; color:#888888; font-family:Arial,sans-serif;',
  h1: 'margin:0 0 18px; font-size:26px; font-weight:700; color:#0a0a0a; letter-spacing:-0.02em; line-height:1.2; font-family:Arial,Helvetica,sans-serif;',
  body: 'margin:0 0 24px; font-size:14px; line-height:1.75; color:#444444; font-family:Arial,sans-serif;',
  strong: 'color:#0a0a0a;',
  rule: 'border:none; border-top:1px solid #e8e8e8; margin:28px 0;',
  note: 'margin:0; font-size:11px; color:#bbbbbb; text-align:center; font-family:Arial,sans-serif; letter-spacing:0.06em;',
};

// ─── OTP Email ─────────────────────────────────────────

export function otpEmailHtml(opts: { firstName: string; otp: string }): string {
  const content = `
    <p style="${S.eyebrow}">Verification</p>
    <h1 style="${S.h1}">Your one-time code</h1>
    <p style="${S.body}">
      Hey <strong style="${S.strong}">${opts.firstName}</strong>, use the code below to verify your REBELIVE account.
      It expires in <strong style="${S.strong}">10 minutes</strong>.
    </p>

    <!-- OTP box -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px; width:100%;">
      <tr>
        <td align="center">
          <div style="display:inline-block; background:#0a0a0a; padding:22px 48px;">
            <span style="font-family:'Courier New',Courier,monospace; font-size:40px; font-weight:700; letter-spacing:0.55em; color:#ffffff; padding-right:-0.55em; display:block;">
              ${opts.otp}
            </span>
          </div>
        </td>
      </tr>
    </table>

    <hr style="${S.rule}"/>
    <p style="${S.note}">If you didn't request this, you can safely ignore this email.</p>
  `;
  return baseWrapper(content);
}

// ─── Welcome / Greeting Email ──────────────────────────

export function greetingEmailHtml(opts: {
  firstName: string;
  persona?: { name: string; tagline?: string | null } | null;
}): string {
  const { firstName, persona } = opts;

  // Persona reveal block - shown only when a persona is assigned
  const personaBlock = persona
    ? `
    <!-- Persona reveal -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px; width:100%;">
      <tr>
        <td style="background:#0a0a0a; padding:24px 28px;">
          <p style="margin:0 0 6px; font-size:9px; letter-spacing:0.3em; text-transform:uppercase; color:rgba(255,255,255,0.45); font-family:Arial,sans-serif;">
            Your Rebel Persona
          </p>
          <p style="margin:0; font-size:28px; font-weight:700; color:#ffffff; letter-spacing:0.04em; font-family:Arial,Helvetica,sans-serif; text-transform:uppercase;">
            ${persona.name}
          </p>
          ${persona.tagline ? `<p style="margin:10px 0 0; font-size:12px; line-height:1.6; color:rgba(255,255,255,0.6); font-family:Arial,sans-serif;">${persona.tagline}</p>` : ''}
        </td>
      </tr>
    </table>`
    : `
    <!-- No persona yet - invite to take the quiz -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px; width:100%; border-left:3px solid #0a0a0a;">
      <tr>
        <td style="padding:14px 18px; background:#f8f8f8;">
          <p style="margin:0; font-size:13px; line-height:1.65; color:#444444; font-family:Arial,sans-serif;">
            <strong style="${S.strong}">Next step:</strong> Take the quiz to discover your rebel persona &mdash; APEX, CAPELLA, or AVIVA &mdash; and unlock your annual drop.
          </p>
        </td>
      </tr>
    </table>`;

  const content = `
    <p style="${S.eyebrow}">Welcome to the pack</p>
    <h1 style="${S.h1}">Your Rebel ID is live, ${firstName}.</h1>
    <p style="${S.body}">
      Welcome to <strong style="${S.strong}">REBELIVE</strong>. You've just unlocked access to the rebel world &mdash; personalised drops, exclusive rewards, and a community that moves differently.
    </p>

    ${personaBlock}

    <!-- CTA button -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
      <tr>
        <td style="background:#0a0a0a;">
          <a href="${CLIENT_URL}" style="display:block; padding:14px 36px; font-size:11px; font-weight:700; letter-spacing:0.22em; text-transform:uppercase; color:#ffffff; text-decoration:none; font-family:Arial,sans-serif;">
            Go to REBELIVE &rarr;
          </a>
        </td>
      </tr>
    </table>

    <hr style="${S.rule}"/>
    <p style="${S.note}">Wake &middot; Fuel &middot; Rebel &mdash; this is just the beginning.</p>
  `;
  return baseWrapper(content);
}

// ─── Order Confirmation Email ──────────────────────────

export interface OrderEmailItem {
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderConfirmationEmailProps {
  customerName: string;
  orderNumber: string;
  orderDate?: string | Date;
  paymentMethod?: string;
  paymentStatus?: string;
  items: OrderEmailItem[];
  subtotal: number;
  discountAmount?: number;
  shippingAmount?: number;
  total: number;
  shippingAddress?: {
    name?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  };
  trackingUrl?: string;
}

export function orderConfirmationEmailHtml(props: OrderConfirmationEmailProps): string {
  const {
    customerName,
    orderNumber,
    orderDate,
    paymentMethod = 'UPI / Instant Pay',
    paymentStatus = 'Completed',
    items = [],
    subtotal,
    discountAmount = 0,
    shippingAmount = 0,
    total,
    shippingAddress,
    trackingUrl,
  } = props;

  const formattedDate = orderDate
    ? new Date(orderDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

  // Always resolve tracking URL against live production domain (never localhost)
  let liveTrackUrl = trackingUrl || `/track-order?id=${orderNumber}`;
  if (liveTrackUrl.startsWith('http://localhost') || liveTrackUrl.startsWith('http://127.0.0.1')) {
    liveTrackUrl = liveTrackUrl.replace(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, PRODUCTION_URL);
  } else if (!liveTrackUrl.startsWith('http')) {
    liveTrackUrl = `${PRODUCTION_URL}${liveTrackUrl.startsWith('/') ? '' : '/'}${liveTrackUrl}`;
  }

  const itemRows = items
    .map((item) => {
      const itemPrice = (item.totalPrice ?? item.unitPrice * item.quantity).toLocaleString('en-IN', {
        maximumFractionDigits: 2,
      });
      return `
        <tr>
          <td style="padding:14px 0; border-bottom:1px solid #f0f0f0;" valign="top">
            <p style="margin:0 0 4px; font-size:14px; font-weight:700; color:#0a0a0a; font-family:Arial,sans-serif;">
              ${item.productName}
            </p>
            ${
              item.variantName
                ? `<p style="margin:0; font-size:12px; color:#666666; font-family:Arial,sans-serif;">${item.variantName}</p>`
                : ''
            }
          </td>
          <td style="padding:14px 12px; border-bottom:1px solid #f0f0f0; text-align:center; font-size:13px; color:#444444; font-family:Arial,sans-serif;" valign="top">
            &times; ${item.quantity}
          </td>
          <td style="padding:14px 0; border-bottom:1px solid #f0f0f0; text-align:right; font-size:14px; font-weight:700; color:#0a0a0a; font-family:Arial,sans-serif;" valign="top">
            &#8377;${itemPrice}
          </td>
        </tr>`;
    })
    .join('');

  const addressBlock = shippingAddress
    ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0; background:#fbfbfb; border:1px solid #e8e8e8; border-radius:4px; padding:20px;">
        <tr>
          <td>
            <p style="margin:0 0 10px; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:#888888; font-weight:700; font-family:Arial,sans-serif;">
              Shipping Destination
            </p>
            <p style="margin:0 0 4px; font-size:14px; font-weight:700; color:#0a0a0a; font-family:Arial,sans-serif;">
              ${shippingAddress.name || customerName}
            </p>
            <p style="margin:0 0 2px; font-size:13px; color:#444444; line-height:1.5; font-family:Arial,sans-serif;">
              ${shippingAddress.line1 || ''}${shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}
            </p>
            <p style="margin:0 0 6px; font-size:13px; color:#444444; line-height:1.5; font-family:Arial,sans-serif;">
              ${shippingAddress.city ? `${shippingAddress.city}, ` : ''}${shippingAddress.state || ''} ${shippingAddress.postalCode ? `- ${shippingAddress.postalCode}` : ''}
            </p>
            ${
              shippingAddress.phone
                ? `<p style="margin:0; font-size:12px; color:#777777; font-family:Arial,sans-serif;">Contact Phone: ${shippingAddress.phone}</p>`
                : ''
            }
          </td>
        </tr>
      </table>`
    : '';

  const content = `
    <!-- Status & Eyebrow -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
      <tr>
        <td>
          <p style="${S.eyebrow}">Order Confirmation</p>
        </td>
        <td align="right">
          <span style="display:inline-block; background:#0a0a0a; color:#ffffff; font-size:10px; font-weight:700; padding:5px 12px; letter-spacing:0.14em; text-transform:uppercase; font-family:Arial,sans-serif;">
            Confirmed
          </span>
        </td>
      </tr>
    </table>

    <h1 style="${S.h1}">Pack confirmed, ${customerName}.</h1>
    <p style="${S.body}">
      We have received your order and payment. Our fulfillment crew at the Amritsar Cold Dispatch Center is currently prepping your cold-pack consignment with temperature protection.
    </p>

    <!-- Order Meta Summary Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a; color:#ffffff; padding:18px 22px; margin:0 0 28px;">
      <tr>
        <td width="50%" valign="top" style="padding-right:12px;">
          <p style="margin:0 0 4px; font-size:9px; letter-spacing:0.25em; text-transform:uppercase; color:rgba(255,255,255,0.45); font-family:Arial,sans-serif;">
            Order Number
          </p>
          <p style="margin:0 0 12px; font-size:15px; font-weight:700; color:#ffffff; letter-spacing:0.04em; font-family:Arial,sans-serif;">
            #${orderNumber}
          </p>
          <p style="margin:0 0 4px; font-size:9px; letter-spacing:0.25em; text-transform:uppercase; color:rgba(255,255,255,0.45); font-family:Arial,sans-serif;">
            Order Date
          </p>
          <p style="margin:0; font-size:13px; color:#ffffff; font-family:Arial,sans-serif;">
            ${formattedDate}
          </p>
        </td>
        <td width="50%" valign="top" style="border-left:1px solid rgba(255,255,255,0.12); padding-left:16px;">
          <p style="margin:0 0 4px; font-size:9px; letter-spacing:0.25em; text-transform:uppercase; color:rgba(255,255,255,0.45); font-family:Arial,sans-serif;">
            Payment Method
          </p>
          <p style="margin:0 0 12px; font-size:14px; font-weight:700; color:#ffffff; font-family:Arial,sans-serif;">
            ${paymentMethod}
          </p>
          <p style="margin:0 0 4px; font-size:9px; letter-spacing:0.25em; text-transform:uppercase; color:rgba(255,255,255,0.45); font-family:Arial,sans-serif;">
            Payment Status
          </p>
          <p style="margin:0; font-size:13px; color:#10b981; font-weight:700; font-family:Arial,sans-serif;">
            &bull; ${paymentStatus}
          </p>
        </td>
      </tr>
    </table>

    <!-- Line items table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <thead>
        <tr>
          <th align="left" style="padding-bottom:10px; border-bottom:2px solid #0a0a0a; font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:#888888; font-family:Arial,sans-serif;">
            Item
          </th>
          <th align="center" style="padding-bottom:10px; border-bottom:2px solid #0a0a0a; font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:#888888; font-family:Arial,sans-serif;">
            Qty
          </th>
          <th align="right" style="padding-bottom:10px; border-bottom:2px solid #0a0a0a; font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:#888888; font-family:Arial,sans-serif;">
            Price
          </th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <!-- Cost Breakdown -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding:6px 0; font-size:13px; color:#666666; font-family:Arial,sans-serif;">
          Subtotal
        </td>
        <td align="right" style="padding:6px 0; font-size:13px; color:#0a0a0a; font-family:Arial,sans-serif;">
          &#8377;${subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </td>
      </tr>
      ${
        discountAmount > 0
          ? `
      <tr>
        <td style="padding:6px 0; font-size:13px; color:#059669; font-family:Arial,sans-serif;">
          Discount Savings
        </td>
        <td align="right" style="padding:6px 0; font-size:13px; color:#059669; font-weight:700; font-family:Arial,sans-serif;">
          -&#8377;${discountAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </td>
      </tr>`
          : ''
      }
      <tr>
        <td style="padding:6px 0; font-size:13px; color:#666666; font-family:Arial,sans-serif;">
          Cold-Pack Express Shipping
        </td>
        <td align="right" style="padding:6px 0; font-size:13px; color:#0a0a0a; font-family:Arial,sans-serif;">
          ${shippingAmount === 0 ? '<strong style="color:#059669;">FREE</strong>' : `&#8377;${shippingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0 0; border-top:1px solid #0a0a0a; font-size:16px; font-weight:700; color:#0a0a0a; font-family:Arial,sans-serif;">
          Total Paid
        </td>
        <td align="right" style="padding:12px 0 0; border-top:1px solid #0a0a0a; font-size:18px; font-weight:700; color:#0a0a0a; font-family:Arial,sans-serif;">
          &#8377;${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </td>
      </tr>
    </table>

    ${addressBlock}

    <!-- CTA Track button -->
    <table cellpadding="0" cellspacing="0" style="margin:28px 0 32px; width:100%;">
      <tr>
        <td align="center">
          <a href="${liveTrackUrl}" style="display:inline-block; background:#0a0a0a; padding:16px 42px; font-size:11px; font-weight:700; letter-spacing:0.22em; text-transform:uppercase; color:#ffffff; text-decoration:none; font-family:Arial,sans-serif;">
            Track Your Order Live &rarr;
          </a>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8; padding:14px 18px; border-left:3px solid #0a0a0a; margin:0 0 20px;">
      <tr>
        <td>
          <p style="margin:0; font-size:12px; line-height:1.6; color:#555555; font-family:Arial,sans-serif;">
            <strong>Cold-Chain Guarantee:</strong> All REBELIVE beverages are dispatched in temperature-shielded packaging. If you need any assistance, reach us at <a href="mailto:support@rebelive.com" style="color:#0a0a0a; font-weight:700;">support@rebelive.com</a>.
          </p>
        </td>
      </tr>
    </table>

    <hr style="${S.rule}"/>
    <p style="${S.note}">Wake &middot; Fuel &middot; Rebel &mdash; Crafted for the Unstoppable.</p>
  `;

  return baseWrapper(content);
}

