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
    const result = await sendVerificationEmail(email, code);
    console.log(`📧 [VERIFY] 코드 발송: ${email} -> ${code} mocked=${(result as any).mocked}`);
    // SMTP 미설정 시 개발 편의를 위해 code를 응답에 포함 (프로덕션에서는 mocked일 때만)
    const isMocked = (result as any).mocked;
    return NextResponse.json({
      ok: true,
      mocked: isMocked,
      // 프로덕션에서는 코드 노출 안 함, 개발/모킹 시에만
      ...(isMocked ? { hint: `개발 모드: 코드=${code} (서버 로그에도 표시)`, code } : {}),
      message: isMocked ? "SMTP 미설정 — 서버 로그/응답의 코드를 사용하세요" : "인증 코드가 이메일로 발송됐어요 (5분 유효)",
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "발송 실패" }, { status: 500 });
  }
}
