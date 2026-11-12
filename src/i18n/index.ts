import type { getCalendars, getLocales } from 'expo-localization';
import { de } from './locales/de';
import { en, type Messages } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { hi } from './locales/hi';
import { id } from './locales/id';
import { pt } from './locales/pt';

export type { Messages };
export type Lang = 'en' | 'hi' | 'es' | 'pt' | 'fr' | 'de' | 'id';

const CATALOG: Record<Lang, Messages> = { en, hi, es, pt, fr, de, id };
export const LANGUAGES = Object.keys(CATALOG) as Lang[];

/** Keys that have `_one` / `_other` plural forms. */
type PluralBase = { [K in keyof Messages]: K extends `${infer B}_one` ? B : never }[keyof Messages];

/** First of the user's preferred languages we have a translation for; English otherwise. */
export function pickLanguage(tags: (string | null | undefined)[]): Lang {
  for (const tag of tags) {
    if (!tag) continue;
    const code = tag.toLowerCase().split(/[-_]/)[0];
    // Android has historically reported Indonesian as "in".
    const lang = code === 'in' ? 'id' : code;
    if ((LANGUAGES as string[]).includes(lang)) return lang as Lang;
  }
  return 'en';
}

interface LocaleInfo {
  lang: Lang;
  /** BCP-47 tag for Intl date formatting, e.g. "es-MX". */
  tag: string;
  uses24h: boolean;
}

type Localization = { getLocales: typeof getLocales; getCalendars: typeof getCalendars };

/**
 * expo-localization is a native module. A build made before it was added
 * (or Expo Go without it) throws on import, which would take down every
 * screen. Load it lazily and fall back to the JS Intl API instead.
 */
function loadLocalization(): Localization | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-localization') as Localization;
  } catch {
    return null;
  }
}

function fromIntl(): LocaleInfo {
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    const lang = pickLanguage([opts.locale]);
    const hc = new Intl.DateTimeFormat(opts.locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return {
      lang,
      tag: opts.locale ?? lang,
      uses24h: hc ? hc === 'h23' || hc === 'h24' : !(lang === 'en' || lang === 'hi'),
    };
  } catch {
    return { lang: 'en', tag: 'en', uses24h: false };
  }
}

function detect(): LocaleInfo {
  const loc = loadLocalization();
  if (!loc) return fromIntl();
  try {
    const locales = loc.getLocales();
    const lang = pickLanguage(locales.map((l) => l.languageTag ?? l.languageCode));
    const match = locales.find((l) => pickLanguage([l.languageTag]) === lang);
    const cal = loc.getCalendars()[0];
    return {
      lang,
      tag: match?.languageTag ?? lang,
      uses24h: cal?.uses24hourClock ?? !(lang === 'en' || lang === 'hi'),
    };
  } catch {
    return fromIntl();
  }
}

let current: LocaleInfo = detect();

export const locale = {
  get lang(): Lang {
    return current.lang;
  },
  get tag(): string {
    return current.tag;
  },
  get uses24h(): boolean {
    return current.uses24h;
  },
};

/** Override the detected locale (tests, or a future in-app language picker). */
export function setLocale(next: Partial<LocaleInfo> & { lang: Lang }): void {
  current = { tag: next.lang, uses24h: !(next.lang === 'en' || next.lang === 'hi'), ...next };
}

export type Params = Record<string, string | number>;

function fill(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translate a key. Missing translations fall back to English, never to a raw key. */
export function t(key: keyof Messages, params?: Params): string {
  return fill(CATALOG[current.lang][key] ?? en[key], params);
}

/** CLDR "one" category for the languages we ship (integers only). */
function isOne(lang: Lang, n: number): boolean {
  switch (lang) {
    case 'fr':
    case 'hi':
    case 'pt':
      return n === 0 || n === 1;
    case 'id':
      return false;
    default:
      return n === 1;
  }
}

/** Plural-aware translate: picks `${base}_one` or `${base}_other`; `{n}` is the count. */
export function tn(base: PluralBase, n: number, params?: Params): string {
  const key = `${base}_${isOne(current.lang, n) ? 'one' : 'other'}` as keyof Messages;
  return t(key, { n, ...params });
}

/** "A, B and C" in the current language. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(t('list_sep'))}${t('list_and')}${items[items.length - 1]}`;
}
