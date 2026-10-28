// Shared browser harness: headless Chromium (bundled in @sparticuz/chromium)
// driven by playwright-core, plus a tiny static server for the web export.
import chromiumPkg from '@sparticuz/chromium';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

/** Serve `root` on a random localhost port; unknown paths fall back to index.html (SPA). */
export async function serve(root) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let file = normalize(join(root, decodeURIComponent(url.pathname)));
      if (!file.startsWith(normalize(root))) {
        res.writeHead(403).end();
        return;
      }
      let ok = false;
      try {
        ok = (await stat(file)).isFile();
      } catch {
        ok = false;
      }
      if (!ok) file = join(root, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

export async function launch() {
  const executablePath = await chromiumPkg.executablePath();
  return chromium.launch({
    executablePath,
    headless: true,
    args: [...chromiumPkg.args.filter((a) => !a.startsWith('--single-process')), '--no-sandbox'],
  });
}

/** An iPhone-sized context (390 x 844 @3x) with touch, in India's time zone. */
export async function phoneContext(browser, extra = {}) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    ...extra,
  });
}
