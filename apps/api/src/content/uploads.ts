import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { recordAudit } from '@smc/db';
import express, { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { requireRole } from '../middleware/access';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Recognise images by their first bytes (never trust the declared type). SVG is not accepted. */
export function imageType(buf: Buffer): 'jpg' | 'png' | 'webp' | 'gif' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  return null;
}

/** Staff upload images (photos, posters); files are served back at /uploads/<name>. */
export function adminUploadsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireRole(ctx, 'ADMIN', 'ORGANIZER'));
  router.post('/', express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, 'empty_upload');
    const ext = imageType(body);
    if (!ext) throw new HttpError(415, 'unsupported_image');
    const dir = resolve(ctx.config.uploadDir);
    await mkdir(dir, { recursive: true });
    const name = `${randomBytes(12).toString('hex')}.${ext}`;
    await writeFile(resolve(dir, name), body);
    await recordAudit(ctx.prisma, {
      runId: req.runId,
      actorType: req.auth!.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
      actorId: req.auth!.memberId,
      action: 'upload.created',
      entityType: 'upload',
      entityId: name,
      result: 'SUCCESS',
      metadata: { bytes: body.length },
    });
    res.status(201).json({ url: `/api/uploads/${name}` });
  });
  return router;
}

/** Public read access to uploaded images. */
export function uploadsStatic(ctx: AppContext) {
  return express.static(resolve(ctx.config.uploadDir), {
    index: false,
    dotfiles: 'deny',
    maxAge: '30d',
    immutable: true,
  });
}
