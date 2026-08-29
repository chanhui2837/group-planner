"use client";
import { useState, useEffect } from "react";
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

  // email verification
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");
  const [mockedCode, setMockedCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // find/reset modals
  const [showFindId, setShowFindId] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [findEmail, setFindEmail] = useState("");
  const [findResult, setFindResult] = useState<string[] | null>(null);
  const [findLoading, setFindLoading] = useState(false);
  const [resetForm, setResetForm] = useState({ email: "", username: "", code: "", newPassword: "" });
  const [resetStep, setResetStep] = useState<"request" | "verify">("request");
  const [resetMsg, setResetMsg] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    // 이메일 바뀌면 인증 초기화
    setVerified(false);
    setCode("");
    setVerifyMsg("");
    setMockedCode(null);
  }, [form.email]);

  const sendCode = async () => {
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setVerifyMsg("올바른 이메일을 먼저 입력하세요");
      return;
    }
    setSending(true);
    setVerifyMsg("");
    setMockedCode(null);
    try {
      const res = await fetch("/api/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 실패");
      setCountdown(30);
      if (data.mocked && data.code) {
        setMockedCode(data.code);
        setVerifyMsg(`📧 SMTP 미설정 — 실제 메일 대신 화면에 코드가 표시됩니다 (Render 로그에도 기록)`);
      } else {
        setVerifyMsg(data.message || "인증 코드가 이메일로 발송됐어요. 5분 안에 입력하세요");
      }
    } catch (e: any) {
      setVerifyMsg(e.message);
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (!code.trim()) {
      setVerifyMsg("코드를 입력하세요");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email, code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "인증 실패");
      setVerified(true);
      setVerifyMsg("✅ 인증 완료! 10분 안에 회원가입을 완료하세요. 같은 이메일로 여러 계정 생성 가능해요");
    } catch (e: any) {
      setVerifyMsg(e.message);
      setVerified(false);
    } finally {
      setVerifying(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "signup" && !verified) {
      setError("이메일 인증을 먼저 완료해주세요. 이메일 옆 ‘인증코드 전송’ → 코드 입력 → ‘인증’");
      return;
    }
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

  const handleFindId = async () => {
    if (!findEmail.trim()) return alert("이메일을 입력하세요");
    setFindLoading(true);
    setFindResult(null);
    try {
      const res = await fetch("/api/auth/find-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: findEmail, mode: "find-id" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFindResult(data.usernames);
      if (data.mocked) alert(`개발 모드: 이 이메일의 아이디는 ${data.usernames.join(", ")} 입니다.`);
      else alert(`아이디를 이메일로 발송했어요 (${data.count}개)`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setFindLoading(false);
    }
  };

  const handleRequestReset = async () => {
    if (!resetForm.email || !resetForm.username) return setResetMsg("이메일과 아이디를 입력하세요");
    setFindLoading(true);
    setResetMsg("");
    try {
      const res = await fetch("/api/auth/find-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resetForm.email, username: resetForm.username, mode: "request-reset" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetStep("verify");
      if (data.mocked && data.code) setResetMsg(`개발 모드: 코드=${data.code} (5분 유효)`);
      else setResetMsg("재설정 코드가 이메일로 발송됐어요");
    } catch (e: any) {
      setResetMsg(e.message);
    } finally {
      setFindLoading(false);
    }
  };

  const handleResetPw = async () => {
    if (!resetForm.code || !resetForm.newPassword) return setResetMsg("코드와 새 비밀번호를 입력하세요");
    setFindLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resetForm.email, username: resetForm.username, code: resetForm.code, newPassword: resetForm.newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("비밀번호가 변경됐어요. 새 비밀번호로 로그인하세요");
      setShowResetPw(false);
      setResetForm({ email: "", username: "", code: "", newPassword: "" });
      setResetStep("request");
    } catch (e: any) {
      setResetMsg(e.message);
    } finally {
      setFindLoading(false);
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
          실시간 MongoDB 동기화 • 최대 10명 그룹 • 이메일 인증
        </div>

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
            <p className="text-sm text-[#636E72] mt-1">{mode === "login" ? "아이디와 비밀번호로 로그인하세요." : "실명, 아이디, 비밀번호, 이메일 인증이 필요해요."}</p>

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
                  <label className="text-xs font-bold text-[#636E72]">이메일 <span className="text-[#FF6B6B]">* 인증 필수</span></label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="you@example.com"
                      required
                      className="flex-1 px-4 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FFE0CC] focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/20 focus:border-[#FF6B6B] text-sm"
                    />
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={sending || countdown > 0}
                      className="px-4 py-3 rounded-2xl bg-[#2D3436] text-white text-xs font-black disabled:opacity-50 shrink-0"
                    >
                      {countdown > 0 ? `${countdown}s` : sending ? "발송 중..." : "인증코드 전송"}
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="6자리 코드"
                      maxLength={6}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm font-mono tracking-widest"
                    />
                    <button
                      type="button"
                      onClick={verify}
                      disabled={verifying || verified}
                      className={`px-4 py-2.5 rounded-xl text-xs font-black shrink-0 ${verified ? "bg-[#00B894] text-white" : "bg-[#FFE66D] text-[#2D3436]"} disabled:opacity-50`}
                    >
                      {verified ? "✅ 인증됨" : verifying ? "확인 중..." : "인증"}
                    </button>
                  </div>
                  {verifyMsg && <div className={`mt-2 text-xs font-bold px-3 py-2 rounded-xl ${verified ? "bg-[#E0F7F4] text-[#00B894]" : "bg-[#FFF0E6] text-[#636E72]"}`}>{verifyMsg}</div>}
                  {mockedCode && !verified && (
                    <div className="mt-2 p-3 rounded-2xl bg-[#FFF8F0] border-2 border-dashed border-[#FF6B6B] flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-[#636E72]">📧 실제 메일 대신 화면 코드</div>
                        <div className="text-[20px] font-black tracking-[0.3em] text-[#FF6B6B]">{mockedCode}</div>
                        <div className="text-[11px] text-[#B2BEC3]">5분 유효 • 이 코드를 위에 입력 → 인증</div>
                      </div>
                      <button type="button" onClick={() => { setCode(mockedCode); navigator.clipboard.writeText(mockedCode); }} className="px-3 py-2 rounded-xl bg-[#FF6B6B] text-white text-xs font-black">복사</button>
                    </div>
                  )}
                  {verified && <div className="mt-1 text-[11px] text-[#00B894] font-bold">✓ 하나의 이메일로 여러 아이디 생성이 가능해요 (10분 유효)</div>}
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

              {mode === "login" && (
                <div className="flex gap-3 text-xs font-bold">
                  <button type="button" onClick={() => setShowFindId(true)} className="text-[#4ECDC4] underline">아이디 찾기</button>
                  <span className="text-[#FFE0CC]">|</span>
                  <button type="button" onClick={() => setShowResetPw(true)} className="text-[#FF6B6B] underline">비밀번호 재설정</button>
                </div>
              )}

              {error && <div className="px-4 py-3 rounded-2xl bg-[#FFE3E3] text-[#E84118] text-sm font-bold">{error}</div>}

              <button
                type="submit"
                disabled={loading || (mode === "signup" && !verified)}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53] text-white font-black shadow-[0_8px_20px_rgba(255,107,107,0.35)] hover:shadow-[0_12px_28px_rgba(255,107,107,0.45)] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "처리 중..." : mode === "login" ? "로그인하기 →" : verified ? "계정 만들고 시작하기 ✨" : "이메일 인증 후 가입 가능"}
              </button>

              <div className="text-center text-xs text-[#B2BEC3]">
                MongoDB에 모든 정보가 실시간으로 저장돼요. <span className="text-[#FF6B6B] font-bold">안전하게 암호화</span> 됩니다.
              </div>
            </form>
          </div>

          <div className="mt-4 text-center text-xs text-[#636E72]">
            이메일 인증 후 하나의 이메일로 여러 계정을 만들 수 있어요.
          </div>
        </div>
      </div>

      {/* 아이디 찾기 모달 */}
      {showFindId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFindId(false)} />
          <div className="relative bg-white rounded-[24px] w-full max-w-[420px] p-6">
            <h3 className="font-black text-lg">아이디 찾기</h3>
            <p className="text-xs text-[#636E72] mt-1">가입 시 인증한 이메일로 아이디를 찾아요</p>
            <input value={findEmail} onChange={(e) => setFindEmail(e.target.value)} placeholder="you@example.com" className="mt-4 w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
            <button onClick={handleFindId} disabled={findLoading} className="mt-3 w-full py-3 rounded-xl bg-[#4ECDC4] text-white font-black text-sm disabled:opacity-50">
              {findLoading ? "조회 중..." : "아이디 찾기"}
            </button>
            {findResult && (
              <div className="mt-4 p-3 rounded-xl bg-[#E0F7F4] border border-[#4ECDC4]/30">
                <div className="text-xs font-black text-[#00B894]">찾은 아이디 ({findResult.length}개):</div>
                <div className="mt-1 font-mono font-bold text-sm">{findResult.join(", ")}</div>
              </div>
            )}
            <button onClick={() => setShowFindId(false)} className="mt-3 w-full py-2 rounded-xl bg-[#F1F2F6] font-bold text-sm">닫기</button>
          </div>
        </div>
      )}

      {/* 비밀번호 재설정 모달 */}
      {showResetPw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowResetPw(false)} />
          <div className="relative bg-white rounded-[24px] w-full max-w-[420px] p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-lg">비밀번호 재설정</h3>
            <p className="text-xs text-[#636E72] mt-1">이메일 + 아이디로 인증 후 새 비밀번호를 설정해요</p>
            {resetStep === "request" ? (
              <>
                <input value={resetForm.email} onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })} placeholder="이메일" className="mt-4 w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
                <input value={resetForm.username} onChange={(e) => setResetForm({ ...resetForm, username: e.target.value })} placeholder="아이디" className="mt-3 w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
                <button onClick={handleRequestReset} disabled={findLoading} className="mt-3 w-full py-3 rounded-xl bg-[#FF6B6B] text-white font-black text-sm disabled:opacity-50">
                  {findLoading ? "발송 중..." : "인증코드 발송"}
                </button>
              </>
            ) : (
              <>
                <div className="mt-4 text-xs font-bold text-[#636E72]">{resetForm.email} / {resetForm.username} 로 코드 발송됨</div>
                <input value={resetForm.code} onChange={(e) => setResetForm({ ...resetForm, code: e.target.value })} placeholder="6자리 코드" className="mt-3 w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm font-mono tracking-widest" maxLength={6} />
                <input value={resetForm.newPassword} onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })} placeholder="새 비밀번호 (4자 이상)" type="password" className="mt-3 w-full px-4 py-3 rounded-xl bg-[#FFF8F0] border border-[#FFE0CC] text-sm" />
                <button onClick={handleResetPw} disabled={findLoading} className="mt-3 w-full py-3 rounded-xl bg-[#00B894] text-white font-black text-sm disabled:opacity-50">
                  {findLoading ? "변경 중..." : "비밀번호 변경"}
                </button>
                <button onClick={() => setResetStep("request")} className="mt-2 w-full py-2 rounded-xl bg-[#F1F2F6] font-bold text-sm">뒤로</button>
              </>
            )}
            {resetMsg && <div className="mt-3 text-xs font-bold px-3 py-2 rounded-xl bg-[#FFF0E6] text-[#636E72]">{resetMsg}</div>}
            <button onClick={() => setShowResetPw(false)} className="mt-3 w-full py-2 rounded-xl bg-[#F1F2F6] font-bold text-sm">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
