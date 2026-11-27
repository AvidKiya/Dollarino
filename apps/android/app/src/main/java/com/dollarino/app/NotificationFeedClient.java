package com.dollarino.app;

import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Lightweight zero-dependency HTTPS client talking directly to Dollarino's Cloudflare Worker.
 */
public final class NotificationFeedClient {

    public static final class AlertItem {
        public final String id;
        public final String channelId;
        public final String title;
        public final String body;
        public final String deepLink;
        public final boolean highPriority;
        public final boolean read;

        public AlertItem(String id, String channelId, String title, String body, String deepLink, boolean highPriority, boolean read) {
            this.id = id;
            this.channelId = channelId;
            this.title = title;
            this.body = body;
            this.deepLink = deepLink;
            this.highPriority = highPriority;
            this.read = read;
        }
    }

    public static final class FeedResponse {
        public final int statusCode;
        public final String cursor;
        public final List<AlertItem> items;

        public FeedResponse(int statusCode, String cursor, List<AlertItem> items) {
            this.statusCode = statusCode;
            this.cursor = cursor;
            this.items = items;
        }
    }

    private NotificationFeedClient() {}

    public static boolean registerDevice(@NonNull SecureSessionStore store) {
        String token = store.getToken();
        if (TextUtils.isEmpty(token)) return false;

        try {
            JSONObject body = new JSONObject();
            body.put("deviceId", store.getOrCreateDeviceId());
            body.put("platform", "android");
            if (!TextUtils.isEmpty(store.getFcmToken())) {
                body.put("fcmToken", store.getFcmToken());
            }
            body.put("appVersion", BuildConfig.VERSION_NAME);
            body.put("appBuild", BuildConfig.VERSION_CODE);
            body.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            body.put("osVersion", "Android " + Build.VERSION.RELEASE);

            int code = sendJson(store.getApiBase() + "/api/mobile/devices/register", "POST", token, body.toString());
            return code >= 200 && code < 300;
        } catch (Throwable ignored) {
            return false;
        }
    }

    @NonNull
    public static FeedResponse fetchFeed(@NonNull SecureSessionStore store, @Nullable String since) {
        String token = store.getToken();
        if (TextUtils.isEmpty(token)) {
            return new FeedResponse(401, null, new ArrayList<>());
        }

        HttpURLConnection conn = null;
        try {
            StringBuilder urlStr = new StringBuilder(store.getApiBase()).append("/api/mobile/notifications/feed?limit=15");
            if (!TextUtils.isEmpty(since)) {
                urlStr.append("&since=").append(URLEncoder.encode(since, "UTF-8"));
            }

            URL url = new URL(urlStr.toString());
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("X-Dollarino-Token", token);

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                return new FeedResponse(code, null, new ArrayList<>());
            }

            String raw = readStream(conn.getInputStream());
            JSONObject json = new JSONObject(raw);
            String nextCursor = json.optString("cursor", "");
            JSONArray arr = json.optJSONArray("items");
            List<AlertItem> list = new ArrayList<>();
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.optJSONObject(i);
                    if (obj == null) continue;
                    list.add(new AlertItem(
                            obj.optString("id", "ntf_" + i),
                            obj.optString("channelId", NotificationChannels.CHANNEL_SYSTEM),
                            obj.optString("title", "دلارینو"),
                            obj.optString("body", ""),
                            obj.optString("deepLink", "dollarino://app?tab=dashboard"),
                            "high".equalsIgnoreCase(obj.optString("priority", "default")),
                            obj.optBoolean("read", false)
                    ));
                }
            }
            return new FeedResponse(code, nextCursor, list);
        } catch (Throwable ignored) {
            return new FeedResponse(0, null, new ArrayList<>());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    public static void ackNotifications(@NonNull SecureSessionStore store, @NonNull List<String> ids) {
        String token = store.getToken();
        if (TextUtils.isEmpty(token) || ids.isEmpty()) return;
        try {
            JSONObject payload = new JSONObject();
            JSONArray arr = new JSONArray();
            for (String id : ids) arr.put(id);
            payload.put("ids", arr);
            sendJson(store.getApiBase() + "/api/mobile/notifications/ack", "POST", token, payload.toString());
        } catch (Throwable ignored) {
        }
    }

    private static int sendJson(@NonNull String urlStr, @NonNull String method, @NonNull String token, @NonNull String jsonBody) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setRequestMethod(method);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("X-Dollarino-Token", token);
            byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            return conn.getResponseCode();
        } catch (Throwable ignored) {
            return 0;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    @NonNull
    private static String readStream(@NonNull InputStream is) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }
}
