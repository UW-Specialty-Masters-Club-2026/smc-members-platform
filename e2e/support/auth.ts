import { expect, type Page } from '@playwright/test';
import { magicToken, waitForEmail } from './db';

/** Sign in through the real magic-link flow (the link is read from the dev outbox). */
export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /sign-in link/i }).click();
  await expect(page.getByRole('status')).toContainText('sign-in link is on its way');
  const mail = await waitForEmail(email, /sign-in link/);
  await page.goto(`/auth/callback#token=${magicToken(mail)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/me/profile');
}
