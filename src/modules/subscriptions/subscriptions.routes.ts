import { Router } from 'express';
import * as subsController from './subscriptions.controller';
import { authenticate } from '../auth/auth.middleware';

const router = Router();

router.get('/plans', subsController.getPlans); // public
router.use(authenticate);

router.get('/', subsController.getSubscriptions);
router.post('/', subsController.createSubscription);
router.patch('/:id/pause', subsController.pauseSubscription);
router.patch('/:id/resume', subsController.resumeSubscription);
router.delete('/:id', subsController.cancelSubscription);

export default router;
