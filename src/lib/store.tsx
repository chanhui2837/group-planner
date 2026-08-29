"use client";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface UserInfo {
  id: string;
  realName: string;
  username: string;
  email: string;
  avatar: string;
  groupId: string | null;
  location?: any;
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
  group: GroupInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: UserInfo | null) => void;
  setGroup: (g: GroupInfo | null) => void;
}

const Ctx = createContext<Store>(null as any);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      setUser(data.user || null);
      setGroup(data.group || null);
    } catch {
      setUser(null);
      setGroup(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return <Ctx.Provider value={{ user, group, loading, refresh, setUser, setGroup }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
