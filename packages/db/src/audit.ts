import { redactForLog } from '@smc/core';
import type { AuditActorType, AuditResult, Prisma, PrismaClient } from './generated/prisma/client';

export interface AuditEntry {
  runId: string;
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  result: AuditResult;
  metadata?: Record<string, unknown>;
  /** When it happened (defaults to the database clock). */
  at?: Date;
}

type AuditWriter = Pick<PrismaClient, 'auditLog'> | Prisma.TransactionClient;

/** Append an audit entry. Email addresses in metadata are masked before storage. */
export async function recordAudit(db: AuditWriter, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      runId: entry.runId,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      result: entry.result,
      ...(entry.at && { createdAt: entry.at }),
      metadata: entry.metadata
        ? (redactForLog(entry.metadata) as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
