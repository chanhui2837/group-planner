"use client";
import { useEffect, useState } from "react";

export interface AlarmData {
  title: string;
  body: string;
  type: "schedule" | "vote" | "message";
}

export default function AlarmOverlay({ alarm, onClose }: { alarm: AlarmData | null; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (alarm) {
      setVisible(true);
      // vibration
      if ("vibrate" in navigator) navigator.vibrate([300, 100, 300, 100, 500]);
      // sound via Web Audio
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.5, ctx.currentTime);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        o.stop(ctx.currentTime + 0.6);
        setTimeout(() => {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.frequency.value = 660;
          o2.connect(g2);
          g2.connect(ctx.destination);
          g2.gain.setValueAtTime(0.5, ctx.currentTime);
          o2.start();
          g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
          o2.stop(ctx.currentTime + 0.8);
        }, 400);
      } catch {}
      // auto close after 8s
      const t = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(t);
    }
  }, [alarm]);

  if (!alarm || !visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setVisible(false)} />
      <div
        className="relative w-full max-w-[420px] bg-white rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.3)] p-6 border-[3px] border-[#FF6B6B] overflow-hidden"
        style={{ animation: "alarmShake 0.4s ease 2, slideIn 0.4s ease" }}
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#FF6B6B] via-[#FFE66D] to-[#4ECDC4]" />
        {/* pulse rings */}
        <div className="absolute -top-6 -right-6 w-24 h-24 pointer-events-none">
          <div className="absolute inset-0 rounded-full bg-[#FF6B6B]/20" style={{ animation: "pulse-ring 1.2s cubic-bezier(0.455,0.03,0.515,0.955) infinite" }} />
          <div className="absolute inset-2 rounded-full bg-[#FF6B6B]/30" style={{ animation: "pulse-ring 1.2s 0.3s infinite" }} />
        </div>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6B6B] to-[#FF8E53] flex items-center justify-center text-2xl shadow-lg shrink-0">
            {alarm.type === "schedule" ? "📅" : alarm.type === "vote" ? "🗳️" : "💬"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-black tracking-widest text-[#FF6B6B]">FAMILY ALARM • 큼직한 알림</div>
            <div className="text-[18px] font-black leading-tight mt-1 text-[#2D3436] break-words">{alarm.title}</div>
            <div className="text-[14px] text-[#636E72] mt-1 leading-snug break-words">{alarm.body}</div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(onClose, 300);
            }}
            className="flex-1 py-3 rounded-2xl bg-[#2D3436] text-white font-bold text-sm"
          >
            확인했어요
          </button>
          <button
            onClick={() => setVisible(false)}
            className="px-6 py-3 rounded-2xl bg-[#FFE8D6] text-[#2D3436] font-bold text-sm"
          >
            닫기
          </button>
        </div>

        <div className="mt-3 text-center text-[11px] text-[#B2BEC3]">진동 + 사운드 + 화면 알림이 동시에 울렸어요!</div>
      </div>
    </div>
  );
}
