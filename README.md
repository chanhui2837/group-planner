# Family Planner — 함께 만드는 우리 가족 플래너

> 따뜻한 코랄·민트 디자인, 하우스+하트 로고, 최대 10명 그룹을 위한 올인원 가족 플래너.

## ✨ 기능 요약

- **회원가입/로그인** — 실명, 아이디, 비밀번호, 이메일 4종 입력. `bcrypt` 해시 + `jose` JWT (httpOnly 쿠키, 30일). MongoDB에 유저 전체 문서 저장, 실시간 동기화.
- **프로필 사진 변경** — 2MB 이하 이미지 base64로 MongoDB에 저장, 모든 멤버에게 즉시 반영.
- **그룹** — 생성 / 초대코드(6자리 영문숫자)로 참가 / 검색 / 탈퇴 / 삭제(그룹장만). 그룹당 최대 10명 제한.
- **그룹 채팅** — 텍스트 + 일정 + 투표 카드가 같은 타임라인에. 2.5초 폴링으로 실시간 동기화 (Socket.IO 확장 가능).
- **큼직한 알림** — 일정/투표가 올라오면 **화면 전체 오버레이 + 진동 + Web Audio 사운드 + Web Notification + Service Worker Push** 5중 알림. 사이트가 꺼져 있어도 Service Worker가 깨워서 알림.
- **투표** — 채팅 안에서 투표 생성(2~6개 선택지, 단일/복수, 마감시간), 투표 즉시 반영, 퍼센트 바 표시.
- **개인 채팅 (1:1)** — 같은 그룹 멤버끼리만 가능.
- **날씨** — Open-Meteo 무료 API, 현재 날씨 + 5일 예보, 위치 기반 자동 조회.
- **위치 공유 & 지도** — Leaflet + OpenStreetMap, “내 위치 공유” 버튼으로 `navigator.geolocation` → MongoDB 저장 → 지도에 아바타 마커로 표시. 4초마다 갱신.
- **디자인** — `Logo.tsx:1` 하우스+하트 로고, 코랄 `#FF6B6B` / 민트 `#4ECDC4` / 옐로우 `#FFE66D` 팔레트, `globals.css:1` 글래스모피즘, 둥근 2xl, 부드러운 그림자.

## 🗂️ 구조

```
src/
  lib/db.ts, auth.ts, store.tsx
  models/User.ts, Group.ts, Message.ts
  components/Logo.tsx, AlarmOverlay.tsx
  app/
    page.tsx (게이트)
    auth/page.tsx (로그인/회원가입)
    dashboard/page.tsx (메인 - 채팅/DM/지도/날씨/멤버)
    api/auth/*, groups/*, messages/*, vote, location, weather, user/*
  public/sw.js, manifest.json, icon-*
```

## 🚀 빠른 시작

### 1) MongoDB 준비 (택1)

- **로컬**: https://www.mongodb.com/try/download/community 설치 후 `mongod` 실행
- **Atlas 무료**: https://cloud.mongodb.com 에서 클러스터 생성 → Connect → Connection String 복사

### 2) 환경변수

```bash
# .env.local 생성 (이미 있음)
MONGODB_URI=mongodb://localhost:27017/family-planner
# Atlas라면: mongodb+srv://user:pass@cluster.mongodb.net/family-planner
JWT_SECRET=아주_길고_무작위한_문자열_32자_이상
```

### 3) 실행

```bash
npm install
npm run dev   # http://localhost:3000
npm run build && npm start # 프로덕션
```

> MongoDB가 꺼져 있으면 API가 500을 반환하고, UI에서 “회원가입 실패: …” 로 표시됩니다. `.env.local`의 `MONGODB_URI`를 확인하세요.

## 🔔 알림 테스트

1. 브라우저에서 알림 권한 허용
2. 그룹 채팅에서 📅 일정 올리기 → 같은 그룹의 다른 탭/기기에 대형 알람 오버레이 + 진동 + 사운드
3. 핸드폰에서 홈 화면에 추가(PWA)하면 꺼져 있어도 Service Worker 푸시 수신

## 🎨 로고

`src/components/Logo.tsx:1` — 주황 그라데이션 하우스 안에 하트, 노란 점·민트 점으로 가족을 표현. 작은 노란 알림 배지 포함.

## 📦 배포

- Vercel/Netlify에 `MONGODB_URI`, `JWT_SECRET` 환경변수 설정
- MongoDB Atlas 화이트리스트에 `0.0.0.0/0` 추가

## 🔧 확장 아이디어

- `server.js`에 Socket.IO 실시간 서버 추가 (현재는 폴링, 주석으로 구조 준비됨)
- `web-push`로 VAPID 푸시 구독 (`/api/push/subscribe` 확장)
- 사진·파일 업로드 S3 연동
