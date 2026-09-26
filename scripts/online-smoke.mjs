// Online smoke test: a host and a guest in separate browser contexts play over WebRTC (PeerJS).
// Usage: start `npm run dev -- --port 5199`, then `node scripts/online-smoke.mjs [url] [screenshotDir]`.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5199/';
const shots = process.argv[3] ?? 'smoke-shots';
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

async function openPlayer(tag, name, lang) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${tag}] console: ${m.text()}`));
  await page.addInitScript(
    ([name, lang]) => {
      localStorage.setItem('kw.name', name);
      localStorage.setItem('kw.lang', lang);
    },
    [name, lang],
  );
  return { context, page, tag };
}

const tryClick = async (locator, options = {}) => {
  try {
    await locator.click({ timeout: 1500, ...options });
    return true;
  } catch {
    return false;
  }
};

/** One step of an auto-player: bid pass/join, play the first legal card, or advance. */
async function step(page) {
  const next = page.locator('.hand-result .btn.primary');
  if (await next.isVisible()) return (await tryClick(next)) && 'next';
  const bid = page.locator('.bid-actions .btn').first();
  if (await bid.isVisible()) return (await tryClick(bid)) && 'bid';
  const card = page.locator('.hand-card.playable').first();
  if (await card.isVisible()) return (await tryClick(card, { position: { x: 8, y: 24 } })) && 'play';
  return null;
}

async function playFor(players, ms, until) {
  const counts = new Map(players.map((p) => [p.tag, { play: 0, bid: 0, next: 0 }]));
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const p of players) {
      const did = await step(p.page);
      if (did) counts.get(p.tag)[did]++;
    }
    if (until && (await until())) break;
    await players[0].page.waitForTimeout(150);
  }
  return Object.fromEntries(counts);
}

const host = await openPlayer('host', 'Anna', 'nl');
const guest = await openPlayer('guest', 'Bert', 'en');

try {
  // Host creates a table.
  await host.page.goto(url);
  await host.page.locator('.home-actions .btn').nth(1).click();
  const codeEl = host.page.locator('.invite-code strong');
  await codeEl.waitFor({ timeout: 30000 });
  const code = (await codeEl.textContent()).trim();
  const link = await host.page.locator('.invite-link input').inputValue();
  console.log('room code', code, link);

  // Guest opens the invite link and joins.
  await guest.page.goto(link);
  await guest.page.locator('.join-form button[type=submit]').click();
  await guest.page.locator('.seat-list').waitFor({ timeout: 30000 });
  await host.page.locator('.seat-list li', { hasText: 'Bert' }).waitFor({ timeout: 15000 });
  await host.page.screenshot({ path: `${shots}/online-1-host-lobby.png` });
  await guest.page.screenshot({ path: `${shots}/online-2-guest-lobby.png` });

  // Guest cannot change rules; host sets 4 hands and starts.
  if (await guest.page.locator('fieldset.options input').first().isEnabled()) errors.push('guest can edit rules');
  await host.page.locator('.segmented button', { hasText: /^4$/ }).click();
  await guest.page.locator('.segmented button.active', { hasText: /^4$/ }).waitFor({ timeout: 10000 });
  await host.page.locator('.start-btn').click();
  await guest.page.locator('.felt').waitFor({ timeout: 10000 });

  // Both players see their own 13 cards and the other human's name.
  const hostCards = await host.page.locator('.hand-card').count();
  const guestCards = await guest.page.locator('.hand-card').count();
  if (hostCards !== 13 || guestCards !== 13) errors.push(`hand sizes host=${hostCards} guest=${guestCards}`);
  if (!(await guest.page.locator('.nameplate', { hasText: 'Anna' }).count())) errors.push('guest does not see host');

  const firstHand = await playFor([host, guest], 90_000, async () => host.page.locator('.hand-result').isVisible());
  await host.page.screenshot({ path: `${shots}/online-3-host-result.png` });
  await guest.page.screenshot({ path: `${shots}/online-4-guest-result.png` });
  console.log('first hand', JSON.stringify(firstHand));
  const hostTotals = await host.page.locator('.result-table td:nth-child(3)').allTextContents();
  const guestTotals = await guest.page.locator('.result-table td:nth-child(3)').allTextContents();
  if (hostTotals.join() !== guestTotals.join()) errors.push(`score mismatch ${hostTotals} vs ${guestTotals}`);

  // Guest drops out: a bot takes over; then the guest reloads and reclaims the seat.
  await guest.page.close();
  await host.page.locator('.nameplate .tag.warn').waitFor({ timeout: 30000 });
  console.log('guest marked offline, bot took over');
  const guestPage = await guest.context.newPage();
  guestPage.on('pageerror', (e) => errors.push(`[guest2] pageerror: ${e.message}`));
  await guestPage.goto(link);
  await guestPage.locator('.join-form button[type=submit]').click();
  await guestPage.locator('.felt').waitFor({ timeout: 30000 });
  await host.page.locator('.nameplate .tag.warn').waitFor({ state: 'detached', timeout: 15000 });
  console.log('guest reclaimed seat');
  guest.page = guestPage;

  const rest = await playFor([host, guest], 180_000, async () => host.page.locator('.game-over').isVisible());
  console.log('rest of game', JSON.stringify(rest));
  if (!(await host.page.locator('.game-over').isVisible())) errors.push('game did not finish');
  await guest.page.locator('.game-over').waitFor({ timeout: 10000 });
  await guest.page.screenshot({ path: `${shots}/online-5-guest-gameover.png` });

  // Host leaves: guest is told quickly.
  const t0 = Date.now();
  await host.page.close({ runBeforeUnload: true });
  await guest.page.locator('.alert').waitFor({ timeout: 30000 });
  const alert = await guest.page.locator('.alert').textContent();
  console.log(`guest notified after ${Date.now() - t0}ms:`, alert);
  if (!/host/i.test(alert)) errors.push(`unexpected host-left message: ${alert}`);
} catch (e) {
  errors.push(`exception: ${e.message}`);
  await host.page.screenshot({ path: `${shots}/online-fail-host.png` }).catch(() => {});
  await guest.page.screenshot({ path: `${shots}/online-fail-guest.png` }).catch(() => {});
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('online smoke test passed');
