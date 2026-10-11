package com.releasegate.inboundintent

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InboundIntentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InboundIntent")

    Events("onNewIntent")

    AsyncFunction("getInitialIntent") {
      val activity = appContext.currentActivity ?: return@AsyncFunction null
      extractIntentPayload(activity.intent, activity)
    }

    AsyncFunction("clearIntent") {
      appContext.currentActivity?.intent = null
    }

    OnNewIntent { intent ->
      val activity = appContext.currentActivity
      val payload = extractIntentPayload(intent, activity)
      if (payload != null) {
        sendEvent("onNewIntent", payload)
      }
    }
  }

  private fun extractIntentPayload(intent: Intent?, activity: Activity?): Map<String, Any?>? {
    if (intent == null) return null
    val action = intent.action ?: return null
    val uri: Uri = when (action) {
      Intent.ACTION_SEND -> {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
      }
      Intent.ACTION_VIEW -> intent.data
      else -> null
    } ?: return null

    val referrer = activity?.referrer?.toString()
    var displayName: String? = null
    var size: Long? = null
    val resolver = activity?.contentResolver ?: appContext.reactContext?.contentResolver

    if (resolver != null && uri.scheme == "content") {
      try {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameIdx != -1) displayName = cursor.getString(nameIdx)
            val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (sizeIdx != -1 && !cursor.isNull(sizeIdx)) size = cursor.getLong(sizeIdx)
          }
        }
      } catch (_: Exception) {
      }
    }
    if (displayName == null) {
      displayName = uri.lastPathSegment
    }

    val mimeType = resolver?.getType(uri) ?: intent.type

    return mapOf(
      "channel" to "share",
      "uri" to uri.toString(),
      "providerAuthority" to uri.authority,
      "displayName" to displayName,
      "mimeType" to mimeType,
      "referrer" to referrer,
      "size" to size
    )
  }
}
