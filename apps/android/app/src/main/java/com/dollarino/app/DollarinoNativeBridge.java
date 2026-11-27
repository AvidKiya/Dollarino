package com.dollarino.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.text.TextUtils;
import android.webkit.JavascriptInterface;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsIntent;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Safe @JavascriptInterface bridge (`window.DollarinoNative`) linking the bundled local
 * Dollarino web UI directly to Android native hardware, notifications, intents, and Keystore auth.
 */
public final class DollarinoNativeBridge {
    private final MainActivity activity;
    private final SecureSessionStore store;
    private final ExecutorService bgExecutor = Executors.newSingleThreadExecutor();

    public DollarinoNativeBridge(@NonNull MainActivity activity, @NonNull SecureSessionStore store) {
        this.activity = activity;
        this.store = store;
    }

    @JavascriptInterface
    @NonNull
    public String getBridgeInfo() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("platform", "android");
            obj.put("versionName", BuildConfig.VERSION_NAME);
            obj.put("versionCode", BuildConfig.VERSION_CODE);
            obj.put("deviceId", store.getOrCreateDeviceId());
            obj.put("apiBase", store.getApiBase());
            obj.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            obj.put("osVersion", "Android " + Build.VERSION.RELEASE);
            obj.put("hasNotificationPermission", NotificationChannels.hasPermission(activity));
            String fcm = store.getFcmToken();
            if (!TextUtils.isEmpty(fcm)) {
                obj.put("fcmToken", fcm);
            }
            return obj.toString();
        } catch (Throwable ignored) {
            return "{\"platform\":\"android\"}";
        }
    }

    @JavascriptInterface
    @NonNull
    public String getApiBase() {
        return store.getApiBase();
    }

    @JavascriptInterface
    public boolean setApiBase(@Nullable String url) {
        return store.setApiBase(url);
    }

    @JavascriptInterface
    public void setAuthSession(
            @Nullable String token,
            @Nullable String apiBase,
            @Nullable String userId,
            @Nullable String username
    ) {
        if (TextUtils.isEmpty(token)) {
            clearAuthSession();
            return;
        }
        store.saveAuthSession(token, apiBase, userId, username);
        bgExecutor.execute(() -> NotificationFeedClient.registerDevice(store));
        activity.runOnUiThread(() -> {
            DollarinoApp.triggerImmediateSync(activity.getApplication());
            activity.ensureNotificationPermissionPromptedOnce();
        });
    }

    @JavascriptInterface
    public void clearAuthSession() {
        store.clearAuthSession();
    }

    @JavascriptInterface
    public void syncNotificationsNow() {
        DollarinoApp.triggerImmediateSync(activity.getApplication());
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        activity.runOnUiThread(activity::requestNotificationPermissionExplicitly);
    }

    @JavascriptInterface
    public void haptic(@Nullable String style) {
        activity.runOnUiThread(() -> performHaptic(activity, style));
    }

    @JavascriptInterface
    public void openExternalUrl(@Nullable String rawUrl) {
        if (TextUtils.isEmpty(rawUrl)) return;
        activity.runOnUiThread(() -> openSafeExternalUrl(activity, rawUrl.trim()));
    }

    @JavascriptInterface
    public void copyText(@Nullable String text) {
        if (text == null) return;
        activity.runOnUiThread(() -> {
            ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(ClipData.newPlainText("Dollarino", text));
            }
        });
    }

    @JavascriptInterface
    public void shareText(@Nullable String title, @Nullable String text) {
        if (TextUtils.isEmpty(text)) return;
        activity.runOnUiThread(() -> {
            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType("text/plain");
            if (!TextUtils.isEmpty(title)) {
                sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            }
            sendIntent.putExtra(Intent.EXTRA_TEXT, text);
            activity.startActivity(Intent.createChooser(sendIntent, TextUtils.isEmpty(title) ? "Dollarino" : title));
        });
    }

    @JavascriptInterface
    public void setStatusBarStyle(boolean isDark) {
        activity.runOnUiThread(() -> activity.applySystemBarTheme(isDark));
    }

    public static void openSafeExternalUrl(@NonNull Activity activity, @NonNull String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
            if (!("https".equals(scheme)
                    || "http".equals(scheme)
                    || "tg".equals(scheme)
                    || "trust".equals(scheme)
                    || "tonkeeper".equals(scheme)
                    || "phantom".equals(scheme)
                    || "mailto".equals(scheme))) {
                return;
            }
            if ("https".equals(scheme)
                    && (rawUrl.contains("accounts.google.com") || rawUrl.contains("/api/auth/google/start"))) {
                CustomTabsIntent customTabs = new CustomTabsIntent.Builder()
                        .setShowTitle(true)
                        .build();
                customTabs.launchUrl(activity, uri);
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            activity.startActivity(intent);
        } catch (Throwable ignored) {
            // Target app (e.g. Trust Wallet / Telegram) not installed; ignore gracefully
        }
    }

    private static void performHaptic(@NonNull Context ctx, @Nullable String style) {
        try {
            long ms = "heavy".equals(style) || "error".equals(style) ? 28 : "medium".equals(style) ? 18 : 10;
            int amp = "heavy".equals(style) || "error".equals(style) ? 180 : 100;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                Vibrator vib = vm != null ? vm.getDefaultVibrator() : null;
                if (vib != null && vib.hasVibrator()) {
                    vib.vibrate(VibrationEffect.createOneShot(ms, amp));
                }
            } else {
                @SuppressWarnings("deprecation")
                Vibrator vib = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
                if (vib != null && vib.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vib.vibrate(VibrationEffect.createOneShot(ms, amp));
                    } else {
                        @SuppressWarnings("deprecation")
                        long ignored = ms;
                        vib.vibrate(ignored);
                    }
                }
            }
        } catch (Throwable ignored) {
        }
    }
}
