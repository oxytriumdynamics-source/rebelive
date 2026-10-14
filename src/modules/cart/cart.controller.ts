import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';

// Helper to locate the active cart for either authenticated user or guest session
async function getActiveCart(req: Request) {
  const sessionId = req.headers['x-session-id'] as string | undefined;
  const userId = req.user?.id;
  if (!userId && (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0)) {
    return null;
  }
  return prisma.cart.findFirst({
    where: userId ? { userId } : { sessionId },
  });
}

// GET /api/v1/cart
export async function getCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = req.headers['x-session-id'] as string | undefined;
    const userId = req.user?.id;

    if (!userId && (!sessionId || typeof sessionId !== 'string')) {
      res.json({ status: 'success', data: { items: [], coupon: null } });
      return;
    }

    const cart = await prisma.cart.findFirst({
      where: userId ? { userId } : { sessionId },
      include: {
        items: {
          include: {
            product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
            variant: true,
            bundle: true,
          },
        },
        coupon: true,
      },
    });

    res.json({ status: 'success', data: cart ?? { items: [], coupon: null } });
  } catch (err) { next(err); }
}

// POST /api/v1/cart/items
export async function addToCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { productId, variantId, bundleId, quantity = 1 } = req.body;
    const sessionId = req.headers['x-session-id'] as string | undefined;
    const userId = req.user?.id;

    if (!userId && (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0)) {
      throw new ValidationError('A session identifier or authentication is required');
    }

    const parsedQty = Math.min(100, Math.max(1, Math.floor(Number(quantity) || 1)));

    // Verify variant exists and has stock
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant || !variant.isActive) throw new NotFoundError('Product variant');
    if (variant.stockQty < parsedQty) throw new ValidationError('Insufficient stock');

    let cart = await prisma.cart.findFirst({
      where: userId ? { userId } : { sessionId },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: userId ?? null, sessionId: userId ? null : sessionId },
      });
    }

    // Upsert cart item
    const existing = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, variantId, bundleId: bundleId ?? null },
    });

    if (existing) {
      const newQty = Math.min(100, existing.quantity + parsedQty);
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId, variantId, bundleId: bundleId ?? null, quantity: parsedQty },
      });
    }

    const updated = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { product: true, variant: true, bundle: true } }, coupon: true },
    });

    res.status(201).json({ status: 'success', data: updated });
  } catch (err) { next(err); }
}

// PATCH /api/v1/cart/items/:itemId
export async function updateCartItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { quantity } = req.body as { quantity: number };
    const itemId = req.params['itemId'] as string;
    const cart = await getActiveCart(req);
    if (!cart) throw new NotFoundError('Cart');

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) throw new NotFoundError('Cart item');

    if (quantity <= 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
      res.json({ status: 'success', message: 'Item removed from cart' });
      return;
    }
    const safeQty = Math.min(100, Math.max(1, Math.floor(quantity)));
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: safeQty } });
    res.json({ status: 'success', message: 'Cart updated' });
  } catch (err) { next(err); }
}

// DELETE /api/v1/cart/items/:itemId
export async function removeFromCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itemId = req.params['itemId'] as string;
    const cart = await getActiveCart(req);
    if (!cart) throw new NotFoundError('Cart');

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) throw new NotFoundError('Cart item');

    await prisma.cartItem.delete({ where: { id: item.id } });
    res.json({ status: 'success', message: 'Item removed from cart' });
  } catch (err) { next(err); }
}

// POST /api/v1/cart/coupon
export async function applyCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code } = req.body;
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new ValidationError('Invalid or expired coupon');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new ValidationError('Coupon has expired');
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new ValidationError('Coupon usage limit reached');

    const sessionId = req.headers['x-session-id'] as string | undefined;
    const userId = req.user?.id;
    const cart = await prisma.cart.findFirst({ where: userId ? { userId } : { sessionId } });
    if (!cart) throw new NotFoundError('Cart');

    await prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } });
    res.json({ status: 'success', data: { coupon, message: 'Coupon applied!' } });
  } catch (err) { next(err); }
}

// DELETE /api/v1/cart/coupon
export async function removeCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = req.headers['x-session-id'] as string | undefined;
    const userId = req.user?.id;
    const cart = await prisma.cart.findFirst({ where: userId ? { userId } : { sessionId } });
    if (cart) await prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    res.json({ status: 'success', message: 'Coupon removed' });
  } catch (err) { next(err); }
}
