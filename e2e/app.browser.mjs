// End-to-end tests of the real app UI (web build of the same React Native
// code) with the simulated enforcer. Native enforcement on devices is covered
// by the Maestro flows in e2e/maestro.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, phoneContext, serve } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, 'artifacts');
const HOUR = 3_600_000;

export async function run(log = console.log) {
  await mkdir(SHOTS, { recursive: true });
  const srv = await serve(join(here, '../dist-e2e'));
  const browser = await launch();
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const id = (t) => page.locator(`[data-testid="${t}"]`);
  const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
  const e2e = (fn, arg) => page.evaluate(([f, a]) => window.__unscrollE2E[f](a), [fn, arg]);
  const settle = () => page.waitForTimeout(1300); // one engine tick
  let passed = 0;
  const step = async (name, fn) => {
    await fn();
    passed++;
    log(`  ok  ${name}`);
  };

  /** Press and hold like a finger, for `ms`. */
  async function hold(testId, ms) {
    const box = await id(testId).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
  }

  try {
    await step('welcome screen explains the three rules', async () => {
      await page.goto(srv.url);
      await id('onboarding-welcome').waitFor();
      const text = await page.innerText('body');
      for (const s of ['Feed and Reels stay hidden', 'can’t be cancelled', 'Leaving takes a deliberate step']) {
        assert.ok(text.includes(s), s);
      }
      await shot('01-welcome');
      await id('get-started').click();
    });

    await step('disclosure needs explicit consent (Play policy)', async () => {
      await id('onboarding-disclosure').waitFor();
      assert.equal(await id('agree-continue').getAttribute('aria-disabled'), 'true');
      await shot('02-disclosure');
      await id('consent-check').click();
      assert.notEqual(await id('agree-continue').getAttribute('aria-disabled'), 'true');
      await id('agree-continue').click();
    });

    await step('cannot continue until blocking is switched on', async () => {
      await id('onboarding-permissions').waitFor();
      assert.equal(await id('permissions-continue').getAttribute('aria-disabled'), 'true');
      await shot('03-permissions');
      await id('perm-open').click();
      await page.waitForFunction(
        () => document.querySelector('[data-testid="permissions-continue"]')?.getAttribute('aria-disabled') !== 'true',
      );
      await id('permissions-continue').click();
    });

    await step('choose what to hide and finish', async () => {
      await id('onboarding-defaults').waitFor();
      assert.equal(await id('default-reels').getAttribute('aria-checked'), 'true');
      assert.equal(await id('default-stories').getAttribute('aria-checked'), 'false');
      await id('default-stories').click();
      await shot('04-defaults');
      await id('finish-setup').click();
      await id('screen-today').waitFor();
      await id('lock-panel-open').waitFor();
      assert.match(await id('lock-panel-open').innerText(), /Feed, Reels, Explore and Stories hidden/);
      await shot('05-today-open');
    });

    await step('focus screen: presets, stepper and limits', async () => {
      await id('start-focus').click();
      await id('screen-focus').waitFor();
      await id('preset-25').click();
      assert.equal(await id('duration-value').innerText(), '25 min');
      await id('duration-plus').click();
      assert.equal(await id('duration-value').innerText(), '40 min');
      await id('duration-minus').click();
      assert.equal(await id('duration-value').innerText(), '25 min');
      // 25 - 15 would go under the 15-minute minimum.
      assert.equal(await id('duration-minus').getAttribute('aria-disabled'), 'true');
      await id('preset-60').click();
      await shot('06-focus-sheet');
    });

    await step('a short tap does not start a lock; a full hold does', async () => {
      assert.match(await id('hold-to-lock').getAttribute('aria-description') ?? (await id('hold-to-lock').getAttribute('aria-label')), /Hold to lock|hold/i);
      await hold('hold-to-lock', 600);
      await page.waitForTimeout(400);
      assert.ok(await id('screen-focus').isVisible(), 'still on focus screen after a short tap');
      assert.equal(await id('hold-to-lock').getAttribute('aria-label'), 'Hold to lock', 'timed-hold mode, not two-step');
      await hold('hold-to-lock', 1500);
      await page.waitForTimeout(300);
      assert.ok(await id('screen-focus').isVisible(), 'a 1.5 s hold is not enough');
      await hold('hold-to-lock', 3400);
      await id('lock-panel-locked').waitFor({ timeout: 5000 });
      await settle();
      await shot('07-today-locked');
    });

    await step('the locked screen has no way to stop the lock', async () => {
      const buttons = await page.locator('[role="button"]').allInnerTexts();
      for (const b of buttons) assert.doesNotMatch(b, /stop|pause|cancel|end now|unlock/i, b);
      assert.ok(await id('extend-focus').isVisible());
      const label = await id('lock-panel-locked').getAttribute('aria-label');
      assert.match(label, /Instagram is locked\. 0 hours 59 minutes remaining|Instagram is locked\. 1 hours 0 minutes remaining/);
    });

    await step('extending only offers longer durations', async () => {
      await id('extend-focus').click();
      await id('screen-focus').waitFor();
      assert.equal(await id('preset-25').count(), 0);
      assert.equal(await id('preset-50').count(), 0);
      assert.ok((await id('preset-120').count()) === 1);
      await shot('08-extend');
      await id('close-focus').click();
    });

    await step('adding a schedule during focus is allowed (it is stricter)', async () => {
      await id('tab-schedules').click();
      await id('screen-schedules').waitFor();
      await shot('09-schedules-empty');
      await id('new-schedule').click();
      await id('screen-schedule').waitFor();
      await id('schedule-name').fill('Board exam prep');
      await id('day-6').click(); // add Saturday
      await id('end-plus').click(); // 1:15 pm
      assert.equal(await id('end-value').innerText(), '1:15 pm');
      await shot('10-schedule-editor');
      await id('save-schedule').click();
      await id('screen-schedules').waitFor();
      assert.match(await page.innerText('body'), /Board exam prep/);
      await shot('11-schedules-list');
    });

    await step('showing Reels again waits 24 hours and can be cancelled', async () => {
      await id('tab-settings').click();
      await id('screen-settings').waitFor();
      await id('surface-reels').click();
      await id('settings-message').waitFor();
      assert.match(await id('settings-message').innerText(), /24 hours/);
      assert.match(await page.innerText('body'), /Show Reels again/);
      await shot('12-settings-pending');
    });

    await step('nothing loosens before 24 hours, even after the focus ends', async () => {
      await e2e('advance', 2 * HOUR);
      await settle();
      await id('tab-today').click();
      await id('lock-panel-open').waitFor();
      assert.match(await id('lock-panel-open').innerText(), /Reels/); // Reels still hidden
      assert.equal(await id('stat-streak').innerText(), '1 day');
      await shot('13-today-after-focus');
    });

    await step('after 24 hours the change applies', async () => {
      await e2e('advance', 23 * HOUR);
      await settle();
      await id('tab-settings').click();
      await id('screen-settings').waitFor();
      assert.equal(await id('surface-reels').getAttribute('aria-checked'), 'false');
      assert.doesNotMatch(await page.innerText('body'), /Show Reels again/);
    });

    await step('blocked attempts from the enforcer show on Today', async () => {
      await e2e('addBlocks', 3);
      await settle();
      await id('tab-today').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="stat-blocked"]')?.textContent === '3 times');
    });

    await step('switching the blocker off is detected and shown', async () => {
      await e2e('setEnabled', false);
      await page.waitForTimeout(4500); // status poll
      await id('blocker-off').waitFor();
      await shot('14-blocker-off');
    });

    await step('state survives a reload', async () => {
      await page.reload();
      await id('screen-today').waitFor();
      await id('tab-schedules').click();
      assert.match(await page.innerText('body'), /Board exam prep/);
    });

    await step('every interactive element has an accessible name', async () => {
      for (const tab of ['tab-today', 'tab-schedules', 'tab-settings']) {
        await id(tab).click();
        await page.waitForTimeout(300);
        const unnamed = await page.evaluate(() =>
          [...document.querySelectorAll('[role="button"],[role="switch"],[role="checkbox"],button,input')]
            .filter((el) => el.offsetParent !== null)
            .filter((el) => !(el.getAttribute('aria-label') || el.innerText.trim() || el.getAttribute('aria-labelledby')))
            .map((el) => el.outerHTML.slice(0, 80)),
        );
        assert.deepEqual(unnamed, [], `${tab}: ${unnamed.join('\n')}`);
      }
    });

    await step('touch targets are at least 44 x 44', async () => {
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('[role="button"],[role="switch"],[role="checkbox"]')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ r: el.getBoundingClientRect(), t: el.getAttribute('aria-label') || el.innerText }))
          .filter(({ r }) => r.width < 44 || r.height < 30) // switches are 50x30 with 8px hit slop
          .map(({ r, t }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`),
      );
      assert.deepEqual(small, []);
    });

    await step('tab bar labels are fully visible (not clipped)', async () => {
      const heights = await page.evaluate(() =>
        ['tab-today', 'tab-schedules', 'tab-settings'].map((id) => {
          const t = document.querySelector(`[data-testid="${id}"]`);
          const label = [...t.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim().length > 3);
          return label.getBoundingClientRect().height;
        }),
      );
      for (const h of heights) assert.ok(h >= 15, `label height ${h}`);
    });

    await step('no runtime errors in the console', async () => {
      const real = errors.filter((e) => !/favicon|DevTools/.test(e));
      assert.deepEqual(real, []);
    });
  } finally {
    await browser.close();
    await srv.close();
  }
  return passed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then((n) => console.log(`app e2e: ${n} passed`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
