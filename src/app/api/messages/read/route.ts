import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import { verifyToken } from "@/lib/auth";
import { isGroupMember, loadUserWithGroups } from "@/lib/groups";

// 읽음 처리: { groupId, upTo(ISO, 이 시각까지), directWith?(1:1 상대 id) }
// - 그룹채팅: 해당 그룹의 일반 메시지 중 upTo 이전·내가 안 쓴 글을 읽음
// - 1:1: directWith와의 대화 중 upTo 이전 글을 읽음
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const { groupId, upTo, directWith } = await req.json();
    const user = await loadUserWithGroups(payload.userId);
    if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });
    const target = groupId || (user.groupId ? String(user.groupId) : null);
    if (!target) return NextResponse.json({ error: "그룹 없음" }, { status: 400 });
    const ok = await isGroupMember(payload.userId, target);
    if (!ok) return NextResponse.json({ error: "속하지 않은 그룹입니다." }, { status: 403 });

    const upToDate = upTo ? new Date(upTo) : new Date();
    const filter: any = { groupId: target, createdAt: { $lte: upToDate }, readBy: { $ne: payload.userId } };
    if (directWith) {
      filter.isDirect = true;
      filter.$or = [
        { sender: payload.userId, receiver: directWith },
        { sender: directWith, receiver: payload.userId },
      ];
    } else {
      filter.isDirect = { $ne: true };
      filter.sender = { $ne: payload.userId };
    }

    const r = await Message.updateMany(filter, { $addToSet: { readBy: payload.userId } });
    return NextResponse.json({ ok: true, marked: r.modifiedCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
