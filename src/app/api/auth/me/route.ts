import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Group from "@/models/Group";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ user: null }, { status: 200 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ user: null }, { status: 200 });

    const user = await User.findById(payload.userId).lean();
    if (!user) return NextResponse.json({ user: null }, { status: 200 });

    let group = null;
    if (user.groupId) {
      group = await Group.findById(user.groupId).populate("members", "realName username avatar").lean();
    }

    // ensure members populated for group
    let groupMembers: any[] = [];
    if (group) {
      groupMembers = (group as any).members || [];
    }

    return NextResponse.json({
      user: {
        id: String(user._id),
        realName: user.realName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        groupId: user.groupId ? String(user.groupId) : null,
        location: user.location || null,
      },
      group: group
        ? {
            id: String((group as any)._id),
            name: (group as any).name,
            description: (group as any).description,
            inviteCode: (group as any).inviteCode,
            owner: String((group as any).owner),
            members: groupMembers.map((m: any) => ({
              id: String(m._id),
              realName: m.realName,
              username: m.username,
              avatar: m.avatar,
            })),
            color: (group as any).color,
            memberCount: groupMembers.length,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
