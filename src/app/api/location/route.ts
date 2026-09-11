import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { verifyToken } from "@/lib/auth";
import { getGroupIds, isGroupMember, loadUserWithGroups } from "@/lib/groups";
import { emitToGroup } from "@/lib/realtime";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const user = await loadUserWithGroups(payload.userId);
    if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });
    const target = searchParams.get("groupId") || (user.groupId ? String(user.groupId) : null);
    if (!target) return NextResponse.json({ members: [] });
    const ok = await isGroupMember(payload.userId, target);
    if (!ok) return NextResponse.json({ error: "속하지 않은 그룹입니다." }, { status: 403 });

    // groupIds(신규) + groupId(구형) 양쪽에 속한 멤버 조회
    const members = await User.find({ $or: [{ groupIds: target as any }, { groupId: target as any }] }).select("realName username avatar location locationSharing").lean();
    return NextResponse.json({
      members: members.map((m: any) => ({
        id: String(m._id),
        realName: m.realName,
        username: m.username,
        avatar: m.avatar,
        location: m.location && m.location.lat ? m.location : null,
        sharing: !!m.locationSharing,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const { lat, lng, address, sharing } = await req.json();
    // 공유 중단 요청 (좌표 없이 sharing:false만 올 수 있음)
    if (sharing === false && (typeof lat !== "number" || typeof lng !== "number")) {
      await User.findByIdAndUpdate(payload.userId, { locationSharing: false });
      return NextResponse.json({ ok: true, sharing: false });
    }
    if (typeof lat !== "number" || typeof lng !== "number") return NextResponse.json({ error: "lat lng 필요" }, { status: 400 });

    await User.findByIdAndUpdate(payload.userId, {
      location: { lat, lng, address: address || "", updatedAt: new Date() },
      locationSharing: sharing === false ? false : true,
    });
    // 속한 모든 그룹 방에 위치 갱신 알림 (지도 실시간 반영)
    try {
      const me = await loadUserWithGroups(payload.userId);
      if (me) {
        for (const gid of getGroupIds(me)) {
          emitToGroup(gid, "location:update", { userId: payload.userId });
        }
      }
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
