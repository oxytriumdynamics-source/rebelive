import { Router } from 'express';
import * as supportController from './support.controller';
import { authenticate } from '../auth/auth.middleware';

const router = Router();

// Public FAQ routes
router.get('/faqs', supportController.getFAQs);
router.patch('/faqs/:id/view', supportController.incrementFAQView);

// Public Contact & Corporate Query routes
router.post('/contact-query', supportController.submitContactQuery);
router.post('/corporate-query', supportController.submitCorporateQuery);

// Protected ticket routes
router.get('/tickets', authenticate, supportController.getTickets);
router.get('/tickets/:id', authenticate, supportController.getTicket);
router.post('/tickets', authenticate, supportController.createTicket);
router.post('/tickets/:id/messages', authenticate, supportController.replyToTicket);

export default router;
