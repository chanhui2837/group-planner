package com.familyplanner.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS ↔ 포그라운드 서비스 브릿지.
 *
 * - start({ endpoint }): prefs 저장 + ForegroundService 시작 (멱등)
 * - stop(): prefs 해제 + 서비스 중단
 * - isRunning(): 서비스 생존 여부
 *
 * 위치 권한이 없으면 reject → JS는 기존 웹 watch로 폴백한다.
 */
@CapacitorPlugin(name = "BackgroundLocation")
public class BackgroundLocationPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String endpoint = call.getString("endpoint");
        if (endpoint == null || endpoint.isEmpty()) {
            call.reject("endpoint 필요");
            return;
        }
        Context ctx = getContext();
        boolean fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            call.reject("위치 권한이 없습니다. 앱 설정에서 위치를 허용해주세요.");
            return;
        }
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(
                    BackgroundLocationService.PREFS, Context.MODE_PRIVATE);
            prefs.edit()
                    .putBoolean(BackgroundLocationService.KEY_ENABLED, true)
                    .putString(BackgroundLocationService.KEY_ENDPOINT, endpoint)
                    .apply();
        } catch (Exception ignored) {}

        try {
            Intent i = new Intent(ctx, BackgroundLocationService.class)
                    .setAction(BackgroundLocationService.ACTION_START)
                    .putExtra(BackgroundLocationService.EXTRA_ENDPOINT, endpoint);
            ContextCompat.startForegroundService(ctx, i);
        } catch (Exception e) {
            call.reject("백그라운드 서비스 시작 실패: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("running", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        try {
            ctx.getSharedPreferences(BackgroundLocationService.PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(BackgroundLocationService.KEY_ENABLED, false)
                    .apply();
        } catch (Exception ignored) {}
        try {
            Intent i = new Intent(ctx, BackgroundLocationService.class)
                    .setAction(BackgroundLocationService.ACTION_STOP);
            // 이미 실행 중이면 onStartCommand(STOP)로 정리, 죽어 있으면 stopService로 정리
            try {
                ContextCompat.startForegroundService(ctx, i);
            } catch (Exception ignored) {}
            ctx.stopService(new Intent(ctx, BackgroundLocationService.class));
        } catch (Exception ignored) {}
        JSObject ret = new JSObject();
        ret.put("running", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", BackgroundLocationService.isRunning);
        call.resolve(ret);
    }
}
