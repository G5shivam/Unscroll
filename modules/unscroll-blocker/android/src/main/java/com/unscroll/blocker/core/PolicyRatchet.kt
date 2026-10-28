package com.unscroll.blocker.core

/**
 * The lock ratchet. Mirrors src/core/ratchet.ts.
 *
 * Stricter changes always pass. Every looser change needs a grant for exactly
 * that surface/schedule that the ENFORCER registered and that has waited at
 * least 24 hours of real (monotonic) time, and is refused while Focus is active.
 */
object PolicyRatchet {
  data class Decision(val ok: Boolean, val reason: String? = null)

  fun matured(g: Grant) = g.waitedMs >= Limits.COOLING_OFF_MS

  fun check(current: Policy, incoming: Policy, grants: List<Grant>, focusActive: Boolean): Decision {
    fun granted(pred: (Grant) -> Boolean) = grants.any { pred(it) && matured(it) }

    for (s in Surface.values()) {
      if (current.blocks(s) && !incoming.blocks(s)) {
        if (focusActive) return Decision(false, "focus active: cannot unblock ${s.key}")
        if (!granted { it.kind == GrantKind.SURFACE_OFF && it.surface == s }) {
          return Decision(false, "no matured grant to unblock ${s.key}")
        }
      }
    }
    for (cur in current.schedules) {
      val next = incoming.schedules.firstOrNull { it.id == cur.id }
      if (next != null && ScheduleRules.coversSuperset(cur, next)) continue
      if (focusActive) return Decision(false, "focus active: cannot loosen schedule ${cur.id}")
      val kinds = if (next != null) setOf(GrantKind.SCHEDULE_EDIT, GrantKind.SCHEDULE_DELETE) else setOf(GrantKind.SCHEDULE_DELETE)
      if (!granted { it.kind in kinds && it.scheduleId == cur.id }) {
        return Decision(false, "no matured grant to loosen schedule ${cur.id}")
      }
    }
    return Decision(true)
  }
}
