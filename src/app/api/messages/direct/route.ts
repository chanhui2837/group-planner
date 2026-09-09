import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import User from "@/models/User";
import Group from "@/models/Group";
import { verifyToken } from "@/lib/auth";
import { loadUserWithGroups } from "@/lib/groups";
import { emitToUser } from "@/lib/realtime";

// 두 유저가 target 그룹을 함께 공유하는지 확인
async function sharedGroupId(userId: string, otherId: string, requested?: string | null) {
  const user = await loadUserWithGroups(userId);
  if (!user) return { error: "유저 없음" as const };
  const target = requested || (user.groupId ? String(user.groupId) : null);
  if (!target) return { error: "그룹 없음" as const };
  const shared = await Group.countDocuments({ _id: target, members: { $all: [userId as any, otherId as any] } });
  if (!shared) return { error: "같은 그룹 멤버끼리만 가능" as const };
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
    const withUser = searchParams.get("with");
    if (!withUser) return NextResponse.json({ error: "with param 필요" }, { status: 400 });

    const other = await User.findById(withUser);
    if (!other) return NextResponse.json({ error: "상대 없음" }, { status: 404 });
    const resolved = await sharedGroupId(payload.userId, String(other._id), searchParams.get("groupId"));
    if ("error" in resolved) {
      const status = resolved.error === "같은 그룹 멤버끼리만 가능" ? 403 : 400;
      return NextResponse.json({ error: resolved.error }, { status });
    }
    const user = resolved.user;

    const messages = await Message.find({
      isDirect: true,
      groupId: resolved.target,
      $or: [
        { sender: user._id, receiver: other._id },
        { sender: other._id, receiver: user._id },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate("sender", "realName username avatar")
      .lean();

    return NextResponse.json({
      messages: messages.map((m: any) => ({
        id: String(m._id),
        sender: m.sender ? { id: String(m.sender._id), realName: m.sender.realName, username: m.sender.username, avatar: m.sender.avatar } : null,
        content: m.content,
        createdAt: m.createdAt,
      })),
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

    const { receiverId, content, groupId } = await req.json();
    if (!receiverId || !content?.trim()) return NextResponse.json({ error: "receiverId와 content 필요" }, { status: 400 });

    const other = await User.findById(receiverId);
    if (!other) return NextResponse.json({ error: "상대 없음" }, { status: 404 });
    const resolved = await sharedGroupId(payload.userId, String(other._id), groupId);
    if ("error" in resolved) {
      const status = resolved.error === "같은 그룹 멤버끼리만 가능" ? 403 : 400;
      return NextResponse.json({ error: resolved.error }, { status });
    }
    const user = resolved.user;

    const msg = await Message.create({
      groupId: resolved.target,
      sender: user._id,
      receiver: other._id,
      isDirect: true,
      type: "text",
      content: content.trim(),
      readBy: [user._id],
    });
    await msg.populate("sender", "realName username avatar");
    const populated = msg as any;
    const dmJson = {
      id: String(populated._id),
      groupId: String(populated.groupId),
      sender: { id: String(populated.sender._id), realName: populated.sender.realName, username: populated.sender.username, avatar: populated.sender.avatar },
      content: populated.content,
      createdAt: populated.createdAt,
    };
    // 수신자 개인 방으로 실시간 전달
    emitToUser(String(other._id), "dm:new", dmJson);
    return NextResponse.json({
      ok: true,
      message: dmJson,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
