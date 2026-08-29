import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const user = await User.findById(payload.userId);
    if (!user?.groupId) return NextResponse.json({ members: [] });

    const members = await User.find({ groupId: user.groupId }).select("realName username avatar location").lean();
    return NextResponse.json({
      members: members.map((m: any) => ({
        id: String(m._id),
        realName: m.realName,
        username: m.username,
        avatar: m.avatar,
        location: m.location && m.location.lat ? m.location : null,
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

    const { lat, lng, address } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") return NextResponse.json({ error: "lat lng 필요" }, { status: 400 });

    await User.findByIdAndUpdate(payload.userId, {
      location: { lat, lng, address: address || "", updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
