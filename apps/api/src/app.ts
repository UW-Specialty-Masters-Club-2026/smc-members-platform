import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { adminMembersRouter } from './admin/members';
import { authRouter } from './auth/routes';
import type { AppContext } from './context';
import { errorHandler } from './errors';
import { meRouter } from './members/routes';
import { loadSession, requireSameOrigin } from './middleware/access';
import { requestId } from './middleware/request-id';

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(requestId);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Browser-facing JSON API (reached through the web app's /api proxy, same origin).
  const browser = express.Router();
  browser.use(express.json({ limit: '100kb' }));
  browser.use(cookieParser());
  browser.use(requireSameOrigin(ctx.config.appBaseUrl));
  browser.use(loadSession(ctx));
  browser.use('/auth', authRouter(ctx));
  browser.use('/me', meRouter(ctx));
  browser.use('/admin/members', adminMembersRouter(ctx));
  app.use(browser);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  app.use(errorHandler(ctx.logger));

  return app;
}
