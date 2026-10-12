import { Router } from 'express';
import * as shippingController from './shipping.controller';
import { optionalAuthenticate } from '../auth/auth.middleware';

const router = Router();

// Fastrr Headless Checkout endpoints
router.post('/fastrr/initiate', optionalAuthenticate, shippingController.initiateFastrrCheckout);
router.post('/fastrr/complete', optionalAuthenticate, shippingController.completeFastrrCheckout);

// Live Shiprocket Tracking
router.get('/track/:identifier', shippingController.trackShipment);

// Shipping rates & policy
router.get('/rates', shippingController.getShippingRates);

// ─── Webhooks ─────────────────────────────────────────
// Shiprocket Tracking & Delivery Status Updates
// Complies with Shiprocket restriction: no 'shiprocket', 'kartrocket', 'sr', or 'kr' in the webhook URL
router.post('/webhooks/tracking', shippingController.handleShiprocketWebhook);
router.post('/webhooks/delivery', shippingController.handleShiprocketWebhook);
router.post('/webhooks/shiprocket', shippingController.handleShiprocketWebhook);

// Fastrr Headless Checkout Events & Payment Capture
router.post('/webhooks/fastrr', shippingController.handleFastrrWebhook);

export default router;
