"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore, MAX_GROUPS } from "@/lib/store";
import { getSocket, disconnectSocket } from "@/lib/socket";
import Logo from "@/components/Logo";
import AlarmOverlay, { AlarmData } from "@/components/AlarmOverlay";
import PWAInstall from "@/components/PWAInstall";
import { startNativeTracking, stopNativeTracking, isNativeTracking } from "@/lib/background-location";

// lazy leaflet to avoid SSR
let L: any = null;

type Tab = "chat" | "dm" | "schedule" | "map" | "weather" | "members";

export default function Dashboard() {
  const { user, group, groups, loading, refresh, switchGroup } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("chat");
  const [alarm, setAlarm] = useState<AlarmData | null>(null);
  const [switching, setSwitching] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);

  const doSwitchGroup = async (id: string) => {
    if (!group || group.id === id || switching) return;
    setSwitching(true);
    try {
      await switchGroup(id);
      setMessages([]);
      setDmMessages([]);
      setMembersLoc([]);
      setDmTarget(null);
      setNewArrivals(0);
      lastMsgCount.current = 0;
      // chatInitRef는 유지 → 새 그룹 id와 다르면 첫-안읽음 스크롤이 다시 동작
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSwitching(false);
    }
  };

  // group creation/join
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchGroups, setSearchGroups] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  // chat
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dmEndRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);
  const [chatMedia, setChatMedia] = useState<{ url: string; type: string } | null>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);

  // realtime (Socket.IO) + 읽음 확인
  const [socketOn, setSocketOn] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [dmUnreadTotal, setDmUnreadTotal] = useState(0);
  const [dmUnreadBy, setDmUnreadBy] = useState<Record<string, number>>({});
  const chatInitRef = useRef<string | null>(null); // 첫-안읽음 스크롤 완료한 그룹
  const [newArrivals, setNewArrivals] = useState(0); // 아래에 새 메시지 pill용
  const markTimer = useRef<any>(null);
  const userRef = useRef<any>(null);
  userRef.current = user;
  const groupRef = useRef<any>(null);
  groupRef.current = group;
  const tabRef = useRef<Tab>(tab);
  tabRef.current = tab;

  // schedule / vote modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ title: "", date: "", time: "", description: "", location: "" });
  const [voteForm, setVoteForm] = useState({ question: "", options: ["", ""], allowMultiple: false, expiresAt: "" });

  // dm
  const [dmTarget, setDmTarget] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<any[]>([]);
  const [dmInput, setDmInput] = useState("");

  // weather
  const [weather, setWeather] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // location / map
  // sharing = 내 위치 추적 ON 의도. localStorage + 서버(locationSharing)에 persist되어
  // 앱/웹을 껐다 켜도 버튼 없이 자동 재개된다. (단, OS가 완전히 죽인 동안의 이동은
  // 웹 기술상 수집 불가 → 재개 시점 최신 위치로 갱신 + 오래됨 표시로 구분)
  const SHARING_KEY = "fp-location-sharing";
  const [membersLoc, setMembersLoc] = useState<any[]>([]);
  const [sharing, setSharing] = useState(false);
  // 네이티브 포그라운드 서비스 동작 여부 (앱 꺼짐 상태에서도 GPS 전송)
  const [nativeBg, setNativeBg] = useState(false);
  const watchIdRef = useRef<any>(null);
  const fallbackTimerRef = useRef<any>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const sharingRef = useRef(false);
  useEffect(() => {
    sharingRef.current = sharing;
  }, [sharing]);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const hasCenteredRef = useRef(false);

  const timeAgo = (iso?: string) => {
    if (!iso) return "시간不明";
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return `${s}초 전`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  };
  const locAgeSec = (iso?: string) => {
    if (!iso) return Infinity;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return Infinity;
    return Math.floor((Date.now() - t) / 1000);
  };

  // profile
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // email lookup (로그인한 이메일만 치면 바로 내역)
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupResult, setLookupResult] = useState<string[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [resetLookup, setResetLookup] = useState({ username: "", code: "", newPw: "" });

  // auth guard + 푸시 구독 (사이트 꺼져도 알림 위해)
  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
    if (user && "Notification" in window && "serviceWorker" in navigator) {
      (async () => {
        try {
          if (Notification.permission === "default") {
            // 첫 진입 시 조용히 요청하지 않고, 지도/채팅에서 일정 올릴 때 요청됨. 여기선 스킵.
          }
          if (Notification.permission !== "granted") return;
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          if (existing) return;
          const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!vapid) {
            console.warn("[PUSH] VAPID 미설정 — 구독 스킵");
            return;
          }
          const toUint8 = (base64: string) => {
            const pad = "=".repeat((4 - (base64.length % 4)) % 4);
            const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
            const raw = atob(b64);
            return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
          };
          const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(vapid) as any });
          await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
          console.log("✅ [PUSH] 구독 완료 — 꺼져도 알림 수신 가능");
        } catch (e: any) {
          console.warn("[PUSH] 구독 실패:", e.message);
        }
      })();
    }
  }, [loading, user, router]);

  const enablePush = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return alert("이 브라우저는 알림을 지원하지 않아요. Chrome/Edge 최신 버전으로 시도하세요");
    if (Notification.permission === "granted") {
      try {
        const reg = await navigator.serviceWorker.ready;
        const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapid) return alert("VAPID 미설정 — 관리자에게 문의");
        const toUint8 = (base64: string) => {
          const pad = "=".repeat((4 - (base64.length % 4)) % 4);
          const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
          const raw = atob(b64);
          return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
        };
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(existing) });
          return alert("✅ 이미 알림이 켜져 있어요! 사이트 꺼져도 일정/문자 알림이 옵니다.");
        }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(vapid) as any });
        const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
        if (!res.ok) throw new Error("구독 저장 실패");
        alert("✅ 알림 활성화! 사이트가 꺼져도 일정/메시지 알림이 옵니다. (핸드폰: 브라우저 메뉴 > 홈 화면에 추가하면 더 잘 옵니다)");
      } catch (e: any) {
        alert("알림 활성화 실패: " + e.message);
      }
      return;
    }
    if (Notification.permission === "denied") {
      alert("❌ 알림이 차단된 상태라 웹에서 강제로 켤 수 없어요 (브라우저 보안 정책).\n\n직접 허용해야 합니다:\n1. 주소창 왼쪽 🔒 클릭 → 사이트 설정\n2. ‘알림’ → ‘허용’으로 변경\n3. 페이지 새로고침 후 다시 ‘🔔 알림 켜기’ 클릭\n\n폰: 설정 > 앱 > 브라우저 > 알림 허용도 켜야 꺼져도 옵니다.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      alert("알림 권한이 거부됐어요. 주소창 🔒 > 알림 ‘허용’으로 바꾸고 새로고침 후 다시 시도하세요.");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) return alert("VAPID 미설정");
      const toUint8 = (base64: string) => {
        const pad = "=".repeat((4 - (base64.length % 4)) % 4);
        const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(b64);
        return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
      };
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(vapid) as any });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error("구독 저장 실패");
      alert("✅ 알림 활성화! 사이트가 꺼져도 일정/문자 알림이 옵니다.");
    } catch (e: any) {
      alert("알림 활성화 실패: " + e.message);
    }
  };

  // fetch groups search (최대 개수 미만일 때만)
  useEffect(() => {
    if (!user || groups.length >= MAX_GROUPS) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/groups?q=${encodeURIComponent(searchQ)}`);
      const data = await res.json();
      setSearchGroups(data.groups || []);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, user, groups.length]);

  // fetch weather by geo — 고정 도시 없음, 실제 기기 위치만 사용
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherAddr, setWeatherAddr] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  useEffect(() => {
    if (!coords) {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setGeoError(null);
            setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
          },
          (err) => {
            console.warn("[geo] 위치 가져오기 실패:", err.message);
            // 고정 금지: 사용자에게 권한 안내만, 자동 도시 고정 안 함
            if (err.code === 1) setGeoError("위치 권한이 거부됐어요. 브라우저 주소창 🔒 > 위치 허용 후 ‘내 위치’ 버튼을 누르세요.");
            else setGeoError(`위치 조회 실패: ${err.message}`);
            // coords는 null 유지 — 지도는 대한민국 중심(36.5,127.5) + 날씨도 수동 선택 안내
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else setGeoError("이 기기는 위치 기능을 지원하지 않아요.");
    }
  }, [coords]);

  useEffect(() => {
    if (!coords) return;
    setWeatherLoading(true);
    setWeatherError(null);
    fetch(`/api/weather?lat=${coords.lat}&lon=${coords.lng}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setWeatherError(d.error);
        else setWeather(d);
      })
      .catch((e) => setWeatherError(e.message))
      .finally(() => setWeatherLoading(false));
    // 정확한 위치명 역지오코딩
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&accept-language=ko`)
      .then((r) => r.json())
      .then((j) => {
        if (j.display_name) {
          // 한국 주소는 display_name이 길어서 앞 3~4개만 간략히
          const parts = j.display_name.split(",").map((s: string) => s.trim()).reverse();
          // 예: 대한민국, 강원특별자치도, 춘천시, 우두동 ...
          const short = parts.slice(0, 4).join(" ");
          setWeatherAddr(j.display_name);
        } else setWeatherAddr(null);
      })
      .catch(() => setWeatherAddr(null));
  }, [coords]);

  // polling group messages (활성 그룹 기준)
  useEffect(() => {
    if (!user || !group) return;
    const gid = group.id;
    let interval: any;
    const fetchMsgs = async () => {
      const res = await fetch(`/api/messages/group?groupId=${gid}`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.messages || [];
      // detect new schedule/vote for alarm
      if (lastMsgCount.current !== 0 && msgs.length > lastMsgCount.current) {
        const newMsgs = msgs.slice(lastMsgCount.current);
        for (const m of newMsgs) {
          if (m.type === "schedule" && m.sender?.id !== user.id) {
            triggerAlarm({ title: `📅 새 일정: ${m.schedule?.title}`, body: `${m.sender.realName}님이 일정을 올렸어요! ${m.schedule?.date} ${m.schedule?.time}`, type: "schedule" });
            break;
          }
          if (m.type === "vote" && m.sender?.id !== user.id) {
            triggerAlarm({ title: `🗳️ 새 투표: ${m.vote?.question}`, body: `${m.sender.realName}님이 투표를 올렸어요! 참여해보세요.`, type: "vote" });
            break;
          }
        }
      }
      lastMsgCount.current = msgs.length;
      setMessages(msgs);
    };
    fetchMsgs();
    interval = setInterval(fetchMsgs, socketOn ? 15000 : 2500); // 소켓 연결 시 폴링은 가벼운 백업만
    return () => clearInterval(interval);
  }, [user, group?.id, socketOn]);

  // auto scroll — 사용자가 위로 올렸을 땐 자동 이동 안 함
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const dmContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    const el = dmContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) dmEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages]);

  // poll locations (활성 그룹 기준)
  // 지도 탭이 아니어도 주기적으로 가져와서, 지도에 들어오자마자 최신 위치가 보이게 한다.
  // 지도 탭: 4초 / 다른 탭: 15초 (배터리·트래픽 절약)
  useEffect(() => {
    if (!group) return;
    const gid = group.id;
    const fetchLoc = async () => {
      try {
        const res = await fetch(`/api/location?groupId=${gid}`, { cache: "no-store" });
        const data = await res.json();
        if (data.members) setMembersLoc(data.members || []);
      } catch {}
    };
    fetchLoc();
    const id = setInterval(fetchLoc, tab === "map" ? 4000 : 15000);
    return () => clearInterval(id);
  }, [group?.id, tab]);

  // DM polling (활성 그룹 기준) — 소켓 연결 시 백업용으로만 느리게
  useEffect(() => {
    if (!dmTarget || !group) return;
    const gid = group.id;
    const fetchDm = async () => {
      const res = await fetch(`/api/messages/direct?with=${dmTarget}&groupId=${gid}`);
      const data = await res.json();
      if (data.messages) setDmMessages(data.messages);
    };
    fetchDm();
    const id = setInterval(fetchDm, socketOn ? 15000 : 2000);
    return () => clearInterval(id);
  }, [dmTarget, group?.id, socketOn]);

  // ---- 실시간 + 읽음 확인 헬퍼 ----
  const messagesRef = useRef<any[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const dmTargetRef = useRef<string | null>(null);
  useEffect(() => {
    dmTargetRef.current = dmTarget;
  }, [dmTarget]);

  const isChatNearBottom = () => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  };
  const scrollChatToBottom = (smooth = true) => {
    if (smooth) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    else chatEndRef.current?.scrollIntoView({ behavior: "auto" } as any);
    setNewArrivals(0);
  };
  const flashMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    const html = el as HTMLElement;
    html.style.transition = "box-shadow 0.3s";
    html.style.boxShadow = "0 0 0 3px #FF6B6B, 0 8px 24px rgba(255,107,107,0.35)";
    html.style.borderRadius = "18px";
    setTimeout(() => {
      html.style.boxShadow = "";
    }, 2600);
  };
  const scrollToFirstUnread = () => {
    const u = userRef.current;
    const list = messagesRef.current;
    if (!u || list.length === 0) return;
    const first = list.find((m: any) => m.sender && m.sender.id !== u.id && !((m.readBy || []) as string[]).includes(u.id));
    if (first) {
      flashMessage(first.id);
    } else {
      scrollChatToBottom();
    }
  };

  // 안 읽은 개수 동기화
  const fetchUnread = async () => {
    try {
      const res = await fetch("/api/messages/unread", { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      setUnread(d.groups || {});
      setDmUnreadTotal(d.dmTotal || 0);
      setDmUnreadBy(d.dmBy || {});
    } catch {}
  };

  // 그룹채팅 읽음 처리 (마지막 메시지 시각까지)
  const doMarkRead = async () => {
    const g = groupRef.current;
    const u = userRef.current;
    const list = messagesRef.current;
    if (!g || !u || list.length === 0) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const last = list[list.length - 1];
    try {
      const res = await fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: g.id, upTo: last.createdAt }),
      });
      if (!res.ok) return;
      setMessages((prev) => prev.map((m) => ((m.readBy || []) as string[]).includes(u.id) ? m : { ...m, readBy: [...(m.readBy || []), u.id] }));
      setUnread((prev) => ({ ...prev, [g.id]: 0 }));
      setNewArrivals(0);
    } catch {}
  };
  const scheduleMarkRead = () => {
    if (markTimer.current) clearTimeout(markTimer.current);
    markTimer.current = setTimeout(doMarkRead, 1200);
  };

  // 1:1 읽음 처리
  const dmMarkedRef = useRef<Record<string, string>>({});
  const dmMessagesRef = useRef<any[]>([]);
  useEffect(() => {
    dmMessagesRef.current = dmMessages;
  }, [dmMessages]);
  const markDmRead = async (partnerId: string) => {
    const g = groupRef.current;
    const dmList = dmMessagesRef.current;
    if (!g || dmList.length === 0) return;
    const last = dmList[dmList.length - 1];
    if (dmMarkedRef.current[partnerId] === last.id) return;
    dmMarkedRef.current[partnerId] = last.id;
    try {
      await fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: g.id, upTo: last.createdAt, directWith: partnerId }),
      });
      fetchUnread();
    } catch {}
  };

  // ---- Socket.IO 실시간 수신 ----
  const groupIdsKey = groups.map((g) => g.id).join(",");
  useEffect(() => {
    if (!user || groups.length === 0) return;
    const s = getSocket();
    const me = user.id;
    const joined = new Set<string>();

    const joinAll = () => {
      for (const g of groups) {
        if (!joined.has(g.id)) {
          s.emit("join-group", g.id);
          joined.add(g.id);
        }
      }
    };
    const handleConnect = () => {
      setSocketOn(true);
      joinAll();
      fetchUnread();
    };
    const handleDisconnect = () => setSocketOn(false);

    const handleMessageNew = (m: any) => {
      if (!m || !m.groupId) return;
      const active = groupRef.current;
      if (!active || m.groupId !== active.id) {
        // 다른 그룹 새 글 → 배지만 증가
        if (!m.sender || m.sender.id !== me) {
          setUnread((prev) => ({ ...prev, [m.groupId]: (prev[m.groupId] || 0) + 1 }));
        }
        return;
      }
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m];
      });
      lastMsgCount.current += 1; // 폴링 중복 알람 방지
      const mine = m.sender?.id === me;
      if (!mine && m.type === "schedule") {
        triggerAlarm({ title: `📅 새 일정: ${m.schedule?.title}`, body: `${m.sender.realName}님이 일정을 올렸어요! ${m.schedule?.date} ${m.schedule?.time}`, type: "schedule" });
      }
      if (!mine && m.type === "vote") {
        triggerAlarm({ title: `🗳️ 새 투표: ${m.vote?.question}`, body: `${m.sender.realName}님이 투표를 올렸어요! 참여해보세요.`, type: "vote" });
      }
      const viewing = tabRef.current === "chat" && typeof document !== "undefined" && document.visibilityState === "visible" && isChatNearBottom();
      if (!viewing && !mine) {
        setUnread((prev) => ({ ...prev, [active.id]: (prev[active.id] || 0) + 1 }));
        setNewArrivals((n) => n + 1);
      }
    };

    const handleVoteUpdate = (p: any) => {
      if (!p || !p.messageId) return;
      const active = groupRef.current;
      if (active && p.groupId && p.groupId !== active.id) return;
      setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, vote: { ...(m.vote || {}), ...p.vote, options: p.vote.options } } : m)));
    };

    const handleDmNew = (m: any) => {
      if (!m || !m.sender) return;
      if (m.sender.id === dmTargetRef.current && tabRef.current === "dm") {
        setDmMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          return [...prev, m];
        });
        markDmRead(m.sender.id);
      } else if (m.sender.id !== me) {
        setDmUnreadTotal((t) => t + 1);
        setDmUnreadBy((prev) => ({ ...prev, [m.sender.id]: (prev[m.sender.id] || 0) + 1 }));
      }
    };

    const handleLocationUpdate = async () => {
      // 지도 탭이 아니어도 최신 목록을 유지 → 지도 진입 시 바로 최신 표시
      const active = groupRef.current;
      if (!active) return;
      try {
        const res = await fetch(`/api/location?groupId=${active.id}`, { cache: "no-store" });
        const data = await res.json();
        if (data.members) setMembersLoc(data.members || []);
      } catch {}
    };

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    s.on("message:new", handleMessageNew);
    s.on("vote:update", handleVoteUpdate);
    s.on("dm:new", handleDmNew);
    s.on("location:update", handleLocationUpdate);
    try {
      if (!s.connected) s.connect();
      else {
        setSocketOn(true);
        joinAll();
      }
    } catch {}
    return () => {
      for (const gid of joined) s.emit("leave-group", gid);
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      s.off("message:new", handleMessageNew);
      s.off("vote:update", handleVoteUpdate);
      s.off("dm:new", handleDmNew);
      s.off("location:update", handleLocationUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, groupIdsKey]);

  // 안 읽은 개수: 진입 시 + 30초마다 보정
  useEffect(() => {
    if (!user) return;
    fetchUnread();
    const id = setInterval(fetchUnread, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, groups.length]);

  // 첫 진입/그룹전환: 첫 안읽음 위치로 스크롤, 없으면 맨 아래 (버그 수정)
  useEffect(() => {
    if (!group || !user || messages.length === 0) return;
    if (chatInitRef.current === group.id) return;
    chatInitRef.current = group.id;
    const t = setTimeout(() => {
      const first = messages.find((m: any) => m.sender && m.sender.id !== user.id && !((m.readBy || []) as string[]).includes(user.id));
      if (first) {
        flashMessage(first.id);
      } else {
        chatEndRef.current?.scrollIntoView({ behavior: "auto" } as any);
      }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, group?.id]);

  // 채팅 보는 중이면 읽음 처리 (탭 전환·새 메시지·복귀 시)
  useEffect(() => {
    if (tab !== "chat" || !group || messages.length === 0) return;
    scheduleMarkRead();
    return () => {
      if (markTimer.current) clearTimeout(markTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, tab, group?.id]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && tabRef.current === "chat") scheduleMarkRead();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 언마운트 시 타이머·소켓 정리
  useEffect(() => {
    return () => {
      if (markTimer.current) clearTimeout(markTimer.current);
      disconnectSocket();
    };
  }, []);

  // 1:1 대화 열람 중이면 읽음 처리
  useEffect(() => {
    if (!dmTarget || dmMessages.length === 0) return;
    const t = setTimeout(() => markDmRead(dmTarget), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmMessages, dmTarget]);

  // 가입 그룹은 있는데 활성 그룹이 비어있으면 첫 그룹으로 자동 전환
  useEffect(() => {
    if (!loading && groups.length > 0 && !group && !switching) {
      (async () => {
        setSwitching(true);
        try {
          await switchGroup(groups[0].id);
        } catch {}
        finally {
          setSwitching(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, groups.length, group?.id]);

  // leaflet map — 최초 1회만 중심 설정, 이후엔 마커만 갱신 (옆으로 넘겨도 다시 내 위치로 점프 안 함)
  const recenterMap = () => {
    const map = mapInstance.current;
    if (!map || !L) return;
    const validLocs = membersLoc.filter((m: any) => m.location && typeof m.location.lat === "number");
    if (validLocs.length > 0) {
      const avgLat = validLocs.reduce((s: number, m: any) => s + m.location.lat, 0) / validLocs.length;
      const avgLng = validLocs.reduce((s: number, m: any) => s + m.location.lng, 0) / validLocs.length;
      map.setView([avgLat, avgLng], 12);
      if (validLocs.length > 1) {
        try {
          const group = new L.featureGroup(validLocs.map((m: any) => L.marker([m.location.lat, m.location.lng])));
          map.fitBounds(group.getBounds().pad(0.2));
        } catch {}
      }
    } else if (coords) {
      map.setView([coords.lat, coords.lng], 12);
    } else {
      map.setView([36.5, 127.5], 7);
    }
    hasCenteredRef.current = true;
    setTimeout(() => map.invalidateSize(), 100);
  };
  useEffect(() => {
    if (tab !== "map" || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      if (!L) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
        const mod = await import("leaflet");
        L = mod.default || mod;
        try {
          delete (L.Icon.Default.prototype as any)._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
            iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
            shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
          });
        } catch {}
      }
      if (cancelled || !mapRef.current) return;
      // hidden -> block 전환 시 레이아웃 반영 대기
      await new Promise((r) => setTimeout(r, 80));
      if (cancelled || !mapRef.current || mapRef.current.clientHeight === 0) return;
      // 기존 맵이 없으면 최초 생성
      if (!mapInstance.current) {
        const validLocs = membersLoc.filter((m: any) => m.location && typeof m.location.lat === "number");
        let center: [number, number];
        if (validLocs.length > 0) {
          const avgLat = validLocs.reduce((s: number, m: any) => s + m.location.lat, 0) / validLocs.length;
          const avgLng = validLocs.reduce((s: number, m: any) => s + m.location.lng, 0) / validLocs.length;
          center = [avgLat, avgLng];
        } else if (coords) {
          center = [coords.lat, coords.lng];
        } else {
          center = [36.5, 127.5];
        }
        const map = L.map(mapRef.current).setView(center, validLocs.length > 0 ? 11 : 7);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
        mapInstance.current = map;
        markerLayerRef.current = L.layerGroup().addTo(map);
        hasCenteredRef.current = true;
        // 모바일에서 파란 화면만 뜨는 버그 방지 — invalidateSize
        setTimeout(() => map.invalidateSize(), 100);
        setTimeout(() => map.invalidateSize(), 500);
        setTimeout(() => map.invalidateSize(), 1000);
      }
      // 마커만 갱신 — 뷰는 건드리지 않음 (옆으로 넘겨도 점프 안 함)
      const layer = markerLayerRef.current;
      if (!layer) return;
      layer.clearLayers();
      const validLocs = membersLoc.filter((m: any) => m.location && typeof m.location.lat === "number");
      validLocs.forEach((m: any) => {
        const isMe = m.id === user?.id;
        const initials = (m.realName || "?").slice(0, 1);
        const avatarHtml = m.avatar ? `<img src="${m.avatar}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-weight:900;color:${isMe ? "#FF6B6B" : "#4ECDC4"}">${initials}</span>`;
        const icon = L.divIcon({
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translateY(-8px)">
            <div style="width:48px;height:48px;border-radius:50%;border:3px solid ${isMe ? "#FF6B6B" : "#4ECDC4"};overflow:hidden;background:white;box-shadow:0 6px 16px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:20px">
              ${avatarHtml}
            </div>
            <span style="background:${isMe ? "#FF6B6B" : "#2D3436"};color:white;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2)">${m.realName}${isMe ? " (나)" : ""}</span>
            <span style="background:white;color:#636E72;font-size:9px;font-weight:700;padding:1px 6px;border-radius:999px;white-space:nowrap;border:1px solid #FFE0CC">${m.location.address ? m.location.address.split(",").slice(0,2).join(",") : `${m.location.lat.toFixed(3)},${m.location.lng.toFixed(3)}`}</span>
          </div>`,
          className: "",
          iconSize: [90, 80],
          iconAnchor: [45, 40],
        });
        L.marker([m.location.lat, m.location.lng], { icon }).addTo(layer).bindPopup(`<b>${m.realName}${isMe ? " (나)" : ""}</b><br/>${m.location.address || `${m.location.lat.toFixed(5)}, ${m.location.lng.toFixed(5)}`}<br/><small>${m.location.updatedAt ? new Date(m.location.updatedAt).toLocaleString() : ""}</small>`);
      });
      if (validLocs.length === 0) {
        const c = coords ? [coords.lat, coords.lng] as [number, number] : [36.5, 127.5] as [number, number];
        const msg = coords ? `내 위치 (공유 전) - ${c[0].toFixed(4)},${c[1].toFixed(4)}<br/><small>“내 위치 1회 공유”를 눌러 위치를 공유하세요</small>` : "위치를 공유해보세요";
        L.marker(c).addTo(layer).bindPopup(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]); // tab 변경 시만 맵 생성, membersLoc/coord 변경 시 마커만 갱신은 아래 effect에서
  // 마커 갱신 전용 (뷰 유지)
  useEffect(() => {
    if (tab !== "map" || !mapInstance.current || !L || !markerLayerRef.current) return;
    const layer = markerLayerRef.current;
    layer.clearLayers();
    const validLocs = membersLoc.filter((m: any) => m.location && typeof m.location.lat === "number");
    validLocs.forEach((m: any) => {
      const isMe = m.id === user?.id;
      const initials = (m.realName || "?").slice(0, 1);
      const avatarHtml = m.avatar ? `<img src="${m.avatar}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-weight:900;color:${isMe ? "#FF6B6B" : "#4ECDC4"}">${initials}</span>`;
      const icon = L.divIcon({
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translateY(-8px)">
          <div style="width:48px;height:48px;border-radius:50%;border:3px solid ${isMe ? "#FF6B6B" : "#4ECDC4"};overflow:hidden;background:white;box-shadow:0 6px 16px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:20px">
            ${avatarHtml}
          </div>
          <span style="background:${isMe ? "#FF6B6B" : "#2D3436"};color:white;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2)">${m.realName}${isMe ? " (나)" : ""}</span>
          <span style="background:white;color:#636E72;font-size:9px;font-weight:700;padding:1px 6px;border-radius:999px;white-space:nowrap;border:1px solid #FFE0CC">${m.location.address ? m.location.address.split(",").slice(0,2).join(",") : `${m.location.lat.toFixed(3)},${m.location.lng.toFixed(3)}`}</span>
        </div>`,
        className: "",
        iconSize: [90, 80],
        iconAnchor: [45, 40],
      });
      L.marker([m.location.lat, m.location.lng], { icon }).addTo(layer).bindPopup(`<b>${m.realName}${isMe ? " (나)" : ""}</b><br/>${m.location.address || `${m.location.lat.toFixed(5)}, ${m.location.lng.toFixed(5)}`}<br/><small>${m.location.updatedAt ? new Date(m.location.updatedAt).toLocaleString() : ""}</small>`);
    });
    if (validLocs.length === 0 && coords) {
      L.marker([coords.lat, coords.lng]).addTo(layer).bindPopup(`내 위치 (공유 전)`);
    }
  }, [membersLoc, coords, user?.id, tab]);
  // 모바일/다른 창 갔다 올 때 파란 화면만 뜨는 버그 방지
  useEffect(() => {
    if (tab === "map" && mapInstance.current) {
      setTimeout(() => mapInstance.current?.invalidateSize(), 100);
      setTimeout(() => mapInstance.current?.invalidateSize(), 500);
      setTimeout(() => mapInstance.current?.invalidateSize(), 1000);
    }
  }, [tab]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && tab === "map" && mapInstance.current) {
        setTimeout(() => mapInstance.current?.invalidateSize(), 100);
        setTimeout(() => mapInstance.current?.invalidateSize(), 500);
      }
    };
    const onFocus = () => {
      if (tab === "map" && mapInstance.current) {
        setTimeout(() => mapInstance.current?.invalidateSize(), 100);
      }
    };
    const onResize = () => {
      if (tab === "map" && mapInstance.current) {
        setTimeout(() => mapInstance.current?.invalidateSize(), 100);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("resize", onResize);
    };
  }, [tab]);

  const triggerAlarm = (a: AlarmData) => {
    setAlarm(a);
    // also use Web Notification if allowed
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(a.title, { body: a.body, icon: "/icon-192.png", requireInteraction: true } as any);
      } catch {}
      // also try service worker
      navigator.serviceWorker?.ready.then((reg) => {
        reg.showNotification(a.title, { body: a.body, icon: "/icon-192.png", vibrate: [300, 100, 300] } as any).catch(() => {});
      });
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return alert("그룹 이름을 입력하세요");
    if (groups.length >= MAX_GROUPS) return alert(`그룹은 최대 ${MAX_GROUPS}개까지만 들어갈 수 있어요. 먼저 다른 그룹에서 나가주세요.`);
    setCreating(true);
    const res = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: groupName, description: groupDesc }) });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) return alert(data.error || "생성 실패");
    await refresh();
    triggerAlarm({ title: "🎉 그룹 생성 완료!", body: `${data.group.name} 그룹이 만들어졌어요. 초대코드: ${data.group.inviteCode}`, type: "schedule" });
  };

  const handleJoin = async (codeOrId?: string, isId?: boolean) => {
    const payload = isId ? { groupId: codeOrId } : { inviteCode: codeOrId || inviteCodeInput };
    if (!payload.inviteCode && !payload.groupId) return alert("초대코드를 입력하세요");
    if (groups.length >= MAX_GROUPS) return alert(`그룹은 최대 ${MAX_GROUPS}개까지만 들어갈 수 있어요. 먼저 다른 그룹에서 나가주세요.`);
    setJoining(true);
    const res = await fetch("/api/groups/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    setJoining(false);
    if (!res.ok) return alert(data.error || "참가 실패");
    await refresh();
    triggerAlarm({ title: "👋 그룹 입장!", body: `${data.group.name}에 입장했어요!`, type: "schedule" });
  };

  const handleLeave = async () => {
    if (!group) return;
    if (!confirm(`"${group.name}" 그룹에서 나가시겠어요?${groups.length > 1 ? " (다른 그룹 활동은 계속돼요)" : ""}`)) return;
    const res = await fetch("/api/groups/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: group.id }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "탈퇴 실패");
    setShowGroupManager(false);
    await refresh();
    setMessages([]);
    setDmMessages([]);
    setMembersLoc([]);
    setDmTarget(null);
    lastMsgCount.current = 0;
  };

  const handleDelete = async () => {
    if (!group) return;
    if (!confirm(`"${group.name}" 그룹을 삭제할까요? 모든 채팅이 사라집니다.`)) return;
    const res = await fetch(`/api/groups?id=${group.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "삭제 실패");
    setShowGroupManager(false);
    await refresh();
    setMessages([]);
    setDmMessages([]);
    setMembersLoc([]);
    setDmTarget(null);
    lastMsgCount.current = 0;
  };

  const sendMessage = async () => {
    if (!input.trim() && !chatMedia) return;
    if (chatMedia) return sendMedia();
    setSending(true);
    const res = await fetch("/api/messages/group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: input, type: "text", groupId: group?.id }) });
    setSending(false);
    if (!res.ok) {
      const d = await res.json();
      return alert(d.error || "전송 실패");
    }
    setInput("");
    // optimistic fetch
    const d = await res.json();
    setMessages((prev) => [...prev, d.message]);
    lastMsgCount.current++;
  };

  const handleChatFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (file.size > 12 * 1024 * 1024) return alert("이미지는 12MB 이하만 가능해요");
      try {
        let dataUrl: string;
        if (file.size > 1 * 1024 * 1024) dataUrl = await compressImage(file, 1200);
        else {
          dataUrl = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.onerror = () => rej(new Error("읽기 실패"));
            r.readAsDataURL(file);
          });
          if (dataUrl.length > 14_000_000) dataUrl = await compressImage(file, 1000);
        }
        setChatMedia({ url: dataUrl, type: file.type });
      } catch {
        alert("이미지 처리 실패");
      }
    } else if (file.type.startsWith("video/")) {
      if (file.size > 25 * 1024 * 1024) return alert("동영상은 25MB 이하만 가능해요");
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error("읽기 실패"));
        r.readAsDataURL(file);
      });
      if (dataUrl.length > 18_000_000) return alert("동영상이 너무 큽니다. 더 작은 파일로 시도하세요");
      setChatMedia({ url: dataUrl, type: file.type });
    } else {
      alert("사진과 동영상만 전송 가능해요");
    }
    if (e.target) e.target.value = "";
  };

  const sendMedia = async () => {
    if (!chatMedia) return;
    const type = chatMedia.type.startsWith("image/") ? "image" : "video";
    setSending(true);
    try {
      const res = await fetch("/api/messages/group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, mediaUrl: chatMedia.url, mediaType: chatMedia.type, content: input.trim(), groupId: group?.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "전송 실패");
      setMessages((prev) => [...prev, data.message]);
      lastMsgCount.current++;
      setChatMedia(null);
      setInput("");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  const sendSchedule = async () => {
    if (!scheduleForm.title || !scheduleForm.date) return alert("제목과 날짜는 필수!");
    const res = await fetch("/api/messages/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "schedule", content: scheduleForm.title, schedule: scheduleForm, groupId: group?.id }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "일정 등록 실패");
    setShowScheduleModal(false);
    setScheduleForm({ title: "", date: "", time: "", description: "", location: "" });
    setMessages((prev) => [...prev, data.message]);
    lastMsgCount.current++;
    triggerAlarm({ title: `📅 일정 등록: ${scheduleForm.title}`, body: `${scheduleForm.date} ${scheduleForm.time} - ${scheduleForm.description || ""}`, type: "schedule" });
    // push to all members via notification (local overlay + web notification already)
  };

  const sendVote = async () => {
    const opts = voteForm.options.filter((o) => o.trim());
    if (!voteForm.question.trim() || opts.length < 2) return alert("질문과 2개 이상 선택지를 입력해주세요");
    const res = await fetch("/api/messages/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "vote",
        content: voteForm.question,
        groupId: group?.id,
        vote: { question: voteForm.question, options: opts, allowMultiple: voteForm.allowMultiple, expiresAt: voteForm.expiresAt || null },
      }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "투표 생성 실패");
    setShowVoteModal(false);
    setVoteForm({ question: "", options: ["", ""], allowMultiple: false, expiresAt: "" });
    setMessages((prev) => [...prev, data.message]);
    lastMsgCount.current++;
    triggerAlarm({ title: `🗳️ 새 투표: ${voteForm.question}`, body: `선택지: ${opts.join(", ")}`, type: "vote" });
  };

  const handleVote = async (msgId: string, idx: number) => {
    const res = await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: msgId, optionIndex: idx }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "투표 실패");
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, vote: { ...m.vote, options: data.vote.options } } : m)));
  };

  const sendDM = async () => {
    if (!dmTarget || !dmInput.trim()) return;
    const res = await fetch("/api/messages/direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiverId: dmTarget, content: dmInput, groupId: group?.id }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "전송 실패");
    setDmMessages((prev) => [...prev, data.message]);
    setDmInput("");
  };

  // ---- 위치 추적 엔진 (자동 재개 + Capacitor 우선) ----
  const clearLocationWatch = async () => {
    try {
      if (watchIdRef.current !== null && watchIdRef.current !== undefined) {
        // Capacitor watchId (string) vs navigator watchId (number) 구분
        if (typeof watchIdRef.current === "string" && watchIdRef.current.startsWith("cap:")) {
          try {
            const { Geolocation } = await import("@capacitor/geolocation");
            await Geolocation.clearWatch({ id: watchIdRef.current.slice(4) });
          } catch {}
        } else if (typeof navigator !== "undefined" && "geolocation" in navigator) {
          try {
            navigator.geolocation.clearWatch(watchIdRef.current);
          } catch {}
        }
      }
    } catch {}
    watchIdRef.current = null;
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const postCoords = async (latitude: number, longitude: number) => {
    let address = "";
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ko`);
      const j = await r.json();
      address = j.display_name || "";
    } catch {}
    await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: latitude, lng: longitude, address, sharing: true }) });
    setGeoError(null);
    setCoords({ lat: latitude, lng: longitude });
    lastSentRef.current = { lat: latitude, lng: longitude, t: Date.now() };
    // 목록 즉시 갱신 (탭 무관 — 지도 진입 시 최신 보장)
    try {
      const gid = groupRef.current?.id || (group as any)?.id;
      if (gid) {
        const r2 = await fetch(`/api/location?groupId=${gid}`, { cache: "no-store" });
        const d2 = await r2.json();
        if (d2.members) setMembersLoc(d2.members || []);
      }
    } catch {}
  };

  const onWatchPos = async (la: number, lo: number) => {
    const now = Date.now();
    const last = lastSentRef.current;
    if (last) {
      const dt = now - last.t;
      const dLat = la - last.lat, dLng = lo - last.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
      if (dt < 5000 && dist < 10) return; // 5초/10m 디바운스
    }
    try {
      await postCoords(la, lo);
      console.log(`📍 [실시간] 위치 자동 갱신: ${la.toFixed(5)},${lo.toFixed(5)}`);
    } catch (e) {
      console.warn("[geo] post fail", e);
    }
  };

  const startTracking = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    // 네이티브(Capacitor) 우선 — 백그라운드에서도 WebView JS 스로틀보다 오래 살아남음
    const useCapacitor = async (): Promise<boolean> => {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        try {
          const perm = await Geolocation.checkPermissions();
          if ((perm as any).location !== "granted" && (perm as any).coarseLocation !== "granted") {
            await Geolocation.requestPermissions();
          }
        } catch {}
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 } as any);
        await postCoords(pos.coords.latitude, pos.coords.longitude);
        if (!silent) {
          triggerAlarm({ title: "📍 위치 공유 시작", body: "이제 이동하면 자동으로 지도에 반영돼요. (앱을 다시 열면 버튼 없이 자동 재개)", type: "schedule" });
        }
        const wid = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000 } as any, (p: any) => {
          if (!p) return;
          if (sharingRef.current === false && !localStorage.getItem(SHARING_KEY)) return;
          onWatchPos(p.coords.latitude, p.coords.longitude);
        });
        // clearWatch용 마커
        watchIdRef.current = `cap:${wid}`;
        return true;
      } catch (e) {
        return false;
      }
    };

    const useWebGeo = async (): Promise<boolean> => {
      if (!("geolocation" in navigator)) {
        if (!silent) alert("위치 기능을 지원하지 않는 기기예요");
        return false;
      }
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await postCoords(pos.coords.latitude, pos.coords.longitude);
            if (!silent) {
              triggerAlarm({ title: "📍 위치 공유 시작", body: "이제 이동하면 자동으로 지도에 반영돼요. (앱을 다시 열면 버튼 없이 자동 재개)", type: "schedule" });
            }
            const wid = navigator.geolocation.watchPosition(
              (wp) => {
                onWatchPos(wp.coords.latitude, wp.coords.longitude);
              },
              (err) => {
                console.warn("[geo] watch fail", err);
              },
              { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
            watchIdRef.current = wid as any;
            resolve(true);
          },
          (err) => {
            console.warn("[geo] share fail", err);
            if (!silent) {
              if (err.code === 1) {
                alert("위치 권한이 거부됐어요. 브라우저 주소창 왼쪽 🔒 > 사이트 설정 > 위치 ‘허용’으로 바꾸고 새로고침 후 다시 시도하세요.\n\n폰: 설정 > 앱 > 브라우저 > 권한 > 위치 허용");
              } else {
                alert("위치 가져오기 실패: " + err.message + "\n\n팁: 핸드폰 설정 > 위치 서비스 켜기, 브라우저 위치 허용을 확인하세요.");
              }
            } else {
              setGeoError("위치 권한이 없어 자동 재개를 건너뜁니다. 지도에서 ‘📍 위치 공유’를 한 번 눌러주세요.");
            }
            resolve(false);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
    };

    await clearLocationWatch();
    try {
      localStorage.setItem(SHARING_KEY, "1");
    } catch {}
    setSharing(true);
    // Capacitor 먼저, 실패하면 웹 geolocation
    let ok = await useCapacitor();
    if (!ok) ok = await useWebGeo();
    if (!ok) {
      setSharing(false);
      try {
        localStorage.removeItem(SHARING_KEY);
      } catch {}
      return false;
    }
    // watch가 멈추거나 스로틀되는 브라우저 대비 폴백: 20초마다 1회 강제 갱신
    if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
    fallbackTimerRef.current = setInterval(async () => {
      if (!sharingRef.current) return;
      const last = lastSentRef.current;
      if (last && Date.now() - last.t < 20000) return;
      try {
        try {
          const { Geolocation } = await import("@capacitor/geolocation");
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 } as any);
          await onWatchPos(pos.coords.latitude, pos.coords.longitude);
          return;
        } catch {}
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (p) => onWatchPos(p.coords.latitude, p.coords.longitude),
            () => {},
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
          );
        }
      } catch {}
    }, 20000);
    // 화면 WakeLock 시도 (모바일 백그라운드 스로틀 완화, 실패해도 무시)
    try {
      const nav: any = navigator as any;
      if (nav.wakeLock && nav.wakeLock.request) {
        nav.wakeLock.request("screen").catch(() => {});
      }
    } catch {}
    // 네이티브 포그라운드 서비스 (상시 알림 + GPS) — 앱을 꺼도 전송 지속.
    // 실패하면 false (웹 watch만으로 동작, 기존과 동일).
    try {
      const okNative = await startNativeTracking();
      setNativeBg(okNative);
      if (okNative && !silent) {
        triggerAlarm({ title: "📱 백그라운드 추적 ON", body: "상태바에 ‘위치 공유 중’ 알림이 뜨고, 앱을 꺼도 위치가 계속 전송돼요.", type: "schedule" });
      }
    } catch {
      setNativeBg(false);
    }
    console.log("[geo] 위치 공유 + 실시간 자동 추적 시작 (자동재개 ON)");
    return true;
  };

  const stopTracking = async () => {
    await clearLocationWatch();
    try {
      await stopNativeTracking();
    } catch {}
    setNativeBg(false);
    setSharing(false);
    try {
      localStorage.removeItem(SHARING_KEY);
    } catch {}
    try {
      await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sharing: false }) });
      await refresh();
    } catch {}
    triggerAlarm({ title: "📍 위치 공유 중단", body: "내 위치 추적을 껐어요. 지도의 마지막 위치는 그대로 남아요.", type: "schedule" });
  };

  const shareLocation = async () => {
    if (sharing) return stopTracking();
    await startTracking({ silent: false });
    setTab("map");
  };

  // 앱/웹 재진입 시 자동 재개: localStorage 의도 or 서버 플래그가 켜져 있으면 버튼 없이 시작
  const autoResumeTried = useRef(false);
  useEffect(() => {
    // 네이티브 서비스가 이미 살아 있으면(앱 재실행 등) 상태만 동기화
    isNativeTracking().then((r) => setNativeBg(r)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!user || autoResumeTried.current) return;
    let want = false;
    try {
      want = localStorage.getItem(SHARING_KEY) === "1";
    } catch {}
    if (!want && (user as any).locationSharing) want = true;
    if (want) {
      autoResumeTried.current = true;
      setSharing(true);
      startTracking({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 포그라운드 복귀/온라인 복귀 시: 추적 죽어 있으면 재시작 + 멤버 위치 새로고침
  useEffect(() => {
    const revive = async () => {
      const gid = groupRef.current?.id;
      if (gid) {
        try {
          const res = await fetch(`/api/location?groupId=${gid}`, { cache: "no-store" });
          const data = await res.json();
          if (data.members) setMembersLoc(data.members || []);
        } catch {}
      }
      let want = false;
      try {
        want = localStorage.getItem(SHARING_KEY) === "1";
      } catch {}
      if (want && watchIdRef.current === null && !document.hidden) {
        console.log("[geo] 복귀 감지 → 추적 재시작");
        setSharing(true);
        startTracking({ silent: true });
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") revive();
    };
    const onFocus = () => revive();
    const onOnline = () => revive();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      // 언마운트 시에도 의도(localStorage)는 유지 — 다음 진입 시 자동 재개.
      // 실제 watch만 정리 (브라우저가 어차피 죽이지만 명시적 정리)
      if (watchIdRef.current !== null && typeof watchIdRef.current === "number") {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
      }
      if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
    };
  }, []);
  const shareChuncheon = async () => {
    setSharing(true);
    try {
      localStorage.setItem(SHARING_KEY, "1");
    } catch {}
    const lat = 37.8813, lng = 127.7298;
    let address = "강원특별자치도 춘천시 중앙로 (춘천 시청附近)";
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const j = await r.json();
      if (j.display_name) address = j.display_name;
    } catch {}
    const res = await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng, address, sharing: true }) });
    setSharing(false);
    if (!res.ok) return alert("위치 공유 실패");
    setCoords({ lat, lng });
    await refresh();
    const r2 = await fetch("/api/location");
    const d2 = await r2.json();
    setMembersLoc(d2.members || []);
    triggerAlarm({ title: "📍 춘천 위치 공유 완료", body: "춘천 시청 기준으로 공유됐어요!", type: "schedule" });
    setTab("map");
  };

  const compressImage = (file: File, maxSize = 900): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas 실패"));
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        // 0.8 품질로 압축
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => reject(new Error("이미지 로드 실패"));
      img.src = url;
    });

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("이미지 파일만 가능해요");
    if (file.size > 12 * 1024 * 1024) return alert("12MB 이하만 가능해요. 더 작은 사진으로 시도하세요");
    try {
      let base64: string;
      if (file.size > 1.5 * 1024 * 1024 || file.type === "image/png") {
        base64 = await compressImage(file, 900);
      } else {
        base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(new Error("읽기 실패"));
          r.readAsDataURL(file);
        });
        if (base64.length > 10_000_000) base64 = await compressImage(file, 900);
      }
      setAvatarPreview(base64);
      const res = await fetch("/api/user/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar: base64 }) });
      const data = await res.json();
      if (!res.ok) return alert(data.error || "업로드 실패");
      await refresh();
      triggerAlarm({ title: "✅ 프로필 사진 변경!", body: "새 프로필 사진이 모두에게 표시돼요.", type: "schedule" });
    } catch {
      alert("이미지 처리 실패");
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const doLookup = async (email?: string) => {
    const target = email || lookupEmail || user?.email || "";
    if (!target.trim()) return alert("이메일을 입력하세요");
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await fetch("/api/auth/find-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: target, mode: "find-id" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLookupResult(data.usernames);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLookupLoading(false);
    }
  };
  const doResetRequest = async () => {
    if (!lookupEmail || !resetLookup.username) return alert("이메일과 아이디를 입력하세요");
    setLookupLoading(true);
    try {
      const res = await fetch("/api/auth/find-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: lookupEmail, username: resetLookup.username, mode: "request-reset" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(data.mocked ? `개발 모드 코드: ${data.code}` : "코드가 이메일로 발송됐어요");
      setResetLookup({ ...resetLookup, code: data.code || "" });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLookupLoading(false);
    }
  };
  const doResetConfirm = async () => {
    if (!resetLookup.code || !resetLookup.newPw) return alert("코드와 새 비밀번호 입력");
    setLookupLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: lookupEmail, username: resetLookup.username, code: resetLookup.code, newPassword: resetLookup.newPw }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("비밀번호 변경 완료");
      setResetLookup({ username: "", code: "", newPw: "" });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const logout = async () => {
    // 로그아웃 시 네이티브 서비스도 중단 (쿠키 무효라 401만 쌓이는 것 방지)
    try {
      await clearLocationWatch();
    } catch {}
    try {
      await stopNativeTracking();
    } catch {}
    setNativeBg(false);
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/auth";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0]">
        <div className="text-[#FF8A65] font-black animate-pulse">로딩 중...</div>
      </div>
    );
  }
  if (!user) return null;

  // --- NO GROUP VIEW (가입 그룹 0개일 때만) ---
  if (groups.length === 0) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] flex flex-col">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-[#FFE0CC] px-4 sm:px-6 py-3 flex items-center justify-between">
          <Logo size={36} />
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-[#FFE8D6] flex items-center justify-center font-black text-[#FF6B6B] overflow-hidden">
                {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : user.realName.slice(0, 1)}
              </div>
              <div className="text-sm leading-tight">
                <div className="font-black">{user.realName}</div>
                <div className="text-xs text-[#636E72]">@{user.username}</div>
              </div>
            </div>
            <button onClick={logout} className="px-4 py-2 rounded-xl bg-[#2D3436] text-white text-xs font-bold">
              로그아웃
            </button>
          </div>
        </header>

        <div className="flex-1 max-w-[1100px] w-full mx-auto p-4 sm:p-6 grid lg:grid-cols-2 gap-6">
          {/* create */}
          <div className="bg-white rounded-[28px] shadow-[0_12px_32px_rgba(255,107,107,0.12)] border border-[#FFE0CC] p-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF6B6B] to-[#FF8E53] flex items-center justify-center text-xl text-white">🏡</div>
            <h2 className="mt-4 text-[22px] font-black">새 그룹 만들기</h2>
            <p className="text-sm text-[#636E72] mt-1">가족, 친구, 동아리 — 그룹당 최대 10명, 한 사람당 최대 {MAX_GROUPS}개 그룹까지 함께해요.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-[#636E72]">그룹 이름 *</label>
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="예) 우리 가족, 행복한 302호" className="mt-1 w-full px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:border-[#FF6B6B] text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-[#636E72]">설명 (선택)</label>
                <input value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} placeholder="예) 매주 일요일 가족 식사!" className="mt-1 w-full px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:border-[#FF6B6B] text-sm" />
              </div>
              <button onClick={handleCreateGroup} disabled={creating} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53] text-white font-black shadow-lg disabled:opacity-60">
                {creating ? "생성 중..." : "✨ 그룹 만들기"}
              </button>
              <div className="text-xs text-[#B2BEC3] text-center">그룹을 만들면 자동으로 그룹장이 되고, 초대코드가 생성돼요.</div>
            </div>
          </div>

          {/* join */}
          <div className="bg-white rounded-[28px] shadow-[0_12px_32px_rgba(255,107,107,0.12)] border border-[#FFE0CC] p-6 flex flex-col">
            <div className="w-12 h-12 rounded-2xl bg-[#4ECDC4] flex items-center justify-center text-xl text-white">🔑</div>
            <h2 className="mt-4 text-[22px] font-black">그룹에 참여하기</h2>
            <p className="text-sm text-[#636E72] mt-1">초대코드 6자리 또는 그룹 이름으로 직접 입력해 입장하세요.</p>

            <div className="mt-6 flex gap-2">
              <input value={inviteCodeInput} onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())} placeholder="초대코드 6자리 (예: A3K9PX)" className="flex-1 px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:border-[#4ECDC4] text-sm font-mono tracking-widest uppercase" maxLength={30} />
              <button onClick={() => handleJoin()} disabled={joining} className="px-6 py-3 rounded-2xl bg-[#2D3436] text-white font-black text-sm disabled:opacity-60">
                입장
              </button>
            </div>
            <div className="mt-2 text-xs text-[#636E72] bg-[#FFF8F0] px-3 py-2 rounded-xl">💡 그룹 이름으로도 입장 가능 — 초대코드 대신 그룹 이름을 정확히 입력하고 입장 누르세요.</div>

            <div className="mt-6">
              <div className="flex items-center gap-2">
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="그룹 목록 보기 (검색만 가능)..." className="flex-1 px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm focus:outline-none focus:border-[#FF6B6B]" />
                <span className="text-xs text-[#B2BEC3] font-bold">{searchGroups.length}개</span>
              </div>
              <div className="text-[11px] text-[#636E72] mt-1 ml-1">아래 목록은 보기 전용 — 참여하려면 위 입력칸에 초대코드나 이름을 직접 쳐야 합니다.</div>

              <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {searchGroups.length === 0 && <div className="text-sm text-[#B2BEC3] text-center py-8">검색 결과가 없어요.</div>}
                {searchGroups.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 p-3 rounded-2xl border border-[#FFE0CC] bg-[#FFFDF8]">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0" style={{ background: g.color }}>
                      {g.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm truncate">{g.name}</div>
                      <div className="text-xs text-[#636E72] truncate">{g.description || "설명 없음"} • {g.memberCount}/10명</div>
                      <div className="text-[11px] font-mono font-bold text-[#B2BEC3]">보기 전용</div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 ${g.isFull ? "bg-[#FFE3E3] text-[#C0392B]" : "bg-[#F1F2F6] text-[#636E72]"}`}>
                      {g.isFull ? "가득 참" : `${g.memberCount}/10`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 text-center text-xs text-[#B2BEC3]">초대코드는 그룹원에게 물어보거나, 그룹장이 알려줄 수 있어요. 그룹당 최대 10명 · 한 사람당 최대 {MAX_GROUPS}개 그룹이에요.</div>
      </div>
    );
  }

  // --- MAIN DASHBOARD WITH GROUP ---
  // 가입 그룹은 있는데 활성 그룹 로딩 중이면 대기 화면 (아래 코드는 group non-null 보장)
  if (!group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0]">
        <div className="text-[#FF8A65] font-black animate-pulse">그룹 불러오는 중...</div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col">
      <AlarmOverlay alarm={alarm} onClose={() => setAlarm(null)} />

      {/* top bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-[#FFE0CC] px-2 sm:px-6 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          <Logo size={34} />
        </div>
        <div className="sm:hidden">
          <Logo size={30} showText={false} />
        </div>
        <div className="hidden sm:block h-6 w-px bg-[#FFE0CC] mx-2" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full animate-pulse shrink-0" style={{ background: group.color }} />
            <h1 className="font-black text-xs sm:text-base truncate max-w-[70px] sm:max-w-none">{group.name}</h1>
            <span className="inline-flex whitespace-nowrap text-[10px] sm:text-xs bg-[#FFE8D6] text-[#FF6B6B] font-black px-1.5 sm:px-2 py-0.5 rounded-full">#{group.inviteCode}</span>
            <span className="hidden sm:inline text-xs text-[#636E72] font-bold">· {group.memberCount}/10</span>
          </div>
          <div className="text-xs text-[#636E72] truncate hidden sm:block">{group.description || "함께하는 가족 그룹"}</div>
        </div>

        {/* 그룹 전환 (2개 이상 가입 시) — 웹/앱 공통 */}
        {groups.length > 1 && (
          <select
            value={group.id}
            onChange={(e) => doSwitchGroup(e.target.value)}
            disabled={switching}
            className="max-w-[110px] sm:max-w-[160px] px-2 py-1.5 rounded-xl bg-[#FFF0E6] border border-[#FFE0CC] text-xs font-black text-[#2D3436] shrink-0 focus:outline-none focus:border-[#FF6B6B] disabled:opacity-60"
            title="활동할 그룹 전환"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}{(unread[g.id] || 0) > 0 ? ` (${unread[g.id]})` : ""} ({g.memberCount}/10)
              </option>
            ))}
          </select>
        )}
        <button onClick={() => setShowGroupManager(true)} className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-[#E0F7F4] border border-[#4ECDC4]/40 text-xs font-black text-[#00897B] shrink-0" title={`내 그룹 관리 (${groups.length}/${MAX_GROUPS})`}>
          <span className="hidden sm:inline">👥 내 그룹 {groups.length}/{MAX_GROUPS}</span>
          <span className="sm:hidden">👥 {groups.length}/{MAX_GROUPS}</span>
        </button>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:block"><PWAInstall /></div>
          <button onClick={enablePush} className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FFE66D] border border-[#FFD54F] text-xs font-black text-[#2D3436] shrink-0" title="사이트 꺼져도 알림 받기">
            🔔 알림 켜기
          </button>
          <button onClick={enablePush} className="sm:hidden p-1.5 rounded-xl bg-[#FFE66D] border border-[#FFD54F] text-xs" title="알림 켜기">
            🔔
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(group.inviteCode);
              triggerAlarm({ title: "📋 복사 완료!", body: `초대코드 ${group.inviteCode}가 복사됐어요. 가족에게 공유해보세요!`, type: "schedule" });
            }}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-[#FFF0E6] border border-[#FFE0CC] text-xs font-bold text-[#FF6B6B] shrink-0"
          >
            <span className="hidden sm:inline">🔗 복사</span>
            <span className="sm:hidden">복사</span>
          </button>

          <div className="relative">
            <button onClick={() => fileRef.current?.click()} className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow flex items-center justify-center bg-[#FFE8D6] font-black text-[#FF6B6B]">
              {avatarPreview || user.avatar ? <img src={avatarPreview || user.avatar} alt="" className="w-full h-full object-cover" /> : user.realName.slice(0, 1)}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <div className="hidden sm:block text-right leading-tight">
            <div className="text-xs font-black">{user.realName}</div>
            <div className="text-[11px] text-[#636E72]">@{user.username}</div>
          </div>

          <button onClick={logout} className="ml-1 p-2 rounded-xl bg-[#FFF0E6] text-[#636E72] hover:bg-[#FFE0CC] text-xs">
            로그아웃
          </button>
        </div>
      </header>

      <div className="flex flex-1 max-w-[1400px] w-full mx-auto">
        {/* sidebar desktop */}
        <aside className="hidden lg:flex w-[260px] shrink-0 flex-col p-4 gap-3">
          <nav className="bg-white rounded-[24px] border border-[#FFE0CC] shadow-sm p-2 space-y-1">
            {[
              { id: "chat", label: "그룹 채팅", icon: "💬", desc: "실시간 대화" },
              { id: "dm", label: "개인 채팅", icon: "✉️", desc: "1:1 대화" },
              { id: "map", label: "지도 · 위치", icon: "🗺️", desc: "실시간 위치" },
              { id: "weather", label: "날씨", icon: "⛅", desc: "5일 예보" },
              { id: "members", label: "멤버", icon: "👨‍👩‍👧‍👦", desc: `${group.memberCount}명` },
            ].map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id as Tab)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition ${tab === n.id ? "bg-[#FF6B6B] text-white shadow" : "hover:bg-[#FFF8F0] text-[#2D3436]"}`}
              >
                <span className="text-lg">{n.icon}</span>
                <span className="flex-1">
                  <div className={`text-sm font-black ${tab === n.id ? "text-white" : ""}`}>{n.label}</div>
                  <div className={`text-xs ${tab === n.id ? "text-white/80" : "text-[#636E72]"}`}>{n.desc}</div>
                </span>
                {n.id === "chat" && (unread[group.id] || 0) > 0 && (
                  <span className="min-w-[22px] px-1.5 py-0.5 rounded-full bg-[#FF6B6B] text-white text-[11px] font-black text-center shrink-0">{unread[group.id] > 99 ? "99+" : unread[group.id]}</span>
                )}
                {n.id === "dm" && dmUnreadTotal > 0 && (
                  <span className="min-w-[22px] px-1.5 py-0.5 rounded-full bg-[#4ECDC4] text-white text-[11px] font-black text-center shrink-0">{dmUnreadTotal > 99 ? "99+" : dmUnreadTotal}</span>
                )}
                {tab === n.id && <span className="w-2 h-2 bg-white rounded-full animate-pulse" />}
              </button>
            ))}
          </nav>

          <div className="bg-gradient-to-br from-[#4ECDC4] to-[#44A8A0] rounded-[24px] p-5 text-white shadow">
            <div className="text-sm font-black">초대코드</div>
            <div className="mt-2 bg-white rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="font-mono font-black text-[#2D3436] tracking-[0.2em]">{group.inviteCode}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(group.inviteCode);
                  triggerAlarm({ title: "복사 완료!", body: "초대코드가 복사됐어요", type: "schedule" });
                }}
                className="text-xs bg-[#FFE66D] px-3 py-1.5 rounded-xl font-black text-[#2D3436]"
              >
                복사
              </button>
            </div>
            <div className="mt-3 text-xs text-white/80">가족을 초대해보세요! 최대 10명까지.</div>
          </div>

          {/* 내 그룹 목록 (최대 3개) — 다른 그룹으로 전환하며 활동 */}
          <div className="bg-white rounded-[24px] border border-[#FFE0CC] shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black text-[#636E72]">내 그룹 ({groups.length}/{MAX_GROUPS})</div>
              {groups.length < MAX_GROUPS && (
                <button onClick={() => setShowGroupManager(true)} className="text-[11px] font-black text-[#FF6B6B] bg-[#FFF0E6] px-2.5 py-1 rounded-lg">
                  ＋ 추가
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => doSwitchGroup(g.id)}
                  disabled={switching}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition disabled:opacity-60 ${g.id === group.id ? "bg-[#FF6B6B] text-white shadow" : "hover:bg-[#FFF8F0] border border-[#FFE0CC]"}`}
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0" style={{ background: g.color }}>
                    {g.name.slice(0, 1)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-xs font-black truncate ${g.id === group.id ? "text-white" : "text-[#2D3436]"}`}>{g.name}</span>
                    <span className={`block text-[10px] ${g.id === group.id ? "text-white/80" : "text-[#B2BEC3]"}`}>{g.memberCount}/10명{g.id === group.id ? " · 활동 중" : ""}</span>
                  </span>
                  {(unread[g.id] || 0) > 0 && (
                    <span className={`min-w-[22px] px-1.5 py-0.5 rounded-full text-[11px] font-black text-center shrink-0 ${g.id === group.id ? "bg-white text-[#FF6B6B]" : "bg-[#FF6B6B] text-white"}`}>
                      {unread[g.id] > 99 ? "99+" : unread[g.id]}
                    </span>
                  )}
                  {g.id === group.id && <span className="w-2 h-2 bg-white rounded-full animate-pulse shrink-0" />}
                </button>
              ))}
            </div>
            <button onClick={() => setShowGroupManager(true)} className="mt-3 w-full py-2 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-xs font-bold text-[#636E72]">
              그룹 관리 · 만들기 · 참여하기
            </button>
          </div>

          <div className="bg-white rounded-[24px] border border-[#FFE0CC] p-4">
            <div className="text-xs font-black text-[#636E72]">그룹 관리</div>
            <button onClick={handleLeave} className="mt-3 w-full py-2.5 rounded-xl bg-[#FFF0E6] text-[#FF6B6B] font-bold text-sm border border-[#FFD1C1]">
              그룹 나가기
            </button>
            {String(group.owner) === user.id && (
              <button onClick={handleDelete} className="mt-2 w-full py-2.5 rounded-xl bg-[#FFE3E3] text-[#C0392B] font-bold text-sm border border-[#FFB5B5]">
                🗑️ 그룹 삭제 (장만 가능)
              </button>
            )}
            <div className="mt-2 text-[11px] text-[#B2BEC3] text-center">나가면 다른 그룹에 들어갈 수 있어요.</div>
          </div>
        </aside>

        {/* main content */}
        <main className="flex-1 min-w-0 p-3 sm:p-4 pb-20 lg:pb-4">
          {/* CHAT TAB */}
          {tab === "chat" && (
            <div className="h-[calc(100vh-120px)] lg:h-[calc(100vh-92px)] bg-white rounded-[24px] border border-[#FFE0CC] shadow-sm flex flex-col overflow-hidden">
              {/* chat header */}
              <div className="px-4 sm:px-5 py-3 border-b border-[#FFE0CC] flex items-center justify-between bg-[#FFFDF8]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black" style={{ background: group.color }}>
                    💬
                  </div>
                  <div>
                    <div className="text-sm font-black">그룹 채팅</div>
                    <div className="text-xs text-[#636E72]">{group.name} · {socketOn ? "실시간 연결됨 ⚡" : "실시간 동기화 중..."}</div>
                  </div>
                </div>
                {(unread[group.id] || 0) > 0 && (
                  <button onClick={scrollToFirstUnread} className="px-3 py-1.5 rounded-full bg-[#FF6B6B] text-white text-xs font-black shadow animate-pulse">
                    {unread[group.id]}개 안 읽음 · 이동 ↓
                  </button>
                )}
              </div>

              {/* messages */}
              <div
                ref={chatContainerRef}
                onScroll={() => {
                  if (isChatNearBottom()) setNewArrivals(0);
                }}
                className="relative flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-[#FFFBF5]"
              >
                {newArrivals > 0 && (
                  <button
                    onClick={() => scrollChatToBottom()}
                    className="sticky top-2 z-10 mx-auto flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2D3436] text-white text-xs font-black shadow-lg"
                  >
                    ↓ 새 메시지 {newArrivals}개
                  </button>
                )}
                {messages.length === 0 && <div className="text-center py-16 text-[#B2BEC3] text-sm">아직 메시지가 없어요. 첫 메시지를 남겨보세요! 👋</div>}
                {messages.map((m) => {
                  const isMe = m.sender?.id === user.id;
                  const isSystem = m.type === "system";
                  if (isSystem) {
                    return (
                      <div key={m.id} id={`msg-${m.id}`} className="flex justify-center">
                        <span className="text-xs bg-[#FFE8D6] text-[#8B5A2B] px-3 py-1.5 rounded-full font-bold">{m.content}</span>
                      </div>
                    );
                  }
                  if (m.type === "schedule") {
                    return (
                      <div key={m.id} id={`msg-${m.id}`} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                        {!isMe && (
                          <div className="w-8 h-8 rounded-full bg-[#FFE8D6] flex items-center justify-center font-black text-xs shrink-0 overflow-hidden">
                            {m.sender?.avatar ? <img src={m.sender.avatar} className="w-full h-full object-cover" /> : m.sender?.realName?.slice(0, 1)}
                          </div>
                        )}
                        <div className={`max-w-[78%] rounded-[20px] overflow-hidden shadow-sm border ${isMe ? "bg-[#FF6B6B] text-white border-[#FF6B6B]" : "bg-white border-[#FFE0CC]"}`}>
                          <div className={`px-4 py-3 ${isMe ? "" : "bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53] text-white"}`}>
                            <div className="text-xs font-black opacity-90">📅 일정</div>
                            <div className="font-black text-sm leading-tight">{m.schedule?.title}</div>
                          </div>
                          <div className="px-4 py-3 space-y-1.5">
                            <div className={`text-xs font-bold flex items-center gap-2 ${isMe ? "text-white/90" : "text-[#636E72]"}`}>
                              <span>🗓️ {m.schedule?.date}</span>
                              {m.schedule?.time && <span>⏰ {m.schedule.time}</span>}
                            </div>
                            {m.schedule?.location && <div className={`text-xs ${isMe ? "text-white/80" : "text-[#636E72]"}`}>📍 {m.schedule.location}</div>}
                            {m.schedule?.description && <div className={`text-sm leading-relaxed ${isMe ? "text-white" : "text-[#2D3436]"}`}>{m.schedule.description}</div>}
                            <div className={`text-[11px] ${isMe ? "text-white/70" : "text-[#B2BEC3]"}`}>by {m.sender?.realName} · {new Date(m.createdAt).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  if (m.type === "vote") {
                    const total = m.vote.options.reduce((s: number, o: any) => s + o.count, 0) || 1;
                    return (
                      <div key={m.id} id={`msg-${m.id}`} className="flex justify-center">
                        <div className="w-full max-w-[520px] bg-white rounded-[20px] border-2 border-[#4ECDC4]/30 shadow p-4">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-full bg-[#4ECDC4] text-white text-xs font-black">🗳️ 투표</span>
                            <span className="text-xs text-[#636E72]">{m.sender?.realName}님이 올렸어요</span>
                          </div>
                          <div className="mt-2 font-black text-[15px]">{m.vote.question}</div>
                          <div className="mt-3 space-y-2">
                            {m.vote.options.map((opt: any, idx: number) => {
                              const pct = Math.round((opt.count / total) * 100);
                              const voted = opt.votes.includes(user.id);
                              return (
                                <button key={idx} onClick={() => handleVote(m.id, idx)} className={`w-full text-left relative overflow-hidden rounded-xl border px-3 py-2.5 flex items-center justify-between transition ${voted ? "border-[#4ECDC4] bg-[#E0F7F4]" : "border-[#FFE0CC] bg-[#FFF8F0] hover:bg-white"}`}>
                                  <div className="absolute inset-y-0 left-0 bg-[#4ECDC4]/15 transition-all" style={{ width: `${pct}%` }} />
                                  <span className="relative text-sm font-bold">{opt.text}</span>
                                  <span className="relative flex items-center gap-2">
                                    <span className="text-xs font-bold text-[#636E72]">{opt.count}표 · {pct}%</span>
                                    {voted && <span className="w-5 h-5 rounded-full bg-[#4ECDC4] text-white text-xs flex items-center justify-center">✓</span>}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-2 text-[11px] text-[#B2BEC3]">{total}명 참여 · {m.vote.allowMultiple ? "복수 선택 가능" : "단일 선택"} · {new Date(m.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  }
                  if (m.type === "image") {
                    return (
                      <div key={m.id} id={`msg-${m.id}`} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                        {!isMe && (
                          <div className="w-8 h-8 rounded-full bg-[#FFE8D6] flex items-center justify-center font-black text-xs shrink-0 overflow-hidden">
                            {m.sender?.avatar ? <img src={m.sender.avatar} className="w-full h-full object-cover" /> : m.sender?.realName?.slice(0, 1)}
                          </div>
                        )}
                        <div className="max-w-[74%]">
                          {!isMe && <div className="text-[11px] font-bold text-[#636E72] ml-1 mb-1">{m.sender?.realName}</div>}
                          <div className={`rounded-[18px] overflow-hidden shadow-sm ${isMe ? "bg-[#FF6B6B] p-1" : "bg-white border border-[#FFE0CC] p-1"}`}>
                            <img src={m.mediaUrl} alt="" className="max-w-[280px] max-h-[320px] w-full rounded-[14px] object-cover cursor-pointer" onClick={() => window.open(m.mediaUrl, "_blank")} />
                            {m.content && <div className={`px-3 py-1.5 text-sm ${isMe ? "text-white" : "text-[#2D3436]"}`}>{m.content}</div>}
                          </div>
                          <div className={`text-[10px] mt-1 ${isMe ? "text-right text-[#B2BEC3]" : "text-[#B2BEC3] ml-1"}`}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </div>
                    );
                  }
                  if (m.type === "video") {
                    return (
                      <div key={m.id} id={`msg-${m.id}`} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                        {!isMe && (
                          <div className="w-8 h-8 rounded-full bg-[#FFE8D6] flex items-center justify-center font-black text-xs shrink-0 overflow-hidden">
                            {m.sender?.avatar ? <img src={m.sender.avatar} className="w-full h-full object-cover" /> : m.sender?.realName?.slice(0, 1)}
                          </div>
                        )}
                        <div className="max-w-[74%]">
                          {!isMe && <div className="text-[11px] font-bold text-[#636E72] ml-1 mb-1">{m.sender?.realName}</div>}
                          <div className={`rounded-[18px] overflow-hidden shadow-sm ${isMe ? "bg-[#FF6B6B] p-1" : "bg-white border border-[#FFE0CC] p-1"}`}>
                            <video src={m.mediaUrl} controls className="max-w-[280px] max-h-[320px] w-full rounded-[14px] bg-black" />
                            {m.content && <div className={`px-3 py-1.5 text-sm ${isMe ? "text-white" : "text-[#2D3436]"}`}>{m.content}</div>}
                          </div>
                          <div className={`text-[10px] mt-1 ${isMe ? "text-right text-[#B2BEC3]" : "text-[#B2BEC3] ml-1"}`}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} id={`msg-${m.id}`} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                      {!isMe && (
                        <div className="w-8 h-8 rounded-full bg-[#FFE8D6] flex items-center justify-center font-black text-xs shrink-0 overflow-hidden">
                          {m.sender?.avatar ? <img src={m.sender.avatar} className="w-full h-full object-cover" /> : m.sender?.realName?.slice(0, 1)}
                        </div>
                      )}
                      <div className={`max-w-[74%]`}>
                        {!isMe && <div className="text-[11px] font-bold text-[#636E72] ml-1 mb-1">{m.sender?.realName}</div>}
                        <div className={`px-4 py-2.5 rounded-[18px] text-sm leading-relaxed shadow-sm ${isMe ? "bg-[#FF6B6B] text-white rounded-br-md" : "bg-white border border-[#FFE0CC] text-[#2D3436] rounded-bl-md"}`}>{m.content}</div>
                        <div className={`text-[10px] mt-1 ${isMe ? "text-right text-[#B2BEC3]" : "text-[#B2BEC3] ml-1"}`}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* input */}
              {chatMedia && (
                <div className="p-3 border-t border-[#FFE0CC] bg-[#FFF8F0] flex items-center gap-3">
                  {chatMedia.type.startsWith("image/") ? <img src={chatMedia.url} className="w-20 h-20 rounded-xl object-cover border border-[#FFE0CC]" alt="preview" /> : <video src={chatMedia.url} className="w-20 h-20 rounded-xl object-cover border border-[#FFE0CC]" />}
                  <div className="flex-1 text-xs">
                    <div className="font-bold">{chatMedia.type.startsWith("image/") ? "사진" : "동영상"} 첨부됨</div>
                    <div className="text-[#636E72]">전송 버튼을 누르면 함께 전송됩니다</div>
                  </div>
                  <button onClick={() => setChatMedia(null)} className="px-3 py-1.5 rounded-xl bg-[#FFE3E3] text-[#C0392B] text-xs font-bold">✕ 제거</button>
                </div>
              )}
              {/* 일정/투표 버튼 - 아래로 이동, 더 누르기 쉽게 크게 */}
              <div className="p-2 border-t border-[#FFE0CC] bg-[#FFFDF8] flex gap-2">
                <button onClick={() => setShowScheduleModal(true)} className="flex-1 py-3.5 rounded-2xl bg-[#FFE66D] text-[#2D3436] font-black text-sm shadow flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
                  📅 일정 만들기
                </button>
                <button onClick={() => setShowVoteModal(true)} className="flex-1 py-3.5 rounded-2xl bg-[#4ECDC4] text-white font-black text-sm shadow flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
                  🗳️ 투표 만들기
                </button>
              </div>
              <div className="p-3 border-t border-[#FFE0CC] bg-white flex gap-2 items-center">
                <input ref={chatFileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleChatFile} />
                <button onClick={() => chatFileRef.current?.click()} className="p-2.5 rounded-xl bg-[#FFF0E6] border border-[#FFE0CC] text-[#636E72] hover:bg-[#FFE0CC] shrink-0" title="사진/동영상 첨부">📎</button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="메시지를 입력하세요... (Enter로 전송)"
                  className="flex-1 px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:border-[#FF6B6B] text-sm"
                />
                <button onClick={sendMessage} disabled={sending || (!input.trim() && !chatMedia)} className="px-5 py-3 rounded-2xl bg-[#FF6B6B] text-white font-black text-sm disabled:opacity-50 shadow">
                  전송
                </button>
              </div>
            </div>
          )}

          {tab === "dm" && (
            <div className="h-[calc(100vh-120px)] lg:h-[calc(100vh-92px)] bg-white rounded-[24px] border border-[#FFE0CC] shadow-sm flex overflow-hidden">
              {/* members list */}
              <div className="w-[160px] sm:w-[220px] border-r border-[#FFE0CC] bg-[#FFFBF5] flex flex-col">
                <div className="p-3 border-b border-[#FFE0CC] bg-white">
                  <div className="text-xs font-black text-[#636E72]">같은 그룹 멤버</div>
                  <div className="text-[11px] text-[#B2BEC3]">1:1 개인 채팅</div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {group.members
                    .filter((m) => m.id !== user.id)
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setDmTarget(m.id)}
                        className={`w-full flex items-center gap-2 px-2 py-2.5 rounded-xl text-left ${dmTarget === m.id ? "bg-[#FF6B6B] text-white" : "hover:bg-white border border-transparent hover:border-[#FFE0CC]"}`}
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-[#FFE8D6] flex items-center justify-center font-black text-xs shrink-0">
                          {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.realName.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black truncate">{m.realName}</div>
                          <div className={`text-[11px] truncate ${dmTarget === m.id ? "text-white/80" : "text-[#636E72]"}`}>@{m.username}</div>
                        </div>
                        {(dmUnreadBy[m.id] || 0) > 0 && (
                          <span className={`min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] font-black text-center shrink-0 ${dmTarget === m.id ? "bg-white text-[#FF6B6B]" : "bg-[#4ECDC4] text-white"}`}>
                            {dmUnreadBy[m.id] > 99 ? "99+" : dmUnreadBy[m.id]}
                          </span>
                        )}
                      </button>
                    ))}
                  {group.members.filter((m) => m.id !== user.id).length === 0 && <div className="text-xs text-[#B2BEC3] text-center py-8">다른 멤버가 없어요</div>}
                </div>
              </div>

              {/* dm chat */}
              <div className="flex-1 flex flex-col min-w-0">
                {!dmTarget ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#FFE8D6] flex items-center justify-center text-2xl">✉️</div>
                    <div className="mt-3 font-black">개인 채팅</div>
                    <div className="text-sm text-[#636E72] mt-1">왼쪽에서 대화할 멤버를 선택하세요.<br />같은 그룹 안에서만 1:1 대화가 가능해요.</div>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-3 border-b border-[#FFE0CC] bg-[#FFFDF8] flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#FFE8D6] flex items-center justify-center font-black text-xs">
                        {group.members.find((m) => m.id === dmTarget)?.avatar ? <img src={group.members.find((m) => m.id === dmTarget)!.avatar} className="w-full h-full object-cover" /> : group.members.find((m) => m.id === dmTarget)?.realName.slice(0, 1)}
                      </div>
                      <div className="font-black text-sm">{group.members.find((m) => m.id === dmTarget)?.realName}</div>
                      <span className="text-xs text-[#636E72]">와의 1:1 대화</span>
                    </div>
                    <div ref={dmContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-[#FFFBF5]">
                      {dmMessages.length === 0 && <div className="text-center py-12 text-[#B2BEC3] text-sm">아직 대화가 없어요. 인사해보세요!</div>}
                      {dmMessages.map((m) => {
                        const isMe = m.sender?.id === user.id;
                        return (
                          <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[70%] px-4 py-2.5 rounded-[18px] text-sm ${isMe ? "bg-[#4ECDC4] text-white rounded-br-md" : "bg-white border border-[#FFE0CC] rounded-bl-md"}`}>{m.content}</div>
                          </div>
                        );
                      })}
                      <div ref={dmEndRef} />
                    </div>
                    <div className="p-3 border-t border-[#FFE0CC] bg-white flex gap-2">
                      <input value={dmInput} onChange={(e) => setDmInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendDM()} placeholder="메시지 입력..." className="flex-1 px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm focus:outline-none focus:border-[#4ECDC4]" />
                      <button onClick={sendDM} className="px-5 py-3 rounded-2xl bg-[#4ECDC4] text-white font-black text-sm">
                        전송
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className={`space-y-4 ${tab === "map" ? "block" : "hidden"}`}>
              <div className="bg-white rounded-[24px] border border-[#FFE0CC] shadow-sm overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black flex items-center gap-2">🗺️ 가족 위치 공유 {sharing && <span className="text-[11px] bg-[#00B894] text-white px-2 py-0.5 rounded-full animate-pulse">추적 중</span>}</h3>
                    <p className="text-xs text-[#636E72] mt-1">지도에서 우리 가족이 지금 어디에 있는지 확인해요. 위치는 실시간으로 업데이트돼요.</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={shareLocation} className={`px-5 py-3 rounded-2xl font-black text-sm shadow ${sharing ? "bg-[#FFE3E3] text-[#C0392B] border border-[#FFB5B5]" : "bg-[#4ECDC4] text-white"}`}>
                      {sharing ? "⏸️ 공유 중단" : "📍 위치 공유"}
                    </button>
                    <button onClick={recenterMap} className="px-4 py-3 rounded-2xl bg-white text-[#636E72] font-black text-sm shadow border border-[#FFE0CC]">
                      🎯 내 위치로
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-[#636E72]">공유를 켜두면 이동 시 5초/10m마다 자동 추적되고, <span className="font-bold">앱·웹을 다시 열면 버튼 없이 자동 재개</span>돼요. {nativeBg ? <span className="font-bold text-[#00B894]">📱 백그라운드 서비스 동작 중 — 앱을 꺼도 계속 전송돼요.</span> : <span><span className="font-bold text-[#FF6B6B]">웹에서는 완전히 꺼져 있는 동안의 이동은 기록되지 않아 다시 켜질 때 최신 위치로 갱신</span>돼요 — <a href="/download" className="underline text-[#4ECDC4] font-bold">앱 설치하기</a></span>}</div>
                  {sharing && !nativeBg && <div className="mt-2 text-xs bg-[#E0F7F4] text-[#00897B] px-3 py-2 rounded-xl font-bold">✅ 자동 추적 ON — 이 상태로 두면 나갔다 들어와도 다시 버튼을 누를 필요 없어요. 끄려면 ‘공유 중단’을 누르세요.</div>}
                  {sharing && nativeBg && <div className="mt-2 text-xs bg-[#E0F7F4] text-[#00897B] px-3 py-2 rounded-xl font-bold">📱 백그라운드 서비스 동작 중 — 상태바에 ‘위치 공유 중’ 알림이 뜨는 동안은 앱을 꺼도 위치가 계속 전송돼요. 끄려면 ‘공유 중단’을 누르세요.</div>}
                  {geoError && <div className="mt-2 text-xs bg-[#FFE3E3] text-[#C0392B] px-3 py-2 rounded-xl font-bold">{geoError}</div>}
                </div>
                {coords && <div className="px-4 py-2 bg-[#FFF8F0] border-b border-[#FFE0CC] text-xs flex items-center gap-2"><span className="w-2 h-2 bg-[#00B894] rounded-full animate-pulse" /> 현재 기준: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} {Math.abs(coords.lat-37.8813)<0.01 ? "(춘천)" : Math.abs(coords.lat-37.5665)<0.01 ? "(서울 - 권한 거부 시 기본값)" : ""} <button onClick={() => setCoords(null)} className="ml-auto text-[#FF6B6B] font-bold underline">다시 가져오기</button></div>}
                <div ref={mapRef} className="w-full h-[320px] sm:h-[420px] bg-[#E8F5F3] relative" />
                <div className="p-3 bg-[#FFFBF5] border-t border-[#FFE0CC] flex flex-wrap gap-2">
                  {membersLoc.map((m) => {
                    const age = m.location ? locAgeSec(m.location.updatedAt) : Infinity;
                    const stale = !m.location || age > 300;
                    const veryStale = !m.location || age > 900;
                    return (
                      <div key={m.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${m.location && !stale ? "bg-white border-[#4ECDC4]/30" : m.location ? "bg-[#FFF8F0] border-[#FFD1C1]" : "bg-[#F1F2F6] border-[#E5E7EB] text-[#636E72]"}`}>
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-[#FFE8D6] flex items-center justify-center text-xs font-black">
                          {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.realName.slice(0, 1)}
                        </div>
                        {m.realName}
                        {m.location ? (
                          <span className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${veryStale ? "bg-[#C0392B]" : stale ? "bg-[#F39C12]" : "bg-[#00B894] animate-pulse"}`} />
                            <span className={`text-[10px] ${veryStale ? "text-[#C0392B]" : stale ? "text-[#E67E22]" : "text-[#00B894]"}`}>{timeAgo(m.location.updatedAt)}{stale ? " · 오래됨" : ""}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#B2BEC3]">{m.sharing ? "켜짐·신호대기" : "미공유"}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {membersLoc
                  .filter((m) => m.location)
                  .map((m) => {
                    const age = locAgeSec(m.location.updatedAt);
                    const stale = age > 300;
                    return (
                      <div key={m.id} className="bg-white rounded-2xl border border-[#FFE0CC] p-4 flex gap-3">
                        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#FFE8D6] flex items-center justify-center font-black shrink-0">
                          {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.realName.slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-sm">{m.realName} {m.id===user.id && <span className="text-[#FF6B6B]">(나)</span>} {stale && <span className="ml-1 text-[10px] bg-[#FFE3E3] text-[#C0392B] px-2 py-0.5 rounded-full">오래된 위치</span>}</div>
                          <div className="text-xs text-[#636E72] truncate">{m.location.address || `${m.location.lat.toFixed(4)}, ${m.location.lng.toFixed(4)}`}</div>
                          <div className="text-[11px] text-[#B2BEC3]">{m.location.updatedAt ? `${new Date(m.location.updatedAt).toLocaleString()} (${timeAgo(m.location.updatedAt)})` : ""}{stale ? " — 상대가 앱을 다시 열면 최신으로 갱신돼요" : ""}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

          {tab === "weather" && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-[#64B5F6] via-[#4DB6AC] to-[#4ECDC4] rounded-[24px] p-6 text-white shadow-lg relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/20 rounded-full blur-2xl" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold opacity-90 flex items-center gap-2 flex-wrap">현재 날씨 • {weatherAddr ? weatherAddr.split(",").slice(0,3).join(", ").slice(0,36) : coords ? `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}` : "위치 확인 중"} <button onClick={() => setCoords({ lat: 37.5665, lng: 126.978 })} className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-xs">서울</button><button onClick={() => setCoords(null)} className="px-2 py-0.5 rounded-full bg-white/80 text-[#2D3436] text-xs font-black">내 위치</button></div>
                      {weatherAddr && <div className="text-xs opacity-80 mt-1 line-clamp-1">{weatherAddr}</div>}
                      {weatherLoading ? (
                        <div className="mt-6 text-white/80">불러오는 중...</div>
                      ) : weatherError ? (
                        <div className="mt-4 bg-white/20 rounded-xl px-3 py-2 text-sm">⚠️ 날씨 로드 실패: {weatherError} <button onClick={() => setCoords({ ...coords! })} className="underline ml-2">재시도</button></div>
                      ) : weather?.current ? (
                        <>
                          <div className="text-[42px] font-black leading-none mt-2">{weather.current.temp ?? "-"}°</div>
                          <div className="text-sm font-bold opacity-90">{weather.current.desc} · 체감 {weather.current.feels}°</div>
                          <div className="mt-3 flex gap-2 text-xs">
                            <span className="bg-white/20 px-3 py-1.5 rounded-full">💧 습도 {weather.current.humidity}%</span>
                            <span className="bg-white/20 px-3 py-1.5 rounded-full">💨 바람 {weather.current.wind}km/h</span>
                          </div>
                        </>
                      ) : (
                        <div className="mt-4 text-white/80 text-sm">날씨 정보를 불러올 수 없어요 — 위치를 허용하거나 춘천 버튼을 눌러보세요</div>
                      )}
                    </div>
                    <div className="text-6xl hidden sm:block">{weather?.current?.code === 0 ? "☀️" : weather?.current?.code === 3 ? "☁️" : weather?.current?.code >= 61 ? "🌧️" : "⛅"}</div>
                  </div>
                  <div className="mt-4 text-xs opacity-80">Open-Meteo 무료 API • 매일 05:00 업데이트 • 가족 나들이 전에 확인하세요!</div>
                </div>
              </div>

              {weather?.daily && (
                <div className="bg-white rounded-[24px] border border-[#FFE0CC] p-4">
                  <h4 className="font-black text-sm mb-3">5일 예보</h4>
                  <div className="grid grid-cols-5 gap-2">
                    {weather.daily.map((d: any) => (
                      <div key={d.date} className="bg-[#FFF8F0] rounded-2xl p-3 text-center border border-[#FFE0CC]">
                        <div className="text-[11px] font-bold text-[#636E72]">{new Date(d.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" })}</div>
                        <div className="text-xl mt-1">{d.code === 0 ? "☀️" : d.code === 3 ? "☁️" : d.code >= 61 ? "🌧️" : d.code === 45 ? "🌫️" : "⛅"}</div>
                        <div className="text-xs font-black mt-1">{d.max}° / {d.min}°</div>
                        <div className="text-[11px] text-[#4ECDC4] font-bold mt-1">{d.desc}</div>
                        {d.precip > 30 && <div className="text-[10px] bg-[#4DB6AC] text-white rounded-full px-1.5 py-0.5 mt-1">강수 {d.precip}%</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-[#FFF8F0] rounded-2xl border border-[#FFE0CC] p-4 flex gap-3 items-center">
                <span className="text-2xl">💡</span>
                <div className="text-sm">
                  <div className="font-black">가족 팁</div>
                  <div className="text-[#636E72]">비가 오는 날엔 실내 활동을, 맑은 날엔 공원 나들이를 투표로 정해보세요!</div>
                </div>
              </div>
            </div>
          )}

          {tab === "members" && (
            <div className="space-y-4">
              <div className="bg-white rounded-[24px] border border-[#FFE0CC] p-6">
                <h3 className="font-black">멤버 ({group.members.length}/10)</h3>
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  {group.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl border border-[#FFE0CC] bg-[#FFFBF5]">
                      <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#FFE8D6] flex items-center justify-center font-black shrink-0 border-2 border-white shadow">
                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.realName.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm flex items-center gap-1.5">
                          {m.realName} {m.id === group.owner && <span className="text-[10px] bg-[#FF6B6B] text-white px-1.5 py-0.5 rounded-full">그룹장</span>} {m.id === user.id && <span className="text-[10px] bg-[#FFE66D] text-[#2D3436] px-1.5 py-0.5 rounded-full">나</span>}
                        </div>
                        <div className="text-xs text-[#636E72]">@{m.username}</div>
                      </div>
                      {m.id !== user.id && (
                        <button onClick={() => { setTab("dm"); setDmTarget(m.id); }} className="px-3 py-1.5 rounded-xl bg-[#4ECDC4] text-white text-xs font-bold">
                          1:1 채팅
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-[24px] border border-[#FFE0CC] p-6">
                <h4 className="font-black text-sm">🔍 이메일로 내 계정 찾기 / 비밀번호 변경</h4>
                <p className="text-xs text-[#636E72] mt-1">로그인한 이메일만 치면 바로 그 이메일의 아이디 내역이 나와요. 같은 이메일로 여러 계정 가능!</p>
                <div className="mt-3 flex gap-2">
                  <input value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} placeholder={user.email} className="flex-1 px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
                  <button onClick={() => doLookup()} disabled={lookupLoading} className="px-4 py-2.5 rounded-xl bg-[#4ECDC4] text-white font-black text-sm disabled:opacity-50">{lookupLoading ? "조회 중..." : "아이디 조회"}</button>
                  <button onClick={() => { setLookupEmail(user.email); doLookup(user.email); }} className="px-3 py-2.5 rounded-xl bg-[#FFE8D6] text-[#636E72] font-bold text-xs hidden sm:block">내 이메일로 바로 조회</button>
                </div>
                {lookupResult && (
                  <div className="mt-3 p-3 rounded-xl bg-[#E0F7F4] border border-[#4ECDC4]/30">
                    <div className="text-xs font-black text-[#00B894]">이 이메일의 아이디 {lookupResult.length}개:</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">{lookupResult.map((u) => <span key={u} className="px-2.5 py-1 rounded-full bg-white border border-[#4ECDC4] font-mono font-bold text-sm">{u}</span>)}</div>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-[#FFE0CC]">
                  <div className="text-xs font-black text-[#636E72]">비밀번호 변경 (이메일 + 아이디로 바로 재설정)</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input value={resetLookup.username} onChange={(e) => setResetLookup({ ...resetLookup, username: e.target.value })} placeholder="아이디" className="px-3 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
                    <button onClick={doResetRequest} disabled={lookupLoading} className="px-3 py-2.5 rounded-xl bg-[#FF6B6B] text-white font-black text-xs">코드 발송</button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input value={resetLookup.code} onChange={(e) => setResetLookup({ ...resetLookup, code: e.target.value })} placeholder="코드 6자리" className="flex-1 px-3 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm font-mono" />
                    <input value={resetLookup.newPw} onChange={(e) => setResetLookup({ ...resetLookup, newPw: e.target.value })} placeholder="새 비번" type="password" className="flex-1 px-3 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
                    <button onClick={doResetConfirm} disabled={lookupLoading} className="px-4 py-2.5 rounded-xl bg-[#00B894] text-white font-black text-xs">변경</button>
                  </div>
                  <div className="text-[11px] text-[#B2BEC3] mt-1">이메일만 치면 바로 조회, 비밀번호는 이메일+아이디 → 코드 → 새 비번 순으로 바로 변경</div>
                </div>
              </div>

              <div className="bg-white rounded-[24px] border border-[#FFE0CC] p-6">
                <h4 className="font-black text-sm">그룹 관리</h4>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button onClick={handleLeave} className="flex-1 py-3 rounded-xl bg-[#FFF0E6] border border-[#FFD1C1] text-[#FF6B6B] font-black text-sm">
                    그룹 나가기
                  </button>
                  {String(group.owner) === user.id && (
                    <button onClick={handleDelete} className="flex-1 py-3 rounded-xl bg-[#FFE3E3] border border-[#FFB5B5] text-[#C0392B] font-black text-sm">
                      그룹 삭제
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-[#B2BEC3] text-center">그룹을 나가면 다른 그룹에 참여하거나 새 그룹을 만들 수 있어요.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl border-t border-[#FFE0CC] flex justify-around py-2 px-2 z-10">
        {[
          { id: "chat", icon: "💬", label: "채팅" },
          { id: "dm", icon: "✉️", label: "개인" },
          { id: "map", icon: "🗺️", label: "지도" },
          { id: "weather", icon: "⛅", label: "날씨" },
          { id: "members", icon: "👨‍👩‍👦", label: "멤버" },
        ].map((n) => (
          <button key={n.id} onClick={() => setTab(n.id as Tab)} className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl ${tab === n.id ? "bg-[#FF6B6B] text-white" : "text-[#636E72]"}`}>
            <span className="text-lg">{n.icon}</span>
            <span className="text-[10px] font-black">{n.label}</span>
            {n.id === "chat" && (unread[group.id] || 0) > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] px-1 py-0.5 rounded-full bg-[#FF6B6B] border-2 border-white text-white text-[10px] font-black text-center">
                {unread[group.id] > 99 ? "99+" : unread[group.id]}
              </span>
            )}
            {n.id === "dm" && dmUnreadTotal > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] px-1 py-0.5 rounded-full bg-[#4ECDC4] border-2 border-white text-white text-[10px] font-black text-center">
                {dmUnreadTotal > 99 ? "99+" : dmUnreadTotal}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* group manager modal — 내 그룹 목록/전환/만들기/참여 (웹·앱 공통) */}
      {showGroupManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowGroupManager(false)} />
          <div className="relative bg-white rounded-[24px] w-full max-w-[480px] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black flex items-center gap-2">👥 내 그룹 ({groups.length}/{MAX_GROUPS})</h3>
            <p className="text-xs text-[#636E72] mt-1">한 번에 최대 {MAX_GROUPS}개 그룹까지 들어갈 수 있어요. 전환하면 그 그룹에서 바로 활동해요.</p>

            <div className="mt-4 space-y-2">
              {groups.map((g) => (
                <div key={g.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${g.id === group.id ? "border-[#FF6B6B] bg-[#FFF5F2]" : "border-[#FFE0CC] bg-[#FFFDF8]"}`}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0" style={{ background: g.color }}>
                    {g.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-sm truncate">{g.name}{g.id === group.id && <span className="ml-1.5 text-[10px] bg-[#FF6B6B] text-white px-1.5 py-0.5 rounded-full">활동 중</span>}{(unread[g.id] || 0) > 0 && <span className="ml-1.5 text-[10px] bg-[#FF6B6B] text-white px-1.5 py-0.5 rounded-full">{unread[g.id] > 99 ? "99+" : unread[g.id]} 안 읽음</span>}</div>
                    <div className="text-xs text-[#636E72] truncate">#{g.inviteCode} · {g.memberCount}/10명</div>
                  </div>
                  {g.id !== group.id && (
                    <button onClick={() => doSwitchGroup(g.id)} disabled={switching} className="px-4 py-2 rounded-xl bg-[#2D3436] text-white text-xs font-black shrink-0 disabled:opacity-60">
                      전환
                    </button>
                  )}
                </div>
              ))}
            </div>

            {groups.length < MAX_GROUPS ? (
              <div className="mt-5 pt-4 border-t border-[#FFE0CC] space-y-4">
                <div>
                  <div className="text-sm font-black">✨ 새 그룹 만들기</div>
                  <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="그룹 이름 (2글자 이상)" className="mt-2 w-full px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm focus:outline-none focus:border-[#FF6B6B]" />
                  <input value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} placeholder="설명 (선택)" className="mt-2 w-full px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm focus:outline-none focus:border-[#FF6B6B]" />
                  <button onClick={handleCreateGroup} disabled={creating} className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53] text-white font-black text-sm disabled:opacity-60">
                    {creating ? "생성 중..." : "그룹 만들기"}
                  </button>
                </div>
                <div>
                  <div className="text-sm font-black">🔑 다른 그룹에 참여하기</div>
                  <div className="mt-2 flex gap-2">
                    <input value={inviteCodeInput} onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())} placeholder="초대코드 6자리 or 그룹 이름" className="flex-1 px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm font-mono uppercase focus:outline-none focus:border-[#4ECDC4]" maxLength={30} />
                    <button onClick={async () => { await handleJoin(); setInviteCodeInput(""); }} disabled={joining} className="px-5 py-2.5 rounded-xl bg-[#2D3436] text-white font-black text-sm disabled:opacity-60">
                      입장
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="그룹 검색..." className="flex-1 px-4 py-2 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm focus:outline-none focus:border-[#FF6B6B]" />
                    <span className="text-xs text-[#B2BEC3] font-bold">{searchGroups.length}개</span>
                  </div>
                  <div className="mt-2 space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {searchGroups.length === 0 && <div className="text-xs text-[#B2BEC3] text-center py-4">검색 결과가 없어요.</div>}
                    {searchGroups
                      .filter((g) => !groups.some((mine) => mine.id === g.id))
                      .map((g) => (
                        <div key={g.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-[#FFE0CC] bg-[#FFFDF8]">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0" style={{ background: g.color }}>
                            {g.name.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-xs truncate">{g.name}</div>
                            <div className="text-[11px] text-[#636E72]">{g.memberCount}/10명</div>
                          </div>
                          <button onClick={() => handleJoin(g.id, true)} disabled={joining || g.isFull} className="px-3 py-1.5 rounded-lg bg-[#4ECDC4] text-white text-xs font-black shrink-0 disabled:opacity-40">
                            {g.isFull ? "가득 참" : "입장"}
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-xs text-center font-bold text-[#C0392B] bg-[#FFE3E3] rounded-xl px-3 py-2.5">
                최대 {MAX_GROUPS}개 그룹에 속해 있어요. 더 들어가려면 먼저 그룹을 나가주세요.
              </div>
            )}

            <button onClick={() => setShowGroupManager(false)} className="mt-5 w-full py-3 rounded-xl bg-[#F1F2F6] font-bold text-sm">
              닫기
            </button>
          </div>
        </div>
      )}

      {/* schedule modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowScheduleModal(false)} />
          <div className="relative bg-white rounded-[24px] w-full max-w-[480px] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black flex items-center gap-2">📅 새 일정 만들기</h3>
            <p className="text-xs text-[#636E72] mt-1">일정을 올리면 모든 멤버에게 큼직한 알림이 울려요! (진동 + 사운드 + 화면)</p>

            <div className="mt-4 space-y-3">
              <input value={scheduleForm.title} onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })} placeholder="제목 * (예: 가족 저녁 식사)" className="w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm focus:outline-none focus:border-[#FF6B6B]" />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={scheduleForm.date} onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })} className="px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
                <input type="time" value={scheduleForm.time} onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })} className="px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
              </div>
              <input value={scheduleForm.location} onChange={(e) => setScheduleForm({ ...scheduleForm, location: e.target.value })} placeholder="장소 (선택, 예: 할머니 댁)" className="w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
              <textarea value={scheduleForm.description} onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })} placeholder="설명 (선택)" rows={3} className="w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm resize-none" />
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setShowScheduleModal(false)} className="flex-1 py-3 rounded-xl bg-[#F1F2F6] font-bold text-sm">
                취소
              </button>
              <button onClick={sendSchedule} className="flex-1 py-3 rounded-xl bg-[#FF6B6B] text-white font-black text-sm">
                일정 올리기 + 알림 울리기 🔔
              </button>
            </div>
          </div>
        </div>
      )}

      {showVoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowVoteModal(false)} />
          <div className="relative bg-white rounded-[24px] w-full max-w-[480px] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black flex items-center gap-2">🗳️ 투표 만들기</h3>
            <p className="text-xs text-[#636E72] mt-1">그룹 채팅에서 바로 투표하고 결과를 확인해요.</p>

            <div className="mt-4 space-y-3">
              <input value={voteForm.question} onChange={(e) => setVoteForm({ ...voteForm, question: e.target.value })} placeholder="질문 * (예: 이번 주말 어디 갈까요?)" className="w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm focus:outline-none focus:border-[#4ECDC4]" />
              {voteForm.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input value={opt} onChange={(e) => setVoteForm({ ...voteForm, options: voteForm.options.map((o, idx) => (idx === i ? e.target.value : o)) })} placeholder={`선택지 ${i + 1}`} className="flex-1 px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
                  {voteForm.options.length > 2 && (
                    <button onClick={() => setVoteForm({ ...voteForm, options: voteForm.options.filter((_, idx) => idx !== i) })} className="px-3 rounded-xl bg-[#FFE3E3] text-[#C0392B]">
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {voteForm.options.length < 6 && (
                <button onClick={() => setVoteForm({ ...voteForm, options: [...voteForm.options, ""] })} className="w-full py-2 rounded-xl border-2 border-dashed border-[#FFE0CC] text-sm font-bold text-[#636E72]">
                  + 선택지 추가
                </button>
              )}
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={voteForm.allowMultiple} onChange={(e) => setVoteForm({ ...voteForm, allowMultiple: e.target.checked })} /> 복수 선택 허용
              </label>
              <input type="datetime-local" value={voteForm.expiresAt} onChange={(e) => setVoteForm({ ...voteForm, expiresAt: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" placeholder="마감 시간(선택)" />
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setShowVoteModal(false)} className="flex-1 py-3 rounded-xl bg-[#F1F2F6] font-bold text-sm">
                취소
              </button>
              <button onClick={sendVote} className="flex-1 py-3 rounded-xl bg-[#4ECDC4] text-white font-black text-sm">
                투표 올리기 🗳️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
