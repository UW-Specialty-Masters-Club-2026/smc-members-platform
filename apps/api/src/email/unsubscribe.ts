import { verifyToken } from '@smc/core';
import { suppressMember } from '@smc/digest';
import express, { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';

async function unsubscribe(
  ctx: AppContext,
  runId: string,
  token: string,
  source: 'unsubscribe_link' | 'one_click',
) {
  const check = verifyToken(ctx.config.linkSigningSecret, 'unsubscribe', token, ctx.now());
  if (!check.ok) throw new HttpError(400, 'invalid_or_expired_link');
  const outcome = await suppressMember(ctx.prisma, {
    memberId: check.subject,
    reason: 'UNSUBSCRIBED',
    source,
    runId,
    now: ctx.now(),
  });
  if (outcome === 'not_found') throw new HttpError(400, 'invalid_or_expired_link');
  return outcome;
}

/**
 * RFC 8058 one-click unsubscribe, POSTed by mail clients (Gmail, Apple Mail…) from the
 * List-Unsubscribe header. No login, no cookies, no redirect; the signed token is the proof.
 */
export function oneClickUnsubscribeRouter(ctx: AppContext): Router {
  const router = Router();
  router.post('/', express.urlencoded({ extended: false, limit: '2kb' }), async (req, res) => {
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    await unsubscribe(ctx, req.runId, token, 'one_click');
    res.type('text/plain').send('You have been unsubscribed from SMC news and invitations.');
  });
  // Link scanners issue GETs; unsubscribing must never happen on a GET.
  router.get('/', (_req, res) => {
    res.status(405).set('Allow', 'POST').type('text/plain').send('Use POST.');
  });
  return router;
}

const body = z.strictObject({ token: z.string().min(20).max(500) });

/** Confirmation page flow: the website POSTs the token from the link after the member clicks. */
export function unsubscribePageRouter(ctx: AppContext): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    const outcome = await unsubscribe(
      ctx,
      req.runId,
      body.parse(req.body).token,
      'unsubscribe_link',
    );
    res.json({ status: 'unsubscribed', alreadyUnsubscribed: outcome === 'already' });
  });
  return router;
}
