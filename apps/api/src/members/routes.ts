import { recordAudit, type Member } from '@smc/db';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { requireAuth } from '../middleware/access';

const nameSchema = z.string().trim().min(1).max(100);
const updateMeBody = z
  .strictObject({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    newsOptIn: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'empty update' });

export function profileView(m: Member) {
  return {
    id: m.id,
    email: m.email,
    firstName: m.firstName,
    lastName: m.lastName,
    role: m.role,
    status: m.status,
    emailVerified: m.emailVerifiedAt !== null,
    newsOptIn: m.newsOptIn,
    newsOptInUpdatedAt: m.newsOptInUpdatedAt,
    emailSuppressedReason: m.emailSuppressedReason,
  };
}

/** My profile: read it, rename, and switch news & invitations on or off at any time. */
export function meRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const member = await ctx.prisma.member.findUnique({ where: { id: req.auth!.memberId } });
    if (!member) throw new HttpError(401, 'unauthenticated');
    res.json(profileView(member));
  });

  router.patch('/', async (req, res) => {
    const body = updateMeBody.parse(req.body);
    const memberId = req.auth!.memberId;
    const now = ctx.now();

    const updated = await ctx.prisma.$transaction(async (tx) => {
      const before = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
      const optInChanged = body.newsOptIn !== undefined && body.newsOptIn !== before.newsOptIn;
      const after = await tx.member.update({
        where: { id: memberId },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          ...(optInChanged && {
            newsOptIn: body.newsOptIn,
            newsOptInUpdatedAt: now,
            // An explicit opt-in from the member clears an earlier automatic suppression.
            ...(body.newsOptIn && { emailSuppressedReason: null }),
          }),
        },
      });
      if (optInChanged) {
        await recordAudit(tx, {
          runId: req.runId,
          actorType: 'MEMBER',
          actorId: memberId,
          action: 'member.news_opt_in.changed',
          entityType: 'member',
          entityId: memberId,
          result: 'SUCCESS',
          metadata: {
            from: before.newsOptIn,
            to: body.newsOptIn,
            source: 'profile',
            clearedSuppression: body.newsOptIn ? before.emailSuppressedReason : null,
          },
        });
      }
      return after;
    });

    res.json(profileView(updated));
  });

  return router;
}
