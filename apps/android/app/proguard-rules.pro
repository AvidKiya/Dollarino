# Dollarino ProGuard Rules (keep WebView JavaScript bridge & AndroidX WorkManager classes)
-keepclassmembers class com.dollarino.app.DollarinoNativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.dollarino.app.NotificationSyncWorker { *; }
-keepattributes JavascriptInterface
-keepattributes *Annotation*

# ---------------------------------------------------------------------------
# R8: com.google.crypto.tink (pulled in by androidx.security:security-crypto,
# used by SecureSessionStore) references compile-only annotation classes that are
# not on the runtime classpath. Without these rules `assembleRelease` fails with:
#   ERROR: R8: Missing class com.google.errorprone.annotations.CanIgnoreReturnValue
#   ERROR: R8: Missing class javax.annotation.Nullable
# The annotations carry no runtime behaviour, so they are safe to ignore.
# ---------------------------------------------------------------------------
# Root cause handled once: Tink's *optional* remote-keyset downloader
# (com.google.crypto.tink.util.KeysDownloader) is the only thing dragging in the Google
# HTTP client, Joda-Time and the compile-only annotation libraries. The app never uses it
# (keysets live in Android Keystore via SecureSessionStore), so the whole downloader is
# excluded from the graph instead of chasing each of its optional classes with -dontwarn.
-dontwarn com.google.crypto.tink.util.KeysDownloader
-assumenosideeffects class com.google.crypto.tink.util.KeysDownloader { *; }
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn javax.annotation.concurrent.**
-dontwarn com.google.api.client.**
-dontwarn org.joda.time.**

# Tink resolves its primitives reflectively; keep the crypto providers intact.
-keep class com.google.crypto.tink.** { *; }
-keepclassmembers class com.google.crypto.tink.** { *; }
