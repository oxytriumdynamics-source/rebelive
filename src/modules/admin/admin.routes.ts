import { Router } from 'express';
import multer from 'multer';
import * as adminController from './admin.controller';
import {
  authenticate,
  requireStaff,
  requireAdmin,
  requireSuperAdmin,
  requireModule,
} from '../auth/auth.middleware';
import { authLimiter } from '../../shared/middleware/rateLimiter';

const router = Router();

// Configure Multer for product image uploads (memory buffer for Cloudinary stream)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and AVIF images are permitted.'));
    }
  },
});

// ─── Public Admin Authentication (Standard 2-Step Email + Password + OTP) ─────
router.post('/login-request', authLimiter, adminController.adminLoginRequest);
router.post('/login-verify-otp', authLimiter, adminController.adminVerifyOtp);

// ─── Protected Routes (Requires Auth + STAFF Role: TEAM, ADMIN, SUPERADMIN) ───
router.use(authenticate, requireStaff);

// ─── Admin Profile & Password Management (SUPERADMIN Only) ────
router.patch('/change-password', requireSuperAdmin, adminController.changeAdminPassword);

// ─── System & Store Settings (Checkout Control) ─────────
router.get('/settings', requireAdmin, adminController.getSettings);
router.patch('/settings/checkout', requireAdmin, adminController.updateCheckoutSetting);

// ─── Dashboard (Accessible to all Staff) ──────────────────
router.get('/dashboard', adminController.getDashboard);

// ─── Staff & User Management (SUPERADMIN Exclusive for control, ADMIN for view) ────────
router.get('/admins', requireSuperAdmin, adminController.getAdminsList);
router.post('/staff', requireSuperAdmin, adminController.createStaffAccount);
router.patch('/staff/:id', requireSuperAdmin, adminController.updateStaffAccount);
router.get('/users', requireAdmin, adminController.getUsers);
router.get('/users/:id', requireAdmin, adminController.getUser);
router.patch('/users/:id', requireSuperAdmin, adminController.updateUser);
router.patch('/users/:id/restrict', requireSuperAdmin, adminController.restrictUser);
router.delete('/users/:id', requireSuperAdmin, adminController.deleteUserPermanent);

// ─── Product Management (requiresModule('products')) ────
router.get('/products', requireModule('products'), adminController.getProducts);
router.get('/products/:id', requireModule('products'), adminController.getProduct);
router.post('/products', requireModule('products'), adminController.createProduct);
router.patch('/products/:id', requireModule('products'), adminController.updateProduct);
router.delete('/products/:id', requireSuperAdmin, adminController.deleteProduct);
router.post('/upload-image', requireModule('products'), upload.single('image'), adminController.uploadProductImage);

// ─── Category Management (requiresModule('products')) ───
router.post('/categories', requireModule('products'), adminController.createCategory);

// ─── Order Management & Shiprocket Dispatch (requiresModule('orders')) ────
router.get('/orders', requireModule('orders'), adminController.getOrders);
router.post('/orders/sync-shiprocket', requireModule('orders'), adminController.syncAllOrdersToShiprocket);
router.get('/orders/:id', requireModule('orders'), adminController.getOrder);
router.patch('/orders/:id/status', requireModule('orders'), adminController.updateOrderStatus);
router.post('/orders/:id/dispatch-shiprocket', requireModule('orders'), adminController.dispatchOrderToShiprocket);
router.get('/orders/:id/track-shiprocket', requireModule('orders'), adminController.trackOrderShiprocket);
router.delete('/orders/:id', requireSuperAdmin, adminController.deleteOrderPermanent);

// ─── Inventory (requiresModule('products')) ─────────────
router.patch('/inventory/:variantId', requireModule('products'), adminController.updateStock);

// ─── Support Tickets ──────────────────────────────────
router.get('/tickets', requireModule('orders'), adminController.getTickets);
router.post('/tickets/:id/reply', requireModule('orders'), adminController.replyToTicket);

// ─── Coupons (requiresModule('products')) ───────────────
router.get('/coupons', requireModule('products'), adminController.getCoupons);
router.post('/coupons', requireModule('products'), adminController.createCoupon);
router.patch('/coupons/:id', requireModule('products'), adminController.updateCoupon);

// ─── Newsletter ───────────────────────────────────────
router.get('/newsletter', requireAdmin, adminController.getNewsletterSubscribers);

// ─── Audit Logs (SUPERADMIN Exclusive) ────────────────
router.get('/audit-logs', requireSuperAdmin, adminController.getAuditLogs);

// ─── Quiz & Personality Types ─────────────────────────
router.post('/personality-types', requireModule('products'), adminController.createPersonalityType);
router.post('/quiz/questions', requireModule('products'), adminController.createQuizQuestion);

// ─── Testimonials Management (requiresModule('testimonials')) ──────────
router.get('/testimonials', requireModule('testimonials'), adminController.getTestimonials);
router.get('/testimonials/:id', requireModule('testimonials'), adminController.getTestimonial);
router.post('/testimonials', requireModule('testimonials'), adminController.createTestimonial);
router.patch('/testimonials/:id', requireModule('testimonials'), adminController.updateTestimonial);
router.delete('/testimonials/:id', requireSuperAdmin, adminController.deleteTestimonial);

// ─── Contact Queries (requiresModule('contact-queries')) ────
router.get('/contact-queries', requireModule('contact-queries'), adminController.getContactQueries);
router.patch('/contact-queries/:id/status', requireModule('contact-queries'), adminController.updateContactQueryStatus);
router.delete('/contact-queries/:id', requireSuperAdmin, adminController.deleteContactQuery);

// ─── Corporate Queries (requiresModule('corporate-queries')) ───────────
router.get('/corporate-queries', requireModule('corporate-queries'), adminController.getCorporateQueries);
router.patch('/corporate-queries/:id/status', requireModule('corporate-queries'), adminController.updateCorporateQueryStatus);
router.delete('/corporate-queries/:id', requireSuperAdmin, adminController.deleteCorporateQuery);

// ─── Blog Posts & Articles Management (requiresModule('blogs')) ────────
router.get('/blogs', requireModule('blogs'), adminController.getBlogs);
router.get('/blogs/:id', requireModule('blogs'), adminController.getBlog);
router.post('/blogs', requireModule('blogs'), adminController.createBlog);
router.patch('/blogs/:id', requireModule('blogs'), adminController.updateBlog);
router.delete('/blogs/:id', requireSuperAdmin, adminController.deleteBlog);

export default router;
