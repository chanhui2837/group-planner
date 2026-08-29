import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { verifyCode } from "@/lib/verification";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email, username, code, newPassword } = await req.json();
    if (!email || !username || !code || !newPassword) return NextResponse.json({ error: "이메일, 아이디, 코드, 새 비밀번호 모두 필요" }, { status: 400 });
    if (newPassword.length < 4) return NextResponse.json({ error: "비밀번호 4자 이상" }, { status: 400 });
    const normalized = email.toLowerCase().trim();
    const key = `reset:${normalized}:${username.trim()}`;
    const result = verifyCode(key, code);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const user = await User.findOne({ email: normalized, username: username.trim() });
    if (!user) return NextResponse.json({ error: "해당 계정 없음" }, { status: 404 });
    const bcrypt = await import("bcryptjs");
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    console.log(`✅ [RESET] 비밀번호 재설정: ${username} (${email})`);
    return NextResponse.json({ ok: true, message: "비밀번호가 변경됐어요" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
