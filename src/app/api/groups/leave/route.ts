import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import User from "@/models/User";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const user = await User.findById(payload.userId);
    if (!user || !user.groupId) return NextResponse.json({ error: "속한 그룹이 없습니다." }, { status: 400 });

    const group = await Group.findById(user.groupId);
    if (!group) {
      user.groupId = null;
      await user.save();
      return NextResponse.json({ ok: true });
    }

    // if owner leaves, transfer ownership or delete if last member
    const isOwner = String(group.owner) === String(user._id);
    group.members = group.members.filter((m) => String(m) !== String(user._id));
    if (group.members.length === 0) {
      await group.deleteOne();
      const Message = (await import("@/models/Message")).default;
      await Message.deleteMany({ groupId: group._id });
    } else {
      let newOwnerName: string | null = null;
      if (isOwner) {
        group.owner = group.members[0] as any;
        // 2번째로 들어온 사람이 자동으로 그룹장 (members[0]이 2번째 가입자)
        const newOwner = await User.findById(group.owner).select("realName").lean() as any;
        newOwnerName = newOwner?.realName || null;
      }
      await group.save();
      const Message = (await import("@/models/Message")).default;
      await Message.create({
        groupId: group._id,
        sender: user._id,
        type: "system",
        content: `${user.realName}님이 그룹에서 나가셨습니다.`,
      });
      if (isOwner && newOwnerName) {
        await Message.create({
          groupId: group._id,
          sender: group.owner as any,
          type: "system",
          content: `👑 그룹장이 나가서 ${newOwnerName}님이 자동으로 새 그룹장이 되었습니다.`,
        });
      }
    }

    user.groupId = null;
    await user.save();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
