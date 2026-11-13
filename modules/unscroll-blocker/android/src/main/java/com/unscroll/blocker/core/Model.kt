package com.unscroll.blocker.core

/** Mirrors src/core/types.ts. */
enum class Surface(val key: String) {
  FEED("feed"), REELS("reels"), EXPLORE("explore"), STORIES("stories");

  companion object {
    fun from(key: String?): Surface? = values().firstOrNull { it.key == key }
  }
}

data class Schedule(val id: String, val name: String, val days: Int, val startMin: Int, val endMin: Int) {
  fun toJson(): Map<String, Any?> =
    mapOf("id" to id, "name" to name, "days" to days, "startMin" to startMin, "endMin" to endMin)
}

/**
 * [waitHours]: how long any loosening waits, chosen by the user (0–168).
 * Raising it is stricter; lowering it needs a matured WAIT_SHORTEN grant.
 */
data class Policy(
  val surfaces: Map<Surface, Boolean>,
  val schedules: List<Schedule>,
  val waitHours: Int = Limits.DEFAULT_WAIT_HOURS,
) {
  fun blocks(s: Surface): Boolean = surfaces[s] == true

  val waitMs: Long get() = waitHours * Limits.HOUR

  fun toJson(): Map<String, Any?> = mapOf(
    "surfaces" to Surface.values().associate { it.key to blocks(it) },
    "schedules" to schedules.map { it.toJson() },
    "waitHours" to waitHours,
  )

  companion object {
    /**
     * Nothing hidden outside focus unless the user turns it on (mirrors
     * DEFAULT_POLICY in engine.ts). Focus always locks the whole app.
     */
    val DEFAULT = Policy(Surface.values().associateWith { false }, emptyList())

    /** Strict structural parse; returns null on anything unexpected. */
    fun fromJson(v: Any?): Policy? {
      val m = v.asMap() ?: return null
      val sm = m["surfaces"].asMap() ?: return null
      val surfaces = HashMap<Surface, Boolean>()
      for (s in Surface.values()) surfaces[s] = sm[s.key].asBoolOrNull() ?: return null
      val list = m["schedules"].asList() ?: return null
      if (list.size > Limits.MAX_SCHEDULES) return null
      val schedules = ArrayList<Schedule>()
      for (item in list) schedules.add(ScheduleRules.parse(item) ?: return null)
      if (schedules.map { it.id }.toSet().size != schedules.size) return null
      // Not present in older saved state: the default (no wait).
      val wait = if (m.containsKey("waitHours")) m["waitHours"].asIntOrNull()?.takeIf { it in 0..Limits.MAX_WAIT_HOURS } ?: return null
        else Limits.DEFAULT_WAIT_HOURS
      return Policy(surfaces, schedules, wait)
    }
  }
}

enum class GrantKind(val key: String) {
  SURFACE_OFF("surface-off"), SCHEDULE_DELETE("schedule-delete"), SCHEDULE_EDIT("schedule-edit"),
  WAIT_SHORTEN("wait-shorten");

  companion object {
    fun from(key: String?): GrantKind? = values().firstOrNull { it.key == key }
  }
}

/**
 * A loosening request. Maturity is measured by [waitedMs], accumulated from the
 * monotonic clock (see WaitRules), so moving the wall clock never shortens it.
 */
data class Grant(
  val id: String,
  val kind: GrantKind,
  val surface: Surface?,
  val scheduleId: String?,
  val waitedMs: Long,
  val lastMono: Long?,
  val lastBootId: String?,
  /** WAIT_SHORTEN: the lowest waiting time this grant allows. */
  val waitHours: Int? = null,
) {
  fun toJson(): Map<String, Any?> = mapOf(
    "id" to id, "kind" to kind.key, "surface" to surface?.key, "scheduleId" to scheduleId,
    "waitedMs" to waitedMs, "lastMono" to lastMono, "lastBootId" to lastBootId, "waitHours" to waitHours,
  )

  companion object {
    private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")

    /** Parse a grant request from the app; the wait starts at the enforcer's own clock reading. */
    fun parseRequest(v: Any?, monoMs: Long?, bootId: String?): Grant? {
      val m = v.asMap() ?: return null
      val id = m["id"].asStringOrNull()?.takeIf { ID.matches(it) } ?: return null
      val kind = GrantKind.from(m["kind"].asStringOrNull()) ?: return null
      return when (kind) {
        GrantKind.SURFACE_OFF -> {
          val s = Surface.from(m["surface"].asStringOrNull()) ?: return null
          Grant(id, kind, s, null, 0, monoMs, bootId)
        }
        GrantKind.WAIT_SHORTEN -> {
          val h = m["waitHours"].asIntOrNull()?.takeIf { it in 0..Limits.MAX_WAIT_HOURS } ?: return null
          Grant(id, kind, null, null, 0, monoMs, bootId, h)
        }
        else -> {
          val sid = m["scheduleId"].asStringOrNull()?.takeIf { ID.matches(it) } ?: return null
          Grant(id, kind, null, sid, 0, monoMs, bootId)
        }
      }
    }

    fun fromJson(v: Any?): Grant? {
      val m = v.asMap() ?: return null
      val waited = m["waitedMs"].asLongOrNull()?.takeIf { it >= 0 } ?: return null
      val base = parseRequest(m, m["lastMono"].asLongOrNull(), m["lastBootId"].asStringOrNull()) ?: return null
      return base.copy(waitedMs = waited)
    }
  }
}

data class ClockSample(
  val wallMs: Long,
  val monoMs: Long,
  val bootId: String,
  val networkMs: Long?,
  val wallTrusted: Boolean,
)

data class ClockState(val anchorMono: Long, val anchorTrusted: Long, val bootId: String, val lastTrusted: Long) {
  fun toJson(): Map<String, Any?> =
    mapOf("anchorMono" to anchorMono, "anchorTrusted" to anchorTrusted, "bootId" to bootId, "lastTrusted" to lastTrusted)

  companion object {
    fun fromJson(v: Any?): ClockState? {
      val m = v.asMap() ?: return null
      return ClockState(
        m["anchorMono"].asLongOrNull() ?: return null,
        m["anchorTrusted"].asLongOrNull() ?: return null,
        m["bootId"].asStringOrNull() ?: return null,
        m["lastTrusted"].asLongOrNull() ?: return null,
      )
    }
  }
}

data class SessionState(
  val id: String,
  val durationMs: Long,
  val consumedMs: Long,
  val lastMono: Long,
  val lastBootId: String,
  val completed: Boolean,
) {
  val remainingMs: Long get() = if (completed) 0 else maxOf(0, durationMs - consumedMs)

  fun toJson(): Map<String, Any?> = mapOf(
    "id" to id, "durationMs" to durationMs, "consumedMs" to consumedMs,
    "lastMono" to lastMono, "lastBootId" to lastBootId, "completed" to completed,
  )

  companion object {
    fun fromJson(v: Any?): SessionState? {
      val m = v.asMap() ?: return null
      val s = SessionState(
        m["id"].asStringOrNull() ?: return null,
        m["durationMs"].asLongOrNull() ?: return null,
        m["consumedMs"].asLongOrNull() ?: return null,
        m["lastMono"].asLongOrNull() ?: return null,
        m["lastBootId"].asStringOrNull() ?: return null,
        m["completed"].asBoolOrNull() ?: return null,
      )
      if (s.durationMs <= 0 || s.consumedMs < 0) return null
      return s
    }
  }
}

object Limits {
  const val MINUTE = 60_000L
  const val HOUR = 60 * MINUTE
  const val DAY = 24 * HOUR
  /** Loosening is instant outside focus (mirrors DEFAULT_WAIT_HOURS in constants.ts). */
  const val DEFAULT_WAIT_HOURS = 0
  const val MAX_WAIT_HOURS = 168
  const val COOLING_OFF_MS = DEFAULT_WAIT_HOURS * HOUR
  const val MIN_SESSION_MS = 15 * MINUTE
  const val MAX_SESSION_MS = 12 * HOUR
  const val MAX_SCHEDULES = 20
  const val MAX_GRANTS = 50
  const val MINUTES_PER_DAY = 1440
  const val MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY
}

data class LocalTime(val dow: Int, val minute: Int)
