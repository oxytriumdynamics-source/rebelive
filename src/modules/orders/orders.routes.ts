import { Router } from 'express';
import * as ordersController from './orders.controller';
import { authenticate } from '../auth/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', ordersController.getOrders);
router.get('/:id', ordersController.getOrder);
router.post('/', ordersController.placeOrder);
router.post('/:id/cancel', ordersController.cancelOrder);

export default router;
