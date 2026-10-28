package com.unscroll.blocker.core

/** Mirrors src/core/schedule.ts. Verified against shared-test-vectors. */
object ScheduleRules {
  private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")

  fun hasDay(days: Int, dow: Int): Boolean = ((days shr dow) and 1) == 1

  fun isOvernight(s: Schedule): Boolean = s.endMin <= s.startMin

  fun windowLength(s: Schedule): Int =
    if (isOvernight(s)) Limits.MINUTES_PER_DAY - s.startMin + s.endMin else s.endMin - s.startMin

  /** Minutes until the active window ends, or -1 when the schedule is inactive. */
  fun minutesUntilEnd(s: Schedule, t: LocalTime): Int {
    if (!isOvernight(s)) {
      return if (hasDay(s.days, t.dow) && t.minute >= s.startMin && t.minute < s.endMin) s.endMin - t.minute else -1
    }
    if (hasDay(s.days, t.dow) && t.minute >= s.startMin) return Limits.MINUTES_PER_DAY - t.minute + s.endMin
    val prev = (t.dow + 6) % 7
    if (hasDay(s.days, prev) && t.minute < s.endMin) return s.endMin - t.minute
    return -1
  }

  fun coverage(s: Schedule): BooleanArray {
    val map = BooleanArray(Limits.MINUTES_PER_WEEK)
    val len = windowLength(s)
    for (d in 0 until 7) {
      if (!hasDay(s.days, d)) continue
      val base = d * Limits.MINUTES_PER_DAY + s.startMin
      for (i in 0 until len) map[(base + i) % Limits.MINUTES_PER_WEEK] = true
    }
    return map
  }

  fun coversSuperset(prev: Schedule, next: Schedule): Boolean {
    val a = coverage(prev)
    val b = coverage(next)
    for (i in a.indices) if (a[i] && !b[i]) return false
    return true
  }

  /** Strict validation matching validateSchedule() in TypeScript. */
  fun parse(v: Any?): Schedule? {
    val m = v.asMap() ?: return null
    val id = m["id"].asStringOrNull()?.takeIf { ID.matches(it) } ?: return null
    val rawName = m["name"].asStringOrNull() ?: return null
    val name = rawName.filter { it >= ' ' && it != '\u007f' }.trim()
    if (name.isEmpty() || name.length > 40) return null
    val days = m["days"].asIntOrNull()?.takeIf { it in 1..0b1111111 } ?: return null
    val start = m["startMin"].asIntOrNull()?.takeIf { it in 0 until Limits.MINUTES_PER_DAY } ?: return null
    val end = m["endMin"].asIntOrNull()?.takeIf { it in 0 until Limits.MINUTES_PER_DAY } ?: return null
    if (start == end) return null
    val s = Schedule(id, name, days, start, end)
    if (windowLength(s) < 15) return null
    return s
  }
}
