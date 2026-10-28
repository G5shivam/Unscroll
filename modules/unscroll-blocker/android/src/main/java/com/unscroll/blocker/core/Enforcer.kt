package com.unscroll.blocker.core

interface StateStore {
  fun load(): String?
  fun save(json: String)
}

interface ClockSource {
  fun sample(): ClockSample
  fun local(trustedMs: Long): LocalTime
}

data class FocusInfo(val active: Boolean, val remainingMs: Long, val source: String?)

/**
 * The Android enforcement state machine. Pure Kotlin (no Android imports) so
 * it is unit-tested on the JVM. The Accessibility service and the Expo module
 * both talk to the single instance of this class.
 *
 * Deliberately missing: any way to stop, pause or shorten a session or a
 * running schedule window, or to loosen the policy without a matured grant.
 *
 * Time model (mirrors src/core/engine.ts):
 *  - one-off sessions, running schedule windows ("window locks") and loosening
 *    grants all accumulate MONOTONIC time, so clock and time-zone changes can
 *    neither end a lock nor shorten the 24-hour wait;
 *  - the trusted wall clock is only used to decide when a schedule window starts.
 */
class Enforcer(private val store: StateStore, private val clock: ClockSource) {
  private var policy: Policy = Policy.DEFAULT
  /** False until the app has sent its first policy (set during onboarding). */
  private var policySet = false
  private var grants: List<Grant> = emptyList()
  private var session: SessionState? = null
  /** scheduleId -> monotonic lock for the window currently running. */
  private var windowLocks: Map<String, SessionState> = emptyMap()
  private var clockState: ClockState? = null
  private var blockCount = 0
  private var lastPersistMono: Long? = null

  init {
    load()
  }

  @Synchronized
  fun currentPolicy(): Policy = policy

  /** Advance clocks, sessions, window locks and grant waits; returns trusted now. */
  @Synchronized
  fun now(): Long {
    val s = clock.sample()
    val r = TrustedClock.read(clockState, s)
    clockState = r.state
    val t = r.trusted
    session = session?.let { SessionRules.tick(it, s.monoMs, s.bootId) }
    grants = grants.map { WaitRules.tick(it, s.monoMs, s.bootId) }

    // Running schedule windows become monotonic locks that can only grow.
    val ticked = windowLocks.mapValues { SessionRules.tick(it.value, s.monoMs, s.bootId) }.toMutableMap()
    val local = clock.local(t)
    val intoMinute = Math.floorMod(t, Limits.MINUTE)
    for (sch in policy.schedules) {
      val mins = ScheduleRules.minutesUntilEnd(sch, local)
      if (mins < 0) continue
      val rem = mins * Limits.MINUTE - intoMinute
      val live = ticked[sch.id]?.takeIf { it.remainingMs > 0 }
      ticked[sch.id] = when {
        live == null -> SessionState(sch.id, rem, 0, s.monoMs, s.bootId, false)
        live.remainingMs < rem -> live.copy(durationMs = live.consumedMs + rem)
        else -> live
      }
    }
    windowLocks = ticked.filterValues { it.remainingMs > 0 }

    val last = lastPersistMono
    if (last == null || s.monoMs < last || s.monoMs - last > PERSIST_EVERY_MS) {
      lastPersistMono = s.monoMs
      persist()
    }
    return t
  }

  @Synchronized
  fun focus(): FocusInfo {
    now()
    var best = FocusInfo(false, 0, null)
    session?.takeIf { it.remainingMs > 0 }?.let { best = FocusInfo(true, it.remainingMs, "session") }
    for (lock in windowLocks.values) {
      if (lock.remainingMs > best.remainingMs) best = FocusInfo(true, lock.remainingMs, "schedule")
    }
    return best
  }

  @Synchronized
  fun applyPolicy(policyJson: String, grantIdsJson: String): PolicyRatchet.Decision {
    val incoming = try {
      Policy.fromJson(MiniJson.parse(policyJson))
    } catch (e: MiniJson.ParseException) {
      null
    } ?: return PolicyRatchet.Decision(false, "malformed policy")
    val ids = try {
      MiniJson.parse(grantIdsJson).asList()?.mapNotNull { it.asStringOrNull() }?.toSet()
    } catch (e: MiniJson.ParseException) {
      null
    } ?: return PolicyRatchet.Decision(false, "malformed grant list")

    val active = focus().active
    // The very first policy (from onboarding) is accepted as-is, unless a lock is
    // already running; until then the fail-closed default applies.
    if (!policySet && !active) {
      policy = incoming
      policySet = true
      persist()
      return PolicyRatchet.Decision(true)
    }
    val usable = grants.filter { it.id in ids }
    val d = PolicyRatchet.check(policy, incoming, usable, active)
    if (!d.ok) return d
    // Consume only the grants this change actually relied on.
    val unblocked = Surface.values().filter { policy.blocks(it) && !incoming.blocks(it) }.toSet()
    val loosened = policy.schedules.filter { cur ->
      val next = incoming.schedules.firstOrNull { it.id == cur.id }
      next == null || !ScheduleRules.coversSuperset(cur, next)
    }.map { it.id }.toSet()
    grants = grants.filterNot { g ->
      g.id in ids && PolicyRatchet.matured(g) && (g.surface in unblocked || g.scheduleId in loosened)
    }
    policy = incoming
    policySet = true
    persist()
    return d
  }

  /** Register a loosening request. One grant per target; a new request restarts the wait. */
  @Synchronized
  fun registerGrant(grantJson: String): Boolean {
    now()
    val s = clock.sample()
    val g = try {
      Grant.parseRequest(MiniJson.parse(grantJson), s.monoMs, s.bootId)
    } catch (e: MiniJson.ParseException) {
      null
    } ?: return false
    val others = grants.filterNot {
      it.id == g.id || (g.surface != null && it.surface == g.surface) || (g.scheduleId != null && it.scheduleId == g.scheduleId)
    }
    if (others.size >= Limits.MAX_GRANTS) return false
    grants = others + g
    persist()
    return true
  }

  @Synchronized
  fun cancelGrant(id: String) {
    grants = grants.filterNot { it.id == id }
    persist()
  }

  @Synchronized
  fun startSession(id: String, durationMs: Long): PolicyRatchet.Decision {
    if (!ID.matches(id)) return PolicyRatchet.Decision(false, "invalid id")
    if (!SessionRules.isValidDuration(durationMs)) return PolicyRatchet.Decision(false, "invalid duration")
    now()
    val s = clock.sample()
    val cur = session
    session = if (cur != null && cur.remainingMs > 0) {
      if (durationMs <= cur.remainingMs) return PolicyRatchet.Decision(false, "would-shorten")
      cur.copy(durationMs = cur.consumedMs + durationMs)
    } else {
      SessionState(id, durationMs, 0, s.monoMs, s.bootId, false)
    }
    persist()
    return PolicyRatchet.Decision(true)
  }

  @Synchronized
  fun recordBlock() {
    if (blockCount < 100_000) blockCount++
    persist()
  }

  @Synchronized
  fun takeBlockCount(): Int {
    val n = blockCount
    blockCount = 0
    if (n > 0) persist()
    return n
  }

  @Synchronized
  fun grantsSnapshot(): List<Grant> = grants

  // --- persistence ---------------------------------------------------------

  private fun persist() {
    val json = MiniJson.stringify(
      mapOf(
        "v" to 2,
        "policy" to policy.toJson(),
        "policySet" to policySet,
        "grants" to grants.map { it.toJson() },
        "session" to session?.toJson(),
        "windows" to windowLocks.values.map { it.toJson() },
        "clock" to clockState?.toJson(),
        "blocks" to blockCount,
      ),
    )
    try {
      store.save(json)
    } catch (e: Exception) {
      // Keep enforcing from memory if storage fails.
    }
  }

  /**
   * Never throws: corrupt state falls back to the fail-closed defaults. If ANY
   * state existed, the "first policy" shortcut is disabled, so a corrupted file
   * can never let the app push a looser policy past the ratchet.
   */
  private fun load() {
    val raw = try {
      store.load()
    } catch (e: Exception) {
      null
    } ?: return
    policySet = true
    try {
      val m = MiniJson.parse(raw).asMap() ?: return
      if (m["v"].asIntOrNull() != 2) return
      Policy.fromJson(m["policy"])?.let {
        policy = it
        policySet = m["policySet"].asBoolOrNull() ?: true
      }
      grants = m["grants"].asList()?.mapNotNull { Grant.fromJson(it) }?.take(Limits.MAX_GRANTS) ?: emptyList()
      session = SessionState.fromJson(m["session"])
      windowLocks = m["windows"].asList()?.mapNotNull { SessionState.fromJson(it) }
        ?.filter { it.remainingMs > 0 }?.take(Limits.MAX_SCHEDULES)?.associateBy { it.id } ?: emptyMap()
      clockState = ClockState.fromJson(m["clock"])
      blockCount = m["blocks"].asIntOrNull()?.coerceIn(0, 100_000) ?: 0
    } catch (e: Exception) {
      policy = Policy.DEFAULT
      grants = emptyList()
      session = null
      windowLocks = emptyMap()
    }
  }

  companion object {
    private const val PERSIST_EVERY_MS = 15_000L
    private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")
  }
}
