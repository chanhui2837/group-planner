"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { useStore } from "@/lib/store";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ realName: "", username: "", password: "", email: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refresh } = useStore();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body = mode === "login" ? { username: form.username, password: form.password } : form;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "오류 발생");
      await refresh();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#FFF8F0]">
      {/* left - branding */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-[#FF6B6B] via-[#FF8E53] to-[#FFE66D] p-10 flex-col justify-between">
        <div>
          <div className="bg-white rounded-2xl px-4 py-3 inline-flex shadow-lg">
            <Logo size={36} />
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-[42px] font-black leading-[0.9] text-white drop-shadow-sm">
            가족이
            <br />
            함께라서
            <br />
            <span className="text-[#2D3436] bg-white px-3 rounded-xl">더 따뜻해</span>
          </h1>
          <p className="mt-4 text-white/90 font-medium leading-relaxed max-w-[420px]">
            그룹 채팅으로 일정을 공유하고, 투표로 결정하고,
            <br />
            지도에서 서로의 위치를 확인하세요.
            <br />
            최대 10명의 가족이 한 그룹에서 함께해요.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3 max-w-[420px]">
            {[
              { icon: "💬", title: "그룹/개인 채팅", desc: "실시간 대화" },
              { icon: "📅", title: "일정 & 투표", desc: "큼직한 알림" },
              { icon: "🗺️", title: "위치 공유", desc: "지도에서 확인" },
            ].map((c) => (
              <div key={c.title} className="bg-white/95 rounded-2xl p-3 text-center shadow">
                <div className="text-xl">{c.icon}</div>
                <div className="text-xs font-black mt-1">{c.title}</div>
                <div className="text-[11px] text-[#636E72]">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-white/80 text-xs font-bold">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          실시간 MongoDB 동기화 • 최대 10명 그룹 • 프로필 사진 변경
        </div>

        {/* deco */}
        <div className="absolute -right-20 -bottom-20 w-[380px] h-[380px] bg-white/15 rounded-full blur-3xl" />
        <div className="absolute -left-10 top-1/3 w-[240px] h-[240px] bg-[#FFE66D]/30 rounded-full blur-3xl" />
      </div>

      {/* right - form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-6">
            <Logo size={44} />
          </div>

          <div className="bg-white rounded-[28px] shadow-[0_16px_40px_rgba(255,107,107,0.12)] border border-[#FFE0CC] p-7">
            <div className="flex gap-2 p-1 bg-[#FFF0E6] rounded-2xl w-fit">
              <button
                onClick={() => setMode("login")}
                className={`px-6 py-2 rounded-xl text-sm font-black transition ${mode === "login" ? "bg-[#FF6B6B] text-white shadow" : "text-[#636E72]"}`}
              >
                로그인
              </button>
              <button
                onClick={() => setMode("signup")}
                className={`px-6 py-2 rounded-xl text-sm font-black transition ${mode === "signup" ? "bg-[#FF6B6B] text-white shadow" : "text-[#636E72]"}`}
              >
                회원가입
              </button>
            </div>

            <h2 className="mt-6 text-[22px] font-black text-[#2D3436] leading-tight">
              {mode === "login" ? "다시 만나서 반가워요! 👋" : "가족을 초대해볼까요? 🏡"}
            </h2>
            <p className="text-sm text-[#636E72] mt-1">{mode === "login" ? "아이디와 비밀번호로 로그인하세요." : "실명, 아이디, 비밀번호, 이메일이 필요해요."}</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="text-xs font-bold text-[#636E72]">실명</label>
                  <input
                    value={form.realName}
                    onChange={(e) => setForm({ ...form, realName: e.target.value })}
                    placeholder="홍길동"
                    required
                    className="mt-1 w-full px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/20 focus:border-[#FF6B6B] text-sm"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-[#636E72]">아이디</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="family123"
                  required
                  className="mt-1 w-full px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/20 focus:border-[#FF6B6B] text-sm"
                />
              </div>
              {mode === "signup" && (
                <div>
                  <label className="text-xs font-bold text-[#636E72]">이메일</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    required
                    className="mt-1 w-full px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/20 focus:border-[#FF6B6B] text-sm"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-[#636E72]">비밀번호</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  className="mt-1 w-full px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/20 focus:border-[#FF6B6B] text-sm"
                />
              </div>

              {error && <div className="px-4 py-3 rounded-2xl bg-[#FFE3E3] text-[#E84118] text-sm font-bold">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53] text-white font-black shadow-[0_8px_20px_rgba(255,107,107,0.35)] hover:shadow-[0_12px_28px_rgba(255,107,107,0.45)] transition disabled:opacity-60"
              >
                {loading ? "처리 중..." : mode === "login" ? "로그인하기 →" : "계정 만들고 시작하기 ✨"}
              </button>

              <div className="text-center text-xs text-[#B2BEC3]">
                MongoDB에 모든 정보가 실시간으로 저장돼요. <span className="text-[#FF6B6B] font-bold">안전하게 암호화</span> 됩니다.
              </div>
            </form>
          </div>

          <div className="mt-4 text-center text-xs text-[#636E72]">
            테스트용 MongoDB 없이도 바로 체험할 수 있어요 — 로컬 모드로 동작합니다.
          </div>
        </div>
      </div>
    </div>
  );
}
