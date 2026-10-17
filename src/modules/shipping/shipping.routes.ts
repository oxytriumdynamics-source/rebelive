import { Router } from 'express';
import * as shippingController from './shipping.controller';
import { optionalAuthenticate } from '../auth/auth.middleware';

const router = Router();

// ─── Fastrr Headless Checkout Endpoints ──────────────────────
router.post('/fastrr/initiate', optionalAuthenticate, shippingController.initiateFastrrCheckout);
router.post('/fastrr/token', shippingController.generateFastrrToken);
router.post('/fastrr/complete', optionalAuthenticate, shippingController.completeFastrrCheckout);
router.post('/fastrr/order/details', shippingController.getFastrrOrderDetails);
router.post('/fastrr/order/list', shippingController.listFastrrOrders);
router.post('/fastrr/refund/initiate', shippingController.initiateRefund);

// ─── Seller Catalog Sync APIs (Shiprocket SRC) ───────────────
// Expected by Shiprocket to sync products & collections to backend
router.get('/catalog/products', shippingController.getCatalogProducts);
router.get('/catalog/collections', shippingController.getCatalogCollections);
router.get('/catalog/collection-products', shippingController.getCatalogCollectionProducts);

// ─── Loyalty Points Manager (Shiprocket SRC) ─────────────────
router.post('/catalog/loyalty/points', shippingController.getLoyaltyPoints);
router.post('/catalog/loyalty/block', shippingController.blockLoyaltyPoints);
router.post('/catalog/loyalty/unblock', shippingController.unblockLoyaltyPoints);

// ─── Live Shiprocket Tracking & Webhook Status ───────────────
router.get('/track/:identifier', shippingController.trackShipment);
router.get('/order-status/:identifier', shippingController.trackShipment);

// ─── Shipping Rates & Policy ─────────────────────────────────
router.get('/rates', shippingController.getShippingRates);

// ─── Webhooks ────────────────────────────────────────────────
// Shiprocket Tracking & Delivery Status Updates
router.post('/webhooks/tracking', shippingController.handleShiprocketWebhook);
router.post('/webhooks/delivery', shippingController.handleShiprocketWebhook);
router.post('/webhooks/shiprocket', shippingController.handleShiprocketWebhook);

// Shiprocket SRC Order Ingestion Webhook (called by Shiprocket on order completion)
router.post('/webhooks/order', shippingController.handleShiprocketOrderWebhook);
router.post('/webhooks/fastrr-order', shippingController.handleShiprocketOrderWebhook);

// Fastrr Headless Checkout Events & Payment Capture
router.post('/webhooks/fastrr', shippingController.handleFastrrWebhook);

export default router;
