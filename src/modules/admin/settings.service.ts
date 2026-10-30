import { prisma } from '../../config/database';
import { recordActivityLog } from './activityLog.service';
import { AuthUser } from '../../shared/types';
import { logger } from '../../shared/utils/logger';

export interface CheckoutSettingData {
  enabled: boolean;
  pauseMessage?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const CHECKOUT_SETTING_KEY = 'checkout_enabled';

// In-memory cache with TTL (10 seconds) to avoid database hammering during high checkout traffic
let cachedSetting: CheckoutSettingData | null = null;
let cacheExpiry = 0;

export async function getCheckoutSetting(): Promise<CheckoutSettingData> {
  const now = Date.now();
  if (cachedSetting && now < cacheExpiry) {
    return cachedSetting;
  }

  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: CHECKOUT_SETTING_KEY },
    });

    if (record) {
      try {
        const parsed = JSON.parse(record.value);
        cachedSetting = {
          enabled: Boolean(parsed.enabled),
          pauseMessage: parsed.pauseMessage || 'Instant checkout is temporarily paused for maintenance. Please check back shortly.',
          updatedAt: record.updatedAt.toISOString(),
          updatedBy: parsed.updatedBy || 'Admin',
        };
        cacheExpiry = now + 10_000;
        return cachedSetting;
      } catch (err) {
        logger.error('[Settings] Error parsing checkout setting JSON:', err);
      }
    }
  } catch (err) {
    logger.error('[Settings] Error fetching checkout setting:', err);
  }

  // Default fallback if not found in database: checkout is active (or enabled: false if previously paused)
  const fallback: CheckoutSettingData = {
    enabled: true,
    pauseMessage: 'Instant checkout is temporarily paused for maintenance. Please check back shortly.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'System',
  };
  cachedSetting = fallback;
  cacheExpiry = now + 10_000;
  return fallback;
}

export async function setCheckoutSetting(
  enabled: boolean,
  pauseMessage?: string,
  user?: AuthUser,
  req?: any
): Promise<CheckoutSettingData> {
  const previous = await getCheckoutSetting();
  const nextData = {
    enabled: Boolean(enabled),
    pauseMessage: pauseMessage?.trim() || 'Instant checkout is temporarily paused for maintenance. Please check back shortly.',
    updatedAt: new Date().toISOString(),
    updatedBy: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Admin',
  };

  await prisma.systemSetting.upsert({
    where: { key: CHECKOUT_SETTING_KEY },
    update: {
      value: JSON.stringify(nextData),
      description: 'Global 1-Click Fastrr and store checkout availability status',
    },
    create: {
      key: CHECKOUT_SETTING_KEY,
      value: JSON.stringify(nextData),
      description: 'Global 1-Click Fastrr and store checkout availability status',
    },
  });

  // Bust cache
  cachedSetting = nextData;
  cacheExpiry = Date.now() + 10_000;

  // Log to Audit Log
  await recordActivityLog({
    req,
    actor: user,
    action: enabled ? 'ENABLE_CHECKOUT' : 'DISABLE_CHECKOUT',
    entity: 'SystemSetting',
    entityId: CHECKOUT_SETTING_KEY,
    oldData: previous,
    newData: nextData,
    details: {
      action: enabled ? 'Store checkout turned ON' : 'Store checkout turned OFF',
      pauseMessage: nextData.pauseMessage,
    },
  });

  return nextData;
}

