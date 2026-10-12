import { Router } from 'express';
import * as contentController from './content.controller';

const router = Router();

router.get('/pages', contentController.listPages);
router.get('/pages/:slug', contentController.getPage);
router.get('/testimonials', contentController.getTestimonials);
router.post('/newsletter/subscribe', contentController.subscribeNewsletter);
router.post('/newsletter/unsubscribe', contentController.unsubscribeNewsletter);

export default router;
