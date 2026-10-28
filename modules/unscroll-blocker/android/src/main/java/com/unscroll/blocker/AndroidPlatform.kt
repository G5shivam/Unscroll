package com.unscroll.blocker

import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import com.unscroll.blocker.core.ClockSample
import com.unscroll.blocker.core.ClockSource
import com.unscroll.blocker.core.Enforcer
import com.unscroll.blocker.core.LocalTime
import com.unscroll.blocker.core.StateStore
import java.util.Calendar

/** Enforcer state in app-private SharedPreferences (excluded from backups). */
class PrefsStore(context: Context) : StateStore {
  private val prefs = context.applicationContext.getSharedPreferences("unscroll_enforcer", Context.MODE_PRIVATE)
  override fun load(): String? = prefs.getString("state", null)
  override fun save(json: String) {
    prefs.edit().putString("state", json).apply()
  }
}

/** Real platform clocks. See src/core/clock.ts for how they are combined. */
class AndroidClock(context: Context) : ClockSource {
  private val resolver = context.applicationContext.contentResolver

  override fun sample(): ClockSample {
    val bootCount = try {
      Settings.Global.getInt(resolver, Settings.Global.BOOT_COUNT, -1)
    } catch (e: Exception) {
      -1
    }
    val network: Long? = if (Build.VERSION.SDK_INT >= 33) {
      try {
        SystemClock.currentNetworkTimeClock().millis()
      } catch (e: Exception) {
        null // DateTimeException when no network time is available yet
      }
    } else null
    val autoTime = try {
      Settings.Global.getInt(resolver, Settings.Global.AUTO_TIME, 0) == 1
    } catch (e: Exception) {
      false
    }
    return ClockSample(
      wallMs = System.currentTimeMillis(),
      monoMs = SystemClock.elapsedRealtime(), // includes deep sleep; not user-settable
      bootId = if (bootCount >= 0) "boot-$bootCount" else "boot-unknown",
      networkMs = network,
      wallTrusted = autoTime,
    )
  }

  override fun local(trustedMs: Long): LocalTime {
    val c = Calendar.getInstance()
    c.timeInMillis = trustedMs
    return LocalTime(c.get(Calendar.DAY_OF_WEEK) - 1, c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE))
  }
}

object EnforcerHolder {
  @Volatile private var instance: Enforcer? = null

  fun get(context: Context): Enforcer =
    instance ?: synchronized(this) {
      instance ?: Enforcer(PrefsStore(context), AndroidClock(context)).also { instance = it }
    }
}

object ServiceStatus {
  fun isEnabled(context: Context): Boolean {
    val resolver = context.contentResolver
    val on = try {
      Settings.Secure.getInt(resolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1
    } catch (e: Exception) {
      false
    }
    if (!on) return false
    val expected = ComponentName(context, BlockerAccessibilityService::class.java)
    val list = Settings.Secure.getString(resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
    return list.split(':').any { ComponentName.unflattenFromString(it) == expected }
  }
}
