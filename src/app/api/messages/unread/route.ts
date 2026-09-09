import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import { verifyToken } from "@/lib/auth";
import { getGroupIds, loadUserWithGroups } from "@/lib/groups";

// 안 읽은 개수: { groups: {groupId: n}, dmTotal: n, dmBy: {userId: n} }
// - 그룹: 일반 메시지 중 남이 쓰고 내가 안 읽은 글
// - DM: 내가 수신자이고 안 읽은 1:1 메시지 (발신자별 집계)
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

    const user = await loadUserWithGroups(payload.userId);
    if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });
    const ids = getGroupIds(user);
    const me = payload.userId;
    const meObj = new mongoose.Types.ObjectId(me);

    const groups: Record<string, number> = {};
    for (const gid of ids) {
      groups[gid] = await Message.countDocuments({
        groupId: gid,
        isDirect: { $ne: true },
        sender: { $ne: meObj },
        readBy: { $ne: meObj },
      });
    }

    const dmAgg = (await Message.aggregate([
      { $match: { isDirect: true, receiver: meObj, readBy: { $ne: meObj } } },
      { $group: { _id: "$sender", n: { $sum: 1 } } },
    ]).catch(() => [])) as any[];
    const dmBy: Record<string, number> = {};
    let dmTotal = 0;
    for (const row of dmAgg) {
      const sid = String(row._id);
      dmBy[sid] = row.n;
      dmTotal += row.n;
    }

    return NextResponse.json({ groups, dmTotal, dmBy });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
