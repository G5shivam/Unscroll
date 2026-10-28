package com.unscroll.blocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-anchors the trusted clock right after boot or an app update, so the
 * enforcer records the new boot as early as possible. The Accessibility
 * service itself is restarted by the system automatically.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    EnforcerHolder.get(context).now()
  }
}
