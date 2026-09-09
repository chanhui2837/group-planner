import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getUserGroupsWithActive, formatGroup, loadUserWithGroups } from "@/lib/groups";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ user: null }, { status: 200 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ user: null }, { status: 200 });

    const user = await loadUserWithGroups(payload.userId);
    if (!user) return NextResponse.json({ user: null }, { status: 200 });

    const { groups, activeId } = await getUserGroupsWithActive(user);
    const formatted = groups.map(formatGroup);
    const active = formatted.find((g) => g.id === activeId) || null;

    return NextResponse.json({
      user: {
        id: String(user._id),
        realName: user.realName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        groupId: active ? active.id : null,
        groupIds: formatted.map((g) => g.id),
        location: user.location || null,
      },
      group: active,
      groups: formatted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
