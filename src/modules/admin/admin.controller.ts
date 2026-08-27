import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import { getPagination, buildPaginationResult } from '../../shared/types';

const qStr = (req: Request, key: string): string | undefined => {
  const v = req.query[key];
  return Array.isArray(v) ? (v[0] as string) : (v as string | undefined);
};
const paramStr = (req: Request, key = 'id') => req.params[key] as string;

// GET /api/v1/admin/dashboard
export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [totalUsers, totalOrders, totalProducts, pendingOrders, openTickets, recentOrders, lowStockVariants] =
      await Promise.all([
        prisma.user.count(),
        prisma.order.count(),
        prisma.product.count({ where: { isActive: true } }),
        prisma.order.count({ where: { status: 'PENDING' } }),
        prisma.ticket.count({ where: { status: 'OPEN' } }),
        prisma.order.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        }),
        prisma.productVariant.findMany({
          where: { stockQty: { lte: 10 }, isActive: true },
          include: { product: { select: { name: true } } },
          take: 10,
        }),
      ]);

    const revenueResult = await prisma.order.aggregate({
      _sum: { total: true },
      where: { status: { in: ['DELIVERED', 'SHIPPED'] } },
    });

    res.json({
      status: 'success',
      data: {
        stats: { totalUsers, totalOrders, totalProducts, pendingOrders, openTickets, totalRevenue: revenueResult._sum.total ?? 0 },
        recentOrders,
        lowStockVariants,
      },
    });
  } catch (err) { next(err); }
}

// GET /api/v1/admin/users
export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const search = qStr(req, 'search');
    const role = qStr(req, 'role');

    const where = {
      ...(role && { role: role as 'CUSTOMER' | 'ADMIN' | 'SUPERADMIN' }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);

    const data = users.map(({ passwordHash, refreshTokens, googleId, ...u }) => u);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// GET /api/v1/admin/users/:id
export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: paramStr(req) },
      include: { orders: { take: 5, orderBy: { createdAt: 'desc' } }, addresses: true, preferences: true },
    });
    if (!user) throw new NotFoundError('User');
    const { passwordHash, refreshTokens, googleId, ...safe } = user;
    res.json({ status: 'success', data: safe });
  } catch (err) { next(err); }
}

// PATCH /api/v1/admin/users/:id
export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role, emailVerified } = req.body as { role?: 'CUSTOMER' | 'ADMIN' | 'SUPERADMIN'; emailVerified?: boolean };
    const user = await prisma.user.update({ where: { id: paramStr(req) }, data: { role, emailVerified } });
    const { passwordHash, refreshTokens, googleId, ...safe } = user;
    res.json({ status: 'success', data: safe });
  } catch (err) { next(err); }
}

// POST /api/v1/admin/products
export async function createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await prisma.product.create({ data: req.body as Parameters<typeof prisma.product.create>[0]['data'] });
    res.status(201).json({ status: 'success', data: product });
  } catch (err) { next(err); }
}

// PATCH /api/v1/admin/products/:id
export async function updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await prisma.product.update({ where: { id: paramStr(req) }, data: req.body as Parameters<typeof prisma.product.update>[0]['data'] });
    res.json({ status: 'success', data: product });
  } catch (err) { next(err); }
}

// DELETE /api/v1/admin/products/:id
export async function deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.product.update({ where: { id: paramStr(req) }, data: { isActive: false } });
    res.json({ status: 'success', message: 'Product deactivated' });
  } catch (err) { next(err); }
}

// GET /api/v1/admin/orders
export async function getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const status = qStr(req, 'status');

    const where = status
      ? { status: status as 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED' }
      : {};

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, firstName: true, lastName: true } }, items: true },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// PATCH /api/v1/admin/orders/:id/status
export async function updateOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, note, trackingNumber, trackingUrl } = req.body as {
      status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
      note?: string;
      trackingNumber?: string;
      trackingUrl?: string;
    };
    const order = await prisma.order.update({
      where: { id: paramStr(req) },
      data: {
        status,
        trackingNumber: trackingNumber ?? undefined,
        trackingUrl: trackingUrl ?? undefined,
        statusHistory: { create: { status, note } },
      },
    });
    res.json({ status: 'success', data: order });
  } catch (err) { next(err); }
}

// PATCH /api/v1/admin/inventory/:variantId
export async function updateStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { changeQty, reason, note } = req.body as { changeQty: number; reason: string; note?: string };
    const variant = await prisma.productVariant.findUnique({ where: { id: paramStr(req, 'variantId') } });
    if (!variant) throw new NotFoundError('Product variant');

    const [updatedVariant] = await prisma.$transaction([
      prisma.productVariant.update({ where: { id: variant.id }, data: { stockQty: { increment: changeQty } } }),
      prisma.inventoryLog.create({ data: { productId: variant.productId, variantId: variant.id, changeQty, reason, note } }),
    ]);

    res.json({ status: 'success', data: updatedVariant });
  } catch (err) { next(err); }
}

// GET /api/v1/admin/tickets
export async function getTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const status = qStr(req, 'status');
    const priority = qStr(req, 'priority');

    const where = {
      ...(status && { status: status as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' }),
      ...(priority && { priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' }),
    };

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where, skip, take,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: { user: { select: { email: true, firstName: true, lastName: true } }, messages: { take: 1, orderBy: { createdAt: 'desc' } } },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// POST /api/v1/admin/tickets/:id/reply
export async function replyToTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message, isInternal, newStatus } = req.body as {
      message: string;
      isInternal?: boolean;
      newStatus?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    };
    const msg = await prisma.ticketMessage.create({
      data: { ticketId: paramStr(req), sender: 'SUPPORT', message, isInternal: isInternal ?? false },
    });
    if (newStatus) {
      await prisma.ticket.update({
        where: { id: paramStr(req) },
        data: { status: newStatus, ...(newStatus === 'RESOLVED' && { resolvedAt: new Date() }) },
      });
    }
    res.status(201).json({ status: 'success', data: msg });
  } catch (err) { next(err); }
}

// GET /api/v1/admin/coupons
export async function getCoupons(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ status: 'success', data: coupons });
  } catch (err) { next(err); }
}

// POST /api/v1/admin/coupons
export async function createCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as Parameters<typeof prisma.coupon.create>[0]['data'];
    const coupon = await prisma.coupon.create({ data: { ...body, code: (body.code as string).toUpperCase() } });
    res.status(201).json({ status: 'success', data: coupon });
  } catch (err) { next(err); }
}

// PATCH /api/v1/admin/coupons/:id
export async function updateCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const coupon = await prisma.coupon.update({ where: { id: paramStr(req) }, data: req.body as Parameters<typeof prisma.coupon.update>[0]['data'] });
    res.json({ status: 'success', data: coupon });
  } catch (err) { next(err); }
}

// GET /api/v1/admin/newsletter
export async function getNewsletterSubscribers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.newsletterSubscriber.findMany({ where: { isActive: true }, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.newsletterSubscriber.count({ where: { isActive: true } }),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// GET /api/v1/admin/audit-logs
export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' }, skip, take,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      prisma.auditLog.count(),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// POST /api/v1/admin/categories
export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = await prisma.category.create({ data: req.body as Parameters<typeof prisma.category.create>[0]['data'] });
    res.status(201).json({ status: 'success', data: category });
  } catch (err) { next(err); }
}

// POST /api/v1/admin/personality-types
export async function createPersonalityType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const type = await prisma.personalityType.create({ data: req.body as Parameters<typeof prisma.personalityType.create>[0]['data'] });
    res.status(201).json({ status: 'success', data: type });
  } catch (err) { next(err); }
}

// POST /api/v1/admin/quiz/questions
export async function createQuizQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { question, sortOrder, answers } = req.body as { question: string; sortOrder?: number; answers?: Array<{ answerText: string; personalityTypeId: string; weight?: number }> };
    const q = await prisma.quizQuestion.create({
      data: {
        question,
        sortOrder: sortOrder ?? 0,
        answers: { create: answers ?? [] },
      },
      include: { answers: true },
    });
    res.status(201).json({ status: 'success', data: q });
  } catch (err) { next(err); }
}
