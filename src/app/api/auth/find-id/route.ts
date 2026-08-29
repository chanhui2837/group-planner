import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { isVerified, verifyCode, generateCode, setCode } from "@/lib/verification";
import { sendAccountInfoEmail, sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email, mode, code, username } = await req.json();
    // mode: "find-id" | "request-reset" | "reset-password"
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "올바른 이메일" }, { status: 400 });
    }
    const normalized = email.toLowerCase().trim();

    if (mode === "find-id") {
      const users = await User.find({ email: normalized }).select("username realName").lean();
      if (users.length === 0) return NextResponse.json({ error: "해당 이메일로 가입된 계정이 없어요" }, { status: 404 });
      const usernames = users.map((u: any) => u.username);
      const result: any = await sendAccountInfoEmail(email, usernames);
      console.log(`🔍 [FIND-ID] ${email} -> ${usernames.join(", ")}`);
      return NextResponse.json({
        ok: true,
        count: usernames.length,
        usernames,
        mocked: result.mocked,
        message: result.mocked ? `개발 모드: ${usernames.join(", ")}` : "아이디 목록을 이메일로 발송했어요",
      });
    }

    if (mode === "request-reset") {
      if (!username) return NextResponse.json({ error: "아이디를 입력하세요" }, { status: 400 });
      const user = await User.findOne({ email: normalized, username: username.trim() });
      if (!user) return NextResponse.json({ error: "해당 이메일/아이디 조합이 없어요" }, { status: 404 });
      const resetCode = generateCode();
      try {
        setCode(`reset:${normalized}:${username.trim()}`, resetCode);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 429 });
      }
      const result: any = await sendPasswordResetEmail(email, username, resetCode);
      console.log(`🔑 [RESET-REQ] ${email} / ${username} -> ${resetCode}`);
      return NextResponse.json({
        ok: true,
        mocked: result.mocked,
        ...(result.mocked ? { hint: `개발 모드 코드=${resetCode}`, code: resetCode } : {}),
        message: result.mocked ? "개발 모드: 코드가 응답에 포함됨" : "비밀번호 재설정 코드가 이메일로 발송됐어요",
      });
    }

    if (mode === "reset-password") {
      const { newPassword } = await req.json().catch(() => ({}));
      // Actually need to read again - we already have body
      // To avoid double parse, use already extracted
      // We'll re-read from req body above: need newPassword from original json
      // So handle differently: if mode is reset-password, expect code, username, newPassword
      return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
    }

    return NextResponse.json({ error: "mode 필요" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// 별도 엔드포인트로 reset-password를 처리 (POST with code)
export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const { email, username, code, newPassword } = await req.json();
    if (!email || !username || !code || !newPassword) return NextResponse.json({ error: "모든 필드 필요" }, { status: 400 });
    if (newPassword.length < 4) return NextResponse.json({ error: "비밀번호 4자 이상" }, { status: 400 });
    const normalized = email.toLowerCase().trim();
    const key = `reset:${normalized}:${username.trim()}`;
    const result = verifyCode(key, code);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const user = await User.findOne({ email: normalized, username: username.trim() });
    if (!user) return NextResponse.json({ error: "계정 없음" }, { status: 404 });
    const bcrypt = await import("bcryptjs");
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    console.log(`✅ [RESET] 비밀번호 재설정 완료: ${username} (${email})`);
    return NextResponse.json({ ok: true, message: "비밀번호가 변경됐어요. 새 비밀번호로 로그인하세요" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
