import { Request } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../shared/utils/logger';
import { AuthUser } from '../../shared/types';

export interface LogActivityParams {
  req?: Request;
  actor?: AuthUser | null;
  action: string;
  entity: string;
  entityId?: string | number | bigint | null;
  details?: Record<string, any> | null;
  oldData?: Record<string, any> | null;
  newData?: Record<string, any> | null;
}

/**
 * Records an immutable administrative activity log in MongoDB.
 * Non-blocking: executes safely in the background without halting response flow.
 */
export async function recordActivityLog(params: LogActivityParams): Promise<void> {
  try {
    const actor = params.actor ?? (params.req?.user as AuthUser | undefined);
    const req = params.req;

    const ipAddress =
      (req?.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req?.socket?.remoteAddress ||
      null;

    const userAgent = req?.headers['user-agent'] || null;

    const actorEmail = actor?.email || 'system';
    const actorName = actor ? `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email : 'System';
    const actorRole = actor?.role || 'SYSTEM';

    const entityId = params.entityId !== undefined && params.entityId !== null ? String(params.entityId) : null;

    await prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        actorEmail,
        actorName,
        actorRole,
        action: params.action,
        entity: params.entity,
        entityId,
        details: params.details as any,
        oldData: params.oldData as any,
        newData: params.newData as any,
        ipAddress,
        userAgent,
      },
    });

    logger.info(
      `[AUDIT LOG] ${actorEmail} [${actorRole}] -> ${params.action} on ${params.entity}${
        entityId ? ` (${entityId})` : ''
      }`
    );
  } catch (err) {
    logger.error('Failed to write activity audit log:', err);
  }
}
