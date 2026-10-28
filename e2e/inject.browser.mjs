// Runs the real Clean Instagram injected script in Chromium against a
// fixture shaped like instagram.com, served from a local origin.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Builds the injected script exactly as the app does (via a tiny TS-free copy of buildInjectedScript). */
async function buildScript(surfaces) {
  const src = (await readFile(join(here, '../src/inject/clean-instagram.js'), 'utf8')).trim().replace(/;\s*$/, '');
  const rules = [
    { surface: 'feed', exact: ['/', ''], prefixes: [] },
    { surface: 'reels', exact: [], prefixes: ['/reels', '/reel/'] },
    { surface: 'explore', exact: [], prefixes: ['/explore'] },
    { surface: 'stories', exact: [], prefixes: ['/stories/'] },
  ].filter((r) => surfaces[r.surface]);
  const hide = {
    feed: ['a[href="/"]'],
    reels: ['a[href^="/reels"]', 'a[href^="/reel/"]'],
    explore: ['a[href^="/explore"]'],
    stories: ['a[href^="/stories/"]'],
  };
  const cfg = {
    safePath: '/direct/inbox/',
    rules,
    hideSelectors: Object.keys(hide).filter((k) => surfaces[k]).flatMap((k) => hide[k]),
  };
  return `${src}(${JSON.stringify(cfg)});\ntrue;`;
}

export async function run(log = console.log) {
  const html = await readFile(join(here, 'fixtures/instagram-like.html'));
  // Serve the fixture AS https://www.instagram.com (intercepted; nothing leaves the machine),
  // because the script refuses to run on any other host.
  const base = 'https://www.instagram.com';
  const browser = await launch();
  let passed = 0;
  const t = async (name, fn) => {
    const ctx = await browser.newContext();
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === 'www.instagram.com') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>other site</p>' });
    });
    const page = await ctx.newPage();
    const messages = [];
    await page.exposeFunction('__rnPost', (m) => messages.push(m));
    await page.addInitScript(() => {
      window.ReactNativeWebView = { postMessage: (m) => window.__rnPost(m) };
    });
    try {
      await fn(page, messages);
      passed++;
      log(`  ok  ${name}`);
    } finally {
      await ctx.close();
    }
  };

  const all = { feed: true, reels: true, explore: true, stories: false };
  const script = await buildScript(all);

  try {
    await t('opening the feed redirects to messages', async (page, messages) => {
      await page.addInitScript(script);
      await page.goto(`${base}/`);
      await page.waitForURL(`${base}/direct/inbox/`);
      await page.waitForTimeout(100);
      assert.ok(messages.includes('unscroll:blocked:feed'));
    });

    await t('opening a Reel URL directly redirects to messages', async (page) => {
      await page.addInitScript(script);
      await page.goto(`${base}/reel/ABC/`);
      await page.waitForURL(`${base}/direct/inbox/`);
    });

    await t('feed, Reels and Explore links are hidden; DMs and profile are visible', async (page) => {
      await page.addInitScript(script);
      await page.goto(`${base}/direct/inbox/`);
      for (const id of ['home', 'explore', 'reels']) assert.equal(await page.isVisible(`#${id}`), false, id);
      for (const id of ['dm', 'profile']) assert.equal(await page.isVisible(`#${id}`), true, id);
    });

    await t('client-side navigation to Reels is intercepted', async (page, messages) => {
      await page.addInitScript(script);
      await page.goto(`${base}/direct/inbox/`);
      await page.evaluate(() => history.pushState({}, '', '/reels/'));
      await page.waitForTimeout(150);
      assert.equal(new URL(page.url()).pathname, '/direct/inbox/');
      assert.ok(messages.includes('unscroll:blocked:reels'));
    });

    await t('a Reel link added later (shared in a chat) is hidden and its click blocked', async (page) => {
      await page.addInitScript(script);
      await page.goto(`${base}/direct/inbox/`);
      await page.evaluate(() => window.addReelLink());
      assert.equal(await page.isVisible('#late-reel'), false);
      await page.evaluate(() => document.getElementById('late-reel').click());
      await page.waitForTimeout(150);
      assert.equal(new URL(page.url()).pathname, '/direct/inbox/');
    });

    await t('a profile’s Reels tab is blocked', async (page) => {
      await page.addInitScript(script);
      await page.goto(`${base}/some.friend/reels/`);
      await page.waitForURL(`${base}/direct/inbox/`);
    });

    await t('allowed pages (profile, messages) stay put', async (page, messages) => {
      await page.addInitScript(script);
      await page.goto(`${base}/some.friend/`);
      await page.waitForTimeout(700);
      assert.equal(new URL(page.url()).pathname, '/some.friend/');
      assert.equal(messages.length, 0);
    });

    await t('the safety-net check catches route changes that bypass history.pushState', async (page) => {
      await page.addInitScript(script);
      await page.goto(`${base}/direct/inbox/`);
      // Simulate a router that saved the original pushState before we patched it.
      await page.evaluate(() => History.prototype.pushState.call(history, {}, '', '/explore/'));
      await page.waitForURL(`${base}/direct/inbox/`, { timeout: 2000 });
    });

    await t('surfaces the user allowed are not blocked', async (page) => {
      await page.addInitScript(await buildScript({ feed: true, reels: false, explore: true, stories: false }));
      await page.goto(`${base}/reels/`);
      await page.waitForTimeout(700);
      assert.equal(new URL(page.url()).pathname, '/reels/');
    });

    await t('the script does nothing on other sites', async (page) => {
      await page.addInitScript(script);
      await page.goto('https://www.facebook.com/');
      assert.equal(await page.evaluate(() => window.__unscrollInstalled), undefined);
      assert.equal(new URL(page.url()).pathname, '/');
    });

    await t('installing twice is harmless and the guard flag cannot be reset by the page', async (page) => {
      await page.addInitScript(script);
      await page.addInitScript(script);
      await page.goto(`${base}/direct/inbox/`);
      const styles = await page.locator('style[data-unscroll]').count();
      assert.equal(styles, 1);
      const reset = await page.evaluate(() => {
        try {
          window.__unscrollInstalled = false;
        } catch {}
        return window.__unscrollInstalled;
      });
      assert.equal(reset, true);
    });

    await t('the script never posts more than the fixed message format', async (page, messages) => {
      await page.addInitScript(script);
      await page.goto(`${base}/`);
      await page.waitForURL(`${base}/direct/inbox/`);
      for (const m of messages) assert.match(m, /^unscroll:blocked:(feed|reels|explore|stories)$/);
    });
  } finally {
    await browser.close();
  }
  return passed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((n) => console.log(`inject browser tests: ${n} passed`)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
