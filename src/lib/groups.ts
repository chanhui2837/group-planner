import mongoose from "mongoose";
import User from "@/models/User";
import Group from "@/models/Group";

// 한 유저가 동시에 속할 수 있는 최대 그룹 수
export const MAX_GROUPS_PER_USER = 3;

// 유저 문서에서 가입 그룹 id 목록 (groupIds + 하위호환 groupId 합집합)
export function getGroupIds(user: any): string[] {
  const ids = new Set<string>();
  for (const g of user.groupIds || []) {
    if (g) ids.add(String(g));
  }
  if (user.groupId) ids.add(String(user.groupId));
  return [...ids];
}

// groupIds 비어있는 기존 유저를 groupId 기준으로 마이그레이션 + 활성그룹 보정.
// 저장 필요 시 true 반환 (호출자가 save).
export function syncUserGroups(user: any): boolean {
  let dirty = false;
  if (!Array.isArray(user.groupIds)) {
    user.groupIds = [];
    dirty = true;
  }
  if (user.groupId && !user.groupIds.some((g: any) => String(g) === String(user.groupId))) {
    user.groupIds.push(user.groupId);
    dirty = true;
  }
  user.groupIds = user.groupIds.filter(Boolean).slice(0, MAX_GROUPS_PER_USER);
  if (!user.groupId && user.groupIds.length > 0) {
    user.groupId = user.groupIds[0];
    dirty = true;
  }
  if (user.groupId && !user.groupIds.some((g: any) => String(g) === String(user.groupId))) {
    user.groupId = user.groupIds.length > 0 ? user.groupIds[0] : null;
    dirty = true;
  }
  return dirty;
}

export async function loadUserWithGroups(userId: string) {
  const user = await User.findById(userId);
  if (!user) return null;
  if (syncUserGroups(user)) await user.save();
  return user;
}

// target 그룹의 실제 멤버인지 (Group.members 기준 — 단일 진실 공급원)
export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(groupId)) return false;
  const count = await Group.countDocuments({ _id: groupId, members: userId as any });
  return count > 0;
}

// 가입 그룹들을 populate 형태로 반환 (활성 그룹 id 포함)
export async function getUserGroupsWithActive(user: any) {
  const ids = getGroupIds(user);
  // 유령 id(삭제된 그룹) 정리
  const existing = ids.length > 0 ? await Group.find({ _id: { $in: ids } }).select("_id").lean() : [];
  const existingIds = new Set(existing.map((g: any) => String(g._id)));
  const validIds = ids.filter((id) => existingIds.has(id));
  if (validIds.length !== ids.length) {
    user.groupIds = validIds.map((id) => new mongoose.Types.ObjectId(id));
    if (user.groupId && !existingIds.has(String(user.groupId))) {
      user.groupId = validIds.length > 0 ? user.groupIds[0] : null;
    }
    await user.save();
  }
  const groups =
    validIds.length > 0
      ? await Group.find({ _id: { $in: validIds } })
          .populate("members", "realName username avatar")
          .lean()
      : [];
  const order = new Map(validIds.map((id, i) => [id, i]));
  groups.sort((a: any, b: any) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
  return { groups, activeId: user.groupId ? String(user.groupId) : null };
}

export function formatGroup(g: any) {
  const members = (g.members || []) as any[];
  return {
    id: String(g._id),
    name: g.name,
    description: g.description,
    inviteCode: g.inviteCode,
    owner: String(g.owner),
    members: members.map((m: any) => ({
      id: String(m._id || m),
      realName: m.realName,
      username: m.username,
      avatar: m.avatar,
    })),
    color: g.color,
    memberCount: members.length,
  };
}
