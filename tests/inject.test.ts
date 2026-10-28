import {
  blockedSurface,
  buildInjectedScript,
  configFor,
  DEFAULT_HIDE,
  isAllowedNavigation,
  isSafeSelector,
  parsePageMessage,
  validateInjectConfig,
} from '../src/inject/config';
import { CLEAN_INSTAGRAM_SOURCE } from '../src/inject/script.generated';

const ALL = { feed: true, reels: true, explore: true, stories: true };

describe('Clean Instagram config', () => {
  test('defaults are valid and only include enabled surfaces', () => {
    const cfg = configFor({ feed: true, reels: true, explore: false, stories: false });
    expect(validateInjectConfig(cfg)).toBe(true);
    expect(cfg.rules.map((r) => r.surface)).toEqual(['feed', 'reels']);
    expect(cfg.hideSelectors).toEqual([...DEFAULT_HIDE.feed, ...DEFAULT_HIDE.reels]);
  });

  test.each([
    'a}body{display:none',
    'a{}',
    'a;b',
    '</style><script>alert(1)</script>',
    'a[href="x"]\\',
    '@import url(x)',
    '',
    'x'.repeat(201),
  ])('unsafe selector %p is rejected', (sel) => {
    expect(isSafeSelector(sel)).toBe(false);
    const cfg = { ...configFor(ALL), hideSelectors: [sel] };
    expect(validateInjectConfig(cfg)).toBe(false);
    expect(() => buildInjectedScript(cfg)).toThrow();
  });

  test('a config that would block the safe path is rejected (no redirect loops)', () => {
    const cfg = configFor(ALL);
    cfg.rules.push({ surface: 'feed', exact: [], prefixes: ['/direct'] });
    expect(validateInjectConfig(cfg)).toBe(false);
  });

  test('unsafe paths are rejected', () => {
    for (const p of ['javascript:alert(1)', '/a b', '/<x>', 'reels', '/../etc']) {
      const cfg = configFor(ALL);
      cfg.rules[1].prefixes.push(p);
      expect(validateInjectConfig(cfg)).toBe(false);
    }
  });

  test('the built script embeds only validated JSON after the generated source', () => {
    const script = buildInjectedScript(configFor(ALL));
    expect(script.startsWith(CLEAN_INSTAGRAM_SOURCE)).toBe(true);
    const json = script.slice(CLEAN_INSTAGRAM_SOURCE.length + 1, script.lastIndexOf(');'));
    expect(JSON.parse(json)).toEqual(configFor(ALL));
    // Extra fields never ride along.
    const withExtra = { ...configFor(ALL), evil: 'x' } as ReturnType<typeof configFor>;
    expect(buildInjectedScript(withExtra)).not.toContain('evil');
  });

  test('the injected source makes no network calls and reads no page data', () => {
    for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'document.cookie', 'localStorage', '.value', 'eval(', 'new Function']) {
      expect(CLEAN_INSTAGRAM_SOURCE).not.toContain(banned);
    }
  });
});

describe('navigation allowlist', () => {
  test.each([
    ['https://www.instagram.com/direct/inbox/', true],
    ['https://instagram.com/accounts/login/', true],
    ['https://www.facebook.com/login.php', false],
    ['https://m.facebook.com/reel/1', false],
    ['about:blank', true],
    ['http://www.instagram.com/', false],
    ['https://evil.com/', false],
    ['https://www.instagram.com.evil.com/', false],
    ['https://user:pass@www.instagram.com/', false],
    ['https://www.instagram.com:8443/', false],
    ['javascript:alert(1)', false],
    ['file:///etc/passwd', false],
    ['intent://scan/#Intent;scheme=zxing;end', false],
    ['not a url', false],
  ])('%s -> %s', (url, ok) => {
    expect(isAllowedNavigation(url)).toBe(ok);
  });

  test('blocked surfaces are detected on navigation', () => {
    const cfg = configFor({ feed: true, reels: true, explore: true, stories: false });
    expect(blockedSurface('https://www.instagram.com/', cfg)).toBe('feed');
    expect(blockedSurface('https://www.instagram.com/reels/', cfg)).toBe('reels');
    expect(blockedSurface('https://www.instagram.com/reel/C123/', cfg)).toBe('reels');
    expect(blockedSurface('https://www.instagram.com/EXPLORE/tags/x', cfg)).toBe('explore');
    expect(blockedSurface('https://www.instagram.com/stories/friend/1', cfg)).toBe(null);
    expect(blockedSurface('https://www.instagram.com/direct/inbox/', cfg)).toBe(null);
    expect(blockedSurface('https://www.instagram.com/some.friend/', cfg)).toBe(null);
    expect(blockedSurface('https://www.instagram.com/some.friend/reels/', cfg)).toBe('reels');
    expect(blockedSurface('https://www.instagram.com/some.friend/reelsfan/', cfg)).toBe(null);
    expect(blockedSurface('https://www.facebook.com/', cfg)).toBe(null);
  });
});

describe('page messages', () => {
  test.each([
    ['unscroll:blocked:reels', 'reels'],
    ['unscroll:blocked:feed', 'feed'],
    ['unscroll:blocked:everything', null],
    ['unscroll:blocked:reels ', null],
    ['UNSCROLL:BLOCKED:REELS', null],
    [42, null],
    [{ toString: () => 'unscroll:blocked:reels' }, null],
    ['x'.repeat(1000), null],
  ])('%p -> %p', (msg, out) => {
    expect(parsePageMessage(msg)).toBe(out);
  });
});
