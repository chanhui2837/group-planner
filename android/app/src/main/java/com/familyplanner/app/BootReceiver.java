package com.familyplanner.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.core.content.ContextCompat;

/**
 * 재부팅/앱 업데이트 후 백그라운드 추적 복구 시도.
 * (Android 12+ 백그라운드 시작 제한으로 실패할 수 있음 — 그 경우
 *  사용자가 앱을 한 번 열면 JS 자동재개가 서비스를 다시 켠다.)
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "FPBootReceiver";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        SharedPreferences p;
        try {
            p = ctx.getSharedPreferences(BackgroundLocationService.PREFS, Context.MODE_PRIVATE);
        } catch (Exception e) {
            return;
        }
        if (!p.getBoolean(BackgroundLocationService.KEY_ENABLED, false)) return;
        String endpoint = p.getString(BackgroundLocationService.KEY_ENDPOINT, null);
        if (endpoint == null || endpoint.isEmpty()) return;
        try {
            Intent i = new Intent(ctx, BackgroundLocationService.class)
                    .setAction(BackgroundLocationService.ACTION_START)
                    .putExtra(BackgroundLocationService.EXTRA_ENDPOINT, endpoint);
            ContextCompat.startForegroundService(ctx, i);
            Log.i(TAG, "재부팅 후 백그라운드 추적 복구 시도");
        } catch (Exception e) {
            Log.w(TAG, "부팅 복구 스킵 (앱 실행 시 자동재개됨): " + e.getMessage());
        }
    }
}
