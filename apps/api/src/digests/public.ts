import { personalize } from '@smc/email';
import { Router } from 'express';
import { sendHtmlDocument } from '../admin/digests';
import type { AppContext } from '../context';
import { HttpError } from '../errors';

const PUBLIC = ['SENDING', 'SENT', 'PARTIALLY_FAILED'] as const;

/**
 * "View in browser": the issue as sent, with no recipient data — a generic greeting, and the
 * unsubscribe link replaced by the preferences page (it can't know who is reading).
 */
export function publicDigestRouter(ctx: AppContext): Router {
  const router = Router();
  router.get('/:weekKey/html', async (req, res) => {
    const digest = await ctx.prisma.weeklyDigest.findUnique({
      where: { weekKey: req.params.weekKey },
    });
    if (!digest || !PUBLIC.includes(digest.status as (typeof PUBLIC)[number]) || !digest.html) {
      throw new HttpError(404, 'digest_not_found');
    }
    const { html } = personalize(
      { html: digest.html, text: '' },
      { firstName: 'there', unsubscribeUrl: `${ctx.config.appBaseUrl}/me/profile` },
    );
    sendHtmlDocument(res, html);
  });
  return router;
}
