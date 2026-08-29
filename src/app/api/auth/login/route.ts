import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { username, password } = await req.json();
    if (!username || !password) return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });

    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user) return NextResponse.json({ error: "존재하지 않는 계정입니다." }, { status: 401 });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return NextResponse.json({ error: "비밀번호가 틀렸습니다." }, { status: 401 });

    const token = await createToken({ userId: String(user._id), username: user.username, realName: user.realName });

    const res = NextResponse.json({
      ok: true,
      user: {
        id: String(user._id),
        realName: user.realName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        groupId: user.groupId ? String(user.groupId) : null,
      },
    });
    res.cookies.set("token", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
