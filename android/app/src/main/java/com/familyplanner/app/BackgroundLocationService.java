package com.familyplanner.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.webkit.CookieManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Family Planner 백그라운드 위치 서비스.
 *
 * - 포그라운드 서비스 + 상태바 상시 알림("위치 공유 중")으로 OS가 쉽게 죽이지 못하게 유지.
 * - 앱 WebView가 꺼지거나 프로세스가 백그라운드에 있어도 GPS/Network 위치를 받아 서버에 직접 POST.
 * - 인증은 WebView 쿠키(token)를 CookieManager에서 읽어 그대로 전송 (httpOnly여도 네이티브에서 읽힘).
 * - 5초/10m 디바운스: 의미 없는 중복 전송을 줄여 배터리 절약.
 *
 * 시작/중단은 JS(Capacitor 플러그인 BackgroundLocation) 또는 BootReceiver가 담당.
 */
public class BackgroundLocationService extends Service {

    private static final String TAG = "FPLocationService";

    public static final String ACTION_START = "com.familyplanner.app.action.START_TRACKING";
    public static final String ACTION_STOP = "com.familyplanner.app.action.STOP_TRACKING";
    public static final String EXTRA_ENDPOINT = "endpoint";

    public static final String PREFS = "fp_bg_location";
    public static final String KEY_ENABLED = "enabled";
    public static final String KEY_ENDPOINT = "endpoint";

    public static volatile boolean isRunning = false;

    private static final String CHANNEL_ID = "fp_location";
    private static final int NOTIF_ID = 1001;

    private static final long MIN_TIME_MS = 15000; // 15초
    private static final float MIN_DIST_M = 10f;   // 10m

    private LocationManager locationManager;
    private LocationListener listener;
    private ExecutorService netExecutor;
    private String endpoint;

    private double lastLat = Double.NaN;
    private double lastLng = Double.NaN;
    private long lastSentMs = 0;
    private String lastStatusText = "위치 수신 대기 중…";

    @Override
    public void onCreate() {
        super.onCreate();
        netExecutor = Executors.newSingleThreadExecutor();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            handleStop();
            return START_NOT_STICKY;
        }
        String ep = intent != null ? intent.getStringExtra(EXTRA_ENDPOINT) : null;
        if (ep == null || ep.isEmpty()) {
            // 시스템이 서비스 재시작 시킨 경우: 저장된 endpoint로 복구
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            if (p.getBoolean(KEY_ENABLED, false)) {
                ep = p.getString(KEY_ENDPOINT, null);
            }
        }
        if (ep == null || ep.isEmpty()) {
            Log.w(TAG, "endpoint 없음 — 서비스 시작 취소");
            stopSelf();
            return START_NOT_STICKY;
        }
        this.endpoint = ep;

        startAsForeground();
        startLocationUpdates();
        isRunning = true;
        Log.i(TAG, "백그라운드 위치 추적 시작: " + endpoint);
        return START_STICKY; // OS가 죽여도 endpoint 복구해서 재시작
    }

    private void startAsForeground() {
        Notification notif = buildNotification(lastStatusText);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                        this, NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIF_ID, notif);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground 실패, 일반 startForeground로 재시도: " + e.getMessage());
            try {
                startForeground(NOTIF_ID, notif);
            } catch (Exception e2) {
                Log.e(TAG, "startForeground 완전 실패", e2);
                stopSelf();
            }
        }
    }

    private void startLocationUpdates() {
        try {
            if (locationManager == null) {
                locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            }
            if (locationManager == null) {
                Log.e(TAG, "LocationManager 없음");
                stopSelf();
                return;
            }
            boolean fine = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
            boolean coarse = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
            if (!fine && !coarse) {
                Log.w(TAG, "위치 권한 없음 — 서비스 중단");
                updateStatus("위치 권한이 없어 중단됨. 앱에서 권한 허용 필요");
                stopSelf();
                return;
            }
            if (listener == null) {
                listener = new LocationListener() {
                    @Override
                    public void onLocationChanged(Location location) {
                        onFix(location.getLatitude(), location.getLongitude(), location.hasAccuracy() ? location.getAccuracy() : -1);
                    }

                    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                    @Override public void onProviderEnabled(String provider) {}
                    @Override public void onProviderDisabled(String provider) {}
                };
            }
            try {
                locationManager.removeUpdates(listener);
            } catch (Exception ignored) {}
            Looper looper = Looper.getMainLooper() != null ? Looper.getMainLooper() : Looper.myLooper();
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, MIN_TIME_MS, MIN_DIST_M, listener, looper);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, MIN_TIME_MS, MIN_DIST_M, listener, looper);
            }
            // 즉시 1회: 마지막 알려진 위치 전송 (알림에 바로 반영)
            try {
                Location last = null;
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                }
                if (last == null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    last = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                }
                if (last != null) {
                    onFix(last.getLatitude(), last.getLongitude(), last.hasAccuracy() ? last.getAccuracy() : -1);
                }
            } catch (SecurityException se) {
                Log.w(TAG, "lastKnown 권한 실패", se);
            }
        } catch (SecurityException se) {
            Log.w(TAG, "위치 요청 권한 실패", se);
            stopSelf();
        } catch (Exception e) {
            Log.e(TAG, "위치 업데이트 시작 실패", e);
            stopSelf();
        }
    }

    private void onFix(double lat, double lng, float accuracy) {
        long now = System.currentTimeMillis();
        if (!Double.isNaN(lastLat)) {
            float[] r = new float[1];
            Location.distanceBetween(lastLat, lastLng, lat, lng, r);
            if (now - lastSentMs < 5000 && r[0] < 10) return; // 5초/10m 디바운스
        }
        lastLat = lat;
        lastLng = lng;
        lastSentMs = now;
        postLocation(lat, lng);
    }

    private void postLocation(final double lat, final double lng) {
        final String ep = endpoint;
        if (ep == null || netExecutor == null) return;
        netExecutor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                JSONObject body = new JSONObject();
                body.put("lat", lat);
                body.put("lng", lng);
                body.put("address", "");
                body.put("sharing", true);
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);

                URL url = new URL(ep);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                conn.setRequestProperty("User-Agent", "FamilyPlanner-BackgroundService/1.0");
                // WebView 세션 쿠키 그대로 전달 (httpOnly token 포함)
                try {
                    String cookie = CookieManager.getInstance().getCookie(ep);
                    if (cookie != null && !cookie.isEmpty()) {
                        conn.setRequestProperty("Cookie", cookie);
                    }
                } catch (Exception ce) {
                    Log.w(TAG, "쿠키 읽기 실패: " + ce.getMessage());
                }
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                    os.flush();
                }
                int code = conn.getResponseCode();
                if (code >= 200 && code < 300) {
                    Log.i(TAG, String.format("📍 [BG] 위치 전송 OK: %.5f,%.5f", lat, lng));
                    updateStatus(String.format("마지막 전송 %tR · %.4f, %.4f", System.currentTimeMillis(), lat, lng));
                } else if (code == 401) {
                    Log.w(TAG, "[BG] 401 인증 실패 — 로그아웃 상태로 추정, 서비스 유지(재로그인 시 자동 복구)");
                    updateStatus("로그인이 필요해요. 앱에서 다시 로그인해주세요");
                } else {
                    Log.w(TAG, "[BG] 전송 실패 HTTP " + code);
                }
            } catch (Exception e) {
                Log.w(TAG, "[BG] 전송 예외: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private void updateStatus(String text) {
        lastStatusText = text;
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotification(text));
        } catch (Exception ignored) {}
    }

    private void handleStop() {
        try {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, false).apply();
        } catch (Exception ignored) {}
        stopTrackingInternal();
        stopSelf();
    }

    private void stopTrackingInternal() {
        try {
            if (locationManager != null && listener != null) locationManager.removeUpdates(listener);
        } catch (Exception ignored) {}
        isRunning = false;
        try {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {}
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIF_ID);
        } catch (Exception ignored) {}
        Log.i(TAG, "백그라운드 위치 추적 중단");
    }

    @Override
    public void onDestroy() {
        stopTrackingInternal();
        if (netExecutor != null) {
            netExecutor.shutdownNow();
            netExecutor = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "위치 공유", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("가족 위치 공유가 켜져 있을 때 GPS 상태를 표시합니다");
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.createNotificationChannel(ch);
            } catch (Exception ignored) {}
        }
    }

    private Notification buildNotification(String subText) {
        Context ctx = this;
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent contentPi;
        try {
            contentPi = PendingIntent.getActivity(
                    ctx, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        } catch (Exception e) {
            contentPi = null;
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setContentTitle("📍 Family Planner 위치 공유 중")
                .setContentText(subText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                        subText + "\n이동하면 가족 지도에 자동 반영됩니다. 끄려면 앱 > 지도 > 공유 중단"))
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (contentPi != null) b.setContentIntent(contentPi);
        return b.build();
    }
}
