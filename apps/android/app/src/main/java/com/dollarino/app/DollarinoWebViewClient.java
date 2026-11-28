package com.dollarino.app;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Serves Dollarino's compiled mobile UI directly from APK local assets (`assets/public`)
 * via WebViewAssetLoader at `https://appassets.dollarino.local/`, never as a remote shortcut,
 * and routes external wallet/Telegram/OAuth URLs safely to native Android handlers.
 */
public final class DollarinoWebViewClient extends WebViewClient {
    public static final String LOCAL_ASSET_HOST = "appassets.dollarino.local";
    public static final String LOCAL_APP_ORIGIN = "https://" + LOCAL_ASSET_HOST;

    private final Activity activity;
    private final WebViewAssetLoader assetLoader;
    private final Runnable onFirstPageFinished;
    private boolean splashDismissed = false;

    public DollarinoWebViewClient(
            @NonNull Activity activity,
            @NonNull Context context,
            @NonNull Runnable onFirstPageFinished
    ) {
        this.activity = activity;
        this.onFirstPageFinished = onFirstPageFinished;
        // WebViewAssetLoader.AssetsPathHandler only exposes a (Context) constructor and maps
        // "/" straight onto the APK's assets/ root. There is no (Context, String) overload
        // and no subdirectory argument - passing one does not compile:
        //   error: no suitable constructor found for AssetsPathHandler(Context,String)
        // We therefore load from assets/public/index.html to keep the web bundle out of the
        // assets/ root, so the path handler gets its own loader rooted at "public".
        this.assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(LOCAL_ASSET_HOST)
                .addPathHandler(
                        "/",
                        new WebViewAssetLoader.AssetsPathHandler(context.getApplicationContext()) {
                            @Override
                            public WebResourceResponse handle(@NonNull String path) {
                                try {
                                    InputStream is = context.getApplicationContext()
                                            .getAssets()
                                            .open("public/" + (path.startsWith("/") ? path.substring(1) : path));
                                    return new WebResourceResponse(guessMimeType(path), null, is);
                                } catch (IOException e) {
                                    return null;
                                }
                            }
                        }
                )
                .build();
    }

    /**
     * Minimal MIME table for the bundled SPA assets. Returning null lets WebView sniff,
     * which is wrong for JS/CSS, so the common extensions are mapped explicitly.
     */
    private static String guessMimeType(@NonNull String path) {
        String lower = path.toLowerCase(java.util.Locale.ROOT);
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".ico")) return "image/x-icon";
        return null;
    }

    @Nullable
    @Override
    public WebResourceResponse shouldInterceptRequest(@NonNull WebView view, @NonNull WebResourceRequest request) {
        Uri url = request.getUrl();
        if (url != null && LOCAL_ASSET_HOST.equalsIgnoreCase(url.getHost())) {
            WebResourceResponse res = assetLoader.shouldInterceptRequest(url);
            if (res != null) {
                return res;
            }
            // SPA fallback: serve bundled index.html for clean routes like /verify-card/... or /
            String path = url.getPath() != null ? url.getPath() : "/";
            if (!path.contains(".") || path.endsWith(".html")) {
                try {
                    InputStream is = activity.getAssets().open("public/index.html");
                    return new WebResourceResponse("text/html", "UTF-8", is);
                } catch (Throwable ignored) {
                    String fallbackHtml = "<!doctype html><html><body style='background:#070b14;color:#f8fafc;font-family:sans-serif;padding:24px;text-align:center'><h2>Dollarino Assets Missing</h2><p>Run <code>npm run build:android</code> to bundle local app assets.</p></body></html>";
                    return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(fallbackHtml.getBytes()));
                }
            }
        }
        return super.shouldInterceptRequest(view, request);
    }

    @Override
    public boolean shouldOverrideUrlLoading(@NonNull WebView view, @NonNull WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri == null) return false;
        String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";

        // Stay inside local bundled WebView ONLY for our appassets host
        if ("https".equals(scheme) && LOCAL_ASSET_HOST.equals(host)) {
            return false;
        }
        // Handle custom dollarino:// deep links in-app
        if ("dollarino".equals(scheme)) {
            if (activity instanceof MainActivity) {
                ((MainActivity) activity).handleIncomingUri(uri);
            }
            return true;
        }

        // Route Trust Wallet, Telegram, Google OAuth, and block explorers to native Android intents / Custom Tabs
        DollarinoNativeBridge.openSafeExternalUrl(activity, uri.toString());
        return true;
    }

    @Override
    public void onPageFinished(@NonNull WebView view, @NonNull String url) {
        super.onPageFinished(view, url);
        if (!splashDismissed) {
            splashDismissed = true;
            onFirstPageFinished.run();
        }
    }
}
