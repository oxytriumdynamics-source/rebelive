import { Router } from 'express';
import multer from 'multer';
import * as adminController from './admin.controller';
import { authenticate, requireAdmin, requireSuperAdmin } from '../auth/auth.middleware';

const router = Router();

// Configure Multer for product image uploads (memory buffer for Cloudinary stream)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum
  },
});

// ─── Public Admin Authentication (Standard 2-Step OTP + Test Bypass) ─────
router.post('/login-request', adminController.adminLoginRequest);
router.post('/login-verify-otp', adminController.adminVerifyOtp);
router.post('/test-login', adminController.testAdminLogin);

// ─── Protected Routes (Requires Auth + ADMIN / SUPERADMIN Role) ────
router.use(authenticate, requireAdmin);

// ─── Dashboard ────────────────────────────────────────
router.get('/dashboard', adminController.getDashboard);

// ─── User Management ──────────────────────────────────
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.patch('/users/:id', requireSuperAdmin, adminController.updateUser);

// ─── Product Management (Full CRUD & Cloudinary Uploads)
router.get('/products', adminController.getProducts);
router.get('/products/:id', adminController.getProduct);
router.post('/products', adminController.createProduct);
router.patch('/products/:id', adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);
router.post('/upload-image', upload.single('image'), adminController.uploadProductImage);

// ─── Category Management ──────────────────────────────
router.post('/categories', adminController.createCategory);

// ─── Order Management & Shiprocket Dispatch ───────────
router.get('/orders', adminController.getOrders);
router.get('/orders/:id', adminController.getOrder);
router.patch('/orders/:id/status', adminController.updateOrderStatus);
router.post('/orders/:id/dispatch-shiprocket', adminController.dispatchOrderToShiprocket);
router.get('/orders/:id/track-shiprocket', adminController.trackOrderShiprocket);

// ─── Inventory ────────────────────────────────────────
router.patch('/inventory/:variantId', adminController.updateStock);

// ─── Support Tickets ──────────────────────────────────
router.get('/tickets', adminController.getTickets);
router.post('/tickets/:id/reply', adminController.replyToTicket);

// ─── Coupons ──────────────────────────────────────────
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.patch('/coupons/:id', adminController.updateCoupon);

// ─── Newsletter ───────────────────────────────────────
router.get('/newsletter', adminController.getNewsletterSubscribers);

// ─── Audit Logs ───────────────────────────────────────
router.get('/audit-logs', requireSuperAdmin, adminController.getAuditLogs);

// ─── Quiz & Personality Types ─────────────────────────
router.post('/personality-types', adminController.createPersonalityType);
router.post('/quiz/questions', adminController.createQuizQuestion);

export default router;
