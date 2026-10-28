// Runs every browser-based suite: injected-script tests and app E2E.
// Builds the E2E web bundle first if it is missing.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { run as runInject } from './inject.browser.mjs';
import { run as runApp } from './app.browser.mjs';
import { run as runProdCheck } from './prod-bundle.check.mjs';

if (!existsSync(new URL('../dist-e2e/index.html', import.meta.url))) {
  execSync('npm run build:web:e2e', { stdio: 'inherit' });
}
let total = 0;
console.log('Clean Instagram script (Chromium):');
total += await runInject();
console.log('App end-to-end (Chromium, phone viewport):');
total += await runApp();
console.log('Production bundle checks:');
total += await runProdCheck();
console.log(`\nbrowser suites: ${total} checks passed`);
