package com.dollarino.app;

import android.app.Application;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Initializes Dollarino notification channels and reliable background WorkManager polling.
 */
public class DollarinoApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationChannels.ensureChannels(this);
        schedulePeriodicNotificationSync();
    }

    public void schedulePeriodicNotificationSync() {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(
                NotificationSyncWorker.class,
                15,
                TimeUnit.MINUTES
        )
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                NotificationSyncWorker.UNIQUE_PERIODIC_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                periodic
        );
    }

    public static void triggerImmediateSync(Application app) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(NotificationSyncWorker.class)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(app).enqueueUniqueWork(
                NotificationSyncWorker.UNIQUE_IMMEDIATE_NAME,
                ExistingWorkPolicy.REPLACE,
                immediate
        );
    }
}
