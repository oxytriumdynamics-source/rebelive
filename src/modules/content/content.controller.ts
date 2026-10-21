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

// GET /api/v1/content/testimonials
export async function getTestimonials(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const testimonials = await prisma.testimonial.findMany({
      where: { isFeatured: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ status: 'success', data: testimonials });
  } catch (err) { next(err); }
}

// ─── BLOG POSTS & ARTICLES (PUBLIC) ─────────────────────

// GET /api/v1/content/blogs
export async function getBlogPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
    const tag = typeof req.query['tag'] === 'string' ? req.query['tag'] : undefined;
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
    const featured = req.query['featured'] === 'true';

    const where: any = { isPublished: true };

    if (category && category !== 'ALL') {
      where.category = { equals: category, mode: 'insensitive' };
    }

    if (tag) {
      where.tags = { has: tag };
    }

    if (featured) {
      where.featured = true;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
      ];
    }

    const blogs = await prisma.blogPost.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    // Compute categories with counts
    const allPublished = await prisma.blogPost.findMany({
      where: { isPublished: true },
      select: { category: true },
    });
    const categoryCounts: Record<string, number> = {};
    for (const post of allPublished) {
      if (post.category) {
        categoryCounts[post.category] = (categoryCounts[post.category] || 0) + 1;
      }
    }

    res.json({
      status: 'success',
      data: blogs,
      categories: Object.entries(categoryCounts).map(([name, count]) => ({ name, count })),
      total: blogs.length,
    });
  } catch (err) { next(err); }
}

// GET /api/v1/content/blogs/:slug
export async function getBlogPostBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slugOrId = String(req.params['slug']);

    // Find by slug first, fallback to id
    let blog = await prisma.blogPost.findUnique({
      where: { slug: slugOrId },
    });

    if (!blog && /^[0-9a-fA-F]{24}$/.test(slugOrId)) {
      blog = await prisma.blogPost.findUnique({
        where: { id: slugOrId },
      });
    }

    if (!blog || !blog.isPublished) {
      throw new NotFoundError('Blog post');
    }

    // Increment views asynchronously
    prisma.blogPost
      .update({
        where: { id: blog.id },
        data: { views: { increment: 1 } },
      })
      .catch(() => {});

    // Fetch related articles (same category or others, excluding current)
    const related = await prisma.blogPost.findMany({
      where: {
        isPublished: true,
        id: { not: blog.id },
        category: blog.category,
      },
      take: 3,
      orderBy: { createdAt: 'desc' },
    });

    let fallbackRelated = related;
    if (fallbackRelated.length < 3) {
      const more = await prisma.blogPost.findMany({
        where: {
          isPublished: true,
          id: { notIn: [blog.id, ...fallbackRelated.map((r) => r.id)] },
        },
        take: 3 - fallbackRelated.length,
        orderBy: { createdAt: 'desc' },
      });
      fallbackRelated = [...fallbackRelated, ...more];
    }

    res.json({
      status: 'success',
      data: {
        blog,
        related: fallbackRelated,
      },
    });
  } catch (err) { next(err); }
}

// GET /api/v1/content/blog-categories
export async function getBlogCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const allPublished = await prisma.blogPost.findMany({
      where: { isPublished: true },
      select: { category: true },
    });
    const categoryCounts: Record<string, number> = {};
    for (const post of allPublished) {
      if (post.category) {
        categoryCounts[post.category] = (categoryCounts[post.category] || 0) + 1;
      }
    }
    res.json({
      status: 'success',
      data: Object.entries(categoryCounts).map(([name, count]) => ({ name, count })),
    });
  } catch (err) { next(err); }
}

