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
    // 10MB까지 허용 (프론트에서 자동 압축 후 전송)
    if (avatar.length > 14_000_000) return NextResponse.json({ error: "이미지가 너무 큽니다. 10MB 이하로 업로드하세요 (자동 압축 후에도 크면 더 작은 사진으로 시도)." }, { status: 400 });

    await User.findByIdAndUpdate(payload.userId, { avatar });
    console.log(`✅ [DB] 프로필 사진 실시간 저장: user=${payload.username} size=${(avatar.length / 1024).toFixed(1)}KB`);
    return NextResponse.json({ ok: true, avatar });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
