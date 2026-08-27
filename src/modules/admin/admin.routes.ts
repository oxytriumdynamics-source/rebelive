import { Router } from 'express';
import * as adminController from './admin.controller';
import { authenticate, requireAdmin, requireSuperAdmin } from '../auth/auth.middleware';

const router = Router();

// All admin routes require auth + ADMIN or SUPERADMIN role
router.use(authenticate, requireAdmin);

// ─── Dashboard ────────────────────────────────────────
router.get('/dashboard', adminController.getDashboard);

// ─── User Management ──────────────────────────────────
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.patch('/users/:id', requireSuperAdmin, adminController.updateUser); // only SUPERADMIN can change roles

// ─── Product Management ───────────────────────────────
router.post('/products', adminController.createProduct);
router.patch('/products/:id', adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);

// ─── Category Management ──────────────────────────────
router.post('/categories', adminController.createCategory);

// ─── Order Management ─────────────────────────────────
router.get('/orders', adminController.getOrders);
router.patch('/orders/:id/status', adminController.updateOrderStatus);

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
