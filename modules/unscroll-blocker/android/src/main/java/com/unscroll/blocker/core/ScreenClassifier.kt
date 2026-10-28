package com.unscroll.blocker.core

/** What the Accessibility service saw on one visible node. Text is never stored. */
data class NodeSignal(val viewId: String?, val text: String?, val desc: String?, val selected: Boolean) {
  /** The part after ":id/", e.g. "clips_viewer_view_pager". */
  val idName: String? get() = viewId?.substringAfter(":id/", viewId)
}

sealed class Verdict {
  object Allow : Verdict()
  data class BlockSurface(val surface: Surface) : Verdict()
  object BlockApp : Verdict()
  object BlockSettings : Verdict()
}

/**
 * Detection rules. Instagram's view ids are not a public API and change with
 * app updates, which is why they live in one data class that can later be
 * replaced from (signed) remote config. VERIFY ON DEVICE before release.
 */
data class DetectionRules(
  val instagramPackages: Set<String>,
  val browserUrlBars: Map<String, Set<String>>,
  val settingsPackages: Set<String>,
  val neverBlock: Set<String>,
  val reelsViewIds: Set<String>,
  val storiesViewIds: Set<String>,
  val homeTabLabels: Set<String>,
  val exploreTabLabels: Set<String>,
  val reelsTabLabels: Set<String>,
  val appLabel: String,
  val forceStopLabels: Set<String>,
  val accessibilityLabels: Set<String>,
  val dateTimeLabels: Set<String>,
) {
  companion object {
    val DEFAULT = DetectionRules(
      instagramPackages = setOf("com.instagram.android", "com.instagram.lite"),
      browserUrlBars = mapOf(
        "com.android.chrome" to setOf("url_bar"),
        "com.chrome.beta" to setOf("url_bar"),
        "com.brave.browser" to setOf("url_bar"),
        "com.microsoft.emmx" to setOf("url_bar"),
        "com.sec.android.app.sbrowser" to setOf("location_bar_edit_text"),
        "org.mozilla.firefox" to setOf("mozac_browser_toolbar_url_view", "url_bar_title"),
        "com.opera.browser" to setOf("url_field"),
        "com.opera.mini.native" to setOf("url_field"),
        "com.duckduckgo.mobile.android" to setOf("omnibarTextInput"),
        "com.mi.globalbrowser" to setOf("url"),
        "com.vivo.browser" to setOf("search_text"),
        "com.heytap.browser" to setOf("url_bar"),
        "com.UCMobile.intl" to setOf("titlebar_url"),
        "com.vivaldi.browser" to setOf("url_bar"),
        "com.kiwibrowser.browser" to setOf("url_bar"),
        "org.mozilla.focus" to setOf("mozac_browser_toolbar_url_view", "display_url"),
      ),
      settingsPackages = setOf("com.android.settings", "com.miui.securitycenter", "com.coloros.safecenter"),
      // Uninstall must ALWAYS stay possible (PRD Rule 3): never cover these.
      neverBlock = setOf(
        "com.android.packageinstaller",
        "com.google.android.packageinstaller",
        "com.android.vending",
        "com.android.systemui",
        "com.google.android.apps.nexuslauncher",
        "com.sec.android.app.launcher",
        "com.miui.home",
        "com.android.launcher3",
        "com.oppo.launcher",
        "com.bbk.launcher2",
        "com.realme.launcher",
        "net.oneplus.launcher",
      ),
      reelsViewIds = setOf("clips_viewer_view_pager", "clips_video_container", "clips_viewer_container"),
      storiesViewIds = setOf("reel_viewer_root", "reel_viewer_container", "reel_viewer_media_container"),
      homeTabLabels = setOf("home", "होम"),
      exploreTabLabels = setOf("search and explore", "explore", "खोजें और एक्सप्लोर करें"),
      reelsTabLabels = setOf("reels", "रील्स"),
      appLabel = "unscroll",
      forceStopLabels = setOf("force stop", "बलपूर्वक रोकें", "clear storage", "clear data", "clear cache"),
      accessibilityLabels = setOf("use unscroll", "unscroll shortcut", "accessibility", "सुलभता"),
      dateTimeLabels = setOf("set time automatically", "automatic date & time", "set date", "time zone", "समय क्षेत्र"),
    )
  }
}

object ScreenClassifier {
  /** A profile's Reels tab: /<user>/reels/ */
  private val PROFILE_REELS = Regex("^/[^/]+/reels(/|$)")

  fun classify(
    pkg: String,
    nodes: List<NodeSignal>,
    policy: Policy,
    focusActive: Boolean,
    selfPackage: String,
    rules: DetectionRules = DetectionRules.DEFAULT,
    /**
     * Cover the Settings pages that could switch Unscroll off during Focus.
     * OFF by default: Google Play's Accessibility policy forbids preventing
     * users from disabling or uninstalling an app or service (outside parental
     * control / enterprise apps). Only enable for builds distributed outside Play.
     */
    guardSettings: Boolean = false,
  ): Verdict {
    if (pkg == selfPackage || pkg in rules.neverBlock) return Verdict.Allow

    if (pkg in rules.instagramPackages) return instagram(nodes, policy, focusActive, rules)

    rules.browserUrlBars[pkg]?.let { bars -> return browser(nodes, bars, policy, focusActive) }

    if (guardSettings && focusActive && pkg in rules.settingsPackages && guardsSettings(nodes, rules)) return Verdict.BlockSettings

    return Verdict.Allow
  }

  private fun instagram(nodes: List<NodeSignal>, policy: Policy, focusActive: Boolean, r: DetectionRules): Verdict {
    if (focusActive) return Verdict.BlockApp
    fun label(n: NodeSignal) = (n.desc ?: n.text)?.trim()?.lowercase()
    if (policy.blocks(Surface.REELS)) {
      if (nodes.any { it.idName in r.reelsViewIds }) return Verdict.BlockSurface(Surface.REELS)
      if (nodes.any { it.selected && label(it) in r.reelsTabLabels }) return Verdict.BlockSurface(Surface.REELS)
    }
    if (policy.blocks(Surface.STORIES) && nodes.any { it.idName in r.storiesViewIds }) {
      return Verdict.BlockSurface(Surface.STORIES)
    }
    if (policy.blocks(Surface.EXPLORE) && nodes.any { it.selected && label(it) in r.exploreTabLabels }) {
      return Verdict.BlockSurface(Surface.EXPLORE)
    }
    if (policy.blocks(Surface.FEED) && nodes.any { it.selected && label(it) in r.homeTabLabels }) {
      return Verdict.BlockSurface(Surface.FEED)
    }
    return Verdict.Allow
  }

  private fun browser(nodes: List<NodeSignal>, bars: Set<String>, policy: Policy, focusActive: Boolean): Verdict {
    val url = nodes.firstOrNull { it.idName in bars && !it.text.isNullOrBlank() }?.text ?: return Verdict.Allow
    val (host, path) = splitUrl(url) ?: return Verdict.Allow
    if (host != "instagram.com" && !host.endsWith(".instagram.com")) return Verdict.Allow
    if (focusActive) return Verdict.BlockApp
    // Many address bars show only the host while not focused; the path is then
    // unknown, so don't guess (it would block DMs as "feed").
    val afterScheme = url.trim().lowercase().removePrefix("https://").removePrefix("http://")
    if (!afterScheme.contains('/')) return Verdict.Allow
    val surface = webSurface(path) ?: return Verdict.Allow
    return if (policy.blocks(surface)) Verdict.BlockSurface(surface) else Verdict.Allow
  }

  /** Same routing rules as the iOS Clean Instagram script. */
  fun webSurface(path: String): Surface? {
    val p = path.lowercase()
    return when {
      p == "/" || p.isEmpty() -> Surface.FEED
      p.startsWith("/reels") || p.startsWith("/reel/") || PROFILE_REELS.containsMatchIn(p) -> Surface.REELS
      p.startsWith("/explore") -> Surface.EXPLORE
      p.startsWith("/stories/") -> Surface.STORIES
      else -> null
    }
  }

  /** Lenient parse of what a URL bar shows: "instagram.com/reels/", "https://www.instagram.com/". */
  fun splitUrl(raw: String): Pair<String, String>? {
    var s = raw.trim().lowercase()
    if (s.isEmpty() || s.contains(' ')) return null
    s = s.removePrefix("https://").removePrefix("http://")
    val slash = s.indexOf('/')
    val hostPort = if (slash >= 0) s.substring(0, slash) else s
    var path = if (slash >= 0) s.substring(slash) else "/"
    path = path.substringBefore('?').substringBefore('#')
    val host = hostPort.substringAfterLast('@').substringBefore(':')
    if (host.isEmpty()) return null
    return host to path
  }

  private fun guardsSettings(nodes: List<NodeSignal>, r: DetectionRules): Boolean {
    val texts = nodes.mapNotNull { (it.text ?: it.desc)?.trim()?.lowercase() }
    val mentionsApp = texts.any { it == r.appLabel || it.startsWith("${r.appLabel} ") || it.contains(" ${r.appLabel}") }
    // App info page for Unscroll: has "Force stop" and our name.
    if (mentionsApp && texts.any { it in r.forceStopLabels }) return true
    // Unscroll's Accessibility detail page (the on/off switch).
    if (mentionsApp && texts.any { t -> r.accessibilityLabels.any { t.contains(it) } }) return true
    // Date & time / time zone page: changing them could shift schedules.
    if (texts.any { it in r.dateTimeLabels }) return true
    return false
  }
}
