import { NextRequest, NextResponse } from "next/server";
import { verifyCode, isVerified } from "@/lib/verification";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) return NextResponse.json({ error: "이메일과 코드를 입력하세요" }, { status: 400 });
    const result = verifyCode(email, code);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    console.log(`✅ [VERIFY] 인증 성공: ${email}`);
    return NextResponse.json({ ok: true, message: "인증 완료! 10분 안에 회원가입을 완료하세요" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") || "";
  if (!email) return NextResponse.json({ error: "email 필요" }, { status: 400 });
  return NextResponse.json({ verified: isVerified(email) });
}
