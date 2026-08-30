import Logo from "@/components/Logo";

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col items-center p-6">
      <div className="bg-white rounded-[28px] border border-[#FFE0CC] shadow-lg max-w-[560px] w-full p-8 mt-8">
        <Logo size={44} />
        <h1 className="text-[24px] font-black mt-4">Family Planner 앱 다운로드</h1>
        <p className="text-sm text-[#636E72] mt-2">핸드폰에 바로 설치해 앱처럼 사용하세요. APK는 PWA 기반이라 Play 스토어 없이 설치 가능합니다.</p>

        <div className="mt-6 grid gap-4">
          <div className="p-4 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC]">
            <div className="font-black text-sm">📲 가장 빠른 방법 (권장) — PWA 설치</div>
            <div className="text-xs text-[#636E72] mt-1">폰 Chrome으로 <b>https://group-planner-2ul2.onrender.com</b> 접속 → 메뉴(⋮) → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b> → 바탕화면에 아이콘 생김. 푸시 알림도 꺼져도 옵니다.</div>
            <a href="https://group-planner-2ul2.onrender.com" className="mt-3 inline-block px-4 py-2 rounded-xl bg-[#FF6B6B] text-white font-black text-sm">사이트 열기</a>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC]">
            <div className="font-black text-sm">📦 APK 직접 다운로드 (Android)</div>
            <div className="text-xs text-[#636E72] mt-1">PWABuilder로 생성된 TWA APK입니다. 다운로드 후 설치 허용 후 실행하세요. (출처를 알 수 없는 앱 설치 허용 필요)</div>
            <div className="mt-3 flex flex-col gap-2">
              <a href="https://www.pwabuilder.com/reportcard?site=https://group-planner-2ul2.onrender.com" target="_blank" className="px-4 py-3 rounded-xl bg-[#2D3436] text-white font-black text-sm text-center">PWABuilder에서 APK 생성하기 (1분)</a>
              <div className="text-[11px] text-[#B2BEC3]">위 버튼 → <b>Package For Stores</b> → <b>Android</b> → <b>Generate Package</b> → <b>Download Package(.apk)</b> 로 바로 받기</div>
              <a href="/icon-512.png" download className="px-4 py-2 rounded-xl bg-white border border-[#FFE0CC] text-[#636E72] font-bold text-xs text-center">임시 아이콘 다운로드 (APK 생성 시 필요)</a>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#E0F7F4] border border-[#4ECDC4]/30">
            <div className="font-black text-xs text-[#00B894]">✅ 이미 PWA 준비 완료</div>
            <div className="text-xs text-[#636E72] mt-1">manifest.json, 512/192 아이콘, Service Worker(sw.js), VAPID 푸시까지 모두 설정됨. APK는 위 PWABuilder 링크로 즉시 생성 가능합니다.</div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a href="/auth" className="text-xs text-[#FF6B6B] font-bold underline">← 로그인으로 돌아가기</a>
        </div>
      </div>
    </div>
  );
}
