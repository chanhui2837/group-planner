import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { realName, username, password, email } = await req.json();

    if (!realName || !username || !password || !email) {
      return NextResponse.json({ error: "모든 필드를 입력해주세요." }, { status: 400 });
    }
    if (username.length < 3) return NextResponse.json({ error: "아이디는 3글자 이상" }, { status: 400 });
    if (password.length < 4) return NextResponse.json({ error: "비밀번호는 4글자 이상" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "올바른 이메일 형식" }, { status: 400 });

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      if (existingUser.username === username) return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      realName,
      username,
      email,
      password: hashed,
      avatar: "",
    });

    const token = await createToken({ userId: String(user._id), username: user.username, realName: user.realName });

    const res = NextResponse.json({
      ok: true,
      user: { id: String(user._id), realName: user.realName, username: user.username, email: user.email, avatar: user.avatar, groupId: null },
    });
    res.cookies.set("token", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch (e: any) {
    console.error(e);
    if (e.code === 11000) return NextResponse.json({ error: "중복된 아이디/이메일" }, { status: 409 });
    return NextResponse.json({ error: "회원가입 실패: " + e.message }, { status: 500 });
  }
}
