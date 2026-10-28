import type { Surface, SurfaceSettings } from '../core/types';
import { CLEAN_INSTAGRAM_SOURCE } from './script.generated';

export interface RouteRule {
  surface: Surface;
  exact: string[];
  prefixes: string[];
}

export interface InjectConfig {
  safePath: string;
  rules: RouteRule[];
  hideSelectors: string[];
}

/** Where blocked routes send the user: the DM inbox. */
export const SAFE_PATH = '/direct/inbox/';
export const START_URL = 'https://www.instagram.com/direct/inbox/';

/**
 * Bundled routing rules for instagram.com. Data only — never code.
 * Feed is the root path; Reels/Explore/Stories are path prefixes.
 */
export const DEFAULT_RULES: readonly Readonly<RouteRule>[] = Object.freeze([
  { surface: 'feed', exact: ['/', ''], prefixes: [] },
  { surface: 'reels', exact: [], prefixes: ['/reels', '/reel/'] },
  { surface: 'explore', exact: [], prefixes: ['/explore'] },
  { surface: 'stories', exact: [], prefixes: ['/stories/'] },
]);

export const DEFAULT_HIDE: Record<Surface, string[]> = {
  feed: ['a[href="/"]'],
  reels: ['a[href^="/reels"]', 'a[href^="/reel/"]'],
  explore: ['a[href^="/explore"]'],
  stories: ['a[href^="/stories/"]'],
};

// --- validation -------------------------------------------------------------

/**
 * Selectors end up inside a <style> element. Braces, semicolons, angle
 * brackets, backslashes and @ would let a selector escape into new CSS rules
 * or markup, so they are rejected outright.
 */
const SAFE_SELECTOR = /^[A-Za-z0-9 [\]="^$*~|:().,_#+'/-]{1,200}$/;
const SAFE_PATH_RE = /^\/[a-z0-9_/-]{0,100}$/;

export function isSafeSelector(s: unknown): s is string {
  return typeof s === 'string' && SAFE_SELECTOR.test(s) && !/[{};<>@\\]/.test(s);
}

export function isSafePath(p: unknown): p is string {
  return typeof p === 'string' && (p === '' || SAFE_PATH_RE.test(p));
}

const SURFACE_SET = new Set<Surface>(['feed', 'reels', 'explore', 'stories']);

export function validateInjectConfig(c: unknown): c is InjectConfig {
  if (typeof c !== 'object' || c === null) return false;
  const o = c as Record<string, unknown>;
  if (!isSafePath(o.safePath) || o.safePath === '') return false;
  if (!Array.isArray(o.rules) || o.rules.length > 20) return false;
  for (const r of o.rules as unknown[]) {
    if (typeof r !== 'object' || r === null) return false;
    const rr = r as Record<string, unknown>;
    if (!SURFACE_SET.has(rr.surface as Surface)) return false;
    if (!Array.isArray(rr.exact) || !Array.isArray(rr.prefixes)) return false;
    if (rr.exact.length > 10 || rr.prefixes.length > 10) return false;
    if (!(rr.exact as unknown[]).every(isSafePath)) return false;
    if (!(rr.prefixes as unknown[]).every((p) => isSafePath(p) && p !== '')) return false;
  }
  if (!Array.isArray(o.hideSelectors) || o.hideSelectors.length > 50) return false;
  if (!(o.hideSelectors as unknown[]).every(isSafeSelector)) return false;
  // The safe path itself must never be blocked, or the redirect would loop.
  const safe = o.safePath as string;
  for (const r of o.rules as RouteRule[]) {
    if (r.exact.includes(safe) || r.prefixes.some((p) => safe.startsWith(p))) return false;
  }
  return true;
}

/** Build the config for the user's current surface settings. */
export function configFor(surfaces: SurfaceSettings): InjectConfig {
  const on = (s: Surface) => surfaces[s];
  return {
    safePath: SAFE_PATH,
    // Deep copies: callers must never be able to mutate the bundled defaults.
    rules: DEFAULT_RULES.filter((r) => on(r.surface)).map((r) => ({
      surface: r.surface,
      exact: [...r.exact],
      prefixes: [...r.prefixes],
    })),
    hideSelectors: (Object.keys(DEFAULT_HIDE) as Surface[]).filter(on).flatMap((s) => [...DEFAULT_HIDE[s]]),
  };
}

/**
 * The exact script handed to the WebView. Throws if the config is invalid, so
 * a bad config can never reach the page.
 */
export function buildInjectedScript(cfg: InjectConfig): string {
  if (!validateInjectConfig(cfg)) throw new Error('Refusing to inject an invalid config');
  // Re-serialise only the known fields so no extra data rides along.
  const clean: InjectConfig = {
    safePath: cfg.safePath,
    rules: cfg.rules.map((r) => ({ surface: r.surface, exact: [...r.exact], prefixes: [...r.prefixes] })),
    hideSelectors: [...cfg.hideSelectors],
  };
  return `${CLEAN_INSTAGRAM_SOURCE}(${JSON.stringify(clean)});\ntrue;`;
}

// --- native-side checks (defence in depth, run by the app for navigations) ---

/**
 * Top-level navigations allowed in Clean Instagram. Facebook is deliberately
 * NOT allowed: it would open an unfiltered Facebook feed and Reels. Users log
 * in with their Instagram username and password (see SECURITY.md).
 */
const ALLOWED_HOSTS = ['instagram.com', 'www.instagram.com', 'help.instagram.com', 'accountscenter.instagram.com'];

/** Which top-level navigations the Clean Instagram view may perform. */
export function isAllowedNavigation(url: string): boolean {
  if (url === 'about:blank') return true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  return ALLOWED_HOSTS.includes(u.hostname.toLowerCase());
}

/** Blocked surface for an instagram.com URL under the given config, or null. */
export function blockedSurface(url: string, cfg: InjectConfig): Surface | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'instagram.com' && host !== 'www.instagram.com') return null;
  const p = u.pathname.toLowerCase();
  for (const r of cfg.rules) {
    if (r.surface === 'reels' && PROFILE_REELS.test(p)) return r.surface;
    if (r.exact.includes(p) || r.prefixes.some((x) => p.startsWith(x))) return r.surface;
  }
  return null;
}

/** A profile's Reels tab, e.g. /some.friend/reels/ (mirrors clean-instagram.js and Kotlin). */
const PROFILE_REELS = /^\/[^/]+\/reels(\/|$)/;

const MESSAGE_RE = /^unscroll:blocked:(feed|reels|explore|stories)$/;

/** Parse a message from the page. Anything not exactly matching is ignored. */
export function parsePageMessage(data: unknown): Surface | null {
  if (typeof data !== 'string' || data.length > 40) return null;
  const m = MESSAGE_RE.exec(data);
  return m ? (m[1] as Surface) : null;
}
