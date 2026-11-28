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
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn javax.annotation.concurrent.**
# Tink's optional remote-keyset downloader targets the Google HTTP client, which the app
# never uses (keysets live in Android Keystore via SecureSessionStore).
-dontwarn com.google.api.client.**

# Tink resolves its primitives reflectively; keep the crypto providers intact.
-keep class com.google.crypto.tink.** { *; }
-keepclassmembers class com.google.crypto.tink.** { *; }
