// Browser smoke test: plays a short solo game against the bots through the real UI.
// Usage: start `npm run dev -- --port 5199`, then `node scripts/smoke.mjs [url] [screenshotDir]`.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5199/';
const shots = process.argv[3] ?? 'smoke-shots';
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

async function playSolo({ theme, lang, viewport, tag }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${tag}] console: ${m.text()}`));
  await page.addInitScript(
    ([theme, lang]) => {
      localStorage.setItem('kw.theme', theme);
      localStorage.setItem('kw.lang', lang);
    },
    [theme, lang],
  );
  await page.goto(url);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/${tag}-1-home.png` });
  await page.getByRole('textbox').first().fill('Tester');
  await page.locator('.home-actions .btn.primary').click();
  await page.locator('.segmented button', { hasText: /^4$/ }).click();
  await page.screenshot({ path: `${shots}/${tag}-2-lobby.png` });
  await page.locator('.topbar .icon-btn').first().click(); // rules
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/${tag}-2b-rules.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('.start-btn').click();

  const seen = new Set();
  const snap = async (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    await page.screenshot({ path: `${shots}/${tag}-${name}.png` });
  };

  // Elements can disappear between the visibility check and the click (animations, bot moves): retry.
  const tryClick = async (locator, options = {}) => {
    try {
      await locator.click({ timeout: 1500, ...options });
      return true;
    } catch {
      return false;
    }
  };

  const deadline = Date.now() + 240_000;
  let plays = 0;
  let bids = 0;
  while (Date.now() < deadline) {
    if (await page.locator('.game-over').isVisible()) {
      await page.waitForTimeout(800);
      await snap('9-gameover');
      break;
    }
    const next = page.locator('.hand-result .btn.primary');
    if (await next.isVisible()) {
      await page.waitForTimeout(600);
      await snap('6-result');
      await tryClick(next);
      await page.waitForTimeout(500);
      continue;
    }
    const bidActions = page.locator('.bid-actions');
    if (await bidActions.isVisible()) {
      await snap('3-bidding');
      // Alternate between asking hearts and passing to exercise both paths.
      const ask = page.locator('.bid-group .suit-btn').first();
      const clicked =
        bids % 3 === 0 && (await ask.isVisible())
          ? await tryClick(ask)
          : await tryClick(bidActions.locator('.btn').first());
      if (clicked) bids++;
      await page.waitForTimeout(250);
      continue;
    }
    const card = page.locator('.hand-card.playable').first();
    if (await card.isVisible()) {
      if (plays === 2) await snap('4-my-turn');
      // Hand cards overlap: click the visible strip on the left, like a player would.
      if (await tryClick(card, { position: { x: 8, y: 24 } })) plays++;
      await page.waitForTimeout(450);
      if (plays === 3) await snap('5-trick');
      continue;
    }
    await page.waitForTimeout(200);
  }
  if (!seen.has('9-gameover')) errors.push(`[${tag}] game did not reach game over (plays=${plays}, bids=${bids})`);
  await page.locator('.modal-body .btn').first().click(); // play again
  await page.waitForTimeout(1500);
  await snap('10-play-again');
  console.log(`[${tag}] plays=${plays} bids=${bids} screenshots=${[...seen].join(',')}`);
  await context.close();
}

try {
  await playSolo({ theme: 'light', lang: 'en', viewport: { width: 1280, height: 800 }, tag: 'desktop-light-en' });
  await playSolo({ theme: 'dark', lang: 'nl', viewport: { width: 390, height: 844 }, tag: 'mobile-dark-nl' });
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('smoke test passed');
