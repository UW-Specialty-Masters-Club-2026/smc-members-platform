import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AFTER_EVENT,
  DURING_EVENT,
  get,
  publishedEvent,
  registeredMember,
  send,
} from '../test/fixtures';
import { createHarness, hasTestDb, type TestHarness } from '../test/harness';

const SURVEY = {
  title: 'How was AI at Work?',
  intro: 'Two minutes, anonymous to organizers.',
  questions: [
    { kind: 'RATING', prompt: 'Overall, how was the workshop?' },
    { kind: 'SINGLE_CHOICE', prompt: 'Would you come again?', options: ['Yes', 'Maybe', 'No'] },
    { kind: 'TEXT', prompt: 'Anything we should change?', required: false },
  ],
};

describe.skipIf(!hasTestDb)('surveys', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  /** Event with one attendee (checked in) and one no-show; survey saved as draft. */
  async function setup(surveyOverrides: object = {}) {
    const { event, staff } = await publishedEvent(h);
    const attendee = await registeredMember(h, event.slug);
    const noShow = await registeredMember(h, event.slug);
    h.setNow(DURING_EVENT);
    await send(h, 'post', '/staff/checkin', staff.cookie, { code: attendee.code });
    const saved = await send(h, 'put', `/admin/events/${event.id}/survey`, staff.cookie, {
      ...SURVEY,
      ...surveyOverrides,
    });
    expect(saved.status).toBe(200);
    const base = `/admin/events/${event.id}/survey`;
    return { event, staff, attendee, noShow, survey: saved.body, base };
  }

  function answersFor(survey: { questions: { id: string; kind: string }[] }, rating = 5) {
    const [r, c, t] = survey.questions;
    return {
      answers: [
        { questionId: r!.id, rating },
        { questionId: c!.id, choice: 'Yes' },
        { questionId: t!.id, text: 'More hands-on time please' },
      ],
    };
  }

  it('validates question definitions', async () => {
    const { event, staff } = await publishedEvent(h);
    const bad = await send(h, 'put', `/admin/events/${event.id}/survey`, staff.cookie, {
      title: 'Feedback',
      questions: [{ kind: 'SINGLE_CHOICE', prompt: 'Pick one' }],
    });
    expect(bad.status).toBe(400);
  });

  it('only opens after the event starts, then freezes the questions', async () => {
    const { event, staff } = await publishedEvent(h);
    await send(h, 'put', `/admin/events/${event.id}/survey`, staff.cookie, SURVEY);
    const early = await send(h, 'post', `/admin/events/${event.id}/survey/open`, staff.cookie);
    expect(early.body).toEqual({ error: 'event_not_started' });

    h.setNow(AFTER_EVENT);
    const opened = await send(h, 'post', `/admin/events/${event.id}/survey/open`, staff.cookie);
    expect(opened.body).toMatchObject({ status: 'OPEN', open: true });
    const edit = await send(h, 'put', `/admin/events/${event.id}/survey`, staff.cookie, SURVEY);
    expect(edit.body).toEqual({ error: 'survey_locked' });
  });

  it('is offered to attendees only, and accepts one response each', async () => {
    const { attendee, noShow, survey, staff, base } = await setup();
    h.setNow(AFTER_EVENT);
    await send(h, 'post', `${base}/open`, staff.cookie);

    expect((await get(h, '/me/surveys', attendee.cookie)).body.surveys).toHaveLength(1);
    expect((await get(h, '/me/surveys', noShow.cookie)).body.surveys).toHaveLength(0);
    expect((await get(h, `/surveys/${survey.id}`, noShow.cookie)).status).toBe(404);

    const ok = await send(
      h,
      'post',
      `/surveys/${survey.id}/responses`,
      attendee.cookie,
      answersFor(survey),
    );
    expect(ok.status).toBe(201);
    const twice = await send(
      h,
      'post',
      `/surveys/${survey.id}/responses`,
      attendee.cookie,
      answersFor(survey),
    );
    expect(twice.body).toEqual({ error: 'already_responded' });
    expect((await get(h, '/me/surveys', attendee.cookie)).body.surveys).toHaveLength(0);
  });

  it('includes confirmed registrants when the audience says so', async () => {
    const { noShow, survey, staff, base } = await setup({ audience: 'REGISTRANTS' });
    h.setNow(AFTER_EVENT);
    await send(h, 'post', `${base}/open`, staff.cookie);
    const res = await send(
      h,
      'post',
      `/surveys/${survey.id}/responses`,
      noShow.cookie,
      answersFor(survey),
    );
    expect(res.status).toBe(201);
  });

  it('rejects invalid or incomplete answers', async () => {
    const { attendee, survey, staff, base } = await setup();
    h.setNow(AFTER_EVENT);
    await send(h, 'post', `${base}/open`, staff.cookie);
    const [r, c] = survey.questions;
    const post = (body: object) =>
      send(h, 'post', `/surveys/${survey.id}/responses`, attendee.cookie, body);

    expect((await post(answersFor(survey, 6))).body).toEqual({ error: 'invalid_answers' });
    expect(
      (
        await post({
          answers: [
            { questionId: r.id, rating: 4 },
            { questionId: c.id, choice: 'Sure' },
          ],
        })
      ).body,
    ).toEqual({ error: 'invalid_answers' });
    expect((await post({ answers: [{ questionId: r.id, rating: 4 }] })).body).toEqual({
      error: 'missing_required_answers',
    });
    // The optional text question may be left out.
    expect(
      (
        await post({
          answers: [
            { questionId: r.id, rating: 4 },
            { questionId: c.id, choice: 'No' },
          ],
        })
      ).status,
    ).toBe(201);
  });

  it('stops accepting responses once closed or past its deadline', async () => {
    const { attendee, survey, staff, base } = await setup({ closesAtPt: '2026-11-01T12:00' });
    h.setNow(AFTER_EVENT);
    await send(h, 'post', `${base}/open`, staff.cookie);
    h.setNow(new Date('2026-11-01T20:00:00Z')); // after noon PST
    const late = await send(
      h,
      'post',
      `/surveys/${survey.id}/responses`,
      attendee.cookie,
      answersFor(survey),
    );
    expect(late.body).toEqual({ error: 'survey_closed' });

    await send(h, 'post', `${base}/close`, staff.cookie);
    expect((await get(h, `${base}`, staff.cookie)).body.status).toBe('CLOSED');
  });

  it('reports aggregated, anonymous results', async () => {
    const { attendee, noShow, survey, staff, base, event } = await setup({
      audience: 'REGISTRANTS',
    });
    h.setNow(AFTER_EVENT);
    await send(h, 'post', `${base}/open`, staff.cookie);
    await send(
      h,
      'post',
      `/surveys/${survey.id}/responses`,
      attendee.cookie,
      answersFor(survey, 5),
    );
    await send(h, 'post', `/surveys/${survey.id}/responses`, noShow.cookie, answersFor(survey, 4));

    const res = await get(h, `${base}/results`, staff.cookie);
    expect(res.body.responseCount).toBe(2);
    expect(res.body.eligibleCount).toBe(2);
    const [rating, choice, text] = res.body.questions;
    expect(rating).toMatchObject({ average: 4.5, distribution: [0, 0, 0, 1, 1] });
    expect(choice.counts).toEqual({ Yes: 2, Maybe: 0, No: 0 });
    expect(text.texts).toEqual(['More hands-on time please', 'More hands-on time please']);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(attendee.member.id);
    expect(raw).not.toContain(attendee.member.email);
    expect(raw).not.toContain(event.slug);
  });

  it('keeps survey management to staff', async () => {
    const { attendee, base } = await setup();
    expect((await get(h, `${base}/results`, attendee.cookie)).status).toBe(403);
  });
});
