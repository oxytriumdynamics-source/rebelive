import { Router } from 'express';
import * as productsController from './products.controller';
import { authenticate, optionalAuthenticate } from '../auth/auth.middleware';

const router = Router();

// Categories
router.get('/categories', productsController.getCategories);

// Bundles
router.get('/bundles', productsController.getBundles);
router.get('/bundles/:slug', productsController.getBundle);

// Products (public with optional auth)
router.get('/', productsController.getProducts);
router.get('/:slug', productsController.getProduct);

// Reviews (requires auth)
router.post('/:id/reviews', authenticate, productsController.createReview);

export default router;
