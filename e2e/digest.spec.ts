import { expect, test } from '@playwright/test';
import { signIn } from './support/auth';
import { db, outbox, resetAll, seedDigestAwaitingApproval } from './support/db';
import { ADMIN_EMAIL, MEMBER_EMAILS } from './support/env';

test.beforeEach(resetAll);

test('admin reviews, tests and approves; the worker sends exactly once; members can unsubscribe', async ({
  page,
}) => {
  const { digestId } = await seedDigestAwaitingApproval();
  await signIn(page, ADMIN_EMAIL);

  // Workspace list
  await page.goto('/admin/digests');
  await expect(page.getByRole('heading', { name: 'Weekly digest' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Pending approval' });
  await row.getByRole('link').click();
  await page.waitForURL(`**/admin/digests/${digestId}`);

  // Review: facts, recipients, schedule, preview at both widths
  await expect(page.getByRole('heading', { name: 'Check the facts' })).toBeVisible();
  await expect(page.getByText('AI at Work Workshop').first()).toBeVisible();
  await expect(page.getByText(/ PT$/).first()).toBeVisible();
  await expect(page.getByText('PACCAR Hall, Room 192 · UW Seattle').first()).toBeVisible();
  await expect(page.getByText('@uw.edu: 1')).toBeVisible();
  await expect(page.getByText('@gmail.com: 1')).toBeVisible();
  const frame = page.frameLocator('iframe[title^="Email preview"]');
  await expect(frame.getByText('UPCOMING EVENTS', { exact: false })).toBeVisible();
  await expect(frame.getByText('Hi Ada,')).toBeVisible();
  await page.getByRole('button', { name: 'Mobile 390' }).click();
  await expect(page.locator('iframe[title="Email preview (mobile)"]')).toHaveAttribute(
    'width',
    '390',
  );

  // Test send goes to the admin only
  await page.getByRole('button', { name: 'Send test to me' }).click();
  await expect(page.getByRole('status')).toContainText(`Test sent to ${ADMIN_EMAIL}`);
  const tests = (await outbox()).filter((m) => m.subject?.startsWith('[TEST]'));
  expect(tests.map((m) => m.to)).toEqual([ADMIN_EMAIL]);

  // Approve (with confirmation)
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Send issue to 2 members/)).toBeVisible();
  await page.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(page.getByRole('status')).toContainText('Approved as issue 1');

  // A second approval (double click, second admin tab) changes nothing.
  const version = (await db().weeklyDigest.findUniqueOrThrow({ where: { id: digestId } })).version;
  const again = await page.request.post(`/api/admin/digests/${digestId}/approve`, {
    data: { version: version - 1 },
    headers: { Origin: 'http://localhost:3000' },
  });
  expect(await again.json()).toEqual({ kind: 'already_approved' });

  // The worker sends and closes the issue.
  await expect
    .poll(
      async () => (await db().weeklyDigest.findUniqueOrThrow({ where: { id: digestId } })).status,
      {
        timeout: 30_000,
      },
    )
    .toBe('SENT');
  await page.reload();
  await expect(page.locator('.tag').first()).toHaveText('Sent');
  const sentStat = page.locator('.stat').filter({ hasText: 'Sent' }).locator('.stat__n');
  await expect(sentStat).toHaveText('2');
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'digest.approved' })).toBeVisible();

  // Exactly one batch, to the two opted-in members only.
  const batches = (await outbox()).filter((m) => m.recipients);
  expect(batches).toHaveLength(1);
  expect(batches[0]!.recipients!.map((r) => r.email).sort()).toEqual([...MEMBER_EMAILS].sort());
  expect(await db().digestDelivery.count()).toBe(2);

  // A member follows the footer unsubscribe link (signed token, no login).
  const mia = batches[0]!.recipients!.find((r) => r.email === MEMBER_EMAILS[0])!;
  await page.context().clearCookies();
  await page.goto(mia.variables.unsub_url!);
  await page.getByRole('button', { name: 'Unsubscribe' }).click();
  await expect(page.getByRole('status')).toContainText('You’re unsubscribed.');
  const member = await db().member.findUniqueOrThrow({ where: { email: MEMBER_EMAILS[0] } });
  expect(member).toMatchObject({ newsOptIn: false, emailSuppressedReason: 'UNSUBSCRIBED' });

  // Mail clients' one-click POST works too; a GET never unsubscribes.
  const leo = batches[0]!.recipients!.find((r) => r.email === MEMBER_EMAILS[1])!;
  expect((await page.request.get(leo.variables.unsub_one_click_url!)).status()).toBe(405);
  const oneClick = await page.request.post(leo.variables.unsub_one_click_url!, {
    form: { 'List-Unsubscribe': 'One-Click' },
  });
  expect(oneClick.status()).toBe(200);
  expect(
    (await db().member.findUniqueOrThrow({ where: { email: MEMBER_EMAILS[1] } })).newsOptIn,
  ).toBe(false);
});

test('the browser view shows the sent issue without personal data', async ({ page }) => {
  const { digestId, weekKey } = await seedDigestAwaitingApproval();
  await db().weeklyDigest.update({ where: { id: digestId }, data: { status: 'SENT' } });
  await page.goto(`/digest/${weekKey}`);
  const frame = page.frameLocator('iframe[title="SMC weekly digest"]');
  await expect(frame.getByText('Hi there,')).toBeVisible();
  await expect(frame.getByText('AI at Work Workshop')).toBeVisible();
});
