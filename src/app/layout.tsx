import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Family Planner — 함께 만드는 우리 가족 일정",
  description: "가족 그룹 채팅, 일정 공유, 투표, 위치 공유, 날씨까지 한 곳에서. 최대 10명의 가족이 함께하는 따뜻한 플래너.",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#FF6B6B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <StoreProvider>{children}</StoreProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          if('serviceWorker' in navigator){
            window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{})});
          }
          // request notification permission lazily
          document.addEventListener('click', function initNotif(){
            if (Notification && Notification.permission==='default') Notification.requestPermission().catch(()=>{});
            document.removeEventListener('click', initNotif);
          });
        `}} />
      </body>
    </html>
  );
}
