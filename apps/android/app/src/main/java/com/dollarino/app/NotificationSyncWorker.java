package com.dollarino.app;

import android.content.Context;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Reliable background notification worker that checks Dollarino's Cloudflare Worker
 * inbox and raises native OS tray notifications across all 5 channels.
 */
public class NotificationSyncWorker extends Worker {

    public static final String UNIQUE_PERIODIC_NAME = "dollarino_notif_periodic_sync";
    public static final String UNIQUE_IMMEDIATE_NAME = "dollarino_notif_immediate_sync";

    public NotificationSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SecureSessionStore store = new SecureSessionStore(ctx);
        if (TextUtils.isEmpty(store.getToken())) {
            return Result.success();
        }

        String cursor = store.getLastNotifCursor();
        boolean isFirstBaseline = TextUtils.isEmpty(cursor);

        NotificationFeedClient.FeedResponse feed = NotificationFeedClient.fetchFeed(store, cursor);
        if (feed.statusCode == 401) {
            // Session expired or revoked remotely
            store.clearAuthSession();
            return Result.success();
        }
        if (feed.statusCode == 0 || feed.statusCode >= 500) {
            return Result.retry();
        }

        List<String> shownIds = new ArrayList<>();
        if (!feed.items.isEmpty()) {
            // On initial sync, notify only unread items (max 3) so login doesn't replay old history
            List<NotificationFeedClient.AlertItem> ordered = new ArrayList<>(feed.items);
            Collections.reverse(ordered);
            int maxShown = isFirstBaseline ? 3 : 8;
            int shownCount = 0;

            for (NotificationFeedClient.AlertItem item : ordered) {
                if (item.read) continue;
                if (shownCount < maxShown) {
                    NotificationChannels.showAlert(
                            ctx,
                            item.id,
                            item.channelId,
                            item.title,
                            item.body,
                            item.deepLink,
                            item.highPriority
                    );
                    shownIds.add(item.id);
                    shownCount++;
                }
            }

            if (!shownIds.isEmpty()) {
                NotificationFeedClient.ackNotifications(store, shownIds);
            }
        }

        if (!TextUtils.isEmpty(feed.cursor)) {
            store.setLastNotifCursor(feed.cursor);
        }

        return Result.success();
    }
}
