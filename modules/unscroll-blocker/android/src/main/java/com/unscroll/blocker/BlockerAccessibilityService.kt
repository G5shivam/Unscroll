package com.unscroll.blocker

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.unscroll.blocker.core.NodeSignal
import com.unscroll.blocker.core.ScreenClassifier
import com.unscroll.blocker.core.Verdict

/**
 * Watches Instagram, browsers and the Settings pages that could disable
 * Unscroll. Screen content is reduced to view ids / short labels, classified,
 * and discarded immediately. Nothing is logged or stored.
 *
 * Events are limited to the packages listed in res/xml/unscroll_accessibility_service.xml.
 */
class BlockerAccessibilityService : AccessibilityService() {
  private val main = Handler(Looper.getMainLooper())
  private lateinit var overlay: BlockOverlay
  private var lastEvalAt = 0L
  private var evalQueued = false
  private var lastVerdict: Verdict = Verdict.Allow
  /** Build-time flag (res/values/unscroll_config.xml); see ScreenClassifier.classify. */
  private val guardSettings: Boolean by lazy {
    try {
      resources.getBoolean(R.bool.unscroll_settings_guard)
    } catch (e: Exception) {
      false
    }
  }

  private val periodic = object : Runnable {
    override fun run() {
      // Re-check even without events: a Focus session can start while Instagram is open.
      evaluate()
      main.postDelayed(this, RECHECK_MS)
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    overlay = BlockOverlay(this)
    EnforcerHolder.get(this).now()
    main.postDelayed(periodic, RECHECK_MS)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || !::overlay.isInitialized) return
    val since = SystemClock.uptimeMillis() - lastEvalAt
    if (since >= THROTTLE_MS) {
      evaluate()
    } else if (!evalQueued) {
      evalQueued = true
      main.postDelayed({
        evalQueued = false
        evaluate()
      }, THROTTLE_MS - since)
    }
  }

  private fun evaluate() {
    if (!::overlay.isInitialized) return
    lastEvalAt = SystemClock.uptimeMillis()
    val root = try {
      rootInActiveWindow
    } catch (e: Exception) {
      null
    }
    val pkg = root?.packageName?.toString()
    if (root == null || pkg == null) {
      // Unknown foreground (e.g. a launcher we get no events for): never leave a block screen up.
      overlay.hide()
      lastVerdict = Verdict.Allow
      return
    }
    val enforcer = EnforcerHolder.get(this)
    val focus = enforcer.focus()
    val verdict = ScreenClassifier.classify(
      pkg, collect(root), enforcer.currentPolicy(), focus.active, packageName, guardSettings = guardSettings,
    )

    if (verdict == Verdict.Allow) {
      overlay.hide()
    } else {
      if (verdict != lastVerdict) enforcer.recordBlock()
      when (verdict) {
        is Verdict.BlockApp -> {
          // Send Instagram away; launchers send us no events, so don't leave a cover over them.
          performGlobalAction(GLOBAL_ACTION_HOME)
          overlay.hide()
        }
        is Verdict.BlockSettings -> {
          overlay.show(verdict, focus.remainingMs)
          performGlobalAction(GLOBAL_ACTION_BACK)
        }
        is Verdict.BlockSurface -> overlay.show(verdict, focus.remainingMs)
        else -> Unit
      }
    }
    lastVerdict = verdict
  }

  /** Breadth-first walk of visible nodes, bounded so a huge screen cannot stall us. */
  private fun collect(root: AccessibilityNodeInfo): List<NodeSignal> {
    val out = ArrayList<NodeSignal>(64)
    val queue = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
    queue.add(root to 0)
    var visited = 0
    while (queue.isNotEmpty() && visited < MAX_NODES) {
      val (node, depth) = queue.removeFirst()
      visited++
      if (!node.isVisibleToUser) continue
      val id = node.viewIdResourceName
      val text = node.text?.toString()?.take(MAX_TEXT)
      val desc = node.contentDescription?.toString()?.take(MAX_TEXT)
      if (id != null || text != null || desc != null) out.add(NodeSignal(id, text, desc, node.isSelected))
      if (depth < MAX_DEPTH) {
        for (i in 0 until node.childCount) {
          val child = try {
            node.getChild(i)
          } catch (e: Exception) {
            null
          } ?: continue
          queue.add(child to depth + 1)
        }
      }
    }
    return out
  }

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    main.removeCallbacksAndMessages(null)
    if (::overlay.isInitialized) overlay.hide()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    main.removeCallbacksAndMessages(null)
    if (::overlay.isInitialized) overlay.hide()
    super.onDestroy()
  }

  companion object {
    private const val THROTTLE_MS = 150L
    private const val RECHECK_MS = 2_000L
    private const val MAX_NODES = 800
    private const val MAX_DEPTH = 40
    private const val MAX_TEXT = 120
  }
}
