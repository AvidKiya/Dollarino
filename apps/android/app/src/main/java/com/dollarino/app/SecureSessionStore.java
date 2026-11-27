package com.dollarino.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import java.util.UUID;

/**
 * Hardware-backed AES-256-GCM EncryptedSharedPreferences wrapper for Dollarino session tokens,
 * device identity, notification cursor, and backend base URL.
 */
public final class SecureSessionStore {
    private static final String PREFS_FILE = "dollarino_secure_prefs_v1";
    private static final String KEY_TOKEN = "auth_token";
    private static final String KEY_API_BASE = "api_base";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_USERNAME = "username";
    private static final String KEY_LAST_NOTIF_CURSOR = "notif_cursor";
    private static final String KEY_FCM_TOKEN = "fcm_token";

    private final SharedPreferences prefs;

    public SecureSessionStore(@NonNull Context context) {
        SharedPreferences resolved;
        Context appCtx = context.getApplicationContext();
        try {
            MasterKey masterKey = new MasterKey.Builder(appCtx)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build();
            resolved = EncryptedSharedPreferences.create(
                    appCtx,
                    PREFS_FILE,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Throwable ignored) {
            // Fallback for older devices with broken Keystore hardware providers
            resolved = appCtx.getSharedPreferences(PREFS_FILE + "_fb", Context.MODE_PRIVATE);
        }
        this.prefs = resolved;
    }

    @NonNull
    public synchronized String getOrCreateDeviceId() {
        String existing = prefs.getString(KEY_DEVICE_ID, null);
        if (!TextUtils.isEmpty(existing)) {
            return existing;
        }
        String fresh = "andr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        prefs.edit().putString(KEY_DEVICE_ID, fresh).apply();
        return fresh;
    }

    @Nullable
    public String getToken() {
        String t = prefs.getString(KEY_TOKEN, null);
        return TextUtils.isEmpty(t) ? null : t;
    }

    @NonNull
    public String getApiBase() {
        String saved = prefs.getString(KEY_API_BASE, null);
        if (!TextUtils.isEmpty(saved) && isSafeApiBase(saved)) {
            return stripTrailingSlash(saved);
        }
        return stripTrailingSlash(BuildConfig.DEFAULT_API_BASE);
    }

    public void saveAuthSession(
            @NonNull String token,
            @Nullable String apiBase,
            @Nullable String userId,
            @Nullable String username
    ) {
        SharedPreferences.Editor ed = prefs.edit().putString(KEY_TOKEN, token.trim());
        if (!TextUtils.isEmpty(apiBase) && isSafeApiBase(apiBase)) {
            ed.putString(KEY_API_BASE, stripTrailingSlash(apiBase));
        }
        if (!TextUtils.isEmpty(userId)) {
            ed.putString(KEY_USER_ID, userId.trim());
        }
        if (!TextUtils.isEmpty(username)) {
            ed.putString(KEY_USERNAME, username.trim());
        }
        ed.apply();
    }

    public boolean setApiBase(@Nullable String apiBase) {
        if (TextUtils.isEmpty(apiBase) || !isSafeApiBase(apiBase)) {
            return false;
        }
        prefs.edit().putString(KEY_API_BASE, stripTrailingSlash(apiBase)).apply();
        return true;
    }

    public void clearAuthSession() {
        prefs.edit()
                .remove(KEY_TOKEN)
                .remove(KEY_USER_ID)
                .remove(KEY_USERNAME)
                .remove(KEY_LAST_NOTIF_CURSOR)
                .apply();
    }

    @Nullable
    public String getLastNotifCursor() {
        return prefs.getString(KEY_LAST_NOTIF_CURSOR, null);
    }

    public void setLastNotifCursor(@Nullable String cursor) {
        if (!TextUtils.isEmpty(cursor)) {
            prefs.edit().putString(KEY_LAST_NOTIF_CURSOR, cursor).apply();
        }
    }

    @Nullable
    public String getFcmToken() {
        return prefs.getString(KEY_FCM_TOKEN, null);
    }

    public void setFcmToken(@Nullable String fcmToken) {
        if (!TextUtils.isEmpty(fcmToken)) {
            prefs.edit().putString(KEY_FCM_TOKEN, fcmToken).apply();
        }
    }

    public static boolean isSafeApiBase(@NonNull String url) {
        String clean = url.trim().toLowerCase();
        if (clean.startsWith("https://")) return true;
        return clean.startsWith("http://10.0.2.2:") || clean.startsWith("http://127.0.0.1:") || clean.startsWith("http://localhost:");
    }

    @NonNull
    private static String stripTrailingSlash(@NonNull String raw) {
        String s = raw.trim();
        while (s.endsWith("/")) {
            s = s.substring(0, s.length() - 1);
        }
        return s;
    }
}
