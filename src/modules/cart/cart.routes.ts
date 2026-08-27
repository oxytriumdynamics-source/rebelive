import { Router } from 'express';
import * as cartController from './cart.controller';
import { optionalAuthenticate } from '../auth/auth.middleware';

const router = Router();

// Cart works for both guests and authenticated users
router.use(optionalAuthenticate);

router.get('/', cartController.getCart);
router.post('/items', cartController.addToCart);
router.patch('/items/:itemId', cartController.updateCartItem);
router.delete('/items/:itemId', cartController.removeFromCart);
router.post('/coupon', cartController.applyCoupon);
router.delete('/coupon', cartController.removeCoupon);

export default router;
