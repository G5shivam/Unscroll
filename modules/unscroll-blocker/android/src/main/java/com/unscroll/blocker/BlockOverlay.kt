package com.unscroll.blocker

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.unscroll.blocker.core.Surface
import com.unscroll.blocker.core.Verdict

/**
 * Full-screen block screen drawn as an Accessibility overlay
 * (TYPE_ACCESSIBILITY_OVERLAY needs no "draw over other apps" permission).
 * It is not focusable, so the app underneath stays the active window and we
 * keep receiving its events to know when to hide again.
 */
class BlockOverlay(private val service: AccessibilityService) {
  private val wm = service.getSystemService(WindowManager::class.java)
  private var view: View? = null
  private var shownFor: Verdict? = null
  private var bodyView: TextView? = null

  fun show(verdict: Verdict, remainingMs: Long) {
    if (shownFor == verdict && view != null) {
      // Same screen: just refresh the remaining time.
      bodyView?.text = copyFor(verdict, remainingMs).second
      return
    }
    hide()
    val v = build(verdict, remainingMs)
    val lp = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.OPAQUE,
    )
    try {
      wm.addView(v, lp)
      view = v
      shownFor = verdict
    } catch (e: Exception) {
      view = null
      shownFor = null
    }
  }

  fun hide() {
    view?.let {
      try {
        wm.removeView(it)
      } catch (e: Exception) {
        // already detached
      }
    }
    view = null
    shownFor = null
    bodyView = null
  }

  private fun build(verdict: Verdict, remainingMs: Long): View {
    val ctx = service
    val root = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_VERTICAL
      setBackgroundColor(INK)
      setPadding(dp(28), dp(48), dp(28), dp(48))
      isClickable = true // swallow touches meant for the app underneath
    }
    val (title, body) = copyFor(verdict, remainingMs)
    root.addView(TextView(ctx).apply {
      text = title
      setTextColor(HIGHLIGHTER)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    })
    val bodyText = TextView(ctx).apply {
      text = body
      setTextColor(ON_INK)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setPadding(0, dp(12), 0, dp(32))
    }
    bodyView = bodyText
    root.addView(bodyText)

    when (verdict) {
      is Verdict.BlockSurface -> {
        root.addView(button("Go to messages", primary = true) { openInstagramInbox() })
        root.addView(button("Go back", primary = false) { service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK) })
      }
      else -> root.addView(button("Go to home screen", primary = true) {
        hide()
        service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
      })
    }
    return root
  }

  private fun copyFor(v: Verdict, remainingMs: Long): Pair<String, String> {
    val left = formatRemaining(remainingMs)
    return when (v) {
      is Verdict.BlockApp -> "Instagram is locked" to "Your focus ends in $left. Unscroll has no stop button."
      is Verdict.BlockSettings -> "Locked during focus" to "This setting could switch Unscroll off, so it’s unavailable for $left."
      is Verdict.BlockSurface -> when (v.surface) {
        Surface.REELS -> "Reels are hidden" to "Your messages are still here."
        Surface.FEED -> "The feed is hidden" to "Messages, posting and your profile still work."
        Surface.EXPLORE -> "Explore is hidden" to "Search for someone from your messages instead."
        Surface.STORIES -> "Stories are hidden" to "You chose to hide Stories in Unscroll."
      }
      else -> "Hidden" to ""
    }
  }

  private fun openInstagramInbox() {
    hide()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.instagram.com/direct/inbox/"))
      .setPackage("com.instagram.android")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      service.startActivity(intent)
    } catch (e: Exception) {
      service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
    }
  }

  private fun button(label: String, primary: Boolean, onClick: () -> Unit): Button =
    Button(service).apply {
      text = label
      isAllCaps = false
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setTextColor(if (primary) INK else ON_INK)
      background = GradientDrawable().apply {
        cornerRadius = dp(12).toFloat()
        setColor(if (primary) HIGHLIGHTER else Color.TRANSPARENT)
        if (!primary) setStroke(dp(1), ON_INK_MUTED)
      }
      minHeight = dp(52)
      setOnClickListener { onClick() }
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        .apply { topMargin = dp(12) }
    }

  private fun dp(v: Int): Int = (v * service.resources.displayMetrics.density).toInt()

  companion object {
    private val INK = Color.parseColor("#14213D")
    private val ON_INK = Color.parseColor("#F3F5F9")
    private val ON_INK_MUTED = Color.parseColor("#A9B3C7")
    private val HIGHLIGHTER = Color.parseColor("#F5DD4B")

    fun formatRemaining(ms: Long): String {
      val totalMin = Math.max(1L, (ms + 59_999) / 60_000)
      val h = totalMin / 60
      val m = totalMin % 60
      return when {
        h == 0L -> "$m min"
        m == 0L -> "$h h"
        else -> "$h h $m min"
      }
    }
  }
}
