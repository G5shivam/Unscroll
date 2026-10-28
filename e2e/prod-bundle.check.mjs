// Security checks on the PRODUCTION web bundle (built without EXPO_PUBLIC_E2E).
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

export async function run(log = console.log) {
  const root = new URL('..', import.meta.url).pathname;
  execSync('npx expo export --platform web --output-dir dist', {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, EXPO_PUBLIC_E2E: '', EXPO_NO_TELEMETRY: '1' },
  });
  const js = files(join(root, 'dist')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join('\n');
  let n = 0;
  const ok = (name, cond) => {
    assert.ok(cond, name);
    n++;
    log(`  ok  ${name}`);
  };
  ok('no E2E time-travel hooks in production', !js.includes('__unscrollE2E'));
  ok('no source maps or inline secrets', !/sourceMappingURL=data:|PRIVATE KEY|api[_-]?key\s*[:=]/i.test(js));
  ok('no http:// endpoints contacted by app code', !/fetch\(\s*["']http:\/\//.test(js));
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((n) => console.log(`production bundle: ${n} passed`)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
