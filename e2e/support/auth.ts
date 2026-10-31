import { expect, type Page } from '@playwright/test';
import { magicToken, waitForEmail } from './db';

/** Sign in through the real magic-link flow (the link is read from the dev outbox). */
export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  // Switch from password to an emailed link, then send it.
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText('sign-in link is on its way');
  const mail = await waitForEmail(email, /sign-in link/);
  await page.goto(`/auth/callback#token=${magicToken(mail)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/me/profile');
}
