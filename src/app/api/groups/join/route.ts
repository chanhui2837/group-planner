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

    const { inviteCode, groupId } = await req.json();
    const user = await User.findById(payload.userId);
    if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });
    if (user.groupId) return NextResponse.json({ error: "이미 그룹에 속해있습니다." }, { status: 400 });

    let group = null;
    if (groupId) group = await Group.findById(groupId);
    else if (inviteCode) {
      const raw = inviteCode.trim();
      // 초대코드 6자리 우선, 없으면 그룹 이름으로 exact 검색 (보기 전용 목록에서 이름 쳐서 입장)
      group = await Group.findOne({ inviteCode: raw.toUpperCase() });
      if (!group) group = await Group.findOne({ name: raw });
      if (!group) group = await Group.findOne({ name: { $regex: `^${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
    } else return NextResponse.json({ error: "초대코드 또는 그룹 이름 필요" }, { status: 400 });

    if (!group) return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });
    if (group.members.length >= 10) return NextResponse.json({ error: "그룹이 가득 찼습니다 (최대 10명)" }, { status: 400 });
    if (group.members.some((m) => String(m) === String(user._id))) return NextResponse.json({ error: "이미 멤버입니다." }, { status: 400 });

    group.members.push(user._id as any);
    await group.save();
    user.groupId = group._id as any;
    await user.save();

    // system message
    const Message = (await import("@/models/Message")).default;
    await Message.create({
      groupId: group._id,
      sender: user._id,
      type: "system",
      content: `${user.realName}님이 그룹에 입장하셨습니다.`,
    });

    return NextResponse.json({ ok: true, group: { id: String(group._id), name: group.name, inviteCode: group.inviteCode } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
