import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Group from "@/models/Group";
import User from "@/models/User";
import { verifyToken } from "@/lib/auth";
import { MAX_GROUPS_PER_USER, getGroupIds, loadUserWithGroups } from "@/lib/groups";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const mine = searchParams.get("mine") === "1";
    // 내 그룹만 보기 (그룹 목록 UI용)
    if (mine) {
      const token = req.cookies.get("token")?.value;
      if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
      const payload = await verifyToken(token);
      if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
      const user = await loadUserWithGroups(payload.userId);
      if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });
      const ids = getGroupIds(user);
      const groups = ids.length > 0 ? await Group.find({ _id: { $in: ids } }).select("name description inviteCode members color").lean() : [];
      return NextResponse.json({
        groups: groups.map((g: any) => ({
          id: String(g._id),
          name: g.name,
          description: g.description,
          inviteCode: g.inviteCode,
          memberCount: g.members.length,
          color: g.color,
          isFull: g.members.length >= 10,
          isMember: true,
        })),
      });
    }
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

    const user = await loadUserWithGroups(payload.userId);
    if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });
    if (getGroupIds(user).length >= MAX_GROUPS_PER_USER)
      return NextResponse.json({ error: `그룹은 최대 ${MAX_GROUPS_PER_USER}개까지 들어갈 수 있어요. 먼저 다른 그룹에서 나가주세요.` }, { status: 400 });

    const { name, description } = await req.json();
    if (!name || name.trim().length < 2) return NextResponse.json({ error: "그룹 이름은 2글자 이상" }, { status: 400 });

    const group = await Group.create({
      name: name.trim(),
      description: description || "",
      owner: user._id,
      members: [user._id],
    });

    user.groupIds = [...getGroupIds(user).map((id) => id as any), group._id as any];
    user.groupId = group._id as any; // 새로 만든 그룹으로 자동 전환
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

    // 모든 멤버의 groupIds/groupId에서 제거 (멀티그룹 대응)
    await User.updateMany({ groupIds: group._id }, { $pull: { groupIds: group._id } });
    await User.updateMany({ groupId: group._id }, { $set: { groupId: null } });
    // 활성 그룹이 사라진 유저는 남은 첫 그룹으로 전환
    const orphaned = await User.find({ groupId: null, groupIds: { $ne: [] } }).select("_id groupIds");
    for (const u of orphaned as any[]) {
      u.groupId = u.groupIds[0] || null;
      await u.save();
    }
    // optionally delete messages - keep for history? delete
    const Message = (await import("@/models/Message")).default;
    await Message.deleteMany({ groupId: group._id });

    await group.deleteOne();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
