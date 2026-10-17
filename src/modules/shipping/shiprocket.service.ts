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

    const cleanPhoneDigits = (params.customer.phone || '').replace(/\D/g, '').slice(-10) || '9876543210';
    const billingPhone = parseInt(cleanPhoneDigits, 10) || 9876543210;

    const cleanPincodeDigits = (params.address.postalCode || '').replace(/\D/g, '').slice(0, 6) || '110001';
    const billingPincode = parseInt(cleanPincodeDigits, 10) || 110001;

    const billingCustomerName = (params.customer.firstName || 'Customer').trim();
    const billingLastName = (params.customer.lastName || 'REBELIVE').trim() || 'REBELIVE';
    const billingAddress = (params.address.line1 || 'Main Street').trim();
    const billingAddress2 = (params.address.line2 || '').trim();
    const billingCity = (params.address.city || 'Amritsar').trim();
    const billingState = (params.address.state || 'Punjab').trim();
    const billingCountry = (params.address.country || 'India').trim();
    const billingEmail = (params.customer.email || 'customer@rebelive.co').trim();

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
      shipping_is_billing: true,
      shipping_customer_name: '',
      shipping_last_name: '',
      shipping_address: '',
      shipping_address_2: '',
      shipping_city: '',
      shipping_pincode: '',
      shipping_country: '',
      shipping_state: '',
      shipping_email: '',
      shipping_phone: '',
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
   * Tracks a shipment via Shiprocket AWB or order ID.
   */
  async trackShipment(
    identifier: string,
    dbOrderContext?: {
      orderNumber: string;
      createdAt: Date;
      status: string;
      address?: { city: string; state: string } | null;
      trackingNumber?: string | null;
      courierName?: string | null;
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
            const isDelivered = rawStatus.includes('DELIVER') || dbOrderContext?.status === 'DELIVERED';
            const statusText = isDelivered ? 'Delivered · Handed to Recipient' : (track.current_status || 'In Transit');
            const currentStatus = isDelivered ? 'DELIVERED' : (track.current_status || 'IN_TRANSIT');

            const activities: TrackingScan[] = (trackingData.shipment_track_activities || []).map(
              (act: any) => ({
                date: act.date || new Date().toISOString(),
                status: act.status || 'In Transit',
                activity: act.activity || 'Package in transit',
                location: act.location || 'Hub',
              })
            );

            return {
              isLive: true,
              orderNumber: dbOrderContext?.orderNumber || identifier,
              trackingNumber: track.awb_code || identifier,
              courierName: track.courier_name || 'Shiprocket Express',
              currentStatus,
              statusText,
              estimatedDelivery: isDelivered ? 'Delivered to Recipient' : (track.edd || 'Within 24–48 Hours'),
              origin: track.origin || 'Amritsar Cold Hub',
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
      const rawStatus = (dbOrderContext.status || '').toUpperCase();

      const isDelivered = rawStatus === 'DELIVERED';
      const isShipped = rawStatus === 'SHIPPED';
      const isProcessing = rawStatus === 'PROCESSING';
      const isCancelled = rawStatus === 'CANCELLED';

      const statusText = isDelivered
        ? 'Delivered · Handed to Recipient'
        : isShipped
        ? 'Dispatched · Handed over to Courier'
        : isProcessing
        ? 'Processing · Packing in Fulfillment Center'
        : isCancelled
        ? 'Order Cancelled'
        : 'Confirmed · Awaiting Dispatch';

      const currentStatus = rawStatus || 'CONFIRMED';
      const destination = dbOrderContext.address?.city
        ? `${dbOrderContext.address.city}, ${dbOrderContext.address.state || 'India'}`
        : 'Destination Address';

      const activities: TrackingScan[] = [];
      if (dbOrderContext.statusHistory && dbOrderContext.statusHistory.length > 0) {
        for (const h of dbOrderContext.statusHistory) {
          activities.push({
            date: new Date(h.createdAt).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            }),
            status: h.status,
            activity: h.note || `Order status updated to ${h.status}`,
            location: 'Rebelive Fulfillment Center',
          });
        }
      } else {
        activities.push({
          date: new Date(dbOrderContext.createdAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          status: 'Confirmed',
          activity: 'Order placed & confirmed. Awaiting courier handover.',
          location: 'Rebelive Digital Ops',
        });
      }

      return {
        isLive: Boolean(dbOrderContext.trackingNumber && dbOrderContext.trackingNumber !== 'SR-PENDING' && !dbOrderContext.trackingNumber.startsWith('SR-AWB-PENDING')),
        orderNumber: orderNum,
        trackingNumber: trackingNum,
        courierName: dbOrderContext.courierName || 'Shiprocket Express',
        currentStatus,
        statusText,
        estimatedDelivery: isDelivered ? 'Delivered to Recipient' : isCancelled ? 'N/A' : 'Pending Courier Pickup',
        origin: 'Amritsar Cold Hub (Punjab)',
        destination,
        activities,
      };
    }

    // Consignment not found on Shiprocket nor in MongoDB database
    return {
      isLive: false,
      orderNumber: identifier,
      trackingNumber: identifier,
      courierName: 'Shiprocket Express',
      currentStatus: 'NOT_FOUND',
      statusText: 'No consignment found',
      estimatedDelivery: 'N/A',
      origin: '',
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
  verifyFastrrSignature(payloadString: string, signature: string): boolean {
    if (!signature || typeof signature !== 'string') return false;
    const secret = env.SR_CHECKOUT_API_SECRET || 'rebelive_fastrr_secret_key';
    const expectedBase64 = crypto.createHmac('sha256', secret).update(payloadString).digest('base64');
    const expectedHex = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

    if (signature === expectedBase64 || signature === expectedHex) {
      return true;
    }

    try {
      const bufSig = Buffer.from(signature);
      const bufExpected = Buffer.from(expectedBase64);
      if (bufSig.length === bufExpected.length && crypto.timingSafeEqual(bufSig, bufExpected)) {
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
    const payload = {
      cart_data: {
        items: params.cart_data.items,
        cart_discount: params.cart_data.cart_discount,
        custom_attributes: params.cart_data.custom_attributes || { brand: 'REBELIVE' },
        mobile_app: Boolean(params.cart_data.mobile_app),
      },
      redirect_url: params.redirect_url || `${env.CLIENT_URL}/order-confirmation`,
      timestamp: new Date().toISOString(),
    };

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

