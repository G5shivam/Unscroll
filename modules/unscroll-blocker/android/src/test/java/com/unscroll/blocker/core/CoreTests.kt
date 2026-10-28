package com.unscroll.blocker.core

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM tests for the Android enforcement core (no Android SDK needed).
 * Runs the SAME shared-test-vectors as the TypeScript engine, plus
 * Android-specific classifier and enforcer cases.
 */
var passed = 0
val failures = mutableListOf<String>()

fun check(name: String, cond: Boolean, detail: () -> String = { "" }) {
  if (cond) passed++ else failures.add("$name ${detail()}")
}

/** Gradle runs unit tests from the module dir (modules/unscroll-blocker/android). */
fun vectorsDir(): File =
  System.getProperty("vectors.dir")?.let { File(it) }
    ?: listOf("../../../shared-test-vectors", "shared-test-vectors").map { File(it) }.first { it.isDirectory }

fun vectors(name: String): Map<String, Any?> =
  MiniJson.parse(File(vectorsDir(), name).readText()).asMapX()

@Suppress("UNCHECKED_CAST")
fun Any?.asMapX(): Map<String, Any?> = this as Map<String, Any?>
@Suppress("UNCHECKED_CAST")
fun Any?.asListX(): List<Any?> = this as List<Any?>
fun Any?.l(): Long = (this as Double).toLong()
fun Any?.i(): Int = (this as Double).toInt()

fun sampleOf(m: Map<String, Any?>) = ClockSample(
  m["wallMs"].l(), m["monoMs"].l(), m["bootId"] as String, (m["networkMs"] as Double?)?.toLong(), m["wallTrusted"] as Boolean,
)

fun scheduleVectors() {
  val v = vectors("schedule.json")
  val sch = v["schedules"].asMapX().mapValues { ScheduleRules.parse(it.value)!! }
  for (c in v["minutesUntilEnd"].asListX().map { it.asMapX() }) {
    val got = ScheduleRules.minutesUntilEnd(sch[c["s"]]!!, LocalTime(c["dow"].i(), c["minute"].i()))
    check("minutesUntilEnd $c", got == c["expect"].i()) { "got $got" }
  }
  for (c in v["coversSuperset"].asListX().map { it.asMapX() }) {
    val got = ScheduleRules.coversSuperset(sch[c["prev"]]!!, ScheduleRules.parse(c["next"])!!)
    check("coversSuperset $c", got == c["expect"]) { "got $got" }
  }
  for (c in v["validate"].asListX().map { it.asMapX() }) {
    val r = ScheduleRules.parse(c["input"])
    check("validate ${c["input"]}", (r != null) == c["ok"]) { "got $r" }
    if (r != null && c.containsKey("name")) check("validate name", r.name == c["name"]) { "got ${r.name}" }
  }
}

fun clockVectors() {
  for (seq in vectors("clock.json")["sequences"].asListX().map { it.asMapX() }) {
    var state: ClockState? = null
    for (step in seq["steps"].asListX().map { it.asMapX() }) {
      val r = TrustedClock.read(state, sampleOf(step["sample"].asMapX()))
      check("clock ${seq["name"]}", r.trusted == step["expect"].l()) { "got ${r.trusted}" }
      state = r.state
    }
  }
}

fun sessionVectors() {
  for (seq in vectors("session.json")["sequences"].asListX().map { it.asMapX() }) {
    var s = SessionState.fromJson(seq["start"])!!
    for (t in seq["ticks"].asListX().map { it.asMapX() }) {
      s = SessionRules.tick(s, t["monoMs"].l(), t["bootId"] as String)
      check("session ${seq["name"]}", s.consumedMs == t["consumedMs"].l() && s.completed == t["completed"]) { "got $s" }
    }
  }
}

@Suppress("UNCHECKED_CAST")
fun ratchetVectors() {
  val v = vectors("ratchet.json")
  val current = Policy.fromJson(v["current"])!!
  for (c in v["cases"].asListX().map { it.asMapX() }) {
    val inc = (MiniJson.parse(MiniJson.stringify(v["current"])) as Map<String, Any?>).toMutableMap()
    val surfaces = (inc["surfaces"] as Map<String, Any?>).toMutableMap()
    var schedules = (inc["schedules"] as List<Any?>).toMutableList()
    c["patch"]?.asMapX()?.get("surfaces")?.asMapX()?.forEach { (k, value) -> surfaces[k] = value }
    c["addSchedule"]?.let { schedules.add(it) }
    c["removeSchedule"]?.let { id -> schedules = schedules.filterNot { it.asMapX()["id"] == id }.toMutableList() }
    c["replaceSchedule"]?.let { r -> schedules = schedules.map { if (it.asMapX()["id"] == r.asMapX()["id"]) r else it }.toMutableList() }
    inc["surfaces"] = surfaces
    inc["schedules"] = schedules
    val grants = c["grants"].asListX().map { Grant.fromJson(it)!! }
    val incoming = Policy.fromJson(inc)
    val ok = incoming != null && PolicyRatchet.check(current, incoming, grants, c["focus"] as Boolean).ok
    check("ratchet ${c["name"]}", ok == c["ok"]) { "got $ok" }
  }
}

// --- Android-specific behaviour ---------------------------------------------

val policy = Policy.DEFAULT
fun n(id: String? = null, text: String? = null, desc: String? = null, selected: Boolean = false) = NodeSignal(id, text, desc, selected)

fun classifierTests() {
  val ig = "com.instagram.android"
  val self = "com.unscroll.app"
  fun cls(pkg: String, nodes: List<NodeSignal>, focus: Boolean = false, p: Policy = policy, guard: Boolean = true) =
    ScreenClassifier.classify(pkg, nodes, p, focus, self, guardSettings = guard)

  check("reels viewer blocked", cls(ig, listOf(n("$ig:id/clips_viewer_view_pager"))) == Verdict.BlockSurface(Surface.REELS))
  check("reels tab blocked", cls(ig, listOf(n(desc = "Reels", selected = true))) == Verdict.BlockSurface(Surface.REELS))
  check("home feed blocked", cls(ig, listOf(n(desc = "Home", selected = true))) == Verdict.BlockSurface(Surface.FEED))
  check("explore blocked", cls(ig, listOf(n(desc = "Search and explore", selected = true))) == Verdict.BlockSurface(Surface.EXPLORE))
  check("Hindi home label", cls(ig, listOf(n(desc = "होम", selected = true))) == Verdict.BlockSurface(Surface.FEED))
  check("DMs allowed", cls(ig, listOf(n("$ig:id/direct_thread_list"), n(desc = "Home", selected = false))) == Verdict.Allow)
  check("stories allowed by default", cls(ig, listOf(n("$ig:id/reel_viewer_root"))) == Verdict.Allow)
  val withStories = Policy(policy.surfaces + (Surface.STORIES to true), emptyList())
  check("stories blocked when enabled", cls(ig, listOf(n("$ig:id/reel_viewer_root")), p = withStories) == Verdict.BlockSurface(Surface.STORIES))
  val reelsOff = Policy(policy.surfaces + (Surface.REELS to false), emptyList())
  check("reels allowed when unblocked", cls(ig, listOf(n("$ig:id/clips_viewer_view_pager")), p = reelsOff) == Verdict.Allow)
  check("focus blocks all of Instagram", cls(ig, listOf(n("$ig:id/direct_thread_list")), focus = true) == Verdict.BlockApp)
  check("focus blocks Instagram Lite", cls("com.instagram.lite", emptyList(), focus = true) == Verdict.BlockApp)

  val chrome = "com.android.chrome"
  fun url(u: String) = listOf(n("$chrome:id/url_bar", text = u))
  check("browser feed (full URL)", cls(chrome, url("https://www.instagram.com/")) == Verdict.BlockSurface(Surface.FEED))
  check("browser host-only bar is not guessed", cls(chrome, url("instagram.com")) == Verdict.Allow)
  check("browser profile reels", cls(chrome, url("instagram.com/some.friend/reels/")) == Verdict.BlockSurface(Surface.REELS))
  check("browser reels", cls(chrome, url("https://www.instagram.com/reels/abc")) == Verdict.BlockSurface(Surface.REELS))
  check("browser DMs ok", cls(chrome, url("instagram.com/direct/inbox/")) == Verdict.Allow)
  check("browser other site", cls(chrome, url("example.com/reels")) == Verdict.Allow)
  check("browser look-alike host", cls(chrome, url("instagram.com.evil.io/")) == Verdict.Allow)
  check("browser focus locks instagram", cls(chrome, url("m.instagram.com/direct/inbox/"), focus = true) == Verdict.BlockApp)
  check("browser focus other site ok", cls(chrome, url("wikipedia.org"), focus = true) == Verdict.Allow)

  val settings = "com.android.settings"
  val appInfo = listOf(n(text = "Unscroll"), n(text = "Force stop"), n(text = "Uninstall"))
  check("app info guarded in focus", cls(settings, appInfo, focus = true) == Verdict.BlockSettings)
  check("app info open outside focus", cls(settings, appInfo, focus = false) == Verdict.Allow)
  check("accessibility page guarded", cls(settings, listOf(n(text = "Use Unscroll"), n(text = "Unscroll")), focus = true) == Verdict.BlockSettings)
  check("date & time guarded", cls(settings, listOf(n(text = "Set time automatically")), focus = true) == Verdict.BlockSettings)
  check("other app info not guarded", cls(settings, listOf(n(text = "Chrome"), n(text = "Force stop")), focus = true) == Verdict.Allow)
  check("unrelated settings not guarded", cls(settings, listOf(n(text = "Wi-Fi"), n(text = "Bluetooth")), focus = true) == Verdict.Allow)
  check("storage page guarded", cls(settings, listOf(n(text = "Unscroll"), n(text = "Clear storage")), focus = true) == Verdict.BlockSettings)
  // Play-compliant default: the Settings guard is OFF unless the build enables it.
  check("guard off by default", ScreenClassifier.classify(settings, appInfo, policy, true, self) == Verdict.Allow)
  check("guard flag off", cls(settings, appInfo, focus = true, guard = false) == Verdict.Allow)

  // Rule 3: uninstall must always remain possible.
  for (pkg in listOf("com.android.packageinstaller", "com.google.android.packageinstaller", "com.android.vending", "com.miui.home", "com.sec.android.app.launcher")) {
    check("never block $pkg", cls(pkg, appInfo, focus = true) == Verdict.Allow)
  }
  check("never block self", cls(self, appInfo, focus = true) == Verdict.Allow)
}

class MemStore : StateStore {
  var data: String? = null
  override fun load() = data
  override fun save(json: String) { data = json }
}

class FakeClock(var wall: Long, var mono: Long = 1_000, var boot: String = "b1", var trusted: Boolean = true) : ClockSource {
  override fun sample() = ClockSample(wall, mono, boot, null, trusted)
  override fun local(trustedMs: Long): LocalTime {
    val minuteOfWeek = Math.floorMod(trustedMs / 60_000, 7 * 1440L)
    return LocalTime((minuteOfWeek / 1440).toInt(), (minuteOfWeek % 1440).toInt())
  }
  fun advance(ms: Long) { wall += ms; mono += ms }
}

fun enforcerTests() {
  val H = Limits.HOUR
  // t = 0 is "Sunday 00:00" for FakeClock.local; start Saturday noon.
  val clock = FakeClock(6 * Limits.DAY + 12 * H)
  val store = MemStore()
  var e = Enforcer(store, clock)

  check("initial policy set", e.applyPolicy(MiniJson.stringify(policy.toJson()), "[]").ok)
  check("no stop API exists", Enforcer::class.java.methods.none { it.name.lowercase().let { n -> "stop" in n || "cancelsession" in n || "disable" in n } })

  check("start session", e.startSession("s1", H).ok)
  check("focus active", e.focus().active)
  check("cannot shorten", !e.startSession("s2", H / 2).ok)
  check("cannot start invalid", !e.startSession("bad id!", H).ok && !e.startSession("s3", 60_000).ok)
  check("can extend", e.startSession("s4", 2 * H).ok && e.focus().remainingMs == 2 * H)

  // Wall-clock jump does nothing on the same boot.
  clock.wall += 10 * Limits.DAY
  check("wall jump ignored", e.focus().remainingMs == 2 * H)

  // Restart (process death) keeps the session.
  clock.mono += 30 * Limits.MINUTE
  e.now()
  e = Enforcer(store, clock)
  check("persisted across restart", e.focus().active && e.focus().remainingMs == 90 * Limits.MINUTE)

  // Loosening during focus is refused even with a grant.
  val looser = MiniJson.stringify(Policy(policy.surfaces + (Surface.REELS to false), emptyList()).toJson())
  check("first policy accepted (onboarding)", Enforcer(MemStore(), FakeClock(0)).applyPolicy(looser, "[]").ok)
  check("register grant", e.registerGrant("""{"id":"g1","kind":"surface-off","surface":"reels"}"""))
  check("refuse unmatured grant", !e.applyPolicy(looser, """["g1"]""").ok)
  clock.mono += 2 * H // session over
  check("session finished", !e.focus().active)
  check("refuse unmatured grant after focus", !e.applyPolicy(looser, """["g1"]""").ok)
  clock.mono += Limits.DAY
  check("refuse without presenting grant id", !e.applyPolicy(looser, "[]").ok)
  check("accept matured grant", e.applyPolicy(looser, """["g1"]""").ok)
  check("grant is single-use", e.grantsSnapshot().none { it.id == "g1" })
  check("stricter is always accepted", e.applyPolicy(MiniJson.stringify(policy.toJson()), "[]").ok)

  // A re-registered request for the same target restarts the wait.
  check("grant a", e.registerGrant("""{"id":"a1","kind":"surface-off","surface":"feed"}"""))
  clock.mono += 23 * H
  check("grant b replaces a", e.registerGrant("""{"id":"a2","kind":"surface-off","surface":"feed"}"""))
  clock.mono += 2 * H
  val noFeed = MiniJson.stringify(Policy(policy.surfaces + (Surface.FEED to false), emptyList()).toJson())
  check("old grant id no longer valid", !e.applyPolicy(noFeed, """["a1"]""").ok)
  check("new grant still maturing", !e.applyPolicy(noFeed, """["a2"]""").ok)

  // Malformed input is refused, never crashes.
  for (bad in listOf("", "{", "null", "[]", """{"surfaces":{},"schedules":[]}""", "x".repeat(600_000), "[".repeat(100))) {
    check("malformed policy refused", !e.applyPolicy(bad, "[]").ok)
  }
  check("malformed grant refused", !e.registerGrant("""{"id":"x","kind":"surface-off","surface":"everything"}"""))
  check("malformed grant json", !e.registerGrant("{{"))

  // Corrupt stored state falls back to safe defaults.
  store.data = "{garbage"
  val fresh = Enforcer(store, clock)
  check("corrupt state -> default policy blocks reels", fresh.currentPolicy().blocks(Surface.REELS))

  // Schedules: active window counts as focus; reboot with manual time fails closed.
  val c2 = FakeClock(1 * Limits.DAY + 8 * H + 59 * Limits.MINUTE, trusted = false) // Monday 08:59
  val e2 = Enforcer(MemStore(), c2)
  val study = """{"surfaces":{"feed":true,"reels":true,"explore":true,"stories":false},"schedules":[{"id":"study","name":"Study","days":62,"startMin":540,"endMin":780}]}"""
  check("add schedule", e2.applyPolicy(study, "[]").ok)
  check("not yet", !e2.focus().active)
  c2.advance(Limits.MINUTE)
  check("schedule active", e2.focus().active && e2.focus().remainingMs == 4 * H)
  c2.wall += 5 * H // user sets clock forward…
  c2.mono = 10_000; c2.boot = "b2" // …and reboots
  check("reboot + manual clock still locked", e2.focus().active)
  check("cannot delete running schedule", !e2.applyPolicy("""{"surfaces":{"feed":true,"reels":true,"explore":true,"stories":false},"schedules":[]}""", "[]").ok)

  // H1: clock forward + reboot does not mature a grant (monotonic wait).
  val c3 = FakeClock(6 * Limits.DAY + 12 * H)
  val e3 = Enforcer(MemStore(), c3)
  check("e3 first policy", e3.applyPolicy(MiniJson.stringify(policy.toJson()), "[]").ok)
  check("e3 grant", e3.registerGrant("""{"id":"r1","kind":"surface-off","surface":"reels"}"""))
  c3.wall += 7 * Limits.DAY; c3.mono = 1_000; c3.boot = "b9"
  val noReels = MiniJson.stringify(Policy(policy.surfaces + (Surface.REELS to false), emptyList()).toJson())
  check("clock jump + reboot does not mature grant", !e3.applyPolicy(noReels, """["r1"]""").ok)
  c3.advance(Limits.DAY)
  check("real 24 h matures grant", e3.applyPolicy(noReels, """["r1"]""").ok)

  // H2: a running window survives clock/zone changes (window lock).
  val c4 = FakeClock(1 * Limits.DAY + 10 * H) // Monday 10:00
  val e4 = Enforcer(MemStore(), c4)
  check("e4 policy", e4.applyPolicy(study, "[]").ok)
  check("window active", e4.focus().active && e4.focus().remainingMs == 3 * H)
  c4.wall += 6 * H // jump past the window's end on the wall clock (same boot: ignored)
  c4.mono += Limits.MINUTE
  check("window survives wall jump", e4.focus().active && e4.focus().remainingMs == 3 * H - Limits.MINUTE)
  c4.mono += 3 * H
  check("window ends on real time", !e4.focus().active)

  // M1: periodic persistence actually happens.
  val st5 = MemStore()
  val c5 = FakeClock(0)
  Enforcer(st5, c5).now()
  check("now() persists", st5.data != null)

  // Low: bad \u escape is a ParseException, and corrupt state never crashes load.
  check("bad unicode escape", try { MiniJson.parse("\"\\u+fff\""); false } catch (e: MiniJson.ParseException) { true })
  val st6 = MemStore(); st6.data = """{"v":2,"policy":{"surfaces":"x"},"grants":[{"waitedMs":"no"}]}"""
  check("corrupt state loads safely", Enforcer(st6, c5).currentPolicy().blocks(Surface.REELS))
  val st7 = MemStore(); st7.data = "{garbage"
  check("corrupt state does not skip the ratchet", !Enforcer(st7, c5).applyPolicy(noReels, "[]").ok)

  // Only grants a change relied on are consumed.
  val c8 = FakeClock(6 * Limits.DAY + 12 * H)
  val e8 = Enforcer(MemStore(), c8)
  check("e8 policy", e8.applyPolicy(MiniJson.stringify(policy.toJson()), "[]").ok)
  check("e8 grant", e8.registerGrant("""{"id":"k1","kind":"surface-off","surface":"feed"}"""))
  c8.mono += Limits.DAY
  val withStories = MiniJson.stringify(Policy(policy.surfaces + (Surface.STORIES to true), emptyList()).toJson())
  check("stricter change presenting a grant", e8.applyPolicy(withStories, """["k1"]""").ok)
  check("unused grant kept", e8.grantsSnapshot().any { it.id == "k1" })

  // Block counter
  e2.recordBlock(); e2.recordBlock()
  check("block count", e2.takeBlockCount() == 2 && e2.takeBlockCount() == 0)
}

fun jsonTests() {
  val round = MiniJson.parse(MiniJson.stringify(mapOf("a" to listOf(1, "x\"\n\u2028", true, null), "b" to 1.5)))
  check("json roundtrip", round == mapOf("a" to listOf(1.0, "x\"\n\u2028", true, null), "b" to 1.5)) { "$round" }
  check("json unicode escape", MiniJson.parse("\"\\u00e9\"") == "é")
  for (bad in listOf("", "{", "[1,]", "{\"a\" 1}", "01x", "\"\u0001\"", "tru", "1 2", "NaN", "1e999")) {
    val threw = try { MiniJson.parse(bad); false } catch (e: MiniJson.ParseException) { true }
    check("json rejects ${bad.take(10)}", threw)
  }
  check("json depth limit", try { MiniJson.parse("[".repeat(40) + "]".repeat(40)); false } catch (e: MiniJson.ParseException) { true })
  check("url split", ScreenClassifier.splitUrl("HTTPS://www.Instagram.com:443/Reels/x?y#z") == ("www.instagram.com" to "/reels/x"))
  check("url split userinfo", ScreenClassifier.splitUrl("instagram.com@evil.io/") == ("evil.io" to "/"))
  check("url with spaces ignored", ScreenClassifier.splitUrl("search instagram reels") == null)
}

fun runAll(): List<String> {
  passed = 0
  failures.clear()
  scheduleVectors()
  clockVectors()
  sessionVectors()
  ratchetVectors()
  classifierTests()
  enforcerTests()
  jsonTests()
  println("Kotlin core: $passed passed, ${failures.size} failed")
  failures.forEach { println("  FAIL $it") }
  return failures.toList()
}

/** JUnit entry point: ./gradlew :unscroll-blocker:testDebugUnitTest */
class CoreTests {
  @Test
  fun sharedVectorsAndEnforcer() {
    val f = runAll()
    assertTrue("Failures:\n" + f.joinToString("\n"), f.isEmpty())
  }
}

/** Plain-JVM entry point for running without Gradle (see native-tests/run-kotlin-tests.sh). */
fun main() {
  if (runAll().isNotEmpty()) kotlin.system.exitProcess(1)
}
