import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import User from "@/models/User";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const filter: any = {};
    if (q) {
      filter.$or = [{ name: { $regex: q, $options: "i" } }, { inviteCode: q.toUpperCase() }];
    }
    const groups = await Group.find(filter).select("name description inviteCode members color createdAt").limit(30).lean();
    return NextResponse.json({
      groups: groups.map((g: any) => ({
        id: String(g._id),
        name: g.name,
        description: g.description,
        inviteCode: g.inviteCode,
        memberCount: g.members.length,
        color: g.color,
        isFull: g.members.length >= 10,
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

    const user = await User.findById(payload.userId);
    if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });
    if (user.groupId) return NextResponse.json({ error: "이미 그룹에 속해있습니다. 먼저 탈퇴해주세요." }, { status: 400 });

    const { name, description } = await req.json();
    if (!name || name.trim().length < 2) return NextResponse.json({ error: "그룹 이름은 2글자 이상" }, { status: 400 });

    const group = await Group.create({
      name: name.trim(),
      description: description || "",
      owner: user._id,
      members: [user._id],
    });

    user.groupId = group._id as any;
    await user.save();
    console.log(`✅ [DB] 그룹 실시간 저장: "${group.name}" invite=${group.inviteCode} owner=${payload.username} members=${group.members.length}/10`);

    return NextResponse.json({
      ok: true,
      group: { id: String(group._id), name: group.name, inviteCode: group.inviteCode, color: group.color },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("id");
    if (!groupId) return NextResponse.json({ error: "그룹 ID 필요" }, { status: 400 });

    const group = await Group.findById(groupId);
    if (!group) return NextResponse.json({ error: "그룹 없음" }, { status: 404 });
    if (String(group.owner) !== payload.userId) return NextResponse.json({ error: "그룹장만 삭제 가능" }, { status: 403 });

    // remove groupId from members
    await User.updateMany({ groupId: group._id }, { $set: { groupId: null } });
    // optionally delete messages - keep for history? delete
    const Message = (await import("@/models/Message")).default;
    await Message.deleteMany({ groupId: group._id });

    await group.deleteOne();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
