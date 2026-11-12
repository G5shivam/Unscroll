import { render, screen } from '@testing-library/react-native';
import { HOUR, MINUTE } from '../src/core/constants';
import { joinList, LANGUAGES, locale, pickLanguage, setLocale, t, tn } from '../src/i18n';
import { de } from '../src/i18n/locales/de';
import { en } from '../src/i18n/locales/en';
import { es } from '../src/i18n/locales/es';
import { fr } from '../src/i18n/locales/fr';
import { hi } from '../src/i18n/locales/hi';
import { id } from '../src/i18n/locales/id';
import { pt } from '../src/i18n/locales/pt';
import { formatDays, formatDuration, formatMinuteOfDay, formatRange, formatUntil } from '../src/ui/format';
import { LockPanel } from '../src/ui/LockPanel';

const CATALOGS = { en, hi, es, pt, fr, de, id } as const;
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

afterEach(() => setLocale({ lang: 'en', tag: 'en-IN', uses24h: false }));

describe('catalogs', () => {
  test('every shipped language has a catalog', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...LANGUAGES].sort());
  });

  test.each(Object.entries(CATALOGS))('%s: same keys as English, none empty', (_lang, cat) => {
    expect(Object.keys(cat).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(cat)) expect([k, v.trim().length > 0]).toEqual([k, true]);
  });

  test.each(Object.entries(CATALOGS))('%s: placeholders match English exactly', (_lang, cat) => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect([k, placeholders(cat[k])]).toEqual([k, placeholders(en[k])]);
    }
  });

  test.each(Object.entries(CATALOGS))('%s: day lists have 7 entries', (_lang, cat) => {
    expect(cat.day_letters.split(',')).toHaveLength(7);
    expect(cat.day_short.split(',')).toHaveLength(7);
    expect(cat.day_names.split(',')).toHaveLength(7);
  });

  test('brand and surface names stay recognisable', () => {
    for (const cat of Object.values(CATALOGS)) {
      expect(cat.lock_title).toContain('Instagram');
      expect(cat.version).toContain('Unscroll');
    }
  });
});

describe('language detection', () => {
  test.each([
    [['es-MX', 'en-US'], 'es'],
    [['pt-BR'], 'pt'],
    [['in-ID'], 'id'], // older Android code for Indonesian
    [['id_ID'], 'id'],
    [['ja-JP', 'de-AT'], 'de'], // first supported language wins
    [['ja-JP'], 'en'], // unsupported falls back to English
    [[null, undefined, ''], 'en'],
  ] as const)('%j -> %s', (tags, lang) => expect(pickLanguage([...tags])).toBe(lang));

  test('a build without the native module falls back to Intl instead of crashing', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-localization', () => {
        throw new Error("Cannot find native module 'ExpoLocalization'");
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const i18n = require('../src/i18n') as typeof import('../src/i18n');
      expect(LANGUAGES).toContain(i18n.locale.lang);
      expect(i18n.t('close').length).toBeGreaterThan(0);
    });
    jest.dontMock('expo-localization');
  });

  test('tests run in English with a 12-hour clock', () => {
    expect(locale.lang).toBe('en');
    expect(locale.uses24h).toBe(false);
  });
});

describe('translation and plurals', () => {
  test('fills placeholders', () => {
    expect(t('step', { n: 2, total: 3 })).toBe('Step 2 of 3');
  });

  test('English plurals', () => {
    expect(tn('times', 1)).toBe('1 time');
    expect(tn('times', 3)).toBe('3 times');
    expect(tn('days', 0)).toBe('0 days');
  });

  test('French and Hindi treat 0 as singular; Indonesian has no plural', () => {
    setLocale({ lang: 'fr' });
    expect(tn('days', 0)).toBe('0 jour');
    expect(tn('days', 2)).toBe('2 jours');
    setLocale({ lang: 'id' });
    expect(tn('days', 1)).toBe('1 hari');
  });

  test('lists use the language’s conjunction', () => {
    setLocale({ lang: 'es' });
    expect(joinList(['Inicio', 'Reels', 'Explorar'])).toBe('Inicio, Reels y Explorar');
  });
});

describe('formatting follows the locale', () => {
  test('English (India): 12-hour clock as before', () => {
    expect(formatMinuteOfDay(13 * 60 + 5)).toBe('1:05 pm');
    expect(formatRange(1380, 420)).toBe('11:00 pm – 7:00 am (next day)');
  });

  test('German: 24-hour clock, German units and days', () => {
    setLocale({ lang: 'de', tag: 'de-DE', uses24h: true });
    expect(formatMinuteOfDay(13 * 60 + 5)).toBe('13:05');
    expect(formatMinuteOfDay(7 * 60)).toBe('07:00');
    expect(formatDuration(90 * MINUTE)).toBe('1 Std. 30 Min.');
    expect(formatDays(127)).toBe('Jeden Tag');
    expect(formatDays(0b0001010)).toBe('Mo, Mi');
    expect(formatUntil(2 * HOUR, 0)).toBe('in 2 Std.');
  });

  test('12-hour clock respects the phone setting in any language', () => {
    setLocale({ lang: 'es', uses24h: false });
    expect(formatMinuteOfDay(21 * 60 + 30)).toBe('9:30 p. m.');
  });
});

describe('screens render translated', () => {
  test('LockPanel in Hindi', async () => {
    setLocale({ lang: 'hi', tag: 'hi-IN', uses24h: false });
    await render(
      <LockPanel focus={{ active: false }} surfaces={{ feed: true, reels: true, explore: false, stories: false }} schedules={[]} />,
    );
    expect(screen.getByText('फ़ीड और रील्स छिपे हैं')).toBeTruthy();
    expect(screen.getByText('Instagram खुला है')).toBeTruthy();
  });
});
