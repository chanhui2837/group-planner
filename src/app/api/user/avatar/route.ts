import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const { avatar } = await req.json(); // base64 data url
    if (!avatar || typeof avatar !== "string") return NextResponse.json({ error: "이미지 없음" }, { status: 400 });
    // limit 2MB base64 ~ 2.8M chars
    if (avatar.length > 3_000_000) return NextResponse.json({ error: "이미지가 너무 큽니다. 2MB 이하로 업로드하세요." }, { status: 400 });

    await User.findByIdAndUpdate(payload.userId, { avatar });
    return NextResponse.json({ ok: true, avatar });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
