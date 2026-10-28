package com.unscroll.blocker.core

/** Mirrors src/core/clock.ts — see that file for the threat model. */
object TrustedClock {
  data class Reading(val trusted: Long, val state: ClockState)

  fun read(prev: ClockState?, s: ClockSample): Reading {
    if (s.monoMs < 0 || s.bootId.isEmpty()) {
      val t = prev?.lastTrusted ?: 0L
      return Reading(t, prev ?: ClockState(s.monoMs, t, s.bootId, t))
    }
    if (prev == null) {
      val t = s.networkMs ?: s.wallMs
      return Reading(t, ClockState(s.monoMs, t, s.bootId, t))
    }
    val sameBoot = s.bootId == prev.bootId && s.monoMs >= prev.anchorMono
    if (sameBoot) {
      val t = maxOf(prev.lastTrusted, prev.anchorTrusted + (s.monoMs - prev.anchorMono))
      return Reading(t, prev.copy(lastTrusted = t))
    }
    val lowerBound = prev.lastTrusted + maxOf(0L, s.monoMs)
    val candidate = when {
      s.networkMs != null -> s.networkMs
      s.wallTrusted -> s.wallMs
      else -> lowerBound
    }
    val t = maxOf(candidate, prev.lastTrusted)
    return Reading(t, ClockState(s.monoMs, t, s.bootId, t))
  }
}

/** Mirrors src/core/session.ts. */
object SessionRules {
  fun tick(sess: SessionState, monoMs: Long, bootId: String): SessionState {
    if (sess.completed || monoMs < 0) return sess
    val sameBoot = bootId == sess.lastBootId && monoMs >= sess.lastMono
    val delta = if (sameBoot) monoMs - sess.lastMono else monoMs
    val consumed = minOf(sess.durationMs, sess.consumedMs + maxOf(0L, delta))
    return sess.copy(consumedMs = consumed, lastMono = monoMs, lastBootId = bootId, completed = consumed >= sess.durationMs)
  }

  fun isValidDuration(ms: Long): Boolean = ms in Limits.MIN_SESSION_MS..Limits.MAX_SESSION_MS
}

/** Mirrors tickWait() in src/core/session.ts: powered-off time never counts. */
object WaitRules {
  fun tick(g: Grant, monoMs: Long, bootId: String): Grant {
    if (monoMs < 0) return g
    val last = g.lastMono
    if (last == null || g.lastBootId == null) return g.copy(lastMono = monoMs, lastBootId = bootId)
    val sameBoot = bootId == g.lastBootId && monoMs >= last
    val delta = if (sameBoot) monoMs - last else monoMs
    return g.copy(waitedMs = g.waitedMs + maxOf(0L, delta), lastMono = monoMs, lastBootId = bootId)
  }
}
