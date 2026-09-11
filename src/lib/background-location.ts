"use client";
import { Capacitor, registerPlugin } from "@capacitor/core";

interface BackgroundLocationPlugin {
  start(options: { endpoint: string }): Promise<{ running: boolean }>;
  stop(): Promise<{ running: boolean }>;
  isRunning(): Promise<{ running: boolean }>;
}

let native: BackgroundLocationPlugin | null = null;
try {
  native = registerPlugin<BackgroundLocationPlugin>("BackgroundLocation");
} catch {
  native = null;
}

/** Capacitor 네이티브 앱(안드로이드)에서만 true */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function locationEndpoint(): string {
  // 네이티브 앱은 server.url(Render)을 로드하므로 같은 origin 기준이면 정확함
  return new URL("/api/location", window.location.href).toString();
}

/**
 * 포그라운드 서비스 시작 (상시 알림 + GPS 유지).
 * 성공 시 true. 웹/권한없음/플러그인미탑재면 false (JS watch로 폴백).
 */
export async function startNativeTracking(): Promise<boolean> {
  if (!isNativeApp() || !native) return false;
  try {
    const r = await native.start({ endpoint: locationEndpoint() });
    console.log("[bg-location] 네이티브 서비스 시작:", r.running);
    return !!r.running;
  } catch (e: any) {
    console.warn("[bg-location] 네이티브 시작 실패, JS 추적으로 폴백:", e?.message || e);
    return false;
  }
}

export async function stopNativeTracking(): Promise<void> {
  if (!isNativeApp() || !native) return;
  try {
    await native.stop();
    console.log("[bg-location] 네이티브 서비스 중단");
  } catch (e: any) {
    console.warn("[bg-location] 네이티브 중단 실패:", e?.message || e);
  }
}

export async function isNativeTracking(): Promise<boolean> {
  if (!isNativeApp() || !native) return false;
  try {
    const r = await native.isRunning();
    return !!r.running;
  } catch {
    return false;
  }
}
