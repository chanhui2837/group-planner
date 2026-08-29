"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Logo from "@/components/Logo";

export default function Home() {
  const { user, loading } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) router.replace("/dashboard");
      else router.replace("/auth");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFF8F0] p-6">
      <div className="animate-bounce">
        <Logo size={72} />
      </div>
      <div className="mt-6 flex items-center gap-2 text-[#FF8A65] font-bold">
        <span className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-ping" />
        불러오는 중...
      </div>
    </div>
  );
}
