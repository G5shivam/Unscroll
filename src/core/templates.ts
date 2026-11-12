import { ALL_DAYS, WEEKDAYS } from './constants';
import type { Schedule } from './types';

export type TemplateKey = 'sleep' | 'morning' | 'study' | 'evening';

/** Times only; the name and "why" text are translated in the UI (tpl_<key>_name / _why). */
export interface ScheduleTemplate {
  key: TemplateKey;
  days: number;
  startMin: number;
  endMin: number;
}

/** Ready-made schedules aimed at the times scrolling costs the most. */
export const TEMPLATES: readonly ScheduleTemplate[] = [
  {
    key: 'sleep',
    days: ALL_DAYS,
    startMin: 22 * 60 + 30,
    endMin: 7 * 60,
  },
  {
    key: 'morning',
    days: ALL_DAYS,
    startMin: 7 * 60,
    endMin: 8 * 60,
  },
  {
    key: 'study',
    days: WEEKDAYS,
    startMin: 9 * 60,
    endMin: 13 * 60,
  },
  {
    key: 'evening',
    days: ALL_DAYS,
    startMin: 19 * 60 + 30,
    endMin: 20 * 60 + 30,
  },
];

export function templateByKey(key: unknown): ScheduleTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

export function scheduleFromTemplate(t: ScheduleTemplate, id: string, name: string): Schedule {
  return { id, name, days: t.days, startMin: t.startMin, endMin: t.endMin };
}
