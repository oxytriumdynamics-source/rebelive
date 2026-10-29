import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { getPagination, buildPaginationResult } from '../../shared/types';
import { hashPassword, verifyPassword } from '../../shared/utils/password';
import { formatRebelId } from '../../shared/utils/rebelId';
import {
  getUserAddresses,
  extractAddressFields,
  isValidRealAddress,
  saveUniqueUserAddress,
} from './address.service';
import { isAuthenticEmail } from '../../lib/orderEmail';

const userId = (req: Request): string => req.user!.id;
const paramId = (req: Request, key = 'id'): string => req.params[key] as string;

// GET /api/v1/users/profile
export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId(req) },
      include: {
        preferences: {
          include: { personalityType: true },
        },
      },
    });
    if (!user) throw new NotFoundError('User');
    const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safe } = user as any;
    res.json({ status: 'success', data: { ...safe, rebelId: formatRebelId(user.id) } });
  } catch (err) { next(err); }
}

// ─── Phone Normalization & Order Merging Helper ───────────
export function normalizePhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits.slice(-10);
}

/**
 * Universally links past orders created via Fastrr / guest checkout to the given user account.
 * Matches orders by phone number AND/OR authentic email address.
 * Automatically saves order addresses to the user's saved addresses and populates missing profile phone.
 */
export async function mergePastGuestOrders(
  targetUserId: string,
  params: { phone?: string | null; email?: string | null }
): Promise<number> {
  const cleanPhone = params.phone ? normalizePhone(params.phone) : '';
  const cleanEmail = params.email && isAuthenticEmail(params.email) ? params.email.trim().toLowerCase() : '';

  if ((!cleanPhone || cleanPhone.length < 10) && !cleanEmail) {
    return 0;
  }

  try {
    // 1. Find all other users with matching phone OR matching authentic email (e.g. Fastrr-created guest accounts)
    const otherUsers = await prisma.user.findMany({
      where: {
        id: { not: targetUserId },
        OR: [
          ...(cleanPhone && cleanPhone.length >= 10 ? [{ phone: { contains: cleanPhone } }] : []),
          ...(cleanEmail ? [{ email: cleanEmail }] : []),
        ],
      },
      select: { id: true, email: true, phone: true },
    });
    const otherUserIds = otherUsers.map((u) => u.id);

    // 2. Find orders to reassign (owned by those guest users OR containing phone/email in notes)
    const candidateOrders = await prisma.order.findMany({
      where: {
        userId: { not: targetUserId },
        OR: [
          ...(otherUserIds.length > 0 ? [{ userId: { in: otherUserIds } }] : []),
          ...(cleanPhone && cleanPhone.length >= 10 ? [{ notes: { contains: cleanPhone } }] : []),
          ...(cleanEmail ? [{ notes: { contains: cleanEmail } }] : []),
        ],
      },
      select: { id: true, shippingAddress: true, notes: true },
    });

    if (candidateOrders.length === 0) {
      // Even if no orders to reassign, ensure user has phone if missing
      if (cleanPhone && cleanPhone.length >= 10) {
        const targetUser = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { phone: true },
        });
        if (!targetUser?.phone) {
          await prisma.user.update({
            where: { id: targetUserId },
            data: { phone: cleanPhone },
          });
        }
      }
      return 0;
    }

    const orderIds = candidateOrders.map((o) => o.id);

    // Reassign orders to the authenticated target user
    const res = await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { userId: targetUserId },
    });

    // Automatically auto-save shipping addresses from merged orders to the user's address book
    for (const ord of candidateOrders) {
      if (ord.shippingAddress) {
        try {
          await saveUniqueUserAddress(targetUserId, ord.shippingAddress);
        } catch {}
      }
    }

    // If target user profile lacks phone, populate from cleanPhone
    if (cleanPhone && cleanPhone.length >= 10) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { phone: true },
      });
      if (!targetUser?.phone) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { phone: cleanPhone },
        });
      }
    }

    // Clean up empty orphaned dummy guest users (guest_* / rebel_*) so they do not pollute admin directory
    if (otherUserIds.length > 0) {
      for (const ou of otherUsers) {
        const isDummyEmail =
          ou.email.startsWith('guest_') || ou.email.startsWith('rebel_') || ou.email.startsWith('fastrr_');
        if (isDummyEmail) {
          const remainingOrders = await prisma.order.count({ where: { userId: ou.id } });
          if (remainingOrders === 0) {
            await prisma.user.delete({ where: { id: ou.id } }).catch(() => {});
          }
        }
      }
    }

    console.log(`🔗 [Order Linking] Reassigned ${res.count} orders to user ${targetUserId} (phone: ${cleanPhone || 'N/A'}, email: ${cleanEmail || 'N/A'})`);
    return res.count;
  } catch (err) {
    console.warn('Non-fatal error merging past guest orders:', err);
    return 0;
  }
}

/**
 * Backward-compatible wrapper for phone-only linking.
 */
export async function mergePastGuestOrdersByPhone(targetUserId: string, cleanPhone: string): Promise<number> {
  return mergePastGuestOrders(targetUserId, { phone: cleanPhone });
}

// POST /api/v1/users/link-phone
export async function linkPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawPhone = (req.body?.phone || '').trim();
    const cleanPhone = normalizePhone(rawPhone);

    if (!cleanPhone || cleanPhone.length < 10) {
      throw new ValidationError('Please enter a valid 10-digit mobile number');
    }

    const currentUserId = userId(req);

    // Update phone on current user
    const updatedUser = await prisma.user.update({
      where: { id: currentUserId },
      data: { phone: cleanPhone },
      include: {
        preferences: {
          include: { personalityType: true },
        },
      },
    });

    // Reassign all previous guest orders placed with this phone number or email
    const mergedCount = await mergePastGuestOrders(currentUserId, { phone: cleanPhone, email: updatedUser.email });

    const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safe } = updatedUser as any;
    res.json({
      status: 'success',
      message: `Phone number linked successfully. ${mergedCount} past orders synced to your account.`,
      data: {
        ...safe,
        rebelId: formatRebelId(updatedUser.id),
        mergedOrdersCount: mergedCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/users/profile
export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { firstName, lastName, phone, avatarUrl } = req.body as Record<string, string>;
    const updateData: Record<string, string> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = normalizePhone(phone) || phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    const currentUserId = userId(req);
    const user = await prisma.user.update({
      where: { id: currentUserId },
      data: updateData,
      include: {
        preferences: {
          include: { personalityType: true },
        },
      },
    });

    // Automatically link any matching past orders by phone and email
    const mergedCount = await mergePastGuestOrders(currentUserId, { phone: user.phone, email: user.email });

    const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safe } = user as any;
    res.json({
      status: 'success',
      data: {
        ...safe,
        rebelId: formatRebelId(user.id),
        mergedOrdersCount: mergedCount,
      },
    });
  } catch (err) { next(err); }
}

// PATCH /api/v1/users/change-password
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword, password } = req.body as {
      currentPassword?: string;
      newPassword?: string;
      password?: string;
    };
    const targetPassword = newPassword || password;

    if (!targetPassword || typeof targetPassword !== 'string' || targetPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters long');
    }

    const user = await prisma.user.findUnique({ where: { id: userId(req) } });
    if (!user) throw new NotFoundError('User');

    // If local password exists, verify current password
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new ValidationError('Current password is required');
      }
      const isMatch = await verifyPassword(currentPassword, user.passwordHash);
      if (!isMatch) {
        throw new ValidationError('Current password does not match');
      }
    }

    const passwordHash = await hashPassword(targetPassword);

    // Invalidate existing sessions on password change to revoke stolen tokens
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        refreshTokens: [],
      },
    });

    res.json({ status: 'success', message: 'Password updated successfully. Other active sessions revoked.' });
  } catch (err) { next(err); }
}

// ─── Addresses (Backed by Prisma Address Model & Order Deduplication) ─────

export async function getAddresses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await getUserAddresses(userId(req));
    res.json({ status: 'success', data: list });
  } catch (err) { next(err); }
}

export async function createAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const uId = userId(req);
    const body = req.body || {};
    const extracted = extractAddressFields(body);

    if (!isValidRealAddress(extracted)) {
      throw new ValidationError('A valid street line 1, city, and 6-digit PIN code are required.');
    }

    const isDefault = Boolean(body.isDefault);
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: uId },
        data: { isDefault: false },
      });
    }

    const existingCount = await prisma.address.count({ where: { userId: uId } });

    const newAddress = await prisma.address.create({
      data: {
        userId: uId,
        name: extracted.name || (req.user ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() : null) || null,
        phone: extracted.phone || req.user?.phone || null,
        line1: extracted.line1,
        line2: extracted.line2,
        city: extracted.city,
        state: extracted.state || 'India',
        country: extracted.country || 'India',
        postalCode: extracted.postalCode,
        label: extracted.label || (existingCount === 0 || isDefault ? 'Default Shipping' : 'Delivery Address'),
        isDefault: isDefault || existingCount === 0,
      },
    });

    res.status(201).json({ status: 'success', data: newAddress });
  } catch (err) { next(err); }
}

export async function updateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const uId = userId(req);
    const id = paramId(req);
    const existing = await prisma.address.findFirst({
      where: { id, userId: uId },
    });
    if (!existing) throw new NotFoundError('Address');

    const body = req.body || {};
    if (body.isDefault) {
      await prisma.address.updateMany({
        where: { userId: uId, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.address.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name?.trim() || null }),
        ...(body.phone !== undefined && { phone: body.phone ? String(body.phone).replace(/\D/g, '').slice(-10) : null }),
        ...(body.line1 !== undefined && { line1: body.line1.trim() }),
        ...(body.line2 !== undefined && { line2: body.line2 ? body.line2.trim() : null }),
        ...(body.city !== undefined && { city: body.city.trim() }),
        ...(body.state !== undefined && { state: body.state.trim() }),
        ...(body.country !== undefined && { country: body.country.trim() }),
        ...(body.postalCode !== undefined && { postalCode: String(body.postalCode).replace(/\D/g, '').slice(0, 6) }),
        ...(body.label !== undefined && { label: body.label?.trim() || null }),
        ...(body.isDefault !== undefined && { isDefault: Boolean(body.isDefault) }),
      },
    });

    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
}

export async function setDefaultAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const uId = userId(req);
    const id = paramId(req);
    const existing = await prisma.address.findFirst({
      where: { id, userId: uId },
    });
    if (!existing) throw new NotFoundError('Address');

    await prisma.address.updateMany({
      where: { userId: uId },
      data: { isDefault: false },
    });

    const updated = await prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });

    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
}

export async function deleteAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const uId = userId(req);
    const id = paramId(req);
    const existing = await prisma.address.findFirst({
      where: { id, userId: uId },
    });
    if (!existing) throw new NotFoundError('Address');

    await prisma.address.delete({ where: { id } });

    if (existing.isDefault) {
      const nextAddr = await prisma.address.findFirst({
        where: { userId: uId },
        orderBy: { createdAt: 'desc' },
      });
      if (nextAddr) {
        await prisma.address.update({
          where: { id: nextAddr.id },
          data: { isDefault: true },
        });
      }
    }

    res.json({ status: 'success', message: 'Address removed' });
  } catch (err) { next(err); }
}

// GET /api/v1/users/notifications
export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.notification.findMany({ where: { userId: userId(req) }, orderBy: { sentAt: 'desc' }, skip, take }),
      prisma.notification.count({ where: { userId: userId(req) } }),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// PATCH /api/v1/users/notifications/:id/read
export async function markNotificationRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramId(req);
    const existing = await prisma.notification.findFirst({
      where: { id, userId: userId(req) },
    });
    if (!existing) throw new NotFoundError('Notification');

    await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ status: 'success', message: 'Notification marked as read' });
  } catch (err) { next(err); }
}

// GET /api/v1/users/wishlist
export async function getWishlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const wishlist = await prisma.wishlist.findUnique({
      where: { userId: userId(req) },
      include: { items: { include: { product: { include: { images: { where: { isPrimary: true } } } }, variant: true } } },
    });
    res.json({ status: 'success', data: wishlist?.items ?? [] });
  } catch (err) { next(err); }
}

// POST /api/v1/users/wishlist
export async function addToWishlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { productId, variantId } = req.body as { productId: string | number; variantId: string | number };
    const pId = /^\d+$/.test(String(productId)) ? BigInt(productId) : null;
    const vId = /^\d+$/.test(String(variantId)) ? BigInt(variantId) : null;
    if (!pId || !vId) throw new ValidationError('Valid numeric productId and variantId are required');

    let wishlist = await prisma.wishlist.findUnique({ where: { userId: userId(req) } });
    if (!wishlist) {
      wishlist = await prisma.wishlist.create({ data: { userId: userId(req) } });
    }
    const item = await prisma.wishlistItem.upsert({
      where: { wishlistId_variantId: { wishlistId: wishlist.id, variantId: vId } },
      create: { wishlistId: wishlist.id, productId: pId, variantId: vId },
      update: {},
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
}

// DELETE /api/v1/users/wishlist/:itemId
export async function removeFromWishlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itemId = paramId(req, 'itemId');
    const item = await prisma.wishlistItem.findUnique({
      where: { id: itemId },
      include: { wishlist: true },
    });
    if (!item || item.wishlist.userId !== userId(req)) {
      throw new NotFoundError('Wishlist item');
    }
    await prisma.wishlistItem.delete({ where: { id: itemId } });
    res.json({ status: 'success', message: 'Item removed from wishlist' });
  } catch (err) { next(err); }
}
