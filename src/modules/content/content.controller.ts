import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';

// GET /api/v1/content/:slug
export async function getPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = await prisma.contentPage.findUnique({
      where: { slug: req.params['slug'] as string },
    });
    if (!page || !page.isPublished) throw new NotFoundError('Page');
    res.json({ status: 'success', data: page });
  } catch (err) { next(err); }
}

// GET /api/v1/content
export async function listPages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pages = await prisma.contentPage.findMany({
      where: { isPublished: true },
      select: { slug: true, title: true, subtitle: true, updatedAt: true },
    });
    res.json({ status: 'success', data: pages });
  } catch (err) { next(err); }
}

// POST /api/v1/newsletter/subscribe
export async function subscribeNewsletter(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, name, source } = req.body;
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, name, source, isActive: true },
      update: { isActive: true },
    });
    res.json({ status: 'success', message: "You're subscribed!" });
  } catch (err) { next(err); }
}

// POST /api/v1/newsletter/unsubscribe
export async function unsubscribeNewsletter(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    await prisma.newsletterSubscriber.update({
      where: { email },
      data: { isActive: false },
    });
    res.json({ status: 'success', message: 'Unsubscribed successfully' });
  } catch (err) { next(err); }
}
