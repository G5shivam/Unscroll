import type { Env } from './engine';
import type { LocalTime } from './schedule';

let counter = 0;

/** Collision-resistant id without needing crypto: time + counter + random. */
export function newId(): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${Date.now().toString(36)}${counter.toString(36)}${rand}`.slice(0, 32);
}

export function toLocal(ms: number): LocalTime {
  const d = new Date(ms);
  return { dow: d.getDay(), minute: d.getHours() * 60 + d.getMinutes() };
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const realEnv: Env = { toLocal, dayKey, newId };
