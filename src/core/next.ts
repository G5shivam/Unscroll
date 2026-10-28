import { DAY, MINUTE } from './constants';
import { hasDay, type LocalTime } from './schedule';
import type { Schedule } from './types';

/** The next time any schedule starts, strictly after `now`. */
export function nextStart(
  schedules: Schedule[],
  now: number,
  toLocal: (ms: number) => LocalTime,
): { schedule: Schedule; startsAt: number } | null {
  const local = toLocal(now);
  const startOfToday = now - local.minute * MINUTE - (((now % MINUTE) + MINUTE) % MINUTE);
  let best: { schedule: Schedule; startsAt: number } | null = null;
  for (const s of schedules) {
    for (let offset = 0; offset <= 7; offset++) {
      const dow = (local.dow + offset) % 7;
      if (!hasDay(s.days, dow)) continue;
      if (offset === 0 && s.startMin <= local.minute) continue;
      const startsAt = startOfToday + offset * DAY + s.startMin * MINUTE;
      if (!best || startsAt < best.startsAt) best = { schedule: s, startsAt };
      break;
    }
  }
  return best;
}
