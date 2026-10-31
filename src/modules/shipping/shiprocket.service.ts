import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';

interface ShiprocketLoginResponse {
  token?: string;
  message?: string;
  status_code?: number;
}

interface ShiprocketOrderItemInput {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
  discount?: number;
  tax?: number;
  hsn?: number;
}

interface CreateShiprocketOrderParams {
  orderNumber: string;
  createdAt: Date;
  customer: {
    firstName: string;
    lastName?: string;
    email: string;
    phone: string;
  };
  address: {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
  };
  items: ShiprocketOrderItemInput[];
  paymentMethod: 'COD' | 'Prepaid';
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  total: number;
  weightKg?: number;
}

export interface TrackingScan {
  date: string;
  status: string;
  activity: string;
  location: string;
}

export interface TrackingResult {
  isLive: boolean;
  orderNumber: string;
  trackingNumber: string;
  courierName: string;
  currentStatus: string;
  statusText: string;
  estimatedDelivery: string;
  origin: string;
  destination: string;
  activities: TrackingScan[];
  shiprocketOrderId?: string | number | null;
  shiprocketShipmentId?: string | number | null;
}

export const SHIPMENT_FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  CONFIRMED: 'Your order has been successfully confirmed.',
  PROCESSING: 'Your order is being prepared for dispatch.',
  'PICKED UP': 'Your shipment has been picked up by our delivery partner.',
  'IN TRANSIT': 'Your shipment is on its way to your delivery destination.',
  'OUT FOR DELIVERY': 'Your order is out for delivery. Get ready to receive it!',
  DELIVERED: 'Your order has been successfully delivered.',
  CANCELLED: 'This order has been cancelled.',
  'DELIVERY FAILED': 'Delivery could not be completed. Our delivery partner may attempt another delivery.',
  'RTO INITIATED': 'Your shipment is being returned to the fulfilment centre.',
};

export function mapShiprocketStatus(rawStatus?: string | number | null): {
  status:
    | 'CONFIRMED'
    | 'PROCESSING'
    | 'PICKED UP'
    | 'IN TRANSIT'
    | 'OUT FOR DELIVERY'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'DELIVERY FAILED'
    | 'RTO INITIATED';
  description: string;
} {
  const s = String(rawStatus || '').toUpperCase().trim();

  if (s.includes('RTO') || s.includes('RETURN_TO_ORIGIN') || s === '10' || s === '13' || s === '14') {
    return { status: 'RTO INITIATED', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['RTO INITIATED'] };
  }
  if (
    s.includes('FAIL') ||
    s.includes('UNDELIVER') ||
    s.includes('UN-DELIVER') ||
    s.includes('NOT DELIVERED') ||
    s.includes('NDR') ||
    s === '9'
  ) {
    return { status: 'DELIVERY FAILED', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['DELIVERY FAILED'] };
  }
  if (s.includes('CANCEL') || s === '8') {
    return { status: 'CANCELLED', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['CANCELLED'] };
  }
  if (s.includes('DELIVERED') || s === '7' || s.includes('DELIVERY COMPLETED')) {
    return { status: 'DELIVERED', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['DELIVERED'] };
  }
  if (s.includes('OUT FOR DELIVERY') || s.includes('OUT_FOR_DELIVERY') || s === 'OFD' || s === '17') {
    return { status: 'OUT FOR DELIVERY', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['OUT FOR DELIVERY'] };
  }
  if (
    s.includes('IN TRANSIT') ||
    s.includes('IN_TRANSIT') ||
    s.includes('TRANSIT') ||
    s.includes('SHIPPED') ||
    s.includes('DISPATCH') ||
    s.includes('REACHED') ||
    s === '6'
  ) {
    return { status: 'IN TRANSIT', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['IN TRANSIT'] };
  }
  if (
    s.includes('PICKED UP') ||
    s.includes('PICKED_UP') ||
    s.includes('PICKUP DONE') ||
    s.includes('PICKED') ||
    s === '19'
  ) {
    return { status: 'PICKED UP', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['PICKED UP'] };
  }
  if (
    s.includes('PROCESSING') ||
    s.includes('MANIFEST') ||
    s.includes('READY') ||
    s.includes('PACK') ||
    s.includes('AWB') ||
    s === '2'
  ) {
    return { status: 'PROCESSING', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['PROCESSING'] };
  }

  return { status: 'CONFIRMED', description: SHIPMENT_FRIENDLY_DESCRIPTIONS['CONFIRMED'] };
}

class ShiprocketService {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private inFlightLoginPromise: Promise<string | null> | null = null;
  private readonly baseUrl = env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external';
  private readonly tokenFilePath = path.join(process.cwd(), '.shiprocket-token.json');

  /**
   * Parses the JWT payload to extract the exact expiration timestamp (in ms).
   */
  private parseJwtExpiry(token: string): number | null {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        if (payload && typeof payload.exp === 'number') {
          return payload.exp * 1000;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Reads cached authentication token from local disk file (.shiprocket-token.json).
   * Ensures that server restarts/reloads do NOT invoke /auth/login again.
   */
  private readTokenFromDisk(): { token: string; expiresAt: number } | null {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const content = fs.readFileSync(this.tokenFilePath, 'utf8');
        const parsed = JSON.parse(content);
        if (
          parsed &&
          typeof parsed.token === 'string' &&
          typeof parsed.expiresAt === 'number' &&
          parsed.email === env.SR_API_EMAIL
        ) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('⚠️ Non-fatal: error reading cached Shiprocket token from disk:', err);
    }
    return null;
  }

  /**
   * Securely saves authenticated token and expiry to local disk cache.
   */
  private writeTokenToDisk(token: string, expiresAt: number): void {
    try {
      fs.writeFileSync(
        this.tokenFilePath,
        JSON.stringify(
          {
            token,
            expiresAt,
            savedAt: Date.now(),
            email: env.SR_API_EMAIL,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (err) {
      console.warn('⚠️ Non-fatal: error writing Shiprocket token to disk:', err);
    }
  }

  /**
   * Invalidate cached token when an API response returns 401 Unauthorized.
   */
  public invalidateAuthToken(): void {
    this.token = null;
    this.tokenExpiry = 0;
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        fs.unlinkSync(this.tokenFilePath);
      }
    } catch {}
    console.log('🔄 [Shiprocket] Auth token cache invalidated from memory and disk.');
  }

  /**
   * Retrieves or refreshes the Shiprocket authentication Bearer token.
   *
   * Adheres to Shiprocket rate-limiting policy:
   * "Do not repeatedly call this endpoint on every checkout request.
   * Cache the token securely and reuse it until it expires; authenticate again when needed."
   */
  async getAuthToken(): Promise<string | null> {
    // 1. Direct explicit token in environment (if specified)
    if (env.SR_API_TOKEN && env.SR_API_TOKEN.trim().length > 20) {
      return env.SR_API_TOKEN.trim();
    }

    const now = Date.now();
    const SAFETY_BUFFER_MS = 15 * 60 * 1000; // 15-minute buffer before expiry

    // 2. Fast Tier-1: In-memory cached token (zero latency, zero I/O)
    if (this.token && this.tokenExpiry > now + SAFETY_BUFFER_MS) {
      return this.token;
    }

    // 3. Persistent Tier-2: Disk-cached token (persists across server restarts / nodemon reloads)
    const diskCached = this.readTokenFromDisk();
    if (diskCached && diskCached.expiresAt > now + SAFETY_BUFFER_MS) {
      this.token = diskCached.token;
      this.tokenExpiry = diskCached.expiresAt;
      const remainingDays = ((diskCached.expiresAt - now) / (1000 * 3600 * 24)).toFixed(1);
      console.log(`✅ [Shiprocket] Reusing securely cached Bearer token (valid for ~${remainingDays} more days).`);
      return this.token;
    }

    // 4. Concurrency Mutex: If an auth request is currently in-flight, await the same promise
    if (this.inFlightLoginPromise) {
      return await this.inFlightLoginPromise;
    }

    if (!env.SR_API_EMAIL || !env.SR_API_PASSWORD) {
      console.warn('⚠️ Shiprocket credentials missing in environment (SR_API_EMAIL / SR_API_PASSWORD / SR_API_TOKEN)');
      return null;
    }

    // 5. Authenticate via /auth/login only once
    this.inFlightLoginPromise = (async () => {
      try {
        console.log(`🔐 [Shiprocket] Authenticating once at ${this.baseUrl}/auth/login...`);
        const response = await fetch(`${this.baseUrl}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: env.SR_API_EMAIL,
            password: env.SR_API_PASSWORD,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`⚠️ Shiprocket authentication failed (${response.status}): ${errorText}`);
          return null;
        }

        const data = (await response.json()) as ShiprocketLoginResponse;
        if (data.token) {
          this.token = data.token;
          // Decode JWT exp or default to 9.5 days
          const jwtExp = this.parseJwtExpiry(data.token);
          this.tokenExpiry = jwtExp || (now + 9.5 * 24 * 60 * 60 * 1000);
          this.writeTokenToDisk(this.token, this.tokenExpiry);

          const daysLeft = ((this.tokenExpiry - now) / (1000 * 3600 * 24)).toFixed(1);
          console.log(`✅ [Shiprocket] Authenticated successfully. Token cached in memory and disk (expires in ~${daysLeft} days).`);
          return this.token;
        }
        return null;
      } catch (err) {
        console.warn('⚠️ Error calling Shiprocket auth endpoint:', err);
        return null;
      } finally {
        this.inFlightLoginPromise = null;
      }
    })();

    return await this.inFlightLoginPromise;
  }

  /**
   * Dynamically checks registered pickup addresses on the Shiprocket account
   * to automatically use the merchant's configured pickup location nickname.
   */
  async getEffectivePickupLocation(token: string): Promise<string> {
    const configuredNickname = env.SR_PICKUP_LOCATION || 'Home';
    try {
      const res = await fetch(`${this.baseUrl}/settings/company/pickup`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        const locations = data?.data?.shipping_address;
        if (Array.isArray(locations) && locations.length > 0) {
          const matched = locations.find(
            (loc: any) => loc.pickup_location?.toLowerCase() === configuredNickname.toLowerCase()
          );
          if (matched?.pickup_location) {
            return matched.pickup_location;
          }
          const primaryLoc = locations.find(
            (loc: any) => loc.is_primary_location === 1 || loc.is_primary_location === '1'
          );
          if (primaryLoc?.pickup_location) {
            return primaryLoc.pickup_location;
          }
          return locations[0].pickup_location || configuredNickname;
        }
      }
    } catch {}
    return configuredNickname;
  }

  /**
   * Creates an adhoc order directly in Shiprocket and assigns AWB.
   */
  async createAdhocOrder(params: CreateShiprocketOrderParams): Promise<{
    success: boolean;
    isLive: boolean;
    shiprocketOrderId: string | null;
    shiprocketShipmentId: string | null;
    awbCode: string | null;
    courierName: string | null;
    error?: string;
    raw?: any;
  }> {
    let token = await this.getAuthToken();

    const formattedDate = params.createdAt.toISOString().replace('T', ' ').slice(0, 16);
    const weight = params.weightKg || Math.max(0.5, params.items.reduce((acc, i) => acc + i.units * 0.35, 0));

    let pickupLocation = env.SR_PICKUP_LOCATION || 'Home';
    if (token) {
      pickupLocation = await this.getEffectivePickupLocation(token);
    }

    const addr: any = params.address || {};
    const cust: any = params.customer || {};

    const cleanPhoneDigits = (
      cust.phone ||
      cust.mobile ||
      addr.billing_phone ||
      addr.shipping_phone ||
      addr.phone ||
      ''
    ).replace(/\D/g, '').slice(-10);
    const billingPhone = cleanPhoneDigits.length === 10 ? parseInt(cleanPhoneDigits, 10) : undefined;

    const rawPincode = (
      addr.billing_pincode ||
      addr.shipping_pincode ||
      addr.postalCode ||
      addr.pincode ||
      addr.zip ||
      ''
    ).replace(/\D/g, '').slice(0, 6);
    const billingPincode = rawPincode ? parseInt(rawPincode, 10) : undefined;

    const billingCustomerName = (
      cust.firstName ||
      addr.billing_customer_name ||
      addr.shipping_customer_name ||
      addr.firstName ||
      (cust.name ? cust.name.split(' ')[0] : '') ||
      'Customer'
    ).trim();

    const billingLastName = (
      cust.lastName ||
      addr.billing_last_name ||
      addr.shipping_last_name ||
      addr.lastName ||
      (cust.name ? cust.name.split(' ').slice(1).join(' ') : '') ||
      'REBELIVE'
    ).trim() || 'REBELIVE';

    const billingAddress = (
      addr.billing_address ||
      addr.shipping_address ||
      addr.line1 ||
      addr.address1 ||
      addr.street ||
      addr.address ||
      ''
    ).trim();

    const billingAddress2 = (
      addr.billing_address_2 ||
      addr.shipping_address_2 ||
      addr.line2 ||
      addr.address2 ||
      addr.landmark ||
      ''
    ).trim();

    const billingCity = (
      addr.billing_city ||
      addr.shipping_city ||
      addr.city ||
      addr.district ||
      ''
    ).trim();

    const billingState = (
      addr.billing_state ||
      addr.shipping_state ||
      addr.state ||
      addr.province ||
      ''
    ).trim();

    const billingCountry = (
      addr.billing_country ||
      addr.shipping_country ||
      addr.country ||
      'India'
    ).trim();

    const billingEmail = (
      cust.email ||
      addr.billing_email ||
      addr.shipping_email ||
      addr.email ||
      (cleanPhoneDigits ? `fastrr_${cleanPhoneDigits}@fastrr.com` : 'customer@rebelive.co')
    ).trim().toLowerCase();

    const isShippingSame = addr.shipping_is_billing !== undefined
      ? Boolean(addr.shipping_is_billing)
      : (billingAddress && addr.shipping_address ? billingAddress === addr.shipping_address : true);

    const shippingCustomerName = (addr.shipping_customer_name || addr.first_name || billingCustomerName).trim();
    const shippingLastName = (addr.shipping_last_name || addr.last_name || billingLastName).trim();
    const shippingAddress = (addr.shipping_address || addr.line1 || billingAddress).trim();
    const shippingAddress2 = (addr.shipping_address_2 || addr.line2 || billingAddress2).trim();
    const shippingCity = (addr.shipping_city || addr.city || billingCity).trim();
    const shippingState = (addr.shipping_state || addr.state || billingState).trim();
    const shippingCountry = (addr.shipping_country || addr.country || billingCountry).trim();
    const rawShipPin = (addr.shipping_pincode || addr.pincode || addr.postalCode || '').toString().replace(/\D/g, '').slice(0, 6);
    const shippingPincode = rawShipPin ? parseInt(rawShipPin, 10) : billingPincode;
    const shippingEmail = (addr.shipping_email || addr.email || billingEmail).trim().toLowerCase();
    const rawShipPhone = (addr.shipping_phone || addr.phone || '').toString().replace(/\D/g, '').slice(-10);
    const shippingPhone = rawShipPhone.length === 10 ? parseInt(rawShipPhone, 10) : billingPhone;

    const payload: any = {
      order_id: params.orderNumber,
      order_date: formattedDate,
      pickup_location: pickupLocation,
      comment: 'Rebelive Cold Dispatch - Handle with Care',
      billing_customer_name: billingCustomerName,
      billing_last_name: billingLastName,
      billing_address: billingAddress,
      billing_address_2: billingAddress2,
      billing_city: billingCity,
      billing_pincode: billingPincode,
      billing_state: billingState,
      billing_country: billingCountry,
      billing_email: billingEmail,
      billing_phone: billingPhone,
      shipping_is_billing: isShippingSame,
      shipping_customer_name: isShippingSame ? billingCustomerName : shippingCustomerName,
      shipping_last_name: isShippingSame ? billingLastName : shippingLastName,
      shipping_address: isShippingSame ? billingAddress : shippingAddress,
      shipping_address_2: isShippingSame ? billingAddress2 : shippingAddress2,
      shipping_city: isShippingSame ? billingCity : shippingCity,
      shipping_pincode: isShippingSame ? billingPincode : shippingPincode,
      shipping_country: isShippingSame ? billingCountry : shippingCountry,
      shipping_state: isShippingSame ? billingState : shippingState,
      shipping_email: isShippingSame ? billingEmail : shippingEmail,
      shipping_phone: isShippingSame ? billingPhone : shippingPhone,
      order_items: params.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.selling_price,
        discount: '',
        tax: '',
        hsn: item.hsn || 22029990,
      })),
      payment_method: params.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
      shipping_charges: params.shippingAmount || 0,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: params.discountAmount || 0,
      sub_total: params.subtotal,
      length: 10,
      breadth: 15,
      height: 20,
      weight: parseFloat(weight.toFixed(2)) || 0.5,
    };

    if (token) {
      try {
        let orderRes = await fetch(`${this.baseUrl}/orders/create/adhoc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        // If 401 Unauthorized, token may be invalidated remotely: flush cache and retry once
        if (orderRes.status === 401) {
          console.warn('⚠️ [Shiprocket] Token returned 401 Unauthorized. Refreshing token cache and retrying...');
          this.invalidateAuthToken();
          token = await this.getAuthToken();
          if (token) {
            orderRes = await fetch(`${this.baseUrl}/orders/create/adhoc`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(payload),
            });
          }
        }

        let orderData = (await orderRes.json()) as any;

        // Auto-correct pickup location if Shiprocket returns available locations in message
        if (
          (!orderData.order_id && !orderData.shipment_id) &&
          orderData.data?.data?.[0]?.pickup_location
        ) {
          const autoPickup = orderData.data.data[0].pickup_location;
          console.log(`🔄 Auto-correcting Shiprocket pickup location to "${autoPickup}" and retrying order creation...`);
          payload.pickup_location = autoPickup;
          orderRes = await fetch(`${this.baseUrl}/orders/create/adhoc`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          if (orderRes.ok) {
            orderData = (await orderRes.json()) as any;
          }
        }

        if (orderRes.ok && (orderData.order_id || orderData.shipment_id)) {
          const srOrderId = orderData.order_id?.toString() || null;
          const srShipmentId = orderData.shipment_id?.toString() || null;
          let awbCode = orderData.awb_code || null;
          let courierName = orderData.courier_name || 'Shiprocket Express';

          // Attempt AWB assignment if shipment_id is present and AWB not assigned yet
          if (srShipmentId && !awbCode) {
            try {
              const awbRes = await fetch(`${this.baseUrl}/courier/assign/awb`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ shipment_id: srShipmentId }),
              });
              if (awbRes.ok) {
                const awbData = (await awbRes.json()) as any;
                if (awbData.response?.data?.awb_code) {
                  awbCode = awbData.response.data.awb_code;
                  courierName = awbData.response.data.courier_name || courierName;
                }
              }
            } catch (awbErr) {
              console.warn('⚠️ Non-fatal error assigning AWB on Shiprocket:', awbErr);
            }
          }

          console.log(`✅ [Shiprocket Live] Order ${params.orderNumber} successfully posted to Shiprocket dashboard (Order ID: ${srOrderId}, Shipment ID: ${srShipmentId}, AWB: ${awbCode})`);
          return {
            success: true,
            isLive: true,
            shiprocketOrderId: srOrderId,
            shiprocketShipmentId: srShipmentId,
            awbCode: awbCode || `SR-${params.orderNumber.replace(/[^0-9]/g, '').slice(-8)}`,
            courierName,
            raw: orderData,
          };
        } else {
          console.warn(`⚠️ Shiprocket order creation responded ${orderRes.status}:`, JSON.stringify(orderData));
          const errMsg = orderData?.message || (orderData ? JSON.stringify(orderData) : `Shiprocket responded ${orderRes.status}`);
          return {
            success: false,
            isLive: false,
            shiprocketOrderId: null,
            shiprocketShipmentId: null,
            awbCode: null,
            courierName: null,
            error: errMsg,
            raw: orderData,
          };
        }
      } catch (err: any) {
        console.warn('⚠️ Network error calling Shiprocket order creation:', err);
        return {
          success: false,
          isLive: false,
          shiprocketOrderId: null,
          shiprocketShipmentId: null,
          awbCode: null,
          courierName: null,
          error: err?.message || 'Network error calling Shiprocket order creation',
        };
      }
    }

    return {
      success: false,
      isLive: false,
      shiprocketOrderId: null,
      shiprocketShipmentId: null,
      awbCode: null,
      courierName: null,
      error: 'Shiprocket authentication failed or live credentials unavailable',
    };
  }

  /**
   * Fetches real-time estimated delivery date (EDD) from Shiprocket Serviceability API.
   * Secure backend integration that falls back gracefully if serviceability is unavailable.
   */
  async getEstimatedDelivery(params: {
    deliveryPostcode?: string | number | null;
    pickupPostcode?: string | number | null;
    isCod?: boolean;
    orderDate?: Date | string;
    weightKg?: number;
  }): Promise<{
    estimatedDeliveryText: string;
    estimatedDeliveryDate: Date;
    courierName?: string;
  }> {
    const pickupPincode = String(params.pickupPostcode || env.SR_PICKUP_PINCODE || '143001').trim();
    const cleanDeliveryPostcode = String(params.deliveryPostcode || '').trim().replace(/\D/g, '');
    const orderCreatedAt = params.orderDate ? new Date(params.orderDate) : new Date();

    // Default graceful fallback: 3 to 4 business days from order placement
    const fallbackDays = 4;
    const fallbackDate = new Date(orderCreatedAt.getTime() + fallbackDays * 24 * 60 * 60 * 1000);
    const fallbackText = fallbackDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    if (!cleanDeliveryPostcode || cleanDeliveryPostcode.length !== 6) {
      return {
        estimatedDeliveryText: fallbackText,
        estimatedDeliveryDate: fallbackDate,
      };
    }

    try {
      const token = await this.getAuthToken();
      if (token) {
        const codFlag = params.isCod ? '1' : '0';
        const weight = params.weightKg || 1;
        const url = `${this.baseUrl}/courier/serviceability/?pickup_postcode=${encodeURIComponent(
          pickupPincode
        )}&delivery_postcode=${encodeURIComponent(cleanDeliveryPostcode)}&weight=${weight}&cod=${codFlag}`;

        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          const availableCouriers = data?.data?.available_courier_companies || [];
          if (Array.isArray(availableCouriers) && availableCouriers.length > 0) {
            const recId = data?.data?.recommended_courier_company_id;
            const chosen = availableCouriers.find((c: any) => c.courier_company_id === recId) || availableCouriers[0];

            if (chosen) {
              const rawEtd = chosen.etd || chosen.estimated_delivery_date;
              const estDays = Number(chosen.estimated_delivery_days);

              if (rawEtd) {
                const parsedEtd = new Date(rawEtd);
                if (!isNaN(parsedEtd.getTime())) {
                  const formattedEtd = parsedEtd.toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });
                  return {
                    estimatedDeliveryText: formattedEtd,
                    estimatedDeliveryDate: parsedEtd,
                    courierName: chosen.courier_name,
                  };
                }
              }

              if (estDays > 0) {
                const calculatedDate = new Date(orderCreatedAt.getTime() + estDays * 24 * 60 * 60 * 1000);
                const formattedEtd = calculatedDate.toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });
                return {
                  estimatedDeliveryText: formattedEtd,
                  estimatedDeliveryDate: calculatedDate,
                  courierName: chosen.courier_name,
                };
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Non-fatal error querying Shiprocket EDD API:', err);
    }

    return {
      estimatedDeliveryText: fallbackText,
      estimatedDeliveryDate: fallbackDate,
    };
  }

  /**
   * Tracks a shipment via Shiprocket AWB or order ID.
   */
  async trackShipment(
    identifier: string,
    dbOrderContext?: {
      orderNumber: string;
      createdAt: Date;
      status: string;
      address?: { city?: string; state?: string; postalCode?: string; pincode?: string } | null;
      trackingNumber?: string | null;
      courierName?: string | null;
      estimatedDeliveryText?: string | null;
      statusHistory?: Array<{ status: string; note?: string | null; createdAt: Date }>;
    }
  ): Promise<TrackingResult> {
    let token = await this.getAuthToken();
    const isAwb = !identifier.toUpperCase().startsWith('RBL-');

    if (token) {
      try {
        const url = isAwb
          ? `${this.baseUrl}/courier/track/awb/${encodeURIComponent(identifier)}`
          : `${this.baseUrl}/courier/track?order_id=${encodeURIComponent(identifier)}`;

        let res = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        // If 401 Unauthorized, refresh token once and retry
        if (res.status === 401) {
          this.invalidateAuthToken();
          token = await this.getAuthToken();
          if (token) {
            res = await fetch(url, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            });
          }
        }

        if (res.ok) {
          const data = (await res.json()) as any;
          const trackingData = data.tracking_data;

          if (trackingData && trackingData.track_status !== 0) {
            const track = trackingData.shipment_track?.[0] || {};
            const rawStatus = (track.current_status || '').toUpperCase();
            const { status: currentStatus, description: currentDesc } = mapShiprocketStatus(
              rawStatus || dbOrderContext?.status
            );

            // Carrier partner: actual assigned courier name from Shiprocket or fallback to Awaiting Courier Assignment
            const courierName =
              track.courier_name &&
              track.courier_name.trim() !== '' &&
              track.courier_name !== 'Shiprocket Express'
                ? track.courier_name.trim()
                : dbOrderContext?.courierName && dbOrderContext.courierName !== 'Shiprocket Express'
                ? dbOrderContext.courierName.trim()
                : 'Awaiting Courier Assignment';

            // Gather all genuine events
            const rawScans: Array<{
              date: string;
              timestamp: number;
              rawStatus: string;
              location: string;
            }> = [];

            // Add order confirmation if context available
            if (dbOrderContext?.createdAt) {
              rawScans.push({
                date: new Date(dbOrderContext.createdAt).toISOString(),
                timestamp: new Date(dbOrderContext.createdAt).getTime(),
                rawStatus: 'CONFIRMED',
                location: 'REBELIVE DISPATCH CENTRE',
              });
            }

            // Add genuine Shiprocket tracking scans
            for (const act of trackingData.shipment_track_activities || []) {
              const dStr = String(act.date || '');
              const ts = new Date(dStr).getTime() || Date.now();
              rawScans.push({
                date: dStr,
                timestamp: ts,
                rawStatus: act.status || act.activity || 'IN_TRANSIT',
                location: String(act.location || ''),
              });
            }

            // Sort chronologically (oldest to newest)
            rawScans.sort((a, b) => a.timestamp - b.timestamp);

            // Deduplicate, map customer-friendly descriptions and locations
            const activities: TrackingScan[] = [];
            const seenKeys = new Set<string>();
            let lastKnownLocation = 'REBELIVE DISPATCH CENTRE';

            for (const item of rawScans) {
              const { status, description } = mapShiprocketStatus(item.rawStatus);

              let loc = item.location ? item.location.trim() : '';
              if (status === 'CONFIRMED' || status === 'PROCESSING') {
                loc = 'REBELIVE DISPATCH CENTRE';
                lastKnownLocation = 'REBELIVE DISPATCH CENTRE';
              } else if (loc && loc !== 'Hub' && loc !== 'Rebelive Fulfillment Center') {
                lastKnownLocation = loc;
              } else {
                loc = lastKnownLocation;
              }

              const dateKey = item.date ? item.date.slice(0, 16) : '';
              const dedupKey = `${status}|${loc}|${dateKey}`;
              if (seenKeys.has(dedupKey)) continue;
              seenKeys.add(dedupKey);

              activities.push({
                date: item.date
                  ? new Date(item.date).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : new Date().toLocaleString('en-IN'),
                status,
                activity: description,
                location: loc,
              });
            }

            const isDelivered = currentStatus === 'DELIVERED';
            const isCancelled = currentStatus === 'CANCELLED';

            let liveEdd = '';
            if (track.edd) {
              const p = new Date(track.edd);
              liveEdd = !isNaN(p.getTime())
                ? p.toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : String(track.edd);
            }
            if (!liveEdd && dbOrderContext?.estimatedDeliveryText) {
              liveEdd = dbOrderContext.estimatedDeliveryText;
            }
            if (!liveEdd) {
              const pCode = (dbOrderContext?.address as any)?.billing_pincode || (dbOrderContext?.address as any)?.postalCode;
              const eddRes = await this.getEstimatedDelivery({
                deliveryPostcode: pCode,
                orderDate: dbOrderContext?.createdAt,
              });
              liveEdd = eddRes.estimatedDeliveryText;
            }

            const estimatedDelivery = isDelivered ? 'Delivered to Recipient' : isCancelled ? 'Order Cancelled' : liveEdd;

            return {
              isLive: true,
              orderNumber: dbOrderContext?.orderNumber || identifier,
              trackingNumber: track.awb_code || identifier,
              courierName,
              currentStatus,
              statusText: isDelivered ? 'Delivered · Handed to Recipient' : isCancelled ? 'Order Cancelled' : currentDesc,
              estimatedDelivery,
              origin: 'REBELIVE WAREHOUSE',
              destination: track.destination || (dbOrderContext?.address?.city ? `${dbOrderContext.address.city}, ${dbOrderContext.address.state || 'India'}` : 'Delivery Destination'),
              activities,
              shiprocketOrderId: track.order_id,
              shiprocketShipmentId: track.shipment_id,
            };
          }
        }
      } catch (err) {
        console.warn('⚠️ Non-fatal error querying Shiprocket live tracking:', err);
      }
    }

    // Honest database-backed tracking: When parcel has not yet been scanned by courier,
    // reflect only genuine database lifecycle events with zero simulated or fabricated activities.
    if (dbOrderContext) {
      const orderNum = dbOrderContext.orderNumber;
      const trackingNum = dbOrderContext.trackingNumber || identifier;
      const { status: currentStatus, description: currentDesc } = mapShiprocketStatus(dbOrderContext.status);

      const courierName =
        dbOrderContext.courierName &&
        dbOrderContext.courierName !== 'Shiprocket Express' &&
        dbOrderContext.courierName !== 'Pending'
          ? dbOrderContext.courierName
          : 'Awaiting Courier Assignment';

      const destination = dbOrderContext.address?.city
        ? `${dbOrderContext.address.city}, ${dbOrderContext.address.state || 'India'}`
        : 'Destination Address';

      const rawDbEvents: Array<{
        date: string;
        timestamp: number;
        status: string;
        note?: string;
      }> = [];

      // Always include genuine order confirmation
      rawDbEvents.push({
        date: new Date(dbOrderContext.createdAt).toISOString(),
        timestamp: new Date(dbOrderContext.createdAt).getTime(),
        status: 'CONFIRMED',
      });

      if (dbOrderContext.statusHistory && dbOrderContext.statusHistory.length > 0) {
        for (const h of dbOrderContext.statusHistory) {
          rawDbEvents.push({
            date: new Date(h.createdAt).toISOString(),
            timestamp: new Date(h.createdAt).getTime(),
            status: h.status,
            note: h.note || undefined,
          });
        }
      }

      // Sort chronologically (oldest to newest)
      rawDbEvents.sort((a, b) => a.timestamp - b.timestamp);

      const activities: TrackingScan[] = [];
      const seenKeys = new Set<string>();
      let lastKnownLocation = 'REBELIVE DISPATCH CENTRE';

      for (const ev of rawDbEvents) {
        const { status, description } = mapShiprocketStatus(ev.status);

        let loc = 'REBELIVE DISPATCH CENTRE';
        if (status !== 'CONFIRMED' && status !== 'PROCESSING') {
          const locMatch = ev.note?.match(/at\s+([^()]+)/i);
          if (locMatch && locMatch[1]) {
            loc = locMatch[1].trim();
            lastKnownLocation = loc;
          } else {
            loc = lastKnownLocation;
          }
        }

        const dateKey = ev.date ? ev.date.slice(0, 16) : '';
        const dedupKey = `${status}|${loc}|${dateKey}`;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

        activities.push({
          date: new Date(ev.date).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          status,
          activity: description,
          location: loc,
        });
      }

      const isDelivered = currentStatus === 'DELIVERED';
      const isCancelled = currentStatus === 'CANCELLED';

      let dbEdd = dbOrderContext.estimatedDeliveryText || '';
      if (!dbEdd) {
        const pCode = (dbOrderContext.address as any)?.billing_pincode || (dbOrderContext.address as any)?.postalCode;
        const eddRes = await this.getEstimatedDelivery({
          deliveryPostcode: pCode,
          orderDate: dbOrderContext.createdAt,
        });
        dbEdd = eddRes.estimatedDeliveryText;
      }

      const estimatedDelivery = isDelivered ? 'Delivered to Recipient' : isCancelled ? 'Order Cancelled' : dbEdd;

      return {
        isLive: Boolean(
          dbOrderContext.trackingNumber &&
          dbOrderContext.trackingNumber !== 'SR-PENDING' &&
          !dbOrderContext.trackingNumber.startsWith('SR-AWB-PENDING')
        ),
        orderNumber: orderNum,
        trackingNumber: trackingNum,
        courierName,
        currentStatus,
        statusText: isDelivered ? 'Delivered · Handed to Recipient' : isCancelled ? 'Order Cancelled' : currentDesc,
        estimatedDelivery,
        origin: 'REBELIVE WAREHOUSE',
        destination,
        activities,
      };
    }

    // Consignment not found on Shiprocket nor in MongoDB database
    return {
      isLive: false,
      orderNumber: identifier,
      trackingNumber: identifier,
      courierName: 'Awaiting Courier Assignment',
      currentStatus: 'NOT_FOUND',
      statusText: 'No consignment found',
      estimatedDelivery: 'Available upon order lookup',
      origin: 'REBELIVE WAREHOUSE',
      destination: '',
      activities: [],
    };
  }

  /**
   * Fastrr Checkout HMAC SHA-256 Base64 calculation
   * Required by Shiprocket Checkout (SRC) API docs (Page 3, 6, 7).
   */
  calculateFastrrHmac(payloadString: string): string {
    const secret = env.SR_CHECKOUT_API_SECRET || 'rebelive_fastrr_secret_key';
    return crypto.createHmac('sha256', secret).update(payloadString).digest('base64');
  }

  /**
   * Legacy / Compatibility Fastrr signature helper (Hex or Base64)
   */
  generateFastrrSignature(payloadString: string): string {
    return this.calculateFastrrHmac(payloadString);
  }

  /**
   * Fastrr Checkout HMAC verification helper
   * Validates both Base64 and Hex digests for maximum interoperability.
   */
  verifyFastrrSignature(payload: string | Buffer, signature: string): boolean {
    if (!signature || typeof signature !== 'string') return false;
    const cleanSig = signature.trim();
    const secret = env.SR_CHECKOUT_API_SECRET || 'rebelive_fastrr_secret_key';

    // 1. Direct secret token match (if static token was configured in Fastrr webhook header)
    if (
      cleanSig === secret ||
      cleanSig === env.SR_WEBHOOK_TOKEN ||
      cleanSig === env.SR_CHECKOUT_API_KEY
    ) {
      return true;
    }

    const rawBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');

    // 2. Base64 digest of raw body
    const expectedBase64 = crypto.createHmac('sha256', secret).update(rawBuffer).digest('base64');
    if (cleanSig === expectedBase64) {
      return true;
    }

    // 3. Hex digest of raw body
    const expectedHex = crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex');
    const normalizedSig = cleanSig.replace(/^sha256=/i, '');
    if (normalizedSig.toLowerCase() === expectedHex.toLowerCase() || normalizedSig === expectedBase64) {
      return true;
    }

    // 4. Also check against JSON string representation if buffer was passed
    if (Buffer.isBuffer(payload)) {
      try {
        const jsonStr = payload.toString('utf8');
        const jsonHex = crypto.createHmac('sha256', secret).update(jsonStr).digest('hex');
        const jsonBase64 = crypto.createHmac('sha256', secret).update(jsonStr).digest('base64');
        if (
          normalizedSig.toLowerCase() === jsonHex.toLowerCase() ||
          normalizedSig === jsonBase64 ||
          cleanSig === jsonBase64
        ) {
          return true;
        }
      } catch {}
    }

    // 5. Timing-safe comparison when byte lengths match
    try {
      const bufSig = Buffer.from(cleanSig);
      const bufExpectedBase64 = Buffer.from(expectedBase64);
      if (bufSig.length === bufExpectedBase64.length && crypto.timingSafeEqual(bufSig, bufExpectedBase64)) {
        return true;
      }
      const bufNorm = Buffer.from(normalizedSig.toLowerCase());
      const bufExpectedHex = Buffer.from(expectedHex.toLowerCase());
      if (bufNorm.length === bufExpectedHex.length && crypto.timingSafeEqual(bufNorm, bufExpectedHex)) {
        return true;
      }
    } catch {}

    return false;
  }

  /**
   * POST /api/v1/access-token/checkout
   * Generates a 1-Click Fastrr checkout access token using Shiprocket Checkout APIs.
   * Documentation: SRC Custom Integration Docs (Pages 6-8).
   */
  async createFastrrCheckoutToken(params: {
    cart_data: {
      items: Array<{
        variant_id: string;
        quantity: number;
        catalog_data?: {
          price: number;
          name: string;
          image_url?: string;
        };
      }>;
      cart_discount?: {
        coupon_code: string;
        amount: number;
      };
      custom_attributes?: Record<string, string>;
      mobile_app?: boolean;
    };
    customer?: {
      name?: string;
      email?: string;
      phone?: string;
    };
    shipping_address?: any;
    redirect_url?: string;
  }): Promise<{
    success: boolean;
    token?: string | null;
    orderId?: string | null;
    expiresAt?: string | null;
    error?: string;
    raw?: any;
  }> {
    const checkoutBaseUrl = 'https://checkout-api.shiprocket.com';
    const payload: any = {
      cart_data: {
        items: params.cart_data.items,
        cart_discount: params.cart_data.cart_discount,
        custom_attributes: params.cart_data.custom_attributes || { brand: 'REBELIVE' },
        mobile_app: Boolean(params.cart_data.mobile_app),
      },
      redirect_url: params.redirect_url || `${env.CLIENT_URL}/order-confirmation`,
      timestamp: new Date().toISOString(),
    };

    if (params.customer) {
      payload.customer = params.customer;
    }
    if (params.shipping_address) {
      payload.shipping_address = params.shipping_address;
    }

    const bodyStr = JSON.stringify(payload);
    const hmacBase64 = this.calculateFastrrHmac(bodyStr);

    if (env.SR_CHECKOUT_API_KEY && env.SR_CHECKOUT_API_SECRET) {
      try {
        const response = await fetch(`${checkoutBaseUrl}/api/v1/access-token/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': env.SR_CHECKOUT_API_KEY,
            'X-Api-HMAC-SHA256': hmacBase64,
          },
          body: bodyStr,
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          const token = data.result?.token || data.token || data.access_token;
          const orderId = data.result?.data?.order_id || data.order_id;
          const expiresAt = data.result?.expires_at || data.expires_at;

          if (token) {
            return {
              success: true,
              token,
              orderId,
              expiresAt,
              raw: data,
            };
          }
        } else {
          const errText = await response.text();
          console.warn(`⚠️ Fastrr live token call returned status ${response.status}: ${errText}`);
        }
      } catch (err) {
        console.warn('⚠️ Network error calling Fastrr live token endpoint:', err);
      }
    }

    return {
      success: false,
      token: undefined,
      orderId: undefined,
      error: 'Fastrr live token could not be obtained',
    };
  }

  /**
   * POST /api/v1/custom-platform-order/details
   * Fetches order details directly from Shiprocket Fastrr checkout service.
   * Documentation: SRC Custom Integration Docs (Pages 9-10).
   */
  async getFastrrOrderDetails(orderId: string): Promise<any> {
    const checkoutBaseUrl = 'https://checkout-api.shiprocket.com';
    const payload = {
      order_id: orderId,
      timestamp: new Date().toISOString(),
    };
    const bodyStr = JSON.stringify(payload);
    const hmacBase64 = this.calculateFastrrHmac(bodyStr);

    try {
      const response = await fetch(`${checkoutBaseUrl}/api/v1/custom-platform-order/details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': env.SR_CHECKOUT_API_KEY,
          'X-Api-HMAC-SHA256': hmacBase64,
        },
        body: bodyStr,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn('⚠️ Error querying Fastrr order details:', err);
    }
    return null;
  }

  /**
   * POST /api/v1/external/refund/initiate
   * Initiates refund for a Fastrr order.
   * Documentation: SRC Custom Integration Docs (Page 12).
   */
  async initiateFastrrRefund(params: { orderId: string; amount: number }): Promise<any> {
    const checkoutBaseUrl = 'https://checkout-api.shiprocket.com';
    const payload = {
      order_id: params.orderId,
      amount: params.amount,
      timestamp: new Date().toISOString(),
    };
    const bodyStr = JSON.stringify(payload);
    const hmacBase64 = this.calculateFastrrHmac(bodyStr);

    try {
      const response = await fetch(`${checkoutBaseUrl}/api/v1/external/refund/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': env.SR_CHECKOUT_API_KEY,
          'X-Api-HMAC-SHA256': hmacBase64,
        },
        body: bodyStr,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn('⚠️ Error calling Fastrr refund endpoint:', err);
    }
    return null;
  }
}

export const shiprocketService = new ShiprocketService();

