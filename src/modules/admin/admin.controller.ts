import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, UnauthorizedError, ValidationError, ForbiddenError } from '../../shared/errors/AppError';
import { getPagination, buildPaginationResult } from '../../shared/types';
import { hashPassword, verifyPassword } from '../../shared/utils/password';
import { generateAccessToken, generateRefreshToken } from '../auth/auth.service';
import { shiprocketService } from '../shipping/shiprocket.service';
import { buildShiprocketAddress } from '../shipping/shipping.controller';
import { sendMail } from '../../lib/mailer';
import { otpEmailHtml } from '../../lib/emailTemplates';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { logger } from '../../shared/utils/logger';
import type { UserRole, OrderStatus } from '@prisma/client';
import { productsCache } from '../products/products.cache';

const qStr = (req: Request, key: string): string | undefined => {
  const v = req.query[key];
  return Array.isArray(v) ? (v[0] as string) : (v as string | undefined);
};

const paramStr = (req: Request, key = 'id'): string => {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : (val || '');
};

// ─── ADMIN 2-STEP AUTHENTICATION (PASSWORD -> OTP) ─────

/**
 * POST /api/v1/admin/login-request
 * Step 1: Admin verifies email and password, system dispatches 6-digit OTP
 */
export async function adminLoginRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Ensure the user has ADMIN or SUPERADMIN privileges
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Access restricted to administrators only');
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otpHash, otpExpiry },
    });

    // Attempt sending real email
    try {
      await sendMail({
        to: user.email,
        subject: `[SECURITY] Your Admin Panel Login Verification Code`,
        html: otpEmailHtml({ firstName: user.firstName, otp }),
      });
    } catch (mailErr) {
      logger.warn(`Mailer error for admin OTP dispatch to ${user.email}: ${mailErr}`);
    }

    logger.info(`[ADMIN 2FA DISPATCH] Security verification code dispatched to ${user.email}`);

    res.status(200).json({
      status: 'success',
      message: `2FA security verification code dispatched to ${user.email}`,
      data: {
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/admin/login-verify-otp
 * Step 2: Admin verifies 6-digit OTP, acquires session tokens & dashboard access
 */
export async function adminVerifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };

    if (!email || !otp) {
      throw new ValidationError('Email and 6-digit OTP are required');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      throw new NotFoundError('Administrator account not found');
    }

    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Access restricted to administrators only');
    }

    if (!user.otpCode || !user.otpExpiry) {
      throw new UnauthorizedError('No pending OTP request found. Please request a new code.');
    }

    const submittedHash = crypto.createHash('sha256').update(cleanOtp).digest('hex');
    const userOtpBuf = Buffer.from(user.otpCode);
    const submittedBuf = Buffer.from(submittedHash);
    const isHashMatch = userOtpBuf.length === submittedBuf.length && crypto.timingSafeEqual(userOtpBuf, submittedBuf);
    const isExpired = new Date() > user.otpExpiry;

    if (!isHashMatch) {
      throw new UnauthorizedError('Invalid OTP code');
    }

    if (isExpired) {
      throw new UnauthorizedError('OTP code has expired. Please request a new one.');
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Clear OTP and record session
    const existingTokens = user.refreshTokens ?? [];
    const tokens = [...existingTokens.slice(-4), refreshToken];

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: null,
        otpExpiry: null,
        lastLoginAt: new Date(),
        emailVerified: true,
        refreshTokens: tokens,
      },
    });

    const { passwordHash, refreshTokens: _r, googleId, otpCode, ...safeUser } = user;

    res.status(200).json({
      status: 'success',
      message: 'Admin authorization granted',
      data: {
        user: safeUser,
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/admin/change-password
 * Allows the currently authenticated admin/superadmin to securely update their password.
 */
export async function changeAdminPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters long');
    }

    if (!req.user || !req.user.id) {
      throw new UnauthorizedError('Authentication required');
    }

    if (req.user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only Super Admin is authorized to modify administrator passwords');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user || !user.passwordHash) {
      throw new NotFoundError('Administrator account not found or has no password set');
    }

    const isMatch = await verifyPassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new ValidationError('Current password does not match');
    }

    const newHashed = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHashed,
        otpCode: null,
        otpExpiry: null,
      },
    });

    logger.info(`[ADMIN SECURITY] Password successfully updated for admin: ${user.email}`);

    res.status(200).json({
      status: 'success',
      message: 'Password successfully updated. Please use your new password on subsequent logins.',
    });
  } catch (err) {
    next(err);
  }
}

// ─── DASHBOARD METRICS ─────────────────────────────────

// GET /api/v1/admin/dashboard
export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [
      totalUsers,
      totalOrders,
      totalProducts,
      pendingOrders,
      shippedOrders,
      deliveredOrders,
      recentOrders,
      lowStockVariants,
      totalContactQueries,
      newContactQueries,
      totalCorporateQueries,
      newCorporateQueries,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'SHIPPED' } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          items: true,
        },
      }),
      prisma.productVariant.findMany({
        where: { stockQty: { lte: 25 }, isActive: true },
        include: { product: { select: { name: true, slug: true } } },
        take: 10,
      }),
      prisma.contactQuery.count().catch(() => 0),
      prisma.contactQuery.count({ where: { status: 'NEW' } }).catch(() => 0),
      prisma.corporateQuery.count().catch(() => 0),
      prisma.corporateQuery.count({ where: { status: 'NEW' } }).catch(() => 0),
    ]);

    const revenueResult = await prisma.order.aggregate({
      _sum: { total: true },
      where: { status: { notIn: ['CANCELLED', 'REFUNDED'] } },
    });

    // Shiprocket sync metrics
    const shiprocketSyncedOrders = await prisma.order.count({
      where: { trackingNumber: { not: null } },
    });

    res.json({
      status: 'success',
      data: {
        stats: {
          totalUsers,
          totalOrders,
          totalProducts,
          pendingOrders,
          shippedOrders,
          deliveredOrders,
          shiprocketSyncedOrders,
          totalRevenue: revenueResult._sum.total ?? 0,
          totalContactQueries,
          newContactQueries,
          totalCorporateQueries,
          newCorporateQueries,
          totalInquiries: (totalContactQueries || 0) + (totalCorporateQueries || 0),
          newInquiries: (newContactQueries || 0) + (newCorporateQueries || 0),
        },
        recentOrders,
        lowStockVariants,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── USER MANAGEMENT ───────────────────────────────────

// GET /api/v1/admin/users
export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const search = qStr(req, 'search');
    const role = qStr(req, 'role');

    const where = {
      ...(role && { role: role as UserRole }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          orders: { select: { id: true, total: true, status: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const data = users.map(({ passwordHash, refreshTokens, googleId, otpCode, ...u }) => ({
      ...u,
      ordersCount: u.orders.length,
      totalSpent: u.orders.reduce((sum, o) => sum + (o.status !== 'CANCELLED' ? o.total : 0), 0),
    }));

    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/users/:id
export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: paramStr(req) },
      include: {
        orders: { take: 10, orderBy: { createdAt: 'desc' }, include: { items: true, payments: true } },
        preferences: true,
      },
    });
    if (!user) throw new NotFoundError('User');
    const { passwordHash, refreshTokens, googleId, otpCode, ...safe } = user;
    res.json({ status: 'success', data: safe });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/users/:id
export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetUserId = paramStr(req);
    const { role, emailVerified, firstName, lastName, phone, isRestricted } = req.body as {
      role?: UserRole;
      emailVerified?: boolean;
      firstName?: string;
      lastName?: string;
      phone?: string;
      isRestricted?: boolean;
    };

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundError('User');
    }

    // Role privilege & hierarchy protection:
    if (role !== undefined && role !== targetUser.role) {
      // 1. Only SUPERADMIN can modify/assign roles
      if (req.user?.role !== 'SUPERADMIN') {
        throw new ForbiddenError('Only Super Admin has authority to assign or change user roles');
      }

      // 2. Protect oxytriumdynamics@gmail.com from being demoted or modified
      if (targetUser.email === 'oxytriumdynamics@gmail.com' && role !== 'SUPERADMIN') {
        throw new ForbiddenError('The master Super Admin account cannot be demoted');
      }
    }

    // User restriction protection:
    if (isRestricted !== undefined && isRestricted !== targetUser.isRestricted) {
      if (req.user?.role !== 'SUPERADMIN') {
        throw new ForbiddenError('Only Super Admin has authority to restrict or unrestrict users');
      }
      if (targetUser.email === 'oxytriumdynamics@gmail.com' && isRestricted) {
        throw new ForbiddenError('The master Super Admin account cannot be restricted');
      }
    }

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(role !== undefined ? { role } : {}),
        ...(emailVerified !== undefined ? { emailVerified } : {}),
        ...(isRestricted !== undefined ? { isRestricted } : {}),
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        phone: phone ?? undefined,
      },
    });
    const { passwordHash, refreshTokens, googleId, otpCode, ...safe } = user;
    res.json({ status: 'success', data: safe });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/admins
export async function getAdminsList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPERADMIN'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        isRestricted: true,
        createdAt: true,
        lastLoginAt: true,
        phone: true,
      },
    });
    res.json({ status: 'success', data: admins });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/users/:id/restrict
export async function restrictUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetUserId = paramStr(req);
    const { isRestricted } = req.body as { isRestricted?: boolean };

    if (req.user?.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only Super Admin has authority to restrict or unrestrict users');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundError('User');
    }

    if (targetUser.email === 'oxytriumdynamics@gmail.com') {
      throw new ForbiddenError('The master Super Admin account cannot be restricted');
    }

    const newRestrictedState = isRestricted !== undefined ? Boolean(isRestricted) : !targetUser.isRestricted;

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: { isRestricted: newRestrictedState },
    });

    logger.info(`[ADMIN RESTRICTION] User ${user.email} restricted status set to ${newRestrictedState} by ${req.user?.email}`);

    const { passwordHash, refreshTokens, googleId, otpCode, ...safe } = user;
    res.json({
      status: 'success',
      message: newRestrictedState ? `User ${user.email} has been restricted` : `User ${user.email} restriction removed`,
      data: safe,
    });
  } catch (err) {
    next(err);
  }
}

// ─── PRODUCT CRUD ──────────────────────────────────────

// GET /api/v1/admin/products
export async function getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = qStr(req, 'search');
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
            { flavor: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        variants: { orderBy: { price: 'asc' } },
        images: { orderBy: { sortOrder: 'asc' } },
        category: true,
      },
    });

    res.json({ status: 'success', data: products });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/products/:id
export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const idOrSlug = paramStr(req);
    const isNumeric = /^\d+$/.test(idOrSlug);
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: idOrSlug.toLowerCase() },
          ...(isNumeric ? [{ id: BigInt(idOrSlug) }] : []),
        ],
      },
      include: {
        variants: { orderBy: { price: 'asc' } },
        images: { orderBy: { sortOrder: 'asc' } },
        category: true,
      },
    });
    if (!product) throw new NotFoundError('Product');
    res.json({ status: 'success', data: product });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/products
export async function createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      name,
      slug,
      displayTitle,
      flavor,
      tagline,
      description,
      story,
      volume,
      sugar,
      caffeine,
      calories,
      canImage,
      image,
      renderImage,
      bgGradient,
      primaryTone,
      accentHex,
      categoryId,
      variants,
      notes,
    } = req.body;

    if (!name || !description) {
      throw new ValidationError('Product name and description are required');
    }

    const cleanSlug = (slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).toLowerCase();

    // Find or create default category
    let finalCatId = categoryId;
    if (!finalCatId) {
      const defaultCat = await prisma.category.findFirst();
      if (defaultCat) {
        finalCatId = defaultCat.id;
      } else {
        const newCat = await prisma.category.create({
          data: { name: 'Functional Beverages', slug: 'functional-beverages' },
        });
        finalCatId = newCat.id;
      }
    }

    // Generate unique Long ID
    const lastProduct = await prisma.product.findFirst({ orderBy: { id: 'desc' } });
    const newProductId = (lastProduct?.id ? BigInt(lastProduct.id) + 1n : 1n);

    const product = await prisma.product.create({
      data: {
        id: newProductId,
        name,
        slug: cleanSlug,
        displayTitle: displayTitle || name,
        flavor: flavor || name,
        tagline: tagline || 'Clean Functional Energy',
        description,
        story: story || null,
        volume: volume || '250ml',
        sugar: sugar || '0g',
        caffeine: caffeine || '120mg',
        calories: calories || '10 kcal',
        canImage: canImage ? String(canImage).trim() : null,
        image: image ? String(image).trim() : (canImage ? String(canImage).trim() : null),
        renderImage: renderImage ? String(renderImage).trim() : null,
        bgGradient: bgGradient || 'from-neutral-900 to-black',
        primaryTone: primaryTone || '#d8ac52',
        accentHex: accentHex || '#d8ac52',
        categoryId: finalCatId,
        notes: Array.isArray(notes) ? notes : ['Natural Caffeine', 'Zero Sugar', 'Electrolytes'],
        ingredients: req.body.ingredients || null,
        netQuantity: req.body.netQuantity || '250 ml',
        isVegetarian: req.body.isVegetarian !== undefined ? Boolean(req.body.isVegetarian) : true,
        nutritionInfo: req.body.nutritionInfo || null,
        additionalInfo: req.body.additionalInfo || null,
        isActive: true,
      },
    });

    // Create variants if provided
    const lastVariant = await prisma.productVariant.findFirst({ orderBy: { id: 'desc' } });
    let nextVarId = (lastVariant?.id ? BigInt(lastVariant.id) + 1n : 100n);

    if (Array.isArray(variants) && variants.length > 0) {
      for (const v of variants) {
        await prisma.productVariant.create({
          data: {
            id: nextVarId++,
            productId: product.id,
            sku: v.sku || `RBL-${cleanSlug.toUpperCase()}-${v.packSize || v.sizeMl || 12}`,
            name: v.name || `${product.name} · ${v.packSize || 12}-Pack`,
            sizeMl: v.sizeMl || 250,
            price: Number(v.price) || 499,
            compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
            stockQty: Number(v.stockQty) || 100,
            isDefault: Boolean(v.isDefault),
            isActive: true,
          },
        });
      }
    } else {
      // Create default 12-pack variant
      await prisma.productVariant.create({
        data: {
          id: nextVarId++,
          productId: product.id,
          sku: `RBL-${cleanSlug.toUpperCase()}-12PK`,
          name: `${product.name} · 12-Pack Case`,
          sizeMl: 250,
          price: 1440,
          compareAtPrice: 1800,
          stockQty: 250,
          isDefault: true,
          isActive: true,
        },
      });
    }

    const fullProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: { variants: true, images: true, category: true },
    });

    productsCache.clear();
    res.status(201).json({ status: 'success', data: fullProduct });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/products/:id
export async function updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const idOrSlug = paramStr(req);
    const isNumeric = /^\d+$/.test(idOrSlug);
    const existingProduct = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: idOrSlug.toLowerCase() },
          ...(isNumeric ? [{ id: BigInt(idOrSlug) }] : []),
        ],
      },
    });
    if (!existingProduct) throw new NotFoundError('Product');
    const targetId = existingProduct.id;

    const { variants, ...productData } = req.body;

    // Clean boolean fields
    if (productData.isVegetarian !== undefined) {
      productData.isVegetarian = Boolean(productData.isVegetarian);
    }
    if (productData.isActive !== undefined) {
      productData.isActive = Boolean(productData.isActive);
    }
    if (productData.isFeatured !== undefined) {
      productData.isFeatured = Boolean(productData.isFeatured);
    }

    // Clean image fields (allow explicit clearing to null)
    if (productData.canImage !== undefined) {
      productData.canImage = productData.canImage && String(productData.canImage).trim() ? String(productData.canImage).trim() : null;
    }
    if (productData.image !== undefined) {
      productData.image = productData.image && String(productData.image).trim() ? String(productData.image).trim() : null;
    }
    if (productData.renderImage !== undefined) {
      productData.renderImage = productData.renderImage && String(productData.renderImage).trim() ? String(productData.renderImage).trim() : null;
    }

    const updated = await prisma.product.update({
      where: { id: targetId },
      data: productData,
    });

    // Automatically synchronize Trio ('variety') product nutrition in DB when Apex, Aviva, or Capella is updated
    const updatedSlug = (updated.slug || '').toLowerCase();
    if (['apex', 'aviva', 'capella'].includes(updatedSlug) && updated.nutritionInfo) {
      try {
        const varietyProduct = await prisma.product.findUnique({
          where: { slug: 'variety' },
        });
        if (varietyProduct) {
          const currentVarietyInfo = (varietyProduct.nutritionInfo as any) || {};
          const currentTrioNutrients = currentVarietyInfo.trioNutrients || {};
          currentTrioNutrients[updatedSlug] = updated.nutritionInfo;

          await prisma.product.update({
            where: { slug: 'variety' },
            data: {
              nutritionInfo: {
                ...currentVarietyInfo,
                trioNutrients: currentTrioNutrients,
              },
              nutrition: {
                ...((varietyProduct.nutrition as any) || {}),
                trioNutrients: currentTrioNutrients,
              },
            },
          });
          logger.info(`[Admin] Synchronized Trio ('variety') product nutrition with updated '${updatedSlug}' in database`);
        }
      } catch (syncErr) {
        logger.error(`[Admin] Failed to sync Trio product nutrition for '${updatedSlug}':`, syncErr);
      }
    }

    // If variants / packs were updated or created
    if (Array.isArray(variants)) {
      const lastVar = await prisma.productVariant.findFirst({ orderBy: { id: 'desc' } });
      let nextVarId = (lastVar?.id ? BigInt(lastVar.id) + 1n : 100n);

      for (const v of variants) {
        if (v.id && /^\d+$/.test(String(v.id))) {
          await prisma.productVariant.update({
            where: { id: BigInt(v.id) },
            data: {
              sku: v.sku ?? undefined,
              price: v.price !== undefined ? Number(v.price) : undefined,
              compareAtPrice: v.compareAtPrice !== undefined ? (v.compareAtPrice ? Number(v.compareAtPrice) : null) : undefined,
              stockQty: v.stockQty !== undefined ? Number(v.stockQty) : undefined,
              name: v.name ?? undefined,
              sizeMl: v.sizeMl !== undefined ? Number(v.sizeMl) : undefined,
              isActive: v.isActive !== undefined ? Boolean(v.isActive) : undefined,
              isDefault: v.isDefault !== undefined ? Boolean(v.isDefault) : undefined,
            },
          });
        } else {
          // CREATE NEW PACK VARIANT
          const cleanSku = v.sku || `RBL-${(updated.slug || 'VAR').toUpperCase()}-${Date.now().toString().slice(-4)}`;
          await prisma.productVariant.create({
            data: {
              id: nextVarId++,
              productId: targetId,
              sku: cleanSku,
              name: v.name || `${updated.name} · Pack`,
              sizeMl: v.sizeMl ? Number(v.sizeMl) : 250,
              price: Number(v.price) || 499,
              compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
              stockQty: Number(v.stockQty) || 100,
              isDefault: Boolean(v.isDefault),
              isActive: v.isActive !== undefined ? Boolean(v.isActive) : true,
            },
          });
        }
      }
    }

    const fullProduct = await prisma.product.findUnique({
      where: { id: targetId },
      include: { variants: true, images: true, category: true },
    });

    productsCache.clear();
    res.json({ status: 'success', data: fullProduct });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/products/:id
export async function deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const idOrSlug = paramStr(req);
    const isNumeric = /^\d+$/.test(idOrSlug);
    const existingProduct = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: idOrSlug.toLowerCase() },
          ...(isNumeric ? [{ id: BigInt(idOrSlug) }] : []),
        ],
      },
    });
    if (!existingProduct) throw new NotFoundError('Product');
    await prisma.product.update({
      where: { id: existingProduct.id },
      data: { isActive: false },
    });
    productsCache.clear();
    res.json({ status: 'success', message: 'Product archived / deactivated successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/admin/upload-image
 * Handles admin product image uploads to Cloudinary via multipart file or base64 data URI
 */
export async function uploadProductImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let source: Buffer | string | undefined;

    if (req.file?.buffer) {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
      if (!allowedMimes.includes(req.file.mimetype)) {
        throw new ValidationError('Invalid image format. Only JPEG, PNG, WEBP, and AVIF are supported.');
      }
      source = req.file.buffer;
    } else if (req.body?.image || req.body?.file || req.body?.dataUrl) {
      const rawStr = (req.body.image || req.body.file || req.body.dataUrl) as string;
      if (typeof rawStr !== 'string') {
        throw new ValidationError('Invalid image data format');
      }
      if (rawStr.startsWith('data:')) {
        const isValidDataUri = /^data:image\/(jpeg|png|webp|avif);base64,/i.test(rawStr);
        if (!isValidDataUri) {
          throw new ValidationError('Invalid base64 image data URI. Only JPEG, PNG, WEBP, and AVIF supported.');
        }
      }
      source = rawStr;
    }

    if (!source) {
      throw new ValidationError('No image file or base64 data provided for upload');
    }

    const rawFolder = (req.body?.folder as string) || 'rebelive/products';
    const cleanSubfolder = String(rawFolder)
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .replace(/^rebelive/, '');
    const folder = `rebelive/${cleanSubfolder || 'products'}`;

    const uploadResult = await uploadToCloudinary(source, { folder });

    res.status(200).json({
      status: 'success',
      data: {
        url: uploadResult.secure_url || uploadResult.url,
        secure_url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── ORDER MANAGEMENT & SHIPROCKET ─────────────────────

// GET /api/v1/admin/orders
export async function getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const status = qStr(req, 'status');
    const search = qStr(req, 'search');

    const where: any = {
      ...(status && status !== 'ALL' && { status: status as OrderStatus }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { trackingNumber: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true, lastName: true, phone: true } },
          items: { include: { product: true } },
          payments: true,
          statusHistory: { orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/orders/:id
export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, firstName: true, lastName: true, phone: true } },
        items: { include: { product: true } },
        payments: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundError('Order');
    res.json({ status: 'success', data: order });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/orders/:id/status
export async function updateOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, note, trackingNumber, trackingUrl } = req.body as {
      status: OrderStatus;
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
        statusHistory: {
          create: {
            status,
            note: note || `Order status updated to ${status} by admin`,
          },
        },
      },
      include: {
        user: true,
        items: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    res.json({ status: 'success', data: order });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/orders/:id/dispatch-shiprocket
// Connects Order directly to Shiprocket: creates adhoc order, generates AWB, marks SHIPPED
export async function dispatchOrderToShiprocket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: true,
        items: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const paymentMethod = order.payments?.[0]?.method === 'COD' ? 'COD' : 'Prepaid';
    const parsedAddr = buildShiprocketAddress(order.shippingAddress || {}, order.user || {});

    const shiprocketResult = await shiprocketService.createAdhocOrder({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customer: {
        firstName: parsedAddr.billing_customer_name,
        lastName: parsedAddr.billing_last_name,
        email: parsedAddr.billing_email,
        phone: parsedAddr.billing_phone,
      },
      address: {
        line1: parsedAddr.billing_address,
        line2: parsedAddr.billing_address_2,
        city: parsedAddr.billing_city,
        state: parsedAddr.billing_state,
        postalCode: parsedAddr.billing_pincode,
        country: parsedAddr.billing_country,
      },
      items: order.items && order.items.length > 0
        ? order.items.map((i) => ({
            name: `${i.productName || 'REBELIVE'} - ${i.variantName || 'Bio-Energy'}`,
            sku: i.sku || 'RBL-APEX',
            units: i.quantity || 1,
            selling_price: i.unitPrice || 499,
          }))
        : [{
            name: 'REBELIVE Clean Bio-Energy Cans',
            sku: 'RBL-APEX-6PK',
            units: 1,
            selling_price: order.total || 499,
          }],
      paymentMethod,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingAmount: order.shippingAmount,
      total: order.total,
    });

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'SHIPPED',
        shiprocketOrderId: shiprocketResult.shiprocketOrderId,
        shiprocketShipmentId: shiprocketResult.shiprocketShipmentId,
        trackingNumber: shiprocketResult.awbCode,
        trackingUrl: `/track-order?id=${order.orderNumber}`,
        statusHistory: {
          create: {
            status: 'SHIPPED',
            note: `Posted to Shiprocket (${shiprocketResult.courierName || 'Shiprocket Express'}). AWB: ${
              shiprocketResult.awbCode
            }`,
          },
        },
      },
      include: {
        user: true,
        items: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    res.json({
      status: 'success',
      message: shiprocketResult.isLive
        ? `Consignment created in live Shiprocket dashboard! AWB: ${shiprocketResult.awbCode}`
        : `Order posted to Shiprocket dispatch queue! AWB: ${shiprocketResult.awbCode}`,
      data: {
        order: updatedOrder,
        awbCode: shiprocketResult.awbCode,
        courierName: shiprocketResult.courierName,
        shiprocketOrderId: shiprocketResult.shiprocketOrderId,
        isLive: shiprocketResult.isLive,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/orders/sync-shiprocket
// Pushes all active unsynced orders directly to Shiprocket
export async function syncAllOrdersToShiprocket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'DELIVERED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        items: true,
        payments: true,
      },
      take: 25,
    });

    let syncedCount = 0;
    const results: Array<{ orderNumber: string; awb: string | null; isLive: boolean }> = [];

    for (const order of orders) {
      try {
        const paymentMethod = order.payments?.[0]?.method === 'COD' ? 'COD' : 'Prepaid';
        const parsedAddr = buildShiprocketAddress(order.shippingAddress || {}, order.user || {});

        const shiprocketResult = await shiprocketService.createAdhocOrder({
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          customer: {
            firstName: parsedAddr.billing_customer_name,
            lastName: parsedAddr.billing_last_name,
            email: parsedAddr.billing_email,
            phone: parsedAddr.billing_phone,
          },
          address: {
            line1: parsedAddr.billing_address,
            line2: parsedAddr.billing_address_2,
            city: parsedAddr.billing_city,
            state: parsedAddr.billing_state,
            postalCode: parsedAddr.billing_pincode,
            country: parsedAddr.billing_country,
          },
          items: order.items && order.items.length > 0
            ? order.items.map((i) => ({
                name: `${i.productName || 'REBELIVE'} - ${i.variantName || 'Bio-Energy'}`,
                sku: i.sku || 'RBL-APEX',
                units: i.quantity || 1,
                selling_price: i.unitPrice || 499,
              }))
            : [{
                name: 'REBELIVE Clean Bio-Energy Cans',
                sku: 'RBL-APEX-6PK',
                units: 1,
                selling_price: order.total || 499,
              }],
          paymentMethod,
          subtotal: order.subtotal,
          discountAmount: order.discountAmount,
          shippingAmount: order.shippingAmount,
          total: order.total,
        });

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: order.status === 'PENDING' ? 'PROCESSING' : order.status,
            shiprocketOrderId: shiprocketResult.shiprocketOrderId,
            shiprocketShipmentId: shiprocketResult.shiprocketShipmentId,
            trackingNumber: shiprocketResult.awbCode,
            trackingUrl: `/track-order?id=${order.orderNumber}`,
          },
        });

        syncedCount++;
        results.push({
          orderNumber: order.orderNumber,
          awb: shiprocketResult.awbCode,
          isLive: shiprocketResult.isLive,
        });
      } catch (orderErr) {
        console.warn(`Error syncing order ${order.orderNumber} to Shiprocket:`, orderErr);
      }
    }

    res.json({
      status: 'success',
      message: `Successfully processed ${syncedCount} orders to Shiprocket`,
      data: {
        syncedCount,
        totalChecked: orders.length,
        results,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/orders/:id/track-shiprocket
export async function trackOrderShiprocket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) throw new NotFoundError('Order not found');

    const tracking = await shiprocketService.trackShipment(
      order.trackingNumber || order.orderNumber,
      {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        status: order.status,
        address: order.shippingAddress as any,
        trackingNumber: order.trackingNumber,
        statusHistory: order.statusHistory,
      }
    );

    res.json({ status: 'success', data: tracking });
  } catch (err) {
    next(err);
  }
}

// ─── INVENTORY & STOCK ─────────────────────────────────

// PATCH /api/v1/admin/inventory/:variantId
export async function updateStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { changeQty, reason, note } = req.body as { changeQty: number; reason: string; note?: string };
    const varIdStr = paramStr(req, 'variantId');
    const varId = /^\d+$/.test(varIdStr) ? BigInt(varIdStr) : null;
    if (!varId) throw new NotFoundError('Product variant');
    const variant = await prisma.productVariant.findUnique({ where: { id: varId } });
    if (!variant) throw new NotFoundError('Product variant');

    const [updatedVariant] = await prisma.$transaction([
      prisma.productVariant.update({
        where: { id: variant.id },
        data: { stockQty: { increment: changeQty } },
      }),
      prisma.inventoryLog.create({
        data: {
          productId: variant.productId,
          variantId: variant.id,
          changeQty,
          reason,
          note,
        },
      }),
    ]);

    productsCache.clear();
    res.json({ status: 'success', data: updatedVariant });
  } catch (err) {
    next(err);
  }
}

// ─── TICKETS, COUPONS, NEWSLETTER, AUDIT ───────────────

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
        where,
        skip,
        take,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
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
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/coupons
export async function getCoupons(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ status: 'success', data: coupons });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/coupons
export async function createCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as Parameters<typeof prisma.coupon.create>[0]['data'];
    const coupon = await prisma.coupon.create({ data: { ...body, code: (body.code as string).toUpperCase() } });
    res.status(201).json({ status: 'success', data: coupon });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/coupons/:id
export async function updateCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const coupon = await prisma.coupon.update({
      where: { id: paramStr(req) },
      data: req.body as Parameters<typeof prisma.coupon.update>[0]['data'],
    });
    res.json({ status: 'success', data: coupon });
  } catch (err) {
    next(err);
  }
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
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/audit-logs
export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      prisma.auditLog.count(),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/categories
export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = await prisma.category.create({ data: req.body as Parameters<typeof prisma.category.create>[0]['data'] });
    res.status(201).json({ status: 'success', data: category });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/personality-types
export async function createPersonalityType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const type = await prisma.personalityType.create({
      data: req.body as Parameters<typeof prisma.personalityType.create>[0]['data'],
    });
    res.status(201).json({ status: 'success', data: type });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/quiz/questions
export async function createQuizQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { question, sortOrder, answers } = req.body as {
      question: string;
      sortOrder?: number;
      answers?: Array<{ answerText: string; personalityTypeId: string; weight?: number }>;
    };
    const q = await prisma.quizQuestion.create({
      data: {
        question,
        sortOrder: sortOrder ?? 0,
        answers: { create: answers ?? [] },
      },
      include: { answers: true },
    });
    res.status(201).json({ status: 'success', data: q });
  } catch (err) {
    next(err);
  }
}

// ─── TESTIMONIALS MANAGEMENT ───────────────────────────

const DEFAULT_TESTIMONIALS = [
  {
    name: 'NISHANT MISHRA',
    role: 'Software Architect & Biohacker',
    quote: 'Clean sustained mental clarity through long coding sessions without any crash or anxiety. Rebelive is literally in a class of its own.',
    rating: 5,
    image: '',
    imagePosition: 'center 15%',
    isFeatured: true,
    sortOrder: 1,
  },
  {
    name: 'ASHRAY VASU',
    role: 'Product Designer',
    quote: 'The calm focus and zero-sugar formulation completely upgraded my workday routine. No jitters, pure natural flow state.',
    rating: 5,
    image: '',
    imagePosition: 'center 15%',
    isFeatured: true,
    sortOrder: 2,
  },
  {
    name: 'VAIBHAV MITTAL',
    role: 'Founder & Endurance Athlete',
    quote: 'Unmatched sustained energy that keeps me dialed in and sharp throughout the day. Zero sugar crash, just pure cognitive momentum.',
    rating: 5,
    image: '',
    imagePosition: 'center 18%',
    isFeatured: true,
    sortOrder: 3,
  },
  {
    name: 'DHIRENDRA SINGH KAUSHIK',
    role: 'Creative Director',
    quote: 'Game-changing endurance and crisp mental sharpness. Zero jitters, no crash, just pure sustained high performance all day long.',
    rating: 5,
    image: '',
    imagePosition: 'center 20%',
    isFeatured: true,
    sortOrder: 4,
  },
];

// GET /api/v1/admin/testimonials
export async function getTestimonials(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await prisma.testimonial.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    res.json({ status: 'success', data: list });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/testimonials/:id
export async function getTestimonial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    const item = await prisma.testimonial.findUnique({ where: { id } });
    if (!item) throw new NotFoundError('Testimonial');
    res.json({ status: 'success', data: item });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/testimonials
export async function createTestimonial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, role, quote, rating, image, imagePosition, isFeatured, sortOrder } = req.body;
    if (!name || !quote) {
      throw new ValidationError('Name and quote are required');
    }

    const created = await prisma.testimonial.create({
      data: {
        name: name.trim(),
        role: role ? role.trim() : null,
        quote: quote.trim(),
        rating: Number(rating) || 5,
        image: image ? String(image).trim() : '',
        imagePosition: imagePosition || 'center 15%',
        isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : true,
        sortOrder: Number(sortOrder) || 0,
      },
    });

    res.status(201).json({ status: 'success', data: created });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/testimonials/:id
export async function updateTestimonial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    const { name, role, quote, rating, image, imagePosition, isFeatured, sortOrder } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name.trim();
    if (role !== undefined) data.role = role ? role.trim() : null;
    if (quote !== undefined) data.quote = quote.trim();
    if (rating !== undefined) data.rating = Number(rating);
    if (image !== undefined) data.image = image ? String(image).trim() : '';
    if (imagePosition !== undefined) data.imagePosition = imagePosition;
    if (isFeatured !== undefined) data.isFeatured = Boolean(isFeatured);
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);

    const updated = await prisma.testimonial.update({
      where: { id },
      data,
    });

    res.json({ status: 'success', data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/testimonials/:id
export async function deleteTestimonial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    await prisma.testimonial.delete({ where: { id } });
    res.json({ status: 'success', message: 'Testimonial deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── CONTACT QUERIES (USER QUERIES) ───────────────────

// GET /api/v1/admin/contact-queries
export async function getContactQueries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = qStr(req, 'status');
    const search = qStr(req, 'search');

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }

    const items = await prisma.contactQuery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const counts = {
      total: await prisma.contactQuery.count(),
      new: await prisma.contactQuery.count({ where: { status: 'NEW' } }),
      viewed: await prisma.contactQuery.count({ where: { status: 'VIEWED' } }),
      in_process: await prisma.contactQuery.count({ where: { status: 'IN_PROCESS' } }),
      resolved: await prisma.contactQuery.count({ where: { status: 'RESOLVED' } }),
      ignored: await prisma.contactQuery.count({ where: { status: 'IGNORED' } }),
    };

    res.json({ status: 'success', data: items, counts });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/contact-queries/:id/status
export async function updateContactQueryStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    const { status, adminNote } = req.body;

    const data: any = {};
    if (status) data.status = String(status).toUpperCase();
    if (adminNote !== undefined) data.adminNote = adminNote ? String(adminNote).trim() : null;

    const updated = await prisma.contactQuery.update({
      where: { id },
      data,
    });

    res.json({ status: 'success', data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/contact-queries/:id
export async function deleteContactQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    await prisma.contactQuery.delete({ where: { id } });
    res.json({ status: 'success', message: 'Contact query deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── CORPORATE QUERIES ────────────────────────────────

// GET /api/v1/admin/corporate-queries
export async function getCorporateQueries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = qStr(req, 'status');
    const search = qStr(req, 'search');

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { refId: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const items = await prisma.corporateQuery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const counts = {
      total: await prisma.corporateQuery.count(),
      new: await prisma.corporateQuery.count({ where: { status: 'NEW' } }),
      viewed: await prisma.corporateQuery.count({ where: { status: 'VIEWED' } }),
      in_process: await prisma.corporateQuery.count({ where: { status: 'IN_PROCESS' } }),
      resolved: await prisma.corporateQuery.count({ where: { status: 'RESOLVED' } }),
      ignored: await prisma.corporateQuery.count({ where: { status: 'IGNORED' } }),
    };

    res.json({ status: 'success', data: items, counts });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/corporate-queries/:id/status
export async function updateCorporateQueryStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    const { status, adminNote } = req.body;

    const data: any = {};
    if (status) data.status = String(status).toUpperCase();
    if (adminNote !== undefined) data.adminNote = adminNote ? String(adminNote).trim() : null;

    const updated = await prisma.corporateQuery.update({
      where: { id },
      data,
    });

    res.json({ status: 'success', data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/corporate-queries/:id
export async function deleteCorporateQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramStr(req);
    await prisma.corporateQuery.delete({ where: { id } });
    res.json({ status: 'success', message: 'Corporate query deleted successfully' });
  } catch (err) {
    next(err);
  }
}

