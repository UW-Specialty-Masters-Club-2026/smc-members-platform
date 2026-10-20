import { formatPtRange } from '@smc/core';
import {
  Prisma,
  recordAudit,
  type Survey,
  type SurveyAudience,
  type SurveyQuestion,
  type SurveyQuestionKind,
} from '@smc/db';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import type { Staff } from '../events/service';

type Db = AppContext['prisma'] | Prisma.TransactionClient;

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export interface QuestionInput {
  kind: SurveyQuestionKind;
  prompt: string;
  required: boolean;
  options: string[] | null;
}

export interface SurveyInput {
  title: string;
  intro: string | null;
  audience: SurveyAudience;
  closesAt: Date | null;
  questions: QuestionInput[];
}

function questionView(q: SurveyQuestion) {
  return {
    id: q.id,
    position: q.position,
    kind: q.kind,
    prompt: q.prompt,
    required: q.required,
    options: (q.options as string[] | null) ?? null,
  };
}

export function isOpen(survey: Survey, now: Date): boolean {
  return survey.status === 'OPEN' && (!survey.closesAt || survey.closesAt > now);
}

// ─── Staff ─────────────────────────────────────────────────────────

/** Create or replace the event's survey. Questions are frozen once the survey opens. */
export async function saveSurvey(
  ctx: AppContext,
  runId: string,
  staff: Staff,
  eventId: string,
  input: SurveyInput,
) {
  return ctx.prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new HttpError(404, 'event_not_found');
    const existing = await tx.survey.findUnique({ where: { eventId } });
    if (existing && existing.status !== 'DRAFT') throw new HttpError(409, 'survey_locked');

    const data = {
      title: input.title,
      intro: input.intro,
      audience: input.audience,
      closesAt: input.closesAt,
    };
    const survey = existing
      ? await tx.survey.update({ where: { id: existing.id }, data })
      : await tx.survey.create({ data: { ...data, eventId } });
    await tx.surveyQuestion.deleteMany({ where: { surveyId: survey.id } });
    await tx.surveyQuestion.createMany({
      data: input.questions.map((q, i) => ({
        surveyId: survey.id,
        position: i + 1,
        kind: q.kind,
        prompt: q.prompt,
        required: q.required,
        options: q.kind === 'SINGLE_CHOICE' ? (q.options ?? []) : Prisma.DbNull,
      })),
    });
    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: existing ? 'survey.updated' : 'survey.created',
      entityType: 'survey',
      entityId: survey.id,
      result: 'SUCCESS',
      metadata: { eventId, questions: input.questions.length, role: staff.role },
    });
    return survey.id;
  });
}

export async function staffSurveyView(ctx: AppContext, eventId: string) {
  const survey = await ctx.prisma.survey.findUnique({
    where: { eventId },
    include: {
      questions: { orderBy: { position: 'asc' } },
      _count: { select: { responses: true } },
    },
  });
  if (!survey) return null;
  return {
    id: survey.id,
    title: survey.title,
    intro: survey.intro,
    audience: survey.audience,
    status: survey.status,
    open: isOpen(survey, ctx.now()),
    openedAt: survey.openedAt,
    closesAt: survey.closesAt,
    closedAt: survey.closedAt,
    responseCount: survey._count.responses,
    questions: survey.questions.map(questionView),
  };
}

/**
 * Release (DRAFT → OPEN) or close (OPEN → CLOSED) a survey. Opening needs questions and
 * a started event, since it asks about something that has happened.
 */
export async function setSurveyStatus(
  ctx: AppContext,
  runId: string,
  staff: Staff,
  eventId: string,
  action: 'open' | 'close',
) {
  const now = ctx.now();
  await ctx.prisma.$transaction(async (tx) => {
    const survey = await tx.survey.findUnique({
      where: { eventId },
      include: { event: true, _count: { select: { questions: true } } },
    });
    if (!survey) throw new HttpError(404, 'survey_not_found');
    if (action === 'open') {
      if (survey._count.questions === 0) throw new HttpError(409, 'survey_has_no_questions');
      if (survey.event.status === 'DRAFT' || survey.event.status === 'CANCELLED') {
        throw new HttpError(409, 'event_not_active');
      }
      if (survey.event.startsAt > now) throw new HttpError(409, 'event_not_started');
    }
    const updated = await tx.survey.updateMany({
      where: { id: survey.id, status: action === 'open' ? 'DRAFT' : 'OPEN' },
      data:
        action === 'open' ? { status: 'OPEN', openedAt: now } : { status: 'CLOSED', closedAt: now },
    });
    if (updated.count !== 1) throw new HttpError(409, 'invalid_transition');
    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: action === 'open' ? 'survey.opened' : 'survey.closed',
      entityType: 'survey',
      entityId: survey.id,
      result: 'SUCCESS',
      metadata: { eventId, role: staff.role },
    });
  });
}

/** Aggregated results. Responses are shown without names. */
export async function surveyResults(ctx: AppContext, eventId: string) {
  const survey = await ctx.prisma.survey.findUnique({
    where: { eventId },
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: { answers: { orderBy: { id: 'asc' } } },
      },
      _count: { select: { responses: true } },
    },
  });
  if (!survey) throw new HttpError(404, 'survey_not_found');
  const eligible = await eligibleCount(ctx.prisma, survey);

  return {
    responseCount: survey._count.responses,
    eligibleCount: eligible,
    questions: survey.questions.map((q) => {
      const base = questionView(q);
      if (q.kind === 'RATING') {
        const ratings = q.answers.map((a) => a.rating).filter((r): r is number => r !== null);
        const distribution = Array.from(
          { length: RATING_MAX },
          (_, i) => ratings.filter((r) => r === i + 1).length,
        );
        const average = ratings.length
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : null;
        return { ...base, answered: ratings.length, average, distribution };
      }
      if (q.kind === 'SINGLE_CHOICE') {
        const counts = Object.fromEntries((base.options ?? []).map((o) => [o, 0]));
        for (const a of q.answers) if (a.choice && a.choice in counts) counts[a.choice]! += 1;
        return { ...base, answered: q.answers.filter((a) => a.choice).length, counts };
      }
      const texts = q.answers.map((a) => a.text).filter((t): t is string => !!t);
      return { ...base, answered: texts.length, texts };
    }),
  };
}

// ─── Members ───────────────────────────────────────────────────────

async function isEligible(db: Db, survey: Survey, memberId: string): Promise<boolean> {
  if (survey.audience === 'ATTENDEES') {
    return (await db.attendance.count({ where: { eventId: survey.eventId, memberId } })) > 0;
  }
  return (
    (await db.registration.count({
      where: { eventId: survey.eventId, memberId, status: 'CONFIRMED' },
    })) > 0
  );
}

async function eligibleCount(db: Db, survey: Survey): Promise<number> {
  return survey.audience === 'ATTENDEES'
    ? db.attendance.count({ where: { eventId: survey.eventId } })
    : db.registration.count({ where: { eventId: survey.eventId, status: 'CONFIRMED' } });
}

/** Open surveys the member may answer and hasn't yet. */
export async function surveysForMember(ctx: AppContext, memberId: string) {
  const now = ctx.now();
  const surveys = await ctx.prisma.survey.findMany({
    where: {
      status: 'OPEN',
      OR: [{ closesAt: null }, { closesAt: { gt: now } }],
      responses: { none: { memberId } },
      event: {
        OR: [
          { attendance: { some: { memberId } } },
          { registrations: { some: { memberId, status: 'CONFIRMED' } } },
        ],
      },
    },
    include: { event: true },
    orderBy: { openedAt: 'desc' },
  });
  const result = [];
  for (const s of surveys) {
    if (await isEligible(ctx.prisma, s, memberId)) {
      result.push({ id: s.id, title: s.title, eventTitle: s.event.title, closesAt: s.closesAt });
    }
  }
  return result;
}

/** A survey as the member sees it. Ineligible members get 404 so surveys don't leak. */
export async function surveyForMember(ctx: AppContext, surveyId: string, memberId: string) {
  const survey = await ctx.prisma.survey.findUnique({
    where: { id: surveyId },
    include: { event: true, questions: { orderBy: { position: 'asc' } } },
  });
  if (!survey || survey.status === 'DRAFT' || !(await isEligible(ctx.prisma, survey, memberId))) {
    throw new HttpError(404, 'survey_not_found');
  }
  const responded = (await ctx.prisma.surveyResponse.count({ where: { surveyId, memberId } })) > 0;
  return {
    id: survey.id,
    title: survey.title,
    intro: survey.intro,
    event: {
      title: survey.event.title,
      when: formatPtRange(survey.event.startsAt, survey.event.endsAt),
    },
    open: isOpen(survey, ctx.now()),
    closesAt: survey.closesAt,
    responded,
    questions: survey.questions.map(questionView),
  };
}

export interface AnswerInput {
  questionId: string;
  rating?: number;
  text?: string;
  choice?: string;
}

/** Validate every answer against its question, then store the response exactly once. */
export async function submitResponse(
  ctx: AppContext,
  runId: string,
  surveyId: string,
  memberId: string,
  answers: AnswerInput[],
) {
  const survey = await ctx.prisma.survey.findUnique({
    where: { id: surveyId },
    include: { questions: true },
  });
  if (!survey || survey.status === 'DRAFT' || !(await isEligible(ctx.prisma, survey, memberId))) {
    throw new HttpError(404, 'survey_not_found');
  }
  if (!isOpen(survey, ctx.now())) throw new HttpError(409, 'survey_closed');

  const byId = new Map(survey.questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const rows: Prisma.SurveyAnswerCreateManyResponseInput[] = [];
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q || seen.has(a.questionId)) throw new HttpError(400, 'invalid_answers');
    seen.add(a.questionId);
    if (q.kind === 'RATING') {
      if (!Number.isInteger(a.rating) || a.rating! < RATING_MIN || a.rating! > RATING_MAX) {
        throw new HttpError(400, 'invalid_answers');
      }
      rows.push({ questionId: q.id, rating: a.rating! });
    } else if (q.kind === 'SINGLE_CHOICE') {
      if (!a.choice || !((q.options as string[] | null) ?? []).includes(a.choice)) {
        throw new HttpError(400, 'invalid_answers');
      }
      rows.push({ questionId: q.id, choice: a.choice });
    } else {
      const text = a.text?.trim();
      if (!text) continue; // an empty optional text answer is simply skipped
      rows.push({ questionId: q.id, text });
    }
  }
  const answered = new Set(rows.map((r) => r.questionId));
  if (survey.questions.some((q) => q.required && !answered.has(q.id))) {
    throw new HttpError(400, 'missing_required_answers');
  }

  try {
    await ctx.prisma.$transaction(async (tx) => {
      const response = await tx.surveyResponse.create({
        data: {
          surveyId,
          memberId,
          submittedAt: ctx.now(),
          answers: { createMany: { data: rows } },
        },
      });
      await recordAudit(tx, {
        runId,
        actorType: 'MEMBER',
        actorId: memberId,
        action: 'survey.response.submitted',
        entityType: 'survey',
        entityId: surveyId,
        result: 'SUCCESS',
        metadata: { responseId: response.id },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, 'already_responded');
    }
    throw err;
  }
}
