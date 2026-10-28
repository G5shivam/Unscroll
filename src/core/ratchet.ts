import { COOLING_OFF_MS, MAX_SCHEDULES } from './constants';
import { coversSuperset, validateSchedule } from './schedule';
import { SURFACES, type PendingKind, type Policy, type Surface } from './types';

/**
 * A loosening request registered with the enforcer when the user asked for it.
 * It only authorises a change once it has matured (24 h) and no Focus is active.
 */
export interface LooseningGrant {
  id: string;
  kind: PendingKind;
  surface?: Surface;
  scheduleId?: string;
  /** Real time waited since the request (monotonic, see tickWait). */
  waitedMs: number;
}

export type RatchetDecision = { ok: true } | { ok: false; reason: string };

function matured(g: LooseningGrant): boolean {
  return Number.isFinite(g.waitedMs) && g.waitedMs >= COOLING_OFF_MS;
}

/**
 * The lock ratchet: decides whether `incoming` may replace `current`.
 *
 * Stricter changes (block more surfaces, add schedules, widen schedules) are
 * always allowed. Every looser change must be backed by a matured grant for
 * exactly that surface/schedule, and is refused outright while Focus is active.
 *
 * The native enforcer runs the same rules (see PolicyRatchet.kt), so even a
 * compromised or buggy JS layer cannot weaken an active lock.
 */
export function checkPolicyChange(
  current: Policy,
  incoming: Policy,
  grants: LooseningGrant[],
  focusActive: boolean,
): RatchetDecision {
  if (!isPolicyShape(incoming)) return { ok: false, reason: 'malformed policy' };
  if (incoming.schedules.length > MAX_SCHEDULES) return { ok: false, reason: 'too many schedules' };
  const ids = new Set<string>();
  for (const s of incoming.schedules) {
    const v = validateSchedule(s);
    if (!v.ok) return { ok: false, reason: `invalid schedule: ${v.reason}` };
    if (ids.has(s.id)) return { ok: false, reason: 'duplicate schedule id' };
    ids.add(s.id);
  }

  const granted = (pred: (g: LooseningGrant) => boolean) =>
    grants.some((g) => pred(g) && matured(g));

  for (const surface of SURFACES) {
    if (current.surfaces[surface] && !incoming.surfaces[surface]) {
      if (focusActive) return { ok: false, reason: `focus active: cannot unblock ${surface}` };
      if (!granted((g) => g.kind === 'surface-off' && g.surface === surface)) {
        return { ok: false, reason: `no matured grant to unblock ${surface}` };
      }
    }
  }

  for (const cur of current.schedules) {
    const next = incoming.schedules.find((s) => s.id === cur.id);
    if (next && coversSuperset(cur, next)) continue;
    if (focusActive) return { ok: false, reason: `focus active: cannot loosen schedule ${cur.id}` };
    const kinds: PendingKind[] = next ? ['schedule-edit', 'schedule-delete'] : ['schedule-delete'];
    if (!granted((g) => kinds.includes(g.kind) && g.scheduleId === cur.id)) {
      return { ok: false, reason: `no matured grant to loosen schedule ${cur.id}` };
    }
  }
  return { ok: true };
}

export function isPolicyShape(p: unknown): p is Policy {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  if (typeof o.surfaces !== 'object' || o.surfaces === null) return false;
  const s = o.surfaces as Record<string, unknown>;
  for (const k of SURFACES) if (typeof s[k] !== 'boolean') return false;
  return Array.isArray(o.schedules);
}
