import { Router } from 'express';
import * as contentController from './content.controller';
import { contactFormLimiter } from '../../shared/middleware/rateLimiter';

const router = Router();

router.get('/pages', contentController.listPages);
router.get('/pages/:slug', contentController.getPage);
router.get('/testimonials', contentController.getTestimonials);
router.post('/newsletter/subscribe', contactFormLimiter, contentController.subscribeNewsletter);
router.post('/newsletter/unsubscribe', contactFormLimiter, contentController.unsubscribeNewsletter);

export default router;
