import { prisma } from '../../config/database';

export interface ExtractedAddress {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  label?: string | null;
}

/**
 * Normalizes strings by lowercasing, removing special characters, and collapsing whitespace.
 */
function normalizeString(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Robust extractor for address fields supporting Shiprocket, Fastrr,
 * and direct frontend payload structures.
 */
export function extractAddressFields(raw: any): ExtractedAddress {
  if (!raw || typeof raw !== 'object') {
    return {
      name: '',
      phone: '',
      line1: '',
      line2: null,
      city: '',
      state: '',
      country: 'India',
      postalCode: '',
    };
  }

  // Unwrap nested containers if present
  let obj = raw;
  if (obj.shipping_address && typeof obj.shipping_address === 'object') obj = obj.shipping_address;
  else if (obj.delivery_address && typeof obj.delivery_address === 'object') obj = obj.delivery_address;
  else if (obj.data?.shipping_address && typeof obj.data.shipping_address === 'object') obj = obj.data.shipping_address;

  const line1 = (
    obj.line1 ||
    obj.street ||
    obj.shipping_address ||
    obj.billing_address ||
    obj.address1 ||
    obj.address ||
    raw.line1 ||
    raw.street ||
    raw.shipping_address ||
    raw.billing_address ||
    raw.address1 ||
    raw.address ||
    ''
  ).trim();

  const line2 = (
    obj.line2 ||
    obj.shipping_address_2 ||
    obj.billing_address_2 ||
    obj.address2 ||
    obj.landmark ||
    obj.area ||
    raw.line2 ||
    raw.shipping_address_2 ||
    raw.billing_address_2 ||
    raw.address2 ||
    raw.landmark ||
    ''
  ).trim() || null;

  const city = (
    obj.city ||
    obj.shipping_city ||
    obj.billing_city ||
    obj.district ||
    obj.town ||
    raw.city ||
    raw.shipping_city ||
    raw.billing_city ||
    ''
  ).trim();

  const state = (
    obj.state ||
    obj.shipping_state ||
    obj.billing_state ||
    obj.province ||
    obj.region ||
    raw.state ||
    raw.shipping_state ||
    raw.billing_state ||
    'India'
  ).trim();

  const postalCode = String(
    obj.postalCode ||
    obj.postal_code ||
    obj.pincode ||
    obj.shipping_pincode ||
    obj.billing_pincode ||
    obj.zip ||
    raw.postalCode ||
    raw.postal_code ||
    raw.pincode ||
    raw.shipping_pincode ||
    raw.billing_pincode ||
    ''
  ).replace(/\D/g, '').slice(0, 6);

  const country = (
    obj.country ||
    obj.shipping_country ||
    obj.billing_country ||
    obj.country_code ||
    raw.country ||
    raw.shipping_country ||
    raw.billing_country ||
    'India'
  ).trim();

  const phone = String(
    obj.phone ||
    obj.shipping_phone ||
    obj.billing_phone ||
    obj.mobile ||
    obj.contact ||
    raw.phone ||
    raw.shipping_phone ||
    raw.billing_phone ||
    raw.mobile ||
    ''
  ).replace(/\D/g, '').slice(-10);

  const firstName = (
    obj.firstName ||
    obj.first_name ||
    obj.shipping_customer_name ||
    obj.billing_customer_name ||
    raw.firstName ||
    raw.first_name ||
    ''
  ).trim();

  const lastName = (
    obj.lastName ||
    obj.last_name ||
    obj.shipping_last_name ||
    obj.billing_last_name ||
    raw.lastName ||
    raw.last_name ||
    ''
  ).trim();

  let name = (
    obj.name ||
    obj.fullName ||
    obj.recipient_name ||
    raw.name ||
    raw.fullName ||
    (firstName ? `${firstName} ${lastName}`.trim() : '') ||
    ''
  ).trim();

  if (name.toLowerCase() === 'customer rebelive' || name.toLowerCase() === 'customer') {
    name = '';
  }

  const label = (obj.label || raw.label || '').trim() || null;

  return {
    name,
    phone,
    line1,
    line2,
    city,
    state,
    country,
    postalCode,
    label,
  };
}

/**
 * Filters out placeholder addresses and validates essential fields.
 */
export function isValidRealAddress(addr: ExtractedAddress): boolean {
  if (!addr.line1 || !addr.city || !addr.postalCode) return false;
  
  const l1 = addr.line1.toLowerCase();
  const c = addr.city.toLowerCase();

  // Exclude dummy placeholders
  if (
    l1 === 'address' ||
    l1 === 'express delivery' ||
    l1 === 'express delivery address' ||
    l1 === 'n/a' ||
    l1.length < 3
  ) {
    return false;
  }

  if (c === 'city' || c === 'town' || c.length < 2) {
    return false;
  }

  if (addr.postalCode.length < 5) {
    return false;
  }

  return true;
}

/**
 * Checks whether two addresses are substantially the same (duplicate detection).
 * Compares postal code, normalized street line 1, city, and secondary line.
 */
export function areAddressesEqual(
  a: { line1: string; line2?: string | null; city: string; state?: string | null; postalCode: string },
  b: { line1: string; line2?: string | null; city: string; state?: string | null; postalCode: string }
): boolean {
  const pinA = String(a.postalCode || '').replace(/\D/g, '');
  const pinB = String(b.postalCode || '').replace(/\D/g, '');

  if (pinA && pinB && pinA !== pinB) {
    return false;
  }

  const normL1A = normalizeString(a.line1);
  const normL1B = normalizeString(b.line1);

  if (!normL1A || !normL1B) return false;

  const normCityA = normalizeString(a.city);
  const normCityB = normalizeString(b.city);

  if (normCityA && normCityB && normCityA !== normCityB) {
    return false;
  }

  // Exact normalized line1 match
  if (normL1A === normL1B) {
    return true;
  }

  // If one contains the other and length difference is minor, check line2
  if (normL1A.includes(normL1B) || normL1B.includes(normL1A)) {
    const normL2A = normalizeString(a.line2 || '');
    const normL2B = normalizeString(b.line2 || '');
    if (!normL2A || !normL2B || normL2A === normL2B) {
      return true;
    }
  }

  return false;
}

/**
 * Saves a user's delivery address from an order if it is unique
 * (i.e. not the same as their last saved address or any existing address).
 */
export async function saveUniqueUserAddress(
  userId: string,
  rawAddress: any,
  defaultName?: string,
  defaultPhone?: string
): Promise<any | null> {
  if (!userId) return null;

  const extracted = extractAddressFields(rawAddress);
  if (!isValidRealAddress(extracted)) {
    return null;
  }

  // Fetch user's existing saved addresses (ordered most recent first)
  const existingAddresses = await prisma.address.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  // 1. Check if same as the last saved address or any saved address
  const isDuplicate = existingAddresses.some((existing) =>
    areAddressesEqual(existing, extracted)
  );

  if (isDuplicate) {
    // Already saved! Optionally enrich name/phone if existing record lacked them
    const matching = existingAddresses.find((existing) =>
      areAddressesEqual(existing, extracted)
    );
    if (matching && (!matching.phone || !matching.name) && (extracted.phone || extracted.name)) {
      try {
        await prisma.address.update({
          where: { id: matching.id },
          data: {
            name: matching.name || extracted.name || defaultName || null,
            phone: matching.phone || extracted.phone || defaultPhone || null,
          },
        });
      } catch {}
    }
    return matching;
  }

  // 2. Truly unique address! Save to Address collection
  const isFirst = existingAddresses.length === 0;
  const nameToUse = extracted.name || defaultName || null;
  const phoneToUse = extracted.phone || defaultPhone || null;

  try {
    const created = await prisma.address.create({
      data: {
        userId,
        name: nameToUse,
        phone: phoneToUse,
        line1: extracted.line1,
        line2: extracted.line2,
        city: extracted.city,
        state: extracted.state || 'India',
        country: extracted.country || 'India',
        postalCode: extracted.postalCode,
        label: extracted.label || (isFirst ? 'Default Shipping' : 'Delivery Address'),
        isDefault: isFirst,
      },
    });

    console.log(`📍 [Address Saved] Unique delivery address saved for user ${userId}: ${created.line1}, ${created.city} (${created.postalCode})`);
    return created;
  } catch (err) {
    console.warn('⚠️ [Address Save Error]', err);
    return null;
  }
}

/**
 * Returns all saved addresses for a user.
 * If user has none yet, auto-imports unique addresses from their past orders!
 */
export async function getUserAddresses(userId: string): Promise<any[]> {
  let addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  // Auto-backfill from past orders if user has no saved addresses
  if (addresses.length === 0) {
    const pastOrders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { shippingAddress: true },
    });

    for (const order of pastOrders) {
      if (order.shippingAddress) {
        await saveUniqueUserAddress(userId, order.shippingAddress);
      }
    }

    addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  return addresses;
}
