import { InvalidLocalTimeError, parsePtLocal } from '@smc/core';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { requireAuth, requireRole } from '../middleware/access';
import {
  saveSurvey,
  setSurveyStatus,
  staffSurveyView,
  submitResponse,
  surveyForMember,
  surveyResults,
  surveysForMember,
} from './service';

const question = z
  .strictObject({
    kind: z.enum(['RATING', 'TEXT', 'SINGLE_CHOICE']),
    prompt: z.string().trim().min(3).max(300),
    required: z.boolean().default(true),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(10).nullable().default(null),
  })
  .refine((q) => (q.kind === 'SINGLE_CHOICE') === (q.options !== null), {
    message: 'options are required for single-choice questions only',
    path: ['options'],
  })
  .refine((q) => !q.options || new Set(q.options).size === q.options.length, {
    message: 'options must be unique',
    path: ['options'],
  });

const surveyBody = z.strictObject({
  title: z.string().trim().min(3).max(160),
  intro: z.string().trim().max(1000).nullable().default(null),
  audience: z.enum(['ATTENDEES', 'REGISTRANTS']).default('ATTENDEES'),
  closesAtPt: z
    .string()
    .nullable()
    .default(null)
    .transform((v, issueCtx) => {
      if (v === null) return null;
      try {
        return parsePtLocal(v);
      } catch (err) {
        issueCtx.addIssue({
          code: 'custom',
          message: err instanceof InvalidLocalTimeError ? err.message : 'invalid time',
        });
        return z.NEVER;
      }
    }),
  questions: z.array(question).min(1).max(20),
});

const responseBody = z.strictObject({
  answers: z
    .array(
      z.strictObject({
        questionId: z.string().min(1).max(40),
        rating: z.number().int().optional(),
        text: z.string().max(2000).optional(),
        choice: z.string().max(200).optional(),
      }),
    )
    .max(20),
});

/** Survey builder, release/close and anonymous results for admins and organizers. */
export function adminSurveyRouter(ctx: AppContext): Router {
  const router = Router({ mergeParams: true });
  router.use(requireRole(ctx, 'ADMIN', 'ORGANIZER'));
  const staff = (req: Express.Request) => ({ memberId: req.auth!.memberId, role: req.auth!.role });
  const eventId = (req: Express.Request & { params: Record<string, string> }) =>
    String(req.params.id);

  router.get('/', async (req, res) => {
    const survey = await staffSurveyView(ctx, eventId(req));
    if (!survey) throw new HttpError(404, 'survey_not_found');
    res.json(survey);
  });

  router.put('/', async (req, res) => {
    const body = surveyBody.parse(req.body);
    await saveSurvey(ctx, req.runId, staff(req), eventId(req), {
      title: body.title,
      intro: body.intro,
      audience: body.audience,
      closesAt: body.closesAtPt,
      questions: body.questions,
    });
    res.json(await staffSurveyView(ctx, eventId(req)));
  });

  for (const action of ['open', 'close'] as const) {
    router.post(`/${action}`, async (req, res) => {
      await setSurveyStatus(ctx, req.runId, staff(req), eventId(req), action);
      res.json(await staffSurveyView(ctx, eventId(req)));
    });
  }

  router.get('/results', async (req, res) => {
    res.json(await surveyResults(ctx, eventId(req)));
  });

  return router;
}

export function surveysRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/:id', async (req, res) => {
    res.json(await surveyForMember(ctx, String(req.params.id), req.auth!.memberId));
  });

  router.post('/:id/responses', async (req, res) => {
    const { answers } = responseBody.parse(req.body);
    await submitResponse(ctx, req.runId, String(req.params.id), req.auth!.memberId, answers);
    res.status(201).json({ status: 'submitted' });
  });

  return router;
}

export function mySurveysRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);
  router.get('/', async (req, res) => {
    res.json({ surveys: await surveysForMember(ctx, req.auth!.memberId) });
  });
  return router;
}
