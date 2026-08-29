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
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);
    const before = searchParams.get("before");

    const query: any = { groupId: user.groupId, isDirect: { $ne: true } };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit).populate("sender", "realName username avatar").lean();
    // reverse to chronological
    messages.reverse();

    return NextResponse.json({
      messages: messages.map((m: any) => ({
        id: String(m._id),
        groupId: String(m.groupId),
        sender: m.sender ? { id: String(m.sender._id), realName: m.sender.realName, username: m.sender.username, avatar: m.sender.avatar } : null,
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
    if (!user?.groupId) return NextResponse.json({ error: "그룹에 먼저 가입하세요." }, { status: 400 });

    const { content, type, schedule, vote } = await req.json();

    // validation per type
    if (type === "schedule") {
      if (!schedule?.title || !schedule?.date) return NextResponse.json({ error: "일정 제목과 날짜 필요" }, { status: 400 });
    } else if (type === "vote") {
      if (!vote?.question || !vote?.options || vote.options.length < 2) return NextResponse.json({ error: "투표 질문과 2개 이상 선택지 필요" }, { status: 400 });
      if (vote.options.length > 6) return NextResponse.json({ error: "선택지는 최대 6개" }, { status: 400 });
    } else {
      if (!content || !content.trim()) return NextResponse.json({ error: "메시지 내용 필요" }, { status: 400 });
    }

    const msgData: any = {
      groupId: user.groupId,
      sender: user._id,
      type: type || "text",
      content: content || "",
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

    const msg = await Message.create(msgData);
    await msg.populate("sender", "realName username avatar");

    const populated = msg as any;

    return NextResponse.json({
      ok: true,
      message: {
        id: String(populated._id),
        groupId: String(populated.groupId),
        sender: { id: String(populated.sender._id), realName: populated.sender.realName, username: populated.sender.username, avatar: populated.sender.avatar },
        type: populated.type,
        content: populated.content,
        schedule: populated.schedule || null,
        vote: populated.vote
          ? {
              question: populated.vote.question,
              options: populated.vote.options.map((o: any) => ({ text: o.text, votes: o.votes.map((v: any) => String(v)), count: o.votes.length })),
              allowMultiple: populated.vote.allowMultiple,
              expiresAt: populated.vote.expiresAt,
              closed: populated.vote.closed,
            }
          : null,
        createdAt: populated.createdAt,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
