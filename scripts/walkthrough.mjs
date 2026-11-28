/**
 * Screenshot walkthrough of the full stub-mode flow (used for docs and visual checks).
 * Usage: npm run dev  (in another terminal), then:
 *   node scripts/walkthrough.mjs [outDir]
 * Set CHROME_PATH to use a system Chrome instead of Playwright's bundled Chromium.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots';
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
const btn = (name) => p.getByRole('button', { name, exact: true });
const shot = (name, el) => (el ?? p).screenshot({ path: `${out}/${name}.png` });

await p.goto(`${base}/`);
await p.waitForSelector('[data-testid=welcome-screen]');
await shot('01-welcome');
await p.getByRole('link', { name: 'Continue in demo mode' }).click();
await p.waitForSelector('[data-testid=chat]');
await shot('02-chat');
await p.fill('#chat-input', 'Create a list called Weekly staples with milk, bread, 6 eggs and 1kg atta');
await p.keyboard.press('Enter');
await p.waitForSelector('[data-testid=found-card]');
await shot('03-found');
await p.getByRole('button', { name: /Swap variant for Amul/ }).click();
await shot('04-swap-sheet');
await btn('Close').click();
await btn('Save as L1').click();
await p.waitForSelector('[data-testid=saved-card]');
await p.fill('#chat-input', 'Add 2 bananas to L1, remove eggs, make bread 2');
await p.keyboard.press('Enter');
await p.waitForSelector('[data-testid=diff-card]');
await shot('05-diff', p.locator('[data-testid=diff-card]'));
await btn('Apply changes').click();
await p.locator('[data-testid=diff-card]').getByText('Changes applied').waitFor();
await p.getByRole('button', { name: /My lists/ }).click();
await p.waitForSelector('[data-testid=list-card]');
await p.locator('[data-testid=demo-scenarios] summary').click();
for (const label of [/out of stock/, /price changes/, /Surge fee/]) await p.getByLabel(label).check();
await shot('06-lists');
await p.locator('[data-testid=list-card]').getByRole('button', { name: 'Order this list' }).click();
await p.waitForSelector('[data-testid=order-progress]');
await shot('07-progress');
await p.waitForSelector('[data-testid=order-summary]', { timeout: 15000 });
await shot('08-order-summary', p.locator('[data-testid=order-summary]'));
await btn('Accept').click();
await btn('Order anyway').click();
await p.waitForSelector('[data-testid=success-screen]');
await shot('09-success');
await btn('Track order').click();
await p.waitForSelector('[data-testid=track-status]');
await shot('10-tracked');
await btn('Back to chat').click();
await p.setViewportSize({ width: 1280, height: 800 });
await shot('11-desktop');
await ctx.close();
await b.close();
console.log(`Screenshots saved to ${out}/`);
