import { NextRequest, NextResponse } from "next/server";
import { generateCode, setCode } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "올바른 이메일 주소를 입력하세요" }, { status: 400 });
    }
    const code = generateCode();
    try {
      setCode(email, code);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    const result: any = await sendVerificationEmail(email, code);
    console.log(`📧 [VERIFY] 코드 발송: ${email} -> ${code} mocked=${result.mocked} error=${result.error || "없음"}`);
    const isMocked = result.mocked;
    const baseMsg = isMocked
      ? result.error
        ? `Gmail 발송 실패 — 화면 코드로 진행하세요 (오류: ${result.error})`
        : "SMTP 미설정 — 화면 코드로 진행하세요"
      : "인증 코드가 이메일로 발송됐어요 (5분 유효)";
    return NextResponse.json({
      ok: true,
      mocked: isMocked,
      ...(isMocked ? { hint: baseMsg, code, error: result.error } : {}),
      message: baseMsg,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "발송 실패" }, { status: 500 });
  }
}
