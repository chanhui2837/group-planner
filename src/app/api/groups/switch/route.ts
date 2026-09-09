import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { isGroupMember, loadUserWithGroups } from "@/lib/groups";

// 활성 그룹 전환 (최대 3개 중 현재 보고 활동할 그룹 선택)
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const { groupId } = await req.json();
    if (!groupId) return NextResponse.json({ error: "그룹 ID 필요" }, { status: 400 });

    const user = await loadUserWithGroups(payload.userId);
    if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });

    const ok = await isGroupMember(payload.userId, groupId);
    if (!ok) return NextResponse.json({ error: "속하지 않은 그룹입니다." }, { status: 403 });

    user.groupId = groupId as any;
    await user.save();
    return NextResponse.json({ ok: true, groupId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
