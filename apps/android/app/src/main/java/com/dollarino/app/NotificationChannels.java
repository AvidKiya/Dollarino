package com.dollarino.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Registers Dollarino's 5 Android notification channels and renders actionable notifications
 * with deep-link navigation back into the exact app screen.
 */
public final class NotificationChannels {
    public static final String CHANNEL_SIGNALS = "dollarino_signals";
    public static final String CHANNEL_TRADES = "dollarino_trades";
    public static final String CHANNEL_SNIPER = "dollarino_sniper";
    public static final String CHANNEL_SECURITY = "dollarino_security";
    public static final String CHANNEL_SYSTEM = "dollarino_system";

    private static final String GROUP_DOLLARINO = "com.dollarino.app.ALERTS";

    private NotificationChannels() {}

    public static void ensureChannels(@NonNull Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        createChannel(
                nm,
                CHANNEL_SIGNALS,
                context.getString(R.string.channel_signals_name),
                context.getString(R.string.channel_signals_desc),
                NotificationManager.IMPORTANCE_HIGH,
                true
        );
        createChannel(
                nm,
                CHANNEL_TRADES,
                context.getString(R.string.channel_trades_name),
                context.getString(R.string.channel_trades_desc),
                NotificationManager.IMPORTANCE_HIGH,
                true
        );
        createChannel(
                nm,
                CHANNEL_SNIPER,
                context.getString(R.string.channel_sniper_name),
                context.getString(R.string.channel_sniper_desc),
                NotificationManager.IMPORTANCE_HIGH,
                true
        );
        createChannel(
                nm,
                CHANNEL_SECURITY,
                context.getString(R.string.channel_security_name),
                context.getString(R.string.channel_security_desc),
                NotificationManager.IMPORTANCE_HIGH,
                true
        );
        createChannel(
                nm,
                CHANNEL_SYSTEM,
                context.getString(R.string.channel_system_name),
                context.getString(R.string.channel_system_desc),
                NotificationManager.IMPORTANCE_DEFAULT,
                false
        );
    }

    private static void createChannel(
            @NonNull NotificationManager nm,
            @NonNull String id,
            @NonNull String name,
            @NonNull String desc,
            int importance,
            boolean vibrate
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(desc);
        ch.enableLights(true);
        ch.setLightColor(Color.parseColor("#10D9A3"));
        ch.enableVibration(vibrate);
        nm.createNotificationChannel(ch);
    }

    public static boolean hasPermission(@NonNull Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return NotificationManagerCompat.from(context).areNotificationsEnabled();
        }
        return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    public static void showAlert(
            @NonNull Context context,
            @NonNull String notificationId,
            @Nullable String channelId,
            @NonNull String title,
            @NonNull String body,
            @Nullable String deepLink,
            boolean highPriority
    ) {
        if (!hasPermission(context)) return;
        ensureChannels(context);

        String resolvedChannel = resolveValidChannel(channelId);
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (!TextUtils.isEmpty(deepLink)) {
            intent.setData(Uri.parse(deepLink));
            intent.putExtra(MainActivity.EXTRA_DEEP_LINK, deepLink);
        }

        int requestCode = Math.abs(notificationId.hashCode());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(context, requestCode, intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, resolvedChannel)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(Color.parseColor("#10D9A3"))
                .setContentTitle(TextUtils.isEmpty(title) ? context.getString(R.string.app_name) : title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(highPriority ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setGroup(GROUP_DOLLARINO)
                .setContentIntent(contentIntent);

        try {
            NotificationManagerCompat.from(context).notify(requestCode, builder.build());
        } catch (SecurityException ignored) {
            // Ignored if runtime permission revoked externally
        }
    }

    @NonNull
    private static String resolveValidChannel(@Nullable String raw) {
        if (CHANNEL_SIGNALS.equals(raw)) return CHANNEL_SIGNALS;
        if (CHANNEL_TRADES.equals(raw)) return CHANNEL_TRADES;
        if (CHANNEL_SNIPER.equals(raw)) return CHANNEL_SNIPER;
        if (CHANNEL_SECURITY.equals(raw)) return CHANNEL_SECURITY;
        return CHANNEL_SYSTEM;
    }
}
