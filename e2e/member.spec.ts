import { expect, test } from '@playwright/test';
import { db, magicToken, resetAll, waitForEmail } from './support/db';
import { NEW_MEMBER_EMAIL } from './support/env';

test.beforeEach(resetAll);

test('a new member opts in at sign-up, registers for an event and manages news in My profile', async ({
  page,
}) => {
  const organizer = await db().member.create({
    data: {
      email: 'org.e2e@uw.edu',
      firstName: 'Olivia',
      lastName: 'E2E',
      role: 'ORGANIZER',
      emailVerifiedAt: new Date(),
    },
  });
  const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60_000);
  await db().event.create({
    data: {
      slug: 'coffee-chat-e2e',
      title: 'Alumni Coffee Chat',
      summary: 'Small-group conversations with Foster alumni.',
      startsAt,
      location: 'Dempsey Hall 302 · UW Seattle',
      status: 'PUBLISHED',
      capacity: 10,
      createdById: organizer.id,
    },
  });

  // Sign up with the news & invitations box ticked.
  await page.goto('/signup');
  await page.getByLabel('UW email').fill(NEW_MEMBER_EMAIL);
  await page.getByLabel('First name').fill('Nora');
  await page.getByLabel('Last name').fill('E2E');
  await page.getByLabel(/Send me extra news and invitations/).check();
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByRole('status')).toContainText('Check your inbox');
  const mail = await waitForEmail(NEW_MEMBER_EMAIL, /Confirm your email/);
  await page.goto(`/auth/callback#token=${magicToken(mail)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/me/profile');

  const newsBox = page.getByRole('checkbox', { name: /Send me extra news and invitations/ });
  await expect(newsBox).toBeChecked();

  // Register for the event; the personal check-in QR appears.
  await page.goto('/events');
  await page.getByRole('link', { name: 'Alumni Coffee Chat' }).click();
  await expect(page.getByText('10 of 10 seats left')).toBeVisible();
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('status').first()).toContainText('You’re registered');
  await expect(page.getByRole('img', { name: 'Your personal check-in QR code' })).toBeVisible();

  // Switch news off and back on from My profile.
  await page.goto('/me/profile');
  await newsBox.uncheck();
  await expect(page.getByRole('status')).toContainText('News and invitations are off.');
  const off = await db().member.findUniqueOrThrow({ where: { email: NEW_MEMBER_EMAIL } });
  expect(off.newsOptIn).toBe(false);
  await newsBox.check();
  await expect(page.getByRole('status')).toContainText('You’ll get news and invitations.');
  await expect(page.getByText('Alumni Coffee Chat')).toBeVisible(); // My events
});

test('key pages fit a 390px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/signup', '/login', '/events', '/news', '/email/unsubscribe']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
