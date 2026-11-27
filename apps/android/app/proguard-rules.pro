# Dollarino ProGuard Rules (keep WebView JavaScript bridge & AndroidX WorkManager classes)
-keepclassmembers class com.dollarino.app.DollarinoNativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.dollarino.app.NotificationSyncWorker { *; }
-keepattributes JavascriptInterface
-keepattributes *Annotation*
