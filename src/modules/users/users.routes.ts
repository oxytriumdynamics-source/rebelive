import { Router } from 'express';
import * as usersController from './users.controller';
import { authenticate } from '../auth/auth.middleware';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Profile
router.get('/profile', usersController.getProfile);
router.patch('/profile', usersController.updateProfile);
router.patch('/change-password', usersController.changePassword);

// Addresses
router.get('/addresses', usersController.getAddresses);
router.post('/addresses', usersController.createAddress);
router.patch('/addresses/:id', usersController.updateAddress);
router.delete('/addresses/:id', usersController.deleteAddress);

// Notifications
router.get('/notifications', usersController.getNotifications);
router.patch('/notifications/:id/read', usersController.markNotificationRead);

// Wishlist
router.get('/wishlist', usersController.getWishlist);
router.post('/wishlist', usersController.addToWishlist);
router.delete('/wishlist/:itemId', usersController.removeFromWishlist);

export default router;
