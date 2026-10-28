package com.unscroll.blocker

import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge. Note what is NOT here: no stop, pause, shorten or disable call.
 * Every policy change is re-checked by the Enforcer's lock ratchet.
 */
class UnscrollBlockerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UnscrollBlocker")

    AsyncFunction("getStatus") {
      mapOf("blockerEnabled" to ServiceStatus.isEnabled(context))
    }

    AsyncFunction("getClockSample") {
      val s = AndroidClock(context).sample()
      mapOf(
        "wallMs" to s.wallMs.toDouble(),
        "monoMs" to s.monoMs.toDouble(),
        "bootId" to s.bootId,
        "networkMs" to s.networkMs?.toDouble(),
        "wallTrusted" to s.wallTrusted,
      )
    }

    AsyncFunction("requestPermission") {
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    AsyncFunction("pickApps") {
      mapOf("selectedCount" to 0) // iOS only
    }

    AsyncFunction("applyPolicy") { policyJson: String, grantIdsJson: String ->
      val d = EnforcerHolder.get(context).applyPolicy(policyJson, grantIdsJson)
      mapOf("accepted" to d.ok, "reason" to d.reason)
    }

    AsyncFunction("registerLoosening") { grantJson: String ->
      // Reject (not just return false) so the app can withdraw the change instead of drifting.
      if (!EnforcerHolder.get(context).registerGrant(grantJson)) throw IllegalStateException("grant refused")
    }

    AsyncFunction("cancelLoosening") { id: String ->
      EnforcerHolder.get(context).cancelGrant(id)
    }

    AsyncFunction("startSession") { id: String, durationMs: Double ->
      if (!durationMs.isFinite()) return@AsyncFunction mapOf("accepted" to false, "reason" to "invalid duration")
      val d = EnforcerHolder.get(context).startSession(id, durationMs.toLong())
      mapOf("accepted" to d.ok, "reason" to d.reason)
    }

    AsyncFunction("takeBlockCount") {
      EnforcerHolder.get(context).takeBlockCount()
    }

    AsyncFunction("openBatterySettings") {
      try {
        context.startActivity(
          Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      } catch (e: Exception) {
        context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
  }
}
