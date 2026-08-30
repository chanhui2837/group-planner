"use client";
import { useEffect, useState } from "react";

export default function PWAInstall() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) {
      alert("브라우저 메뉴 > ‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러 설치하세요.\n\n폰: Chrome 메뉴(⋮) > 홈 화면에 추가\nPC: 주소창 오른쪽 설치 아이콘");
      return;
    }
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setDeferred(null);
  };

  if (installed) return <span className="text-xs bg-[#E0F7F4] text-[#00B894] px-2.5 py-1 rounded-full font-bold">✓ 앱 설치됨</span>;

  return (
    <button onClick={install} className="px-3 py-2 rounded-xl bg-[#2D3436] text-white text-xs font-black flex items-center gap-1.5">
      📲 앱 설치
    </button>
  );
}
