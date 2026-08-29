"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Logo from "@/components/Logo";
import AlarmOverlay, { AlarmData } from "@/components/AlarmOverlay";

// lazy leaflet to avoid SSR
let L: any = null;

type Tab = "chat" | "dm" | "schedule" | "map" | "weather" | "members";

export default function Dashboard() {
  const { user, group, loading, refresh } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("chat");
  const [alarm, setAlarm] = useState<AlarmData | null>(null);

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
  const lastMsgCount = useRef(0);

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
  const [membersLoc, setMembersLoc] = useState<any[]>([]);
  const [sharing, setSharing] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  // profile
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // auth guard
  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [loading, user, router]);

  // fetch groups search
  useEffect(() => {
    if (!user || group) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/groups?q=${encodeURIComponent(searchQ)}`);
      const data = await res.json();
      setSearchGroups(data.groups || []);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, user, group]);

  // fetch weather by geo — 고정 도시 없음, 실제 기기 위치만 사용
  const [weatherError, setWeatherError] = useState<string | null>(null);
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
  }, [coords]);

  // polling group messages
  useEffect(() => {
    if (!user || !group) return;
    let interval: any;
    const fetchMsgs = async () => {
      const res = await fetch("/api/messages/group");
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
    interval = setInterval(fetchMsgs, 2500);
    return () => clearInterval(interval);
  }, [user, group]);

  // auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, dmMessages]);

  // poll locations
  useEffect(() => {
    if (!group || tab !== "map") return;
    const fetchLoc = async () => {
      const res = await fetch("/api/location");
      const data = await res.json();
      setMembersLoc(data.members || []);
    };
    fetchLoc();
    const id = setInterval(fetchLoc, 4000);
    return () => clearInterval(id);
  }, [group, tab]);

  // DM polling
  useEffect(() => {
    if (!dmTarget || !group) return;
    const fetchDm = async () => {
      const res = await fetch(`/api/messages/direct?with=${dmTarget}`);
      const data = await res.json();
      if (data.messages) setDmMessages(data.messages);
    };
    fetchDm();
    const id = setInterval(fetchDm, 2000);
    return () => clearInterval(id);
  }, [dmTarget, group]);

  // leaflet map init
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
        // fix default icon path (leaflet CDN)
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
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      // 중심: 멤버 위치 평균 → 내 실제 기기 위치 → 대한민국 중심 (고정 도시 없음)
      const validLocs = membersLoc.filter((m: any) => m.location && typeof m.location.lat === "number");
      let center: [number, number];
      if (validLocs.length > 0) {
        const avgLat = validLocs.reduce((s: number, m: any) => s + m.location.lat, 0) / validLocs.length;
        const avgLng = validLocs.reduce((s: number, m: any) => s + m.location.lng, 0) / validLocs.length;
        center = [avgLat, avgLng];
      } else if (coords) {
        center = [coords.lat, coords.lng];
      } else {
        center = [36.5, 127.5]; // 대한민국 중심 — 특정 도시 고정 아님
      }
      const map = L.map(mapRef.current).setView(center, validLocs.length > 0 ? 11 : 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
      mapInstance.current = map;

      // add markers for members - 프로필/이름 항상 표시
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
        L.marker([m.location.lat, m.location.lng], { icon }).addTo(map).bindPopup(`<b>${m.realName}${isMe ? " (나)" : ""}</b><br/>${m.location.address || `${m.location.lat.toFixed(5)}, ${m.location.lng.toFixed(5)}`}<br/><small>${m.location.updatedAt ? new Date(m.location.updatedAt).toLocaleString() : ""}</small>`);
      });

      // 위치 미공유 안내 마커 (서울→춘천으로 수정)
      if (validLocs.length === 0) {
        const msg = coords ? `내 위치 (공유 전) - ${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}<br/><small>“내 위치 공유하기”를 눌러 춘천 위치를 공유하세요</small>` : "위치를 공유해보세요";
        L.marker(center).addTo(map).bindPopup(msg);
      }
      // 멤버가 여러 명이면 모두 보이도록 bounds 조정
      if (validLocs.length > 1) {
        try {
          const group = new L.featureGroup(validLocs.map((m: any) => L.marker([m.location.lat, m.location.lng])));
          map.fitBounds(group.getBounds().pad(0.2));
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, membersLoc, coords, user?.id]);

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
    setJoining(true);
    const res = await fetch("/api/groups/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    setJoining(false);
    if (!res.ok) return alert(data.error || "참가 실패");
    await refresh();
    triggerAlarm({ title: "👋 그룹 입장!", body: `${data.group.name}에 입장했어요!`, type: "schedule" });
  };

  const handleLeave = async () => {
    if (!confirm("정말 그룹에서 나가시겠어요?")) return;
    const res = await fetch("/api/groups/leave", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "탈퇴 실패");
    await refresh();
  };

  const handleDelete = async () => {
    if (!group) return;
    if (!confirm(`"${group.name}" 그룹을 삭제할까요? 모든 채팅이 사라집니다.`)) return;
    const res = await fetch(`/api/groups?id=${group.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "삭제 실패");
    await refresh();
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    setSending(true);
    const res = await fetch("/api/messages/group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: input, type: "text" }) });
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

  const sendSchedule = async () => {
    if (!scheduleForm.title || !scheduleForm.date) return alert("제목과 날짜는 필수!");
    const res = await fetch("/api/messages/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "schedule", content: scheduleForm.title, schedule: scheduleForm }),
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
    const res = await fetch("/api/messages/direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiverId: dmTarget, content: dmInput }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "전송 실패");
    setDmMessages((prev) => [...prev, data.message]);
    setDmInput("");
  };

  const shareLocation = async () => {
    if (!("geolocation" in navigator)) return alert("위치 기능을 지원하지 않는 기기예요");
    setSharing(true);
    const doShare = async (latitude: number, longitude: number, showAlarm = true) => {
      let address = "";
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const j = await r.json();
        address = j.display_name || "";
      } catch {}
      const res = await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: latitude, lng: longitude, address }) });
      setSharing(false);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return alert("위치 공유 실패: " + (d.error || res.statusText));
      }
      setCoords({ lat: latitude, lng: longitude });
      await refresh();
      const r2 = await fetch("/api/location");
      const d2 = await r2.json();
      setMembersLoc(d2.members || []);
      if (showAlarm) triggerAlarm({ title: "📍 위치 공유 완료", body: `위치가 저장됐어요! (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`, type: "schedule" });
      setTab("map");
    };
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await doShare(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setSharing(false);
        console.warn("[geo] share fail", err);
        if (err.code === 1) {
          if (confirm("위치 권한이 거부됐어요. 브라우저 주소창 왼쪽 🔒 > 위치 허용 후 다시 시도하세요. 춘천 시청(37.8813,127.7298)으로 임시 공유할까요?")) {
            doShare(37.8813, 127.7298);
          }
        } else {
          alert("위치 가져오기 실패: " + err.message + "\n\n팁: 핸드폰 설정 > 위치 서비스 켜기, 브라우저 위치 허용을 확인하세요.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // 실시간 이동 추적 - 핸드폰 들고 이동하면 자동 갱신
  const toggleTracking = () => {
    if (isTracking) {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsTracking(false);
      console.log("[geo] 실시간 추적 중지");
      return;
    }
    if (!("geolocation" in navigator)) return alert("위치 기능 미지원 기기예요");
    if (!group) return alert("그룹에 먼저 가입하세요");
    setIsTracking(true);
    console.log("[geo] 실시간 추적 시작 - 5초/10m 마다 MongoDB에 자동 저장");
    // 즉시 한 번 공유
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude, lo = pos.coords.longitude;
        lastSentRef.current = { lat: la, lng: lo, t: Date.now() };
        fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: la, lng: lo, address: "" }) }).then(() => {
          setCoords({ lat: la, lng: lo });
        });
      },
      () => {}
    );
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const la = pos.coords.latitude, lo = pos.coords.longitude;
        const now = Date.now();
        const last = lastSentRef.current;
        // 5초 이내 & 10m 이내면 스킵 (배터리/DB 절약)
        if (last) {
          const dt = now - last.t;
          const dLat = la - last.lat, dLng = lo - last.lng;
          const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111000; // 대략 m
          if (dt < 5000 && dist < 10) return;
        }
        lastSentRef.current = { lat: la, lng: lo, t: now };
        let address = "";
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${lo}`);
          const j = await r.json();
          address = j.display_name || "";
        } catch {}
        await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: la, lng: lo, address }) });
        setCoords({ lat: la, lng: lo });
        console.log(`📍 [실시간] 위치 자동 갱신: ${la.toFixed(5)},${lo.toFixed(5)}`);
        // 지도 탭이 아니면 membersLoc 갱신은 폴링(4초)이 처리, 지도면 즉시 반영
        if (tab === "map") {
          const r2 = await fetch("/api/location");
          const d2 = await r2.json();
          setMembersLoc(d2.members || []);
        }
      },
      (err) => {
        console.warn("[geo] watch fail", err);
        setIsTracking(false);
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        alert("실시간 추적 실패: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
    watchIdRef.current = id as unknown as number;
  };
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);
  const shareChuncheon = async () => {
    setSharing(true);
    const lat = 37.8813, lng = 127.7298;
    let address = "강원특별자치도 춘천시 중앙로 (춘천 시청附近)";
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const j = await r.json();
      if (j.display_name) address = j.display_name;
    } catch {}
    const res = await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng, address }) });
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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert("2MB 이하만 가능해요");
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setAvatarPreview(base64);
      const res = await fetch("/api/user/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar: base64 }) });
      const data = await res.json();
      if (!res.ok) return alert(data.error || "업로드 실패");
      await refresh();
      triggerAlarm({ title: "✅ 프로필 사진 변경!", body: "새 프로필 사진이 모두에게 표시돼요.", type: "schedule" });
    };
    reader.readAsDataURL(file);
  };

  const logout = async () => {
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

  // --- NO GROUP VIEW ---
  if (!group) {
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
            <p className="text-sm text-[#636E72] mt-1">가족, 친구, 동아리 — 최대 10명까지 함께해요.</p>

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
            <p className="text-sm text-[#636E72] mt-1">초대코드를 입력하거나, 아래 목록에서 찾아보세요.</p>

            <div className="mt-6 flex gap-2">
              <input value={inviteCodeInput} onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())} placeholder="초대코드 6자리 (예: A3K9PX)" className="flex-1 px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:border-[#4ECDC4] text-sm font-mono tracking-widest uppercase" maxLength={6} />
              <button onClick={() => handleJoin()} disabled={joining} className="px-6 py-3 rounded-2xl bg-[#2D3436] text-white font-black text-sm disabled:opacity-60">
                입장
              </button>
            </div>

            <div className="mt-6">
              <div className="flex items-center gap-2">
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="그룹 이름으로 검색..." className="flex-1 px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm focus:outline-none focus:border-[#FF6B6B]" />
                <span className="text-xs text-[#B2BEC3] font-bold">{searchGroups.length}개</span>
              </div>

              <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {searchGroups.length === 0 && <div className="text-sm text-[#B2BEC3] text-center py-8">검색 결과가 없어요. 초대코드를 받아보세요!</div>}
                {searchGroups.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 p-3 rounded-2xl border border-[#FFE0CC] bg-[#FFFDF8] hover:bg-white transition">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0" style={{ background: g.color }}>
                      {g.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm truncate">{g.name}</div>
                      <div className="text-xs text-[#636E72] truncate">{g.description || "설명 없음"} • {g.memberCount}/10명</div>
                      <div className="text-[11px] font-mono font-bold text-[#FF6B6B]">#{g.inviteCode}</div>
                    </div>
                    <button
                      disabled={g.isFull}
                      onClick={() => handleJoin(g.id, true)}
                      className={`px-4 py-2 rounded-xl text-xs font-black shrink-0 ${g.isFull ? "bg-[#F1F2F6] text-[#B2BEC3]" : "bg-[#FFE66D] text-[#2D3436] hover:bg-[#FFD54F]"}`}
                    >
                      {g.isFull ? "가득 참" : "참여"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 text-center text-xs text-[#B2BEC3]">초대코드는 그룹원에게 물어보거나, 그룹장이 알려줄 수 있어요. 그룹은 최대 10명 제한이에요.</div>
      </div>
    );
  }

  // --- MAIN DASHBOARD WITH GROUP ---
  return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col">
      <AlarmOverlay alarm={alarm} onClose={() => setAlarm(null)} />

      {/* top bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-[#FFE0CC] px-3 sm:px-6 py-3 flex items-center gap-3">
        <Logo size={34} />
        <div className="hidden sm:block h-6 w-px bg-[#FFE0CC] mx-2" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: group.color }} />
            <h1 className="font-black text-sm sm:text-base truncate">{group.name}</h1>
            <span className="hidden sm:inline text-xs bg-[#FFE8D6] text-[#FF6B6B] font-black px-2 py-0.5 rounded-full">#{group.inviteCode}</span>
            <span className="text-xs text-[#636E72] font-bold">· {group.memberCount}/10</span>
          </div>
          <div className="text-xs text-[#636E72] truncate hidden sm:block">{group.description || "함께하는 가족 그룹"}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(group.inviteCode);
              triggerAlarm({ title: "📋 복사 완료!", body: `초대코드 ${group.inviteCode}가 복사됐어요. 가족에게 공유해보세요!`, type: "schedule" });
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FFF0E6] border border-[#FFE0CC] text-xs font-bold text-[#FF6B6B]"
          >
            🔗 초대코드 복사
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
                    <div className="text-xs text-[#636E72]">{group.name} · 실시간 동기화 중...</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowScheduleModal(true)} className="px-3 py-2 rounded-xl bg-[#FFE66D] text-[#2D3436] font-black text-xs flex items-center gap-1">
                    📅 일정
                  </button>
                  <button onClick={() => setShowVoteModal(true)} className="px-3 py-2 rounded-xl bg-[#4ECDC4] text-white font-black text-xs flex items-center gap-1">
                    🗳️ 투표
                  </button>
                </div>
              </div>

              {/* messages */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-[#FFFBF5]">
                {messages.length === 0 && <div className="text-center py-16 text-[#B2BEC3] text-sm">아직 메시지가 없어요. 첫 메시지를 남겨보세요! 👋</div>}
                {messages.map((m) => {
                  const isMe = m.sender?.id === user.id;
                  const isSystem = m.type === "system";
                  if (isSystem) {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <span className="text-xs bg-[#FFE8D6] text-[#8B5A2B] px-3 py-1.5 rounded-full font-bold">{m.content}</span>
                      </div>
                    );
                  }
                  if (m.type === "schedule") {
                    return (
                      <div key={m.id} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
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
                      <div key={m.id} className="flex justify-center">
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
                  return (
                    <div key={m.id} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
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
              <div className="p-3 border-t border-[#FFE0CC] bg-white flex gap-2 items-center">
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
                <button onClick={sendMessage} disabled={sending || !input.trim()} className="px-5 py-3 rounded-2xl bg-[#FF6B6B] text-white font-black text-sm disabled:opacity-50 shadow">
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
                        <div className="min-w-0">
                          <div className="text-xs font-black truncate">{m.realName}</div>
                          <div className={`text-[11px] truncate ${dmTarget === m.id ? "text-white/80" : "text-[#636E72]"}`}>@{m.username}</div>
                        </div>
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
                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-[#FFFBF5]">
                      {dmMessages.length === 0 && <div className="text-center py-12 text-[#B2BEC3] text-sm">아직 대화가 없어요. 인사해보세요!</div>}
                      {dmMessages.map((m) => {
                        const isMe = m.sender?.id === user.id;
                        return (
                          <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[70%] px-4 py-2.5 rounded-[18px] text-sm ${isMe ? "bg-[#4ECDC4] text-white rounded-br-md" : "bg-white border border-[#FFE0CC] rounded-bl-md"}`}>{m.content}</div>
                          </div>
                        );
                      })}
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

          {tab === "map" && (
            <div className="space-y-4">
              <div className="bg-white rounded-[24px] border border-[#FFE0CC] shadow-sm overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black flex items-center gap-2">🗺️ 가족 위치 공유</h3>
                    <p className="text-xs text-[#636E72] mt-1">지도에서 우리 가족이 지금 어디에 있는지 확인해요. 위치는 실시간으로 업데이트돼요.</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={shareLocation} disabled={sharing} className="px-5 py-3 rounded-2xl bg-[#4ECDC4] text-white font-black text-sm shadow disabled:opacity-60">
                      {sharing ? "공유 중..." : "📍 내 위치 1회 공유"}
                    </button>
                    <button onClick={toggleTracking} className={`px-5 py-3 rounded-2xl font-black text-sm shadow border ${isTracking ? "bg-[#FF6B6B] text-white border-[#FF6B6B] animate-pulse" : "bg-[#FFE66D] text-[#2D3436] border-[#FFD54F]"}`}>
                      {isTracking ? "⏸️ 실시간 추적 중지" : "▶️ 실시간 이동 추적"}
                    </button>
                    <button onClick={shareChuncheon} disabled={sharing} className="px-4 py-3 rounded-2xl bg-white text-[#636E72] font-black text-sm shadow border border-[#FFE0CC] disabled:opacity-60" title="테스트용 - 춘천 시청 좌표로 저장">
                      🧪 춘천 테스트
                    </button>
                  </div>
                  {geoError && <div className="mt-2 text-xs bg-[#FFE3E3] text-[#C0392B] px-3 py-2 rounded-xl font-bold">{geoError}</div>}
                  {isTracking && <div className="mt-2 text-xs font-bold text-[#FF6B6B] flex items-center gap-1.5"><span className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-ping" /> 핸드폰 들고 이동하면 5초/10m 마다 MongoDB에 자동 저장 → 지도에 프로필/이름 실시간 이동!</div>}
                </div>
                {coords && <div className="px-4 py-2 bg-[#FFF8F0] border-b border-[#FFE0CC] text-xs flex items-center gap-2"><span className="w-2 h-2 bg-[#00B894] rounded-full animate-pulse" /> 현재 기준: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} {Math.abs(coords.lat-37.8813)<0.01 ? "(춘천)" : Math.abs(coords.lat-37.5665)<0.01 ? "(서울 - 권한 거부 시 기본값)" : ""} <button onClick={() => setCoords(null)} className="ml-auto text-[#FF6B6B] font-bold underline">다시 가져오기</button></div>}
                <div ref={mapRef} className="w-full h-[420px] bg-[#E8F5F3] relative" />
                <div className="p-3 bg-[#FFFBF5] border-t border-[#FFE0CC] flex flex-wrap gap-2">
                  {membersLoc.map((m) => (
                    <div key={m.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${m.location ? "bg-white border-[#4ECDC4]/30" : "bg-[#F1F2F6] border-[#E5E7EB] text-[#636E72]"}`}>
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-[#FFE8D6] flex items-center justify-center text-xs font-black">
                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.realName.slice(0, 1)}
                      </div>
                      {m.realName}
                      {m.location ? <span className="w-2 h-2 bg-[#00B894] rounded-full animate-pulse" /> : <span className="text-[10px] text-[#B2BEC3]">미공유</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {membersLoc
                  .filter((m) => m.location)
                  .map((m) => (
                    <div key={m.id} className="bg-white rounded-2xl border border-[#FFE0CC] p-4 flex gap-3">
                      <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#FFE8D6] flex items-center justify-center font-black shrink-0">
                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.realName.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm">{m.realName} {m.id===user.id && <span className="text-[#FF6B6B]">(나)</span>}</div>
                        <div className="text-xs text-[#636E72] truncate">{m.location.address || `${m.location.lat.toFixed(4)}, ${m.location.lng.toFixed(4)}`}</div>
                        <div className="text-[11px] text-[#B2BEC3]">{m.location.updatedAt ? new Date(m.location.updatedAt).toLocaleString() : ""}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {tab === "weather" && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-[#64B5F6] via-[#4DB6AC] to-[#4ECDC4] rounded-[24px] p-6 text-white shadow-lg relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/20 rounded-full blur-2xl" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold opacity-90 flex items-center gap-2">현재 날씨 • {coords ? `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}` : "위치 확인 중"} <button onClick={() => setCoords({ lat: 37.5665, lng: 126.978 })} className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-xs">서울</button><button onClick={() => setCoords(null)} className="px-2 py-0.5 rounded-full bg-white/80 text-[#2D3436] text-xs font-black">내 위치</button></div>
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
          <button key={n.id} onClick={() => setTab(n.id as Tab)} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl ${tab === n.id ? "bg-[#FF6B6B] text-white" : "text-[#636E72]"}`}>
            <span className="text-lg">{n.icon}</span>
            <span className="text-[10px] font-black">{n.label}</span>
          </button>
        ))}
      </nav>

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
