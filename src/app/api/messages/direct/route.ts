import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import User from "@/models/User";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
    const user = await User.findById(payload.userId);
    if (!user?.groupId) return NextResponse.json({ error: "그룹 없음" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const withUser = searchParams.get("with");
    if (!withUser) return NextResponse.json({ error: "with param 필요" }, { status: 400 });

    const other = await User.findById(withUser);
    if (!other) return NextResponse.json({ error: "상대 없음" }, { status: 404 });
    if (String(other.groupId) !== String(user.groupId)) return NextResponse.json({ error: "같은 그룹 멤버만 가능" }, { status: 403 });

    const messages = await Message.find({
      isDirect: true,
      groupId: user.groupId,
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
    const user = await User.findById(payload.userId);
    if (!user?.groupId) return NextResponse.json({ error: "그룹 없음" }, { status: 400 });

    const { receiverId, content } = await req.json();
    if (!receiverId || !content?.trim()) return NextResponse.json({ error: "receiverId와 content 필요" }, { status: 400 });

    const other = await User.findById(receiverId);
    if (!other) return NextResponse.json({ error: "상대 없음" }, { status: 404 });
    if (String(other.groupId) !== String(user.groupId)) return NextResponse.json({ error: "같은 그룹만 가능" }, { status: 403 });

    const msg = await Message.create({
      groupId: user.groupId,
      sender: user._id,
      receiver: other._id,
      isDirect: true,
      type: "text",
      content: content.trim(),
    });
    await msg.populate("sender", "realName username avatar");
    const populated = msg as any;
    return NextResponse.json({
      ok: true,
      message: {
        id: String(populated._id),
        sender: { id: String(populated.sender._id), realName: populated.sender.realName, username: populated.sender.username, avatar: populated.sender.avatar },
        content: populated.content,
        createdAt: populated.createdAt,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
