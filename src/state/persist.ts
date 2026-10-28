import { initialState } from '../core/engine';
import { isPolicyShape } from '../core/ratchet';
import { validateSchedule } from '../core/schedule';
import type { AppState, PendingChange, Session } from '../core/types';

export const STORAGE_KEY = 'unscroll.state.v1';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length <= max;

function numRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isNum(n) && n >= 0) out[k] = n;
  }
  return out;
}

function parseSession(v: unknown): Session | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (!isStr(s.id) || !isNum(s.durationMs) || !isNum(s.consumedMs) || !isNum(s.lastMono)) return null;
  if (!isStr(s.lastBootId, 128) || !isNum(s.startedAt) || typeof s.completed !== 'boolean') return null;
  if (s.consumedMs < 0 || s.durationMs <= 0) return null;
  return {
    id: s.id,
    durationMs: s.durationMs,
    consumedMs: Math.min(s.consumedMs, s.durationMs),
    lastMono: s.lastMono,
    lastBootId: s.lastBootId,
    startedAt: s.startedAt,
    completed: s.completed,
  };
}

function parsePending(v: unknown): PendingChange | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  if (!isStr(p.id) || !isNum(p.requestedAt) || !isNum(p.effectiveAt)) return null;
  if (p.kind !== 'surface-off' && p.kind !== 'schedule-delete' && p.kind !== 'schedule-edit') return null;
  // Never trust a stored effectiveAt that is earlier than the cooling-off rule allows.
  const effectiveAt = Math.max(p.effectiveAt, p.requestedAt + 24 * 3_600_000);
  const waitedMs = isNum(p.waitedMs) && p.waitedMs >= 0 ? Math.min(p.waitedMs, 365 * 24 * 3_600_000) : 0;
  const out: PendingChange = {
    id: p.id,
    kind: p.kind,
    requestedAt: p.requestedAt,
    effectiveAt,
    waitedMs,
    lastMono: isNum(p.lastMono) ? p.lastMono : null,
    lastBootId: isStr(p.lastBootId, 128) ? p.lastBootId : null,
  };
  if (p.kind === 'surface-off') {
    if (!['feed', 'reels', 'explore', 'stories'].includes(p.surface as string)) return null;
    out.surface = p.surface as PendingChange['surface'];
  } else {
    if (!isStr(p.scheduleId)) return null;
    out.scheduleId = p.scheduleId;
    if (p.kind === 'schedule-edit') {
      const v2 = validateSchedule(p.next);
      if (!v2.ok || v2.value.id !== p.scheduleId) return null;
      out.next = v2.value;
    }
  }
  return out;
}

/**
 * Parse persisted state defensively. Anything malformed is dropped; the
 * result is always a structurally valid AppState.
 */
export function parseState(raw: string | null): AppState {
  const base = initialState();
  if (!raw) return base;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return base;
  }
  if (typeof data !== 'object' || data === null) return base;
  const d = data as Record<string, unknown>;
  if (d.version !== 1) return base;

  const state: AppState = { ...base };
  state.onboarded = d.onboarded === true;
  state.consentAt = isNum(d.consentAt) ? d.consentAt : null;
  if (isPolicyShape(d.policy)) {
    const schedules = d.policy.schedules
      .map((s) => validateSchedule(s))
      .flatMap((r) => (r.ok ? [r.value] : []))
      .slice(0, 20);
    state.policy = { surfaces: { ...d.policy.surfaces }, schedules };
  }
  state.pending = Array.isArray(d.pending)
    ? d.pending.map(parsePending).filter((x): x is PendingChange => x !== null)
    : [];
  state.sessions = Array.isArray(d.sessions)
    ? d.sessions.map(parseSession).filter((x): x is Session => x !== null)
    : [];
  state.windowLocks = Array.isArray(d.windowLocks)
    ? d.windowLocks.map(parseSession).filter((x): x is Session => x !== null).slice(-40)
    : [];
  const c = d.clock as Record<string, unknown> | null | undefined;
  state.clock =
    c && isNum(c.anchorMono) && isNum(c.anchorTrusted) && isStr(c.bootId, 128) && isNum(c.lastTrusted)
      ? { anchorMono: c.anchorMono, anchorTrusted: c.anchorTrusted, bootId: c.bootId, lastTrusted: c.lastTrusted }
      : null;
  const st = (d.stats ?? {}) as Record<string, unknown>;
  state.stats = { blocks: numRecord(st.blocks), focusMinutes: numRecord(st.focusMinutes) };
  state.escapes = Array.isArray(d.escapes)
    ? d.escapes
        .filter(
          (e): e is AppState['escapes'][number] =>
            typeof e === 'object' &&
            e !== null &&
            ((e as { kind: unknown }).kind === 'uninstall' || (e as { kind: unknown }).kind === 'permission-revoked') &&
            isNum((e as { at: unknown }).at) &&
            typeof (e as { duringFocus: unknown }).duringFocus === 'boolean',
        )
        .slice(-100)
    : [];
  const sk = (d.streak ?? {}) as Record<string, unknown>;
  state.streak = {
    current: isNum(sk.current) && sk.current >= 0 ? Math.floor(sk.current) : 0,
    best: isNum(sk.best) && sk.best >= 0 ? Math.floor(sk.best) : 0,
    lastDay: typeof sk.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sk.lastDay) ? sk.lastDay : null,
  };
  state.enforcementArmed = d.enforcementArmed === true;
  return state;
}

export function serializeState(state: AppState): string {
  return JSON.stringify(state);
}
