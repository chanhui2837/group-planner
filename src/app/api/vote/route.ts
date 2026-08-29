import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const { messageId, optionIndex } = await req.json();
    if (!messageId || optionIndex === undefined) return NextResponse.json({ error: "messageId와 optionIndex 필요" }, { status: 400 });

    const msg = await Message.findById(messageId);
    if (!msg || !msg.vote) return NextResponse.json({ error: "투표 없음" }, { status: 404 });
    if (msg.vote.closed) return NextResponse.json({ error: "종료된 투표" }, { status: 400 });
    if (msg.vote.expiresAt && new Date(msg.vote.expiresAt) < new Date()) {
      msg.vote.closed = true;
      await msg.save();
      return NextResponse.json({ error: "만료된 투표" }, { status: 400 });
    }
    if (optionIndex < 0 || optionIndex >= msg.vote.options.length) return NextResponse.json({ error: "잘못된 선택지" }, { status: 400 });

    const userId = payload.userId;
    const options = msg.vote.options as any[];

    if (!msg.vote.allowMultiple) {
      // remove previous votes
      for (const opt of options) {
        opt.votes = opt.votes.filter((v: any) => String(v) !== userId);
      }
    } else {
      // if already voted this option, toggle off
      const currentOpt = options[optionIndex];
      if (currentOpt.votes.some((v: any) => String(v) === userId)) {
        currentOpt.votes = currentOpt.votes.filter((v: any) => String(v) !== userId);
        await msg.save();
        return NextResponse.json({ ok: true, vote: msg.vote });
      }
    }

    // add vote
    if (!msg.vote.allowMultiple || !options[optionIndex].votes.some((v: any) => String(v) === userId)) {
      options[optionIndex].votes.push(userId as any);
    }

    await msg.save();
    return NextResponse.json({ ok: true, vote: { question: msg.vote.question, options: msg.vote.options.map((o: any) => ({ text: o.text, votes: o.votes.map((v: any) => String(v)), count: o.votes.length })), allowMultiple: msg.vote.allowMultiple } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
