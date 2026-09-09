import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import { verifyToken } from "@/lib/auth";
import { isGroupMember, loadUserWithGroups } from "@/lib/groups";
import { emitToGroup } from "@/lib/realtime";

function toMessageJson(m: any) {
  return {
    id: String(m._id),
    groupId: String(m.groupId),
    sender: m.sender
      ? { id: String(m.sender._id || m.sender), realName: m.sender.realName, username: m.sender.username, avatar: m.sender.avatar }
      : null,
    type: m.type,
    content: m.content,
    schedule: m.schedule || null,
    vote: m.vote
      ? {
          question: m.vote.question,
          options: m.vote.options.map((o: any) => ({ text: o.text, votes: o.votes.map((v: any) => String(v)), count: o.votes.length })),
          allowMultiple: m.vote.allowMultiple,
          expiresAt: m.vote.expiresAt,
          closed: m.vote.closed,
        }
      : null,
    mediaUrl: m.mediaUrl || null,
    mediaType: m.mediaType || null,
    readBy: ((m.readBy || []) as any[]).map((v: any) => String(v)),
    createdAt: m.createdAt,
  };
}

async function resolveGroupId(userId: string, requested?: string | null) {
  const user = await loadUserWithGroups(userId);
  if (!user) return { error: "유저 없음" as const };
  const target = requested || (user.groupId ? String(user.groupId) : null);
  if (!target) return { error: "그룹 없음" as const };
  const ok = await isGroupMember(userId, target);
  if (!ok) return { error: "속하지 않은 그룹입니다." as const };
  return { user, target };
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const resolved = await resolveGroupId(payload.userId, searchParams.get("groupId"));
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });

    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);
    const before = searchParams.get("before");

    const query: any = { groupId: resolved.target, isDirect: { $ne: true } };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit).populate("sender", "realName username avatar").lean();
    // reverse to chronological
    messages.reverse();

    return NextResponse.json({
      messages: messages.map(toMessageJson),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const body = await req.json();
    const { content, type, schedule, vote, mediaUrl, mediaType } = body;
    const groupIdParam: string | undefined = body.groupId;

    const resolved = await resolveGroupId(payload.userId, groupIdParam);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
    const user = resolved.user;
    const targetGroupId = resolved.target;

    // validation per type
    if (type === "schedule") {
      if (!schedule?.title || !schedule?.date) return NextResponse.json({ error: "일정 제목과 날짜 필요" }, { status: 400 });
    } else if (type === "vote") {
      if (!vote?.question || !vote?.options || vote.options.length < 2) return NextResponse.json({ error: "투표 질문과 2개 이상 선택지 필요" }, { status: 400 });
      if (vote.options.length > 6) return NextResponse.json({ error: "선택지는 최대 6개" }, { status: 400 });
    } else if (type === "image" || type === "video") {
      if (!mediaUrl || typeof mediaUrl !== "string") return NextResponse.json({ error: "미디어 없음" }, { status: 400 });
      if (mediaUrl.length > 18_000_000) return NextResponse.json({ error: "파일이 너무 큽니다 (15MB 이하 권장). 더 작은 파일로 시도하세요." }, { status: 400 });
    } else {
      if (!content || !content.trim()) return NextResponse.json({ error: "메시지 내용 필요" }, { status: 400 });
    }

    const msgData: any = {
      groupId: targetGroupId,
      sender: user._id,
      type: type || "text",
      content: content || "",
      readBy: [user._id], // 작성자는 읽음 처리
    };
    if (type === "schedule") msgData.schedule = schedule;
    if (type === "vote") {
      msgData.vote = {
        question: vote.question,
        options: vote.options.map((t: string) => ({ text: t, votes: [] })),
        allowMultiple: !!vote.allowMultiple,
        expiresAt: vote.expiresAt ? new Date(vote.expiresAt) : null,
        closed: false,
      };
    }
    if (type === "image" || type === "video") {
      msgData.mediaUrl = mediaUrl;
      msgData.mediaType = mediaType || (type === "image" ? "image/jpeg" : "video/mp4");
    }

    const msg = await Message.create(msgData);
    await msg.populate("sender", "realName username avatar");
    console.log(`✅ [DB] 메시지 실시간 저장: type=${msgData.type} group=${String(targetGroupId)} sender=${payload.username} id=${String(msg._id)}`);
    // 사이트 꺼져도 가야 하는 푸시 — 일정은 큼직한 알람, 일반 메시지도 알림
    try {
      const { sendPushToGroup } = await import("@/lib/push");
      const title = msgData.type === "schedule" ? `📅 새 일정: ${schedule?.title}` : msgData.type === "vote" ? `🗳️ 새 투표: ${vote?.question}` : `💬 ${user.realName}`;
      const body = msgData.type === "schedule" ? `${schedule?.date} ${schedule?.time || ""} - ${user.realName}님이 일정을 올렸어요!` : msgData.type === "vote" ? `${user.realName}님이 투표를 올렸어요!` : (content || "").slice(0, 80);
      const pushType = msgData.type === "schedule" ? "schedule" : msgData.type === "vote" ? "vote" : "message";
      // fire-and-forget (기다리지 않고 백그라운드)
      sendPushToGroup(String(targetGroupId), String(user._id), { title, body, url: "/", type: pushType as any });
    } catch (e: any) {
      console.warn("[PUSH] 호출 실패:", e.message);
    }

    const populated = msg as any;
    const messageJson = toMessageJson(populated);
    // 같은 그룹 방에 실시간 브로드캐스트 (소켓 연결된 멤버는 폴링 없이 즉시 수신)
    emitToGroup(String(targetGroupId), "message:new", messageJson);

    return NextResponse.json({
      ok: true,
      message: messageJson,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
