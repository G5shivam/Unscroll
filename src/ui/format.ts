import { ALL_DAYS, WEEKDAYS, WEEKEND } from '../core/constants';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 13:05 -> "1:05 pm". Uses a 12-hour clock, the common convention in India. */
export function formatMinuteOfDay(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return formatMinuteOfDay(d.getHours() * 60 + d.getMinutes());
}

export function formatRange(startMin: number, endMin: number): string {
  const overnight = endMin <= startMin;
  return `${formatMinuteOfDay(startMin)} – ${formatMinuteOfDay(endMin)}${overnight ? ' (next day)' : ''}`;
}

export function formatDays(days: number): string {
  if (days === ALL_DAYS) return 'Every day';
  if (days === WEEKDAYS) return 'Weekdays';
  if (days === WEEKEND) return 'Weekends';
  const picked = DAY_SHORT.filter((_, i) => (days >> i) & 1);
  return picked.join(', ');
}

/** 5_400_000 -> "1 h 30 min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
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
  if (ms <= 60_000) return 'in under a minute';
  return `in ${formatDuration(ms)}`;
}

export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
