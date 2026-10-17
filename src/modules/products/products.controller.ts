import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import { getPagination, buildPaginationResult } from '../../shared/types';
import { productsCache } from './products.cache';

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
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
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

    const cacheKey = `list:${categoryId || ''}:${featured || ''}:${search || ''}:${page}:${limit}`;
    const cached = productsCache.getList(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=300');
      res.json(cached);
      return;
    }

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
        orderBy: { createdAt: 'asc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          variants: { where: { isActive: true }, orderBy: { price: 'asc' } },
          category: { select: { name: true, slug: true } },
          personalityType: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Format products so id is long data type (number) and unique, preserving slug and variants
    const formattedData = data.map((p) => ({
      ...p,
      id: Number(p.id),
      slug: p.slug,
      variants: p.variants.map((v) => ({
        ...v,
        id: Number(v.id),
        productId: Number(v.productId),
      })),
    }));

    const responsePayload = {
      status: 'success',
      products: formattedData,
      ...buildPaginationResult(formattedData, total, page, limit),
    };

    // Store in cache and pre-warm individual items
    productsCache.setList(cacheKey, responsePayload);
    formattedData.forEach((p) => {
      if (p.slug) productsCache.setProduct(p.slug, p);
      if (p.id) productsCache.setProduct(String(p.id), p);
    });

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=300');
    res.json(responsePayload);
  } catch (err) { next(err); }
}

// GET /api/v1/products/:slug
export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slugOrId = paramStr(req, 'slug');
    const cached = productsCache.getProduct(slugOrId);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=300');
      res.json({ status: 'success', data: cached, product: cached });
      return;
    }

    const isNumeric = /^\d+$/.test(slugOrId);

    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: slugOrId.toLowerCase() },
          ...(isNumeric ? [{ id: BigInt(slugOrId) }] : []),
        ],
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true }, orderBy: { price: 'asc' } },
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

    const formattedProduct = {
      ...product,
      id: Number(product.id),
      slug: product.slug,
      variants: product.variants.map((v) => ({
        ...v,
        id: Number(v.id),
        productId: Number(v.productId),
      })),
    };

    productsCache.setProduct(slugOrId, formattedProduct);
    if (formattedProduct.slug) productsCache.setProduct(formattedProduct.slug, formattedProduct);
    if (formattedProduct.id) productsCache.setProduct(String(formattedProduct.id), formattedProduct);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=300');
    res.json({ status: 'success', data: formattedProduct, product: formattedProduct });
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
    const { rating, title, body, orderId } = req.body as { rating: string | number; title?: string; body: string; orderId?: string };

    const idOrSlug = paramStr(req);
    const isNumeric = /^\d+$/.test(idOrSlug);
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: idOrSlug.toLowerCase() },
          ...(isNumeric ? [{ id: BigInt(idOrSlug) }] : []),
        ],
      },
    });
    if (!product) throw new NotFoundError('Product');

    const numRating = parseInt(String(rating), 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      res.status(400).json({ status: 'error', message: 'Rating must be an integer between 1 and 5' });
      return;
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      res.status(400).json({ status: 'error', message: 'Review body cannot be empty' });
      return;
    }

    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ status: 'error', message: 'Valid orderId is required to review a product' });
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user!.id },
    });
    if (!order) {
      res.status(400).json({ status: 'error', message: 'Order not found or does not belong to your account' });
      return;
    }

    const review = await prisma.review.create({
      data: {
        userId: req.user!.id,
        productId: product.id,
        orderId: order.id,
        rating: numRating,
        title: title ? String(title).slice(0, 150) : undefined,
        body: String(body).slice(0, 2000),
      },
    });
    // Invalidate product cache so updated reviews and ratings reflect immediately
    productsCache.clear();
    res.status(201).json({ status: 'success', data: review });
  } catch (err) { next(err); }
}
