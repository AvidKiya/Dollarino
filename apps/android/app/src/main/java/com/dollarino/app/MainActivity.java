package com.dollarino.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONObject;

/**
 * Dollarino native Android container hosting the bundled local Dollarino application
 * with encrypted Keystore auth sync, WorkManager background notifications, file uploads,
 * deep-link routing, and native Trust Wallet / Telegram intent handoff.
 */
public class MainActivity extends AppCompatActivity {

    public static final String EXTRA_DEEP_LINK = "com.dollarino.app.DEEP_LINK";
    private static final String PREF_PERM_PROMPTED = "dollarino_notif_perm_prompted";

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private View splashOverlay;
    private SecureSessionStore sessionStore;

    @Nullable
    private ValueCallback<Uri[]> pendingFileCallback;
    private long lastBackPressedMs = 0L;
    private boolean webReady = false;
    @Nullable
    private Uri pendingLaunchUri = null;

    private final ActivityResultLauncher<String> notifPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) {
                    DollarinoApp.triggerImmediateSync(getApplication());
                }
            });

    private final ActivityResultLauncher<String[]> filePickerLauncher =
            registerForActivityResult(new ActivityResultContracts.OpenMultipleDocuments(), uris -> {
                if (pendingFileCallback != null) {
                    Uri[] result = (uris != null && !uris.isEmpty()) ? uris.toArray(new Uri[0]) : null;
                    pendingFileCallback.onReceiveValue(result);
                    pendingFileCallback = null;
                }
            });

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        sessionStore = new SecureSessionStore(this);
        swipeRefresh = findViewById(R.id.swipe_refresh);
        webView = findViewById(R.id.dollarino_webview);
        splashOverlay = findViewById(R.id.splash_overlay);

        applySystemBarTheme(true);

        swipeRefresh.setColorSchemeColors(Color.parseColor("#10D9A3"), Color.parseColor("#F59E0B"));
        swipeRefresh.setProgressBackgroundColorSchemeColor(Color.parseColor("#0F172A"));
        swipeRefresh.setOnRefreshListener(() -> {
            if (webView != null) {
                webView.reload();
            }
            DollarinoApp.triggerImmediateSync(getApplication());
            swipeRefresh.postDelayed(() -> swipeRefresh.setRefreshing(false), 900);
        });

        configureWebView();
        registerBackNavigation();

        if (getIntent() != null) {
            Uri data = getIntent().getData();
            String extra = getIntent().getStringExtra(EXTRA_DEEP_LINK);
            if (data != null) {
                pendingLaunchUri = data;
            } else if (!TextUtils.isEmpty(extra)) {
                pendingLaunchUri = Uri.parse(extra);
            }
        }

        webView.loadUrl(DollarinoWebViewClient.LOCAL_APP_ORIGIN + "/index.html");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setAllowFileAccessFromFileURLs(false);
        ws.setAllowUniversalAccessFromFileURLs(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setUseWideViewPort(true);
        ws.setLoadWithOverviewMode(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setUserAgentString(ws.getUserAgentString() + " DollarinoAndroid/" + BuildConfig.VERSION_NAME);

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Allow SwipeRefresh strictly when page is scrolled to the very top
        webView.setOnScrollChangeListener((v, scrollX, scrollY, oldScrollX, oldScrollY) ->
                swipeRefresh.setEnabled(scrollY <= 2)
        );

        webView.addJavascriptInterface(new DollarinoNativeBridge(this, sessionStore), "DollarinoNative");

        webView.setWebViewClient(new DollarinoWebViewClient(this, this, () -> {
            webReady = true;
            if (swipeRefresh != null) swipeRefresh.setRefreshing(false);
            if (splashOverlay != null && splashOverlay.getVisibility() == View.VISIBLE) {
                splashOverlay.animate()
                        .alpha(0f)
                        .setDuration(160)
                        .withEndAction(() -> splashOverlay.setVisibility(View.GONE))
                        .start();
            }
            if (pendingLaunchUri != null) {
                Uri target = pendingLaunchUri;
                pendingLaunchUri = null;
                handleIncomingUri(target);
            }
        }));

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }
                pendingFileCallback = filePathCallback;
                try {
                    String[] mimeTypes = new String[]{"image/*"};
                    if (fileChooserParams != null && fileChooserParams.getAcceptTypes() != null
                            && fileChooserParams.getAcceptTypes().length > 0
                            && !TextUtils.isEmpty(fileChooserParams.getAcceptTypes()[0])) {
                        mimeTypes = fileChooserParams.getAcceptTypes();
                    }
                    filePickerLauncher.launch(mimeTypes);
                    return true;
                } catch (Throwable ignored) {
                    pendingFileCallback = null;
                    return false;
                }
            }
        });
    }

    private void registerBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView == null) {
                    finish();
                    return;
                }
                webView.evaluateJavascript(
                        "(function(){return window.__dollarinoHandleAndroidBack ? Boolean(window.__dollarinoHandleAndroidBack()) : false;})()",
                        result -> {
                            if ("true".equals(result)) {
                                return;
                            }
                            if (webView.canGoBack()) {
                                webView.goBack();
                                return;
                            }
                            long now = System.currentTimeMillis();
                            if (now - lastBackPressedMs < 2000L) {
                                finish();
                            } else {
                                lastBackPressedMs = now;
                                Toast.makeText(MainActivity.this, R.string.back_press_exit_hint, Toast.LENGTH_SHORT).show();
                            }
                        }
                );
            }
        });
    }

    @Override
    protected void onNewIntent(@NonNull Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri data = intent.getData();
        String extra = intent.getStringExtra(EXTRA_DEEP_LINK);
        if (data != null) {
            handleIncomingUri(data);
        } else if (!TextUtils.isEmpty(extra)) {
            handleIncomingUri(Uri.parse(extra));
        }
    }

    public void handleIncomingUri(@NonNull Uri uri) {
        if (!webReady || webView == null) {
            pendingLaunchUri = uri;
            return;
        }
        String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
        if ("auth".equals(host)) {
            try {
                JSONObject authJson = new JSONObject();
                String gToken = uri.getQueryParameter("google_token");
                String g2fa = uri.getQueryParameter("google_2fa");
                String gErr = uri.getQueryParameter("auth_error");
                if (!TextUtils.isEmpty(gToken)) authJson.put("google_token", gToken);
                if (!TextUtils.isEmpty(g2fa)) authJson.put("google_2fa", g2fa);
                if (!TextUtils.isEmpty(gErr)) authJson.put("auth_error", gErr);
                String jsArg = JSONObject.quote(authJson.toString());
                webView.evaluateJavascript(
                        "window.__dollarinoHandleAndroidAuth && window.__dollarinoHandleAndroidAuth(" + jsArg + ");",
                        null
                );
            } catch (Throwable ignored) {
            }
            return;
        }

        String jsUrl = JSONObject.quote(uri.toString());
        webView.evaluateJavascript(
                "window.__dollarinoHandleAndroidDeepLink && window.__dollarinoHandleAndroidDeepLink(" + jsUrl + ");",
                null
        );
    }

    public void applySystemBarTheme(boolean isDark) {
        Window window = getWindow();
        if (window == null) return;
        int barColor = isDark ? Color.parseColor("#070B14") : Color.parseColor("#F3F7FF");
        window.setStatusBarColor(barColor);
        window.setNavigationBarColor(barColor);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(!isDark);
            controller.setAppearanceLightNavigationBars(!isDark);
        }
    }

    public void ensureNotificationPermissionPromptedOnce() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        boolean alreadyPrompted = getSharedPreferences("dollarino_ui", MODE_PRIVATE)
                .getBoolean(PREF_PERM_PROMPTED, false);
        if (!alreadyPrompted) {
            getSharedPreferences("dollarino_ui", MODE_PRIVATE)
                    .edit()
                    .putBoolean(PREF_PERM_PROMPTED, true)
                    .apply();
            notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
        }
    }

    public void requestNotificationPermissionExplicitly() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
        } else {
            DollarinoApp.triggerImmediateSync(getApplication());
            Toast.makeText(this, "اعلان‌های اندروید فعال هستند", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        if (!TextUtils.isEmpty(sessionStore.getToken())) {
            DollarinoApp.triggerImmediateSync(getApplication());
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
