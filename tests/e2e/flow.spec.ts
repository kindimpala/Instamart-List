import { expect, test } from '@playwright/test';
import { ATTRIBUTION_TEXT } from '../../shared/brand';
import { btn, createL1, say, setFlags, start } from './helpers';

test('create L1 from a sentence, edit it via chat, delete it with the inline confirm', async ({ page }) => {
  await start(page);
  await createL1(page);

  await say(page, 'Add 2 bananas to L1, remove eggs, make bread 2 and rename it to Weekend list');
  const diff = page.getByTestId('diff-card');
  await expect(diff).toBeVisible();
  await expect(diff.getByTestId('diff-added')).toContainText('Banana');
  await expect(diff.getByTestId('diff-removed')).toContainText('Eggs');
  await expect(diff.getByTestId('diff-changed')).toContainText('1 → 2');
  await expect(diff).toContainText('Rename “Weekly staples” to “Weekend list”');
  await expect(diff.getByRole('button', { name: /unchanged/ })).toBeVisible();
  await diff.getByRole('button', { name: 'Apply changes' }).click();
  await expect(diff.getByText('Changes applied')).toBeVisible();

  await page.getByRole('button', { name: /My lists/ }).click();
  const card = page.getByTestId('list-card');
  await expect(card).toContainText('Weekend list');
  await expect(card).toContainText('4 items');

  // Inline confirm, never a browser dialog.
  page.on('dialog', () => {
    throw new Error('Native dialog used');
  });
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(card.getByText('Delete?')).toBeVisible();
  await card.getByRole('button', { name: 'No' }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Delete' }).click();
  await card.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByTestId('list-card')).toHaveCount(0);
  await expect(page.getByText('No lists yet.')).toBeVisible();
});

test('order a list end to end: out-of-stock swap, price change, surge, budget, success', async ({ page }) => {
  await start(page);
  await createL1(page);
  await setFlags(page, 'oos,price,surge,eta');
  await say(page, 'Order L1 under ₹150');
  const summary = page.getByTestId('order-summary');
  await expect(summary).toBeVisible();

  await expect(summary.getByTestId('substitution-banner')).toContainText('out of stock');
  await expect(summary.getByTestId('price-tag')).toHaveText('Price updated ₹49 to ₹52');
  await expect(summary.getByTestId('surge-line')).toBeVisible();
  await expect(summary.getByTestId('surge-banner')).toContainText('A surge fee of ₹25 is applied right now');
  const surgeBg = await summary.getByTestId('surge-line').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(surgeBg).toBe('rgb(255, 243, 209)'); // amber highlight
  await expect(summary.getByTestId('budget-bar')).toContainText('Over by');

  // Cannot confirm until the substitution is resolved.
  await expect(summary.getByRole('button', { name: 'Order anyway' })).toBeDisabled();
  await summary.getByRole('button', { name: 'Accept' }).click();

  const confirmResp = page.waitForResponse('**/api/order/confirm');
  await summary.getByRole('button', { name: 'Order anyway' }).click();
  const body = await (await confirmResp).json();
  expect(body.order.message).toContain(ATTRIBUTION_TEXT);

  await expect(page.getByTestId('success-screen')).toBeVisible();
  await expect(page.getByTestId('order-id')).toHaveText(/^IM\d+/);
  await expect(page.getByTestId('eta')).toHaveText('12 mins');
  await expect(page.getByTestId('live-region')).toContainText(ATTRIBUTION_TEXT);
  await btn(page, 'Track order').click();
  await expect(page.getByTestId('track-status')).toContainText('Order confirmed');
});

test('ETA line is hidden when the service response has none; cancel clears the cart', async ({ page }) => {
  await start(page);
  await createL1(page);
  await setFlags(page, 'noeta');
  await say(page, 'order L1');
  const summary = page.getByTestId('order-summary');
  await expect(summary.getByTestId('surge-banner')).toHaveCount(0);
  await summary.getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByTestId('success-screen')).toBeVisible();
  await expect(page.getByTestId('eta')).toHaveCount(0);
  await btn(page, 'Track order').click();
  await expect(page.getByTestId('track-status')).toBeVisible();
  await expect(page.getByTestId('eta')).toHaveCount(0);

  await btn(page, 'Back to chat').click();
  await say(page, 'order L1');
  await page.getByTestId('order-summary').last().getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Order cancelled. I’ve cleared your Instamart cart.')).toBeVisible();
});

test('budget on a new list suggests cheaper variants', async ({ page }) => {
  await start(page);
  await say(page, 'Create a list with 5kg atta and 1 L ghee, keep it under ₹500');
  const card = page.getByTestId('found-card');
  const bar = card.getByTestId('budget-bar');
  await expect(bar).toContainText('Over by');
  await bar.getByRole('button', { name: /Switch|Remove/ }).first().click();
  await expect(card.getByTestId('found-total')).not.toHaveText('₹908');
});

test('confirm endpoint rejects calls without a valid token', async ({ page }) => {
  await start(page);
  const headers = { 'x-requested-with': 'instamart-lists' };
  const none = await page.request.post('/api/order/confirm', { data: {}, headers });
  expect(none.status()).toBe(403);
  expect((await none.json()).error).toBe('confirm_missing');
  const forged = await page.request.post('/api/order/confirm', { data: { token: 'eyJ0eXAiOiJvcmRlci1jb25maXJtIn0.forged' }, headers });
  expect(forged.status()).toBe(403);
  const noCsrf = await page.request.post('/api/order/confirm', { data: {} });
  expect(noCsrf.status()).toBe(403);
});

test('@layout no horizontal overflow and phone-width container', async ({ page }) => {
  await start(page);
  await createL1(page);
  const vw = page.viewportSize()!.width;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const phone = await page.locator('.phone').boundingBox();
  expect(phone!.width).toBeLessThanOrEqual(Math.min(vw, 480));
  if (vw > 600) expect(phone!.x).toBeGreaterThan(100); // centred on desktop
  // All buttons meet the 44px target.
  const small = await page.$$eval('button, a.btn', (els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect()).filter((r) => r.height < 43.5 || r.width < 43.5).length,
  );
  expect(small).toBe(0);
});
