import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import { getPagination, buildPaginationResult } from '../../shared/types';

const paramStr = (req: Request, key = 'id'): string => req.params[key] as string;
const qStr = (req: Request, key: string): string | undefined => {
  const v = req.query[key];
  return Array.isArray(v) ? (v[0] as string) : (v as string | undefined);
};

// ─── Categories ────────────────────────────────────────

// GET /api/v1/products/categories
export async function getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ status: 'success', data: categories });
  } catch (err) { next(err); }
}

// ─── Products ──────────────────────────────────────────

// GET /api/v1/products
export async function getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const categoryId = qStr(req, 'categoryId');
    const featured = qStr(req, 'featured');
    const search = qStr(req, 'search');

    const where = {
      isActive: true,
      ...(categoryId && { categoryId }),
      ...(featured === 'true' && { isFeatured: true }),
      ...(search && { name: { contains: search, mode: 'insensitive' as const } }),
    };

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          images: { where: { isPrimary: true }, take: 1 },
          variants: { where: { isDefault: true }, take: 1 },
          category: { select: { name: true, slug: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// GET /api/v1/products/:slug
export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await prisma.product.findUnique({
      where: { slug: paramStr(req, 'slug') },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true } },
        category: true,
        personalityType: true,
        reviews: {
          where: { isApproved: true },
          include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!product || !product.isActive) throw new NotFoundError('Product');
    res.json({ status: 'success', data: product });
  } catch (err) { next(err); }
}

// ─── Bundles ───────────────────────────────────────────

// GET /api/v1/products/bundles
export async function getBundles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bundles = await prisma.bundle.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { items: { include: { product: { include: { images: { where: { isPrimary: true } } } }, variant: true } } },
    });
    res.json({ status: 'success', data: bundles });
  } catch (err) { next(err); }
}

// GET /api/v1/products/bundles/:slug
export async function getBundle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bundle = await prisma.bundle.findUnique({
      where: { slug: paramStr(req, 'slug') },
      include: { items: { include: { product: true, variant: true } } },
    });
    if (!bundle || !bundle.isActive) throw new NotFoundError('Bundle');
    res.json({ status: 'success', data: bundle });
  } catch (err) { next(err); }
}

// ─── Reviews ───────────────────────────────────────────

// POST /api/v1/products/:id/reviews
export async function createReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rating, title, body, orderId } = req.body as { rating: string | number; title?: string; body: string; orderId: string };
    const review = await prisma.review.create({
      data: {
        userId: req.user!.id,
        productId: paramStr(req),
        orderId,
        rating: parseInt(rating as string),
        title,
        body,
      },
    });
    res.status(201).json({ status: 'success', data: review });
  } catch (err) { next(err); }
}
