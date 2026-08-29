import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { verifyToken } from "@/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
    const { realName, email } = await req.json();
    const update: any = {};
    if (realName) update.realName = realName;
    if (email) update.email = email;
    const user = await User.findByIdAndUpdate(payload.userId, update, { new: true });
    return NextResponse.json({ ok: true, user: { id: String(user!._id), realName: user!.realName, email: user!.email, username: user!.username, avatar: user!.avatar } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
