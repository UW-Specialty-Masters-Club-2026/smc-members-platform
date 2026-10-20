import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { requireRole } from '../middleware/access';
import { checkInByCode, lookupCode } from './service';

const codeBody = z.strictObject({ code: z.string().min(10).max(500) });

/** Organizer scanner flow: the member's QR opens /checkin on the organizer's phone. */
export function staffCheckInRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireRole(ctx, 'ADMIN', 'ORGANIZER'));

  router.post('/lookup', async (req, res) => {
    res.json(await lookupCode(ctx, codeBody.parse(req.body).code));
  });

  router.post('/', async (req, res) => {
    const staff = { memberId: req.auth!.memberId, role: req.auth!.role };
    res.json(await checkInByCode(ctx, req.runId, staff, codeBody.parse(req.body).code));
  });

  return router;
}
