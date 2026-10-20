import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

/** An error whose `code` is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'HttpError';
  }
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'invalid_request',
        fields: [...new Set(err.issues.map((i) => i.path.join('.')))],
      });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    logger.error({ err, runId: req.runId, path: req.path }, 'unhandled request error');
    res.status(500).json({ error: 'internal_error' });
  };
}
