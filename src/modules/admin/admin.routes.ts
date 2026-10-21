import { Router } from 'express';
import multer from 'multer';
import * as adminController from './admin.controller';
import { authenticate, requireAdmin, requireSuperAdmin } from '../auth/auth.middleware';
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

// ─── Protected Routes (Requires Auth + ADMIN / SUPERADMIN Role) ────
router.use(authenticate, requireAdmin);

// ─── Admin Profile & Password Management (SUPERADMIN Only) ────
router.patch('/change-password', requireSuperAdmin, adminController.changeAdminPassword);

// ─── Dashboard ────────────────────────────────────────
router.get('/dashboard', adminController.getDashboard);

// ─── User Management & Super Admin Restrictions ────────
router.get('/admins', requireSuperAdmin, adminController.getAdminsList);
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.patch('/users/:id', requireSuperAdmin, adminController.updateUser);
router.patch('/users/:id/restrict', requireSuperAdmin, adminController.restrictUser);

// ─── Product Management (Deletions restricted to Super Admin)
router.get('/products', adminController.getProducts);
router.get('/products/:id', adminController.getProduct);
router.post('/products', adminController.createProduct);
router.patch('/products/:id', adminController.updateProduct);
router.delete('/products/:id', requireSuperAdmin, adminController.deleteProduct);
router.post('/upload-image', upload.single('image'), adminController.uploadProductImage);

// ─── Category Management ──────────────────────────────
router.post('/categories', adminController.createCategory);

// ─── Order Management & Shiprocket Dispatch ───────────
router.get('/orders', adminController.getOrders);
router.post('/orders/sync-shiprocket', adminController.syncAllOrdersToShiprocket);
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

// ─── Testimonials Management ──────────────────────────
router.get('/testimonials', adminController.getTestimonials);
router.get('/testimonials/:id', adminController.getTestimonial);
router.post('/testimonials', adminController.createTestimonial);
router.patch('/testimonials/:id', adminController.updateTestimonial);
router.delete('/testimonials/:id', requireSuperAdmin, adminController.deleteTestimonial);

// ─── Contact Queries (User Queries) ────────────────────
router.get('/contact-queries', adminController.getContactQueries);
router.patch('/contact-queries/:id/status', adminController.updateContactQueryStatus);
router.delete('/contact-queries/:id', requireSuperAdmin, adminController.deleteContactQuery);

// ─── Corporate Queries ────────────────────────────────
router.get('/corporate-queries', adminController.getCorporateQueries);
router.patch('/corporate-queries/:id/status', adminController.updateCorporateQueryStatus);
router.delete('/corporate-queries/:id', requireSuperAdmin, adminController.deleteCorporateQuery);

// ─── Blog Posts & Articles Management ─────────────────
router.get('/blogs', adminController.getBlogs);
router.get('/blogs/:id', adminController.getBlog);
router.post('/blogs', adminController.createBlog);
router.patch('/blogs/:id', adminController.updateBlog);
router.delete('/blogs/:id', adminController.deleteBlog);

export default router;

