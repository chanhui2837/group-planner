"use client";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface UserInfo {
  id: string;
  realName: string;
  username: string;
  email: string;
  avatar: string;
  groupId: string | null; // 현재 활성 그룹
  groupIds: string[]; // 가입한 모든 그룹 (최대 3개)
  location?: any;
  locationSharing?: boolean;
}
export interface GroupInfo {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  owner: string;
  members: { id: string; realName: string; username: string; avatar: string }[];
  color: string;
  memberCount: number;
}

interface Store {
  user: UserInfo | null;
  group: GroupInfo | null; // 현재 활성 그룹
  groups: GroupInfo[]; // 가입한 모든 그룹 (최대 3개)
  loading: boolean;
  refresh: () => Promise<void>;
  switchGroup: (id: string) => Promise<void>;
  setUser: (u: UserInfo | null) => void;
  setGroup: (g: GroupInfo | null) => void;
}

const Ctx = createContext<Store>(null as any);

export const MAX_GROUPS = 3;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      setUser(data.user || null);
      setGroup(data.group || null);
      setGroups(data.groups || (data.group ? [data.group] : []));
    } catch {
      setUser(null);
      setGroup(null);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const switchGroup = async (id: string) => {
    if (group?.id === id) return;
    const res = await fetch("/api/groups/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: id }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "그룹 전환 실패");
    }
    await refresh();
  };

  useEffect(() => {
    refresh();
  }, []);

  return <Ctx.Provider value={{ user, group, groups, loading, refresh, switchGroup, setUser, setGroup }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
