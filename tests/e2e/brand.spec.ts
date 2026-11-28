/**
 * "Powered by Instamart" branding checks. Prints measured contrast values.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ATTRIBUTION_TEXT } from '../../shared/brand';
import { btn, createL1, say, setFlags, start } from './helpers';

const LOGO_FILE = path.resolve('src/assets/brand/instamart-logo-square.png');
const LOGO_SHA = createHash('sha256').update(readFileSync(LOGO_FILE)).digest('hex');

interface Measured {
  logo: { w: number; h: number; natW: number; natH: number; alt: string | null; ariaHidden: string | null; radius: string; filter: string; opacity: string; boxShadow: string; border: string; objectFit: string } | null;
  textSize: number;
  strongWeight: number;
  phrase: string;
  gap: number;
  pad: { t: number; r: number; b: number; l: number };
  rect: { x: number; y: number; w: number; h: number };
  textOverflow: boolean;
  fg: string;
  bg: string;
}

async function measure(badge: Locator): Promise<Measured> {
  return badge.evaluate((el) => {
    const img = el.querySelector('img');
    const text = el.querySelector('.pbi__text') as HTMLElement;
    const strong = el.querySelector('strong')!;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let gap = 0;
    if (img) gap = text.getBoundingClientRect().left - img.getBoundingClientRect().right;
    if (img && gap < 0) gap = text.getBoundingClientRect().top - img.getBoundingClientRect().bottom; // wrapped
    const ics = img ? getComputedStyle(img) : null;
    return {
      logo: img
        ? {
            w: img.getBoundingClientRect().width,
            h: img.getBoundingClientRect().height,
            natW: img.naturalWidth,
            natH: img.naturalHeight,
            alt: img.getAttribute('alt'),
            ariaHidden: img.getAttribute('aria-hidden'),
            radius: ics!.borderRadius,
            filter: ics!.filter,
            opacity: ics!.opacity,
            boxShadow: ics!.boxShadow,
            border: ics!.borderStyle,
            objectFit: ics!.objectFit,
          }
        : null,
      textSize: parseFloat(getComputedStyle(text).fontSize),
      strongWeight: Number(getComputedStyle(strong).fontWeight),
      phrase: (text.textContent ?? '').replace(/\s+/g, ' ').trim(),
      gap,
      pad: { t: parseFloat(cs.paddingTop), r: parseFloat(cs.paddingRight), b: parseFloat(cs.paddingBottom), l: parseFloat(cs.paddingLeft) },
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      textOverflow: text.scrollWidth > text.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1,
      fg: getComputedStyle(text).color,
      bg: cs.backgroundColor,
    };
  });
}

function lum(rgb: string) {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** Nothing interactive (or any other element) may intrude into the badge box incl. its 8px clear space. */
async function assertClearSpace(_page: Page, badge: Locator) {
  const intruders = await badge.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const out: string[] = [];
    for (const other of Array.from(document.querySelectorAll('button, a, input, select, textarea, [role=button], .pbi, .list-badge, .tag'))) {
      if (other === el || el.contains(other) || other.contains(el)) continue;
      const o = other.getBoundingClientRect();
      if (o.width === 0 || o.height === 0) continue;
      const overlap = o.left < r.right && o.right > r.left && o.top < r.bottom && o.bottom > r.top;
      if (overlap) out.push(`${other.tagName}.${(other as HTMLElement).className}`);
    }
    return out;
  });
  expect(intruders, 'elements inside the badge clear space').toEqual([]);
}

async function checkStandard(page: Page, badge: Locator) {
  await expect(badge).toBeVisible();
  const m = await measure(badge);
  expect(m.logo, 'logo rendered').not.toBeNull();
  expect(m.logo!.w).toBeCloseTo(32, 0);
  expect(m.logo!.h).toBeCloseTo(32, 0);
  expect(m.textSize).toBe(16);
  expect(m.gap).toBeGreaterThanOrEqual(8);
  for (const v of Object.values(m.pad)) expect(v).toBeGreaterThanOrEqual(8);
  commonChecks(m);
  await assertClearSpace(page, badge);
}

async function checkCompact(page: Page, badge: Locator) {
  await expect(badge).toBeVisible();
  const m = await measure(badge);
  expect(m.logo).not.toBeNull();
  expect(m.logo!.w).toBeGreaterThanOrEqual(24);
  expect(m.logo!.h).toBeGreaterThanOrEqual(24);
  expect(m.textSize).toBeGreaterThanOrEqual(14);
  expect(m.gap).toBeGreaterThanOrEqual(8);
  for (const v of Object.values(m.pad)) expect(v).toBeGreaterThanOrEqual(8);
  commonChecks(m);
  await assertClearSpace(page, badge);
}

function commonChecks(m: Measured) {
  expect(m.phrase).toBe(ATTRIBUTION_TEXT);
  expect(m.strongWeight).toBeGreaterThanOrEqual(700);
  expect(m.textOverflow).toBe(false);
  const l = m.logo!;
  expect(l.w).toBeCloseTo(l.h, 1); // 1:1 on screen
  expect(l.natW).toBe(l.natH); // 1:1 artwork
  expect(l.alt).toBe('');
  expect(l.ariaHidden).toBe('true');
  expect(l.radius).toBe('0px');
  expect(l.filter).toBe('none');
  expect(l.opacity).toBe('1');
  expect(l.boxShadow).toBe('none');
  expect(['none', 'hidden']).toContain(l.border);
  expect(m.bg).not.toMatch(/rgba\(.*,\s*0\)$|transparent/); // solid backing surface
}

test.describe('Powered by Instamart badge', () => {
  test('appears on login, every chat screen, product results, order summary and success', async ({ page }) => {
    // 1) welcome / login
    await page.context().clearCookies();
    await page.goto('/?stub=');
    await checkStandard(page, page.getByTestId('welcome-screen').getByTestId('pbi-standard'));
    // sign-in is its own labelled control, not the badge
    await expect(page.getByTestId('welcome-screen').getByTestId('pbi-standard').locator('a, button')).toHaveCount(0);

    await start(page);
    // 2) persistent strip above the input bar
    const strip = page.getByTestId('pbi-strip');
    await checkStandard(page, strip.getByTestId('pbi-standard'));
    const stripBox = await strip.boundingBox();
    const inputBox = await page.locator('.inputbar').boundingBox();
    expect(inputBox!.y - (stripBox!.y + stripBox!.height)).toBeGreaterThanOrEqual(8);

    // 3) product results
    await createL1(page);
    await say(page, 'Create a list with milk and eggs');
    await checkCompact(page, page.getByTestId('found-card').last().getByTestId('pbi-compact'));

    // strip on the lists screen too
    await page.getByRole('button', { name: /My lists/ }).click();
    await checkStandard(page, page.getByTestId('pbi-strip').getByTestId('pbi-standard'));
    await page.getByRole('button', { name: 'Back to chat' }).click();

    // 4) order summary
    await setFlags(page, 'surge');
    await say(page, 'order L1');
    const summary = page.getByTestId('order-summary');
    await checkCompact(page, summary.getByTestId('pbi-compact'));

    // 5) success
    await summary.getByRole('button', { name: 'Order anyway' }).click();
    await checkStandard(page, page.getByTestId('success-screen').getByTestId('pbi-standard'));
  });

  test('logo file is byte-identical to the supplied asset and square', async ({ page }) => {
    await page.goto('/?stub=');
    const src = await page.getByTestId('welcome-screen').locator('.pbi__logo').getAttribute('src');
    const res = await page.request.get(src!);
    const served = createHash('sha256').update(await res.body()).digest('hex');
    expect(served).toBe(LOGO_SHA);
    const nat = await page.locator('.pbi__logo').first().evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight]);
    expect(nat[0]).toBe(nat[1]);
  });

  test('phrase is read once, logo is decorative, badge is not interactive', async ({ page }) => {
    await start(page);
    const badge = page.getByTestId('pbi-strip').getByTestId('pbi-standard');
    const snap = await badge.ariaSnapshot();
    expect(snap.match(/Powered by/g)?.length).toBe(1);
    expect(snap).not.toMatch(/img/);
    const info = await badge.evaluate((el) => {
      const all = [el, ...Array.from(el.querySelectorAll('*'))] as HTMLElement[];
      const reactHandlers = all.some((n) => {
        const k = Object.keys(n).find((x) => x.startsWith('__reactProps'));
        const props = k ? (n as any)[k] : {};
        return Object.keys(props).some((p) => /^on[A-Z]/.test(p));
      });
      return {
        reactHandlers,
        onclick: all.some((n) => n.onclick !== null),
        interactive: all.some((n) => ['A', 'BUTTON', 'INPUT'].includes(n.tagName) || n.hasAttribute('tabindex') || n.getAttribute('role') === 'button'),
        insideInteractive: !!el.closest('a, button, [role=button]'),
      };
    });
    expect(info).toEqual({ reactHandlers: false, onclick: false, interactive: false, insideInteractive: false });
  });

  test('badge has its own row on a 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await start(page);
    const badge = page.getByTestId('pbi-strip').getByTestId('pbi-standard');
    const others = await badge.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return Array.from(document.querySelectorAll('body *'))
        .filter((o) => o !== el && !el.contains(o) && !o.contains(el) && (o as HTMLElement).offsetParent !== null)
        .filter((o) => {
          const b = o.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && b.top < r.bottom && b.bottom > r.top && (b.right <= r.left || b.left >= r.right);
        })
        .map((o) => o.tagName + '.' + (o as HTMLElement).className);
    });
    expect(others).toEqual([]);
  });

  for (const scenario of [
    { name: '200% browser zoom', viewport: { width: 188, height: 406 }, rootFont: null },
    { name: '200% text size', viewport: { width: 375, height: 812 }, rootFont: '200%' },
  ]) {
    test(`nothing is truncated at ${scenario.name}`, async ({ page }) => {
      await start(page);
      await page.setViewportSize(scenario.viewport);
      if (scenario.rootFont) await page.evaluate((f) => (document.documentElement.style.fontSize = f), scenario.rootFont);
      for (const badge of await page.locator('.pbi').all()) {
        const m = await measure(badge);
        expect(m.phrase).toBe(ATTRIBUTION_TEXT);
        expect(m.textOverflow).toBe(false);
        expect(m.logo!.w).toBeCloseTo(m.logo!.h, 1);
        expect(m.logo!.w).toBeGreaterThanOrEqual(scenario.rootFont ? 64 : 32);
        expect(m.textSize).toBeGreaterThanOrEqual(scenario.rootFont ? 32 : 16);
        expect(m.rect.x).toBeGreaterThanOrEqual(0);
        expect(m.rect.x + m.rect.w).toBeLessThanOrEqual(scenario.viewport.width + 0.5);
        const clipped = await badge.evaluate((el) => {
          let p = el.parentElement;
          const r = el.getBoundingClientRect();
          while (p) {
            const cs = getComputedStyle(p);
            if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') {
              const pr = p.getBoundingClientRect();
              if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) return true;
            }
            p = p.parentElement;
          }
          return false;
        });
        expect(clipped).toBe(false);
      }
    });
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`attribution contrast is at least 4.5:1 in ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await start(page);
      const m = await measure(page.getByTestId('pbi-strip').getByTestId('pbi-standard'));
      const ratio = contrast(m.fg, m.bg);
      console.log(`[contrast] ${scheme}: text ${m.fg} on ${m.bg} = ${ratio.toFixed(2)}:1`);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      await say(page, 'Create a list with milk and bread');
      const c = await measure(page.getByTestId('found-card').getByTestId('pbi-compact'));
      const r2 = contrast(c.fg, c.bg);
      console.log(`[contrast] ${scheme} (compact, in card): ${c.fg} on ${c.bg} = ${r2.toFixed(2)}:1`);
      expect(r2).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('text-only outputs carry the attribution (confirm response + exported list)', async ({ page }) => {
    await start(page);
    await createL1(page);
    const headers = { 'x-requested-with': 'instamart-lists' };
    const { lists } = await (await page.request.get('/api/lists')).json();
    const exp = await (await page.request.get(`/api/lists/${lists[0].id}/export`)).json();
    expect(exp.text).toContain(ATTRIBUTION_TEXT);
    const { preview } = await (await page.request.post('/api/order/prepare', { data: { listId: lists[0].id }, headers })).json();
    const confirm = await (await page.request.post('/api/order/confirm', { data: { token: preview.confirmToken }, headers })).json();
    expect(confirm.order.message).toContain(ATTRIBUTION_TEXT);
    // the copy-to-clipboard toast too
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: /My lists/ }).click();
    await page.getByTestId('list-card').getByRole('button', { name: 'Copy' }).click();
    await expect(page.locator('.toast')).toContainText(ATTRIBUTION_TEXT);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain(ATTRIBUTION_TEXT);
    await btn(page, 'Back to chat').click();
  });
});
