export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/** PRD supporting rule: loosening changes wait 24 hours. */
export const COOLING_OFF_MS = 24 * HOUR;

/** PRD FR-3: one-off sessions are 15 minutes to 12 hours. */
export const MIN_SESSION_MS = 15 * MINUTE;
export const MAX_SESSION_MS = 12 * HOUR;

export const MAX_SCHEDULES = 20;
export const MAX_SCHEDULE_NAME = 40;
export const MAX_PENDING = 50;
export const MAX_SESSION_HISTORY = 60;
export const MAX_ESCAPES = 100;
export const STATS_RETENTION_DAYS = 90;

export const ALL_DAYS = 0b1111111;
export const WEEKDAYS = 0b0111110;
export const WEEKEND = 0b1000001;
