/**
 * Development only: fill the local database with a realistic demo club so every screen has
 * something to show. Wipes the database first, so it requires --reset.
 *   npm run seed:demo -w @smc/worker -- --reset
 */
import { randomUUID } from 'node:crypto';
import { parseEnv, workerEnvSchema } from '@smc/config';
import { createLogger, parsePtLocal } from '@smc/core';
import { createPrismaClient, type Member } from '@smc/db';
import { resetDatabase } from '@smc/db/testing';
import { approveDigest, createDraft, weekKeyFor, type WorkflowDeps } from '@smc/digest';
import { DevOutboxMailer } from '@smc/email';
import { DateTime } from 'luxon';
import { seedContent } from './seed-content';

const env = parseEnv(workerEnvSchema);
const logger = createLogger({ name: 'seed-demo' });
if (env.APP_ENV !== 'development' || !process.argv.includes('--reset')) {
  logger.error('seed-demo runs only with APP_ENV=development and --reset (it wipes the database)');
  process.exit(2);
}

const db = createPrismaClient(env.DATABASE_URL);
const now = new Date();
const pt = (days: number, time: string) =>
  parsePtLocal(
    `${DateTime.fromJSDate(now, { zone: 'America/Los_Angeles' }).plus({ days }).toISODate()}T${time}`,
  );
const verified = new Date(now.getTime() - 30 * 24 * 60 * 60_000);

async function person(email: string, first: string, last: string, extra: Partial<Member> = {}) {
  return db.member.create({
    data: {
      email,
      firstName: first,
      lastName: last,
      newsOptIn: true,
      newsOptInUpdatedAt: verified,
      emailVerifiedAt: verified,
      ...extra,
    },
  });
}

try {
  await resetDatabase(db);

  // ── People ──
  const ada = await person('ada.demo@uw.edu', 'Ada', 'Lovelace', {
    role: 'ADMIN',
    newsOptIn: false,
  });
  const olivia = await person('olivia.demo@uw.edu', 'Olivia', 'Park', { role: 'ORGANIZER' });
  // The club's real website content (team, articles, newsletters, skills, site copy).
  await seedContent(db);
  const members = [
    await person('mia.demo@uw.edu', 'Mia', 'Chen'),
    await person('leo.demo@gmail.com', 'Leo', 'Garcia'),
    await person('noah.demo@uw.edu', 'Noah', 'Kim'),
    await person('emma.demo@uw.edu', 'Emma', 'Nguyen'),
    await person('sofia.demo@uw.edu', 'Sofia', 'Rossi'),
    await person('liam.demo@uw.edu', 'Liam', 'Patel'),
    await person('ava.demo@uw.edu', 'Ava', 'Johnson'),
    await person('ethan.demo@uw.edu', 'Ethan', 'Wright'),
  ];
  await person('optout.demo@uw.edu', 'Omar', 'Hassan', { newsOptIn: false });
  await person('new.demo@uw.edu', 'Nina', 'Lopez', { emailVerifiedAt: null });
  const [mia, leo, noah, emma, sofia, liam, ava, ethan] = members as [Member, ...Member[]];

  // ── Events ──
  const event = (data: {
    slug: string;
    title: string;
    summary: string;
    details?: string;
    startsAt: Date;
    endsAt?: Date;
    location: string;
    capacity: number | null;
    status?: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
  }) =>
    db.event.create({
      data: {
        status: 'PUBLISHED',
        publishedAt: verified,
        createdById: olivia.id,
        ...data,
      },
    });
  const register = (
    eventId: string,
    m: Member,
    status: 'CONFIRMED' | 'WAITLISTED',
    minutesAgo: number,
  ) =>
    db.registration.create({
      data: {
        eventId,
        memberId: m.id,
        status,
        registeredAt: new Date(now.getTime() - minutesAgo * 60_000),
        confirmedAt: status === 'CONFIRMED' ? new Date(now.getTime() - minutesAgo * 60_000) : null,
      },
    });

  const workshop = await event({
    slug: 'ai-at-work-workshop',
    title: 'AI at Work Workshop',
    summary: 'Hands-on session on putting AI tools to work in finance and analytics roles.',
    details:
      'Bring a laptop. We’ll walk through prompt patterns for financial modeling, data cleanup and reporting, then practice on a real case.',
    startsAt: pt(2, '18:00'),
    endsAt: pt(2, '19:30'),
    location: 'PACCAR Hall, Room 192 · UW Seattle',
    capacity: 30,
  });
  for (const [i, m] of [mia, noah, emma, sofia, liam].entries())
    await register(workshop.id, m!, 'CONFIRMED', 300 - i);

  const coffee = await event({
    slug: 'alumni-coffee-chat',
    title: 'Alumni Coffee Chat',
    summary:
      'Small-group conversations with Foster Specialty Master’s alumni about their first year on the job.',
    startsAt: pt(9, '17:30'),
    endsAt: pt(9, '19:00'),
    location: 'Dempsey Hall, Room 302 · UW Seattle',
    capacity: 4,
  });
  for (const [i, m] of [noah, emma, sofia, liam].entries())
    await register(coffee.id, m!, 'CONFIRMED', 200 - i);
  await register(coffee.id, ava!, 'WAITLISTED', 100);
  await register(coffee.id, ethan!, 'WAITLISTED', 90);

  await event({
    slug: 'case-competition-kickoff',
    title: 'Case Competition Kickoff',
    summary: 'Meet your teammates, get the brief, and hear tips from last year’s winners.',
    startsAt: pt(12, '18:30'),
    location: 'Founders Hall, Room 150 · UW Seattle',
    capacity: null,
  });
  await event({
    slug: 'spring-networking-night',
    title: 'Spring Networking Night',
    summary: 'Draft: not visible to members yet.',
    startsAt: pt(40, '18:00'),
    location: 'TBD',
    capacity: 80,
    status: 'DRAFT',
  });
  await event({
    slug: 'resume-review-cancelled',
    title: 'Resume Review Clinic',
    summary: 'Cancelled: the career coach is unavailable.',
    startsAt: pt(5, '12:00'),
    location: 'PACCAR Hall 391 · UW Seattle',
    capacity: 20,
    status: 'CANCELLED',
  });

  // A past event with check-ins and an open survey (Mia has feedback to give).
  const mixer = await event({
    slug: 'welcome-mixer',
    title: 'Welcome Mixer',
    summary: 'Kick-off social for the new cohort.',
    startsAt: pt(-6, '18:00'),
    endsAt: pt(-6, '20:00'),
    location: 'Foster Commons · UW Seattle',
    capacity: 60,
    status: 'COMPLETED',
  });
  for (const [i, m] of [mia, leo, noah].entries()) {
    const r = await register(mixer.id, m!, 'CONFIRMED', 20_000 - i);
    await db.attendance.create({
      data: {
        eventId: mixer.id,
        registrationId: r.id,
        memberId: m!.id,
        method: i === 1 ? 'MANUAL' : 'QR',
        checkedInAt: pt(-6, '18:10'),
        checkedInById: olivia.id,
      },
    });
  }
  const survey = await db.survey.create({
    data: {
      eventId: mixer.id,
      title: 'How was the Welcome Mixer?',
      intro: 'Two minutes; organizers see answers without names.',
      status: 'OPEN',
      openedAt: pt(-5, '09:00'),
      questions: {
        create: [
          { position: 1, kind: 'RATING', prompt: 'Overall, how was the mixer?' },
          {
            position: 2,
            kind: 'SINGLE_CHOICE',
            prompt: 'Would you come again?',
            options: ['Yes', 'Maybe', 'No'],
          },
          { position: 3, kind: 'TEXT', prompt: 'What should we do differently?', required: false },
        ],
      },
    },
    include: { questions: { orderBy: { position: 'asc' } } },
  });
  for (const [m, rating, choice, text] of [
    [leo, 5, 'Yes', 'More time for small-group intros.'],
    [noah, 4, 'Maybe', 'A quieter room would help.'],
  ] as const) {
    await db.surveyResponse.create({
      data: {
        surveyId: survey.id,
        memberId: m!.id,
        submittedAt: pt(-4, '10:00'),
        answers: {
          create: [
            { questionId: survey.questions[0]!.id, rating },
            { questionId: survey.questions[1]!.id, choice },
            { questionId: survey.questions[2]!.id, text },
          ],
        },
      },
    });
  }

  // ── News (published inside the weekly windows) ──
  const weekKey = weekKeyFor(now);
  const monday = DateTime.fromISO(weekKey, { zone: 'America/Los_Angeles' });
  const lastWeekKey = monday.minus({ weeks: 1 }).toISODate()!;
  await db.newsPost.create({
    data: {
      slug: 'welcome-mixer-recap',
      title: 'Welcome Mixer recap',
      summary: 'Thanks to the 40+ students who came out. Photos are up on Instagram @smclub_uw.',
      status: 'PUBLISHED',
      publishedAt: monday.minus({ days: 5 }).set({ hour: 12 }).toJSDate(),
      createdById: olivia.id,
    },
  });
  await db.newsPost.create({
    data: {
      slug: 'join-the-smc-team',
      tag: 'NOW RECRUITING',
      title: 'Join the SMC team',
      summary:
        'SMC is growing. Help create experiences that connect Specialty Master’s students across UW Foster. All positions are open to current UW Foster Specialty Master’s students.',
      status: 'PUBLISHED',
      publishedAt: monday.minus({ days: 3 }).set({ hour: 11 }).toJSDate(),
      applyEmail: 'smcommittee@uw.edu',
      applyChecklist: [
        'Your resume',
        'The role you’re interested in',
        'A brief note on why you’d like to join',
      ],
      createdById: ada.id,
      openings: {
        create: [
          { position: 1, title: 'Finance Officers', openings: 2 },
          { position: 2, title: 'Operations', openings: 1 },
          { position: 3, title: 'Alumni Outreach', openings: 1 },
          { position: 4, title: 'AI & Tech', openings: 1 },
        ],
      },
    },
  });

  // ── Digests: last week (sent, with results) and this week (awaiting approval) ──
  const deps = (runId: string, at: Date): WorkflowDeps => ({
    db,
    mailer: new DevOutboxMailer(env.DEV_OUTBOX_DIR),
    transport: {
      sendBatch: () => Promise.reject(new Error('demo seed does not send')),
      acceptedDeliveryIds: () => Promise.resolve(new Set()),
    },
    guard: { allowlist: new Set() },
    from: env.MAIL_FROM,
    replyTo: env.MAIL_REPLY_TO,
    appBaseUrl: env.APP_BASE_URL,
    apiBaseUrl: env.API_BASE_URL,
    linkSigningSecret: env.LINK_SIGNING_SECRET,
    lookaheadDays: env.DIGEST_EVENT_LOOKAHEAD_DAYS,
    logoUrl: env.DIGEST_LOGO_URL ?? null,
    now: () => at,
    runId,
  });

  const lastMonday = new Date(`${lastWeekKey}T16:30:00Z`);
  const last = await createDraft(deps(`seed-${randomUUID()}`, lastMonday), lastWeekKey);
  if (last.kind === 'pending_approval') {
    const d = await db.weeklyDigest.findUniqueOrThrow({ where: { id: last.digestId } });
    await approveDigest(deps('seed-approve-last', lastMonday), d.id, ada.id, d.version);
    const recipients = await db.member.findMany({
      where: { status: 'ACTIVE', newsOptIn: true, emailVerifiedAt: { not: null } },
    });
    const outcomes = [
      'DELIVERED',
      'DELIVERED',
      'DELIVERED',
      'DELIVERED',
      'DELIVERED',
      'FAILED',
      'DELIVERED',
      'UNSUBSCRIBED',
      'DELIVERED',
    ] as const;
    const batch = await db.digestBatch.create({
      data: {
        digestId: d.id,
        batchNo: 1,
        status: 'SUBMITTED',
        recipientCount: recipients.length,
        attempts: 1,
        mailgunMessageId: '<demo@mg>',
        submittedAt: lastMonday,
      },
    });
    for (const [i, m] of recipients.entries()) {
      const status = outcomes[i % outcomes.length]!;
      await db.digestDelivery.create({
        data: {
          digestId: d.id,
          memberId: m.id,
          weekKey: lastWeekKey,
          idempotencyKey: `digest:${lastWeekKey}:${m.id}`,
          batchId: batch.id,
          status,
          mailgunMessageId: '<demo@mg>',
          attempts: 1,
          ...(status === 'FAILED' && {
            lastErrorCode: '550',
            lastErrorMessage: '5.1.1 mailbox does not exist',
            failedAt: lastMonday,
          }),
          ...(status === 'DELIVERED' && { deliveredAt: lastMonday }),
        },
      });
    }
    await db.weeklyDigest.update({
      where: { id: d.id },
      data: { status: 'SENT', sendingStartedAt: lastMonday, completedAt: lastMonday },
    });
  }

  const thisMonday = new Date(`${weekKey}T16:30:00Z`);
  const current = await createDraft(deps(`seed-${randomUUID()}`, thisMonday), weekKey);
  if (current.kind === 'pending_approval') {
    // Open a two-hour approval window from now so the demo can approve and send.
    await db.weeklyDigest.update({
      where: { id: current.digestId },
      data: { sendNotBefore: now, expiresAt: new Date(now.getTime() + 2 * 60 * 60_000) },
    });
  }

  logger.info({ weekKey, lastWeek: last.kind, thisWeek: current.kind }, 'demo data ready');
} finally {
  await db.$disconnect();
}
