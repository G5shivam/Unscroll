import { ALL_DAYS, WEEKDAYS, WEEKEND } from '../core/constants';
import { locale, t } from '../i18n';

/** Day names for the current language, Sunday first. */
export const dayLetters = (): string[] => t('day_letters').split(',');
export const dayShort = (): string[] => t('day_short').split(',');
export const dayNames = (): string[] => t('day_names').split(',');

/** 13:05 -> "1:05 pm" or "13:05", following the phone's 12/24-hour setting. */
export function formatMinuteOfDay(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = String(min % 60).padStart(2, '0');
  if (locale.uses24h) return `${String(h).padStart(2, '0')}:${m}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${t(h < 12 ? 'am' : 'pm')}`;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return formatMinuteOfDay(d.getHours() * 60 + d.getMinutes());
}

export function formatRange(startMin: number, endMin: number): string {
  const overnight = endMin <= startMin;
  return `${formatMinuteOfDay(startMin)} – ${formatMinuteOfDay(endMin)}${overnight ? t('range_next_day') : ''}`;
}

export function formatDays(days: number): string {
  if (days === ALL_DAYS) return t('days_every');
  if (days === WEEKDAYS) return t('days_weekdays');
  if (days === WEEKEND) return t('days_weekends');
  const picked = dayShort().filter((_, i) => (days >> i) & 1);
  return picked.join(t('list_sep'));
}

/** 5_400_000 -> "1 h 30 min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return t('dur_min', { m });
  if (m === 0) return t('dur_h', { h });
  return t('dur_h_min', { h, m });
}

/** Countdown parts, always two digits, for the big lock display. */
export function countdownParts(ms: number): { h: string; m: string; s: string } {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { h: String(h).padStart(2, '0'), m: String(m).padStart(2, '0'), s: String(s).padStart(2, '0') };
}

/** "in 23 h 40 min" style text for cooling-off countdowns. */
export function formatUntil(target: number, now: number): string {
  const ms = target - now;
  if (ms <= 60_000) return t('until_soon');
  return t('until', { d: formatDuration(ms) });
}

/** Localised calendar date, e.g. "Wednesday, 11 November". */
export function formatDate(ms: number, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Date(ms).toLocaleDateString(locale.tag, opts);
  } catch {
    return new Date(ms).toDateString();
  }
}
