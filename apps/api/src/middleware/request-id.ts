import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const VALID_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Assign a run ID to every request (reusing a well-formed upstream X-Request-Id). */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.runId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.runId);
  next();
};
