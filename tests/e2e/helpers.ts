import { expect, type Page } from '@playwright/test';

export const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

/** Fresh session -> welcome -> chat. Optional stub scenario flags. */
export async function start(page: Page, flags = '') {
  await page.context().clearCookies();
  await page.goto(flags ? `/?stub=${flags}` : '/?stub=');
  await expect(page.getByTestId('welcome-screen')).toBeVisible();
  await page.getByRole('link', { name: 'Continue in demo mode' }).click();
  await expect(page.getByTestId('chat')).toBeVisible();
}

export async function say(page: Page, text: string) {
  await page.fill('#chat-input', text);
  await page.keyboard.press('Enter');
}

export async function setFlags(page: Page, flags: string) {
  await page.evaluate((f) => sessionStorage.setItem('stubFlags', f), flags);
}

export async function createL1(page: Page) {
  await say(page, 'Create a list called Weekly staples with milk, bread, 6 eggs and 1kg atta');
  await expect(page.getByTestId('found-card')).toBeVisible();
  await expect(page.getByTestId('found-row')).toHaveCount(4);
  await btn(page, 'Save as L1').click();
  await expect(page.getByTestId('saved-card')).toContainText('Saved as L1');
}
