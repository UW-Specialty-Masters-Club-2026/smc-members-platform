import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { adminDigestsRouter } from './admin/digests';
import { adminEventsRouter } from './admin/events';
import { adminMembersRouter } from './admin/members';
import { staffCheckInRouter } from './attendance/routes';
import { authRouter } from './auth/routes';
import type { AppContext } from './context';
import { publicDigestRouter } from './digests/public';
import { errorHandler } from './errors';
import { eventsRouter, myRegistrationsRouter } from './events/routes';
import { meRouter } from './members/routes';
import { adminNewsRouter, newsRouter } from './news/routes';
import { loadSession, requireSameOrigin } from './middleware/access';
import { adminSurveyRouter, mySurveysRouter, surveysRouter } from './surveys/routes';
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
  browser.use('/me/registrations', myRegistrationsRouter(ctx));
  browser.use('/me/surveys', mySurveysRouter(ctx));
  browser.use('/me', meRouter(ctx));
  browser.use('/events', eventsRouter(ctx));
  browser.use('/news', newsRouter(ctx));
  browser.use('/admin/members', adminMembersRouter(ctx));
  browser.use('/admin/events/:id/survey', adminSurveyRouter(ctx));
  browser.use('/admin/events', adminEventsRouter(ctx));
  browser.use('/admin/news', adminNewsRouter(ctx));
  browser.use('/admin/digests', adminDigestsRouter(ctx));
  browser.use('/digest', publicDigestRouter(ctx));
  browser.use('/staff/checkin', staffCheckInRouter(ctx));
  browser.use('/surveys', surveysRouter(ctx));
  app.use(browser);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  app.use(errorHandler(ctx.logger));

  return app;
}
