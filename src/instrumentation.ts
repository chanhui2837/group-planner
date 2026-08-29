export async function register() {
  // Next.js 부팅 시 MongoDB 연결 시도 — Render 로그에 즉시 표시
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { connectDB } = await import("./lib/db");
    try {
      await connectDB();
      console.log("✅ [DB] Instrumentation: MongoDB 초기 연결 성공 — 실시간 저장 준비 완료");
    } catch (e: any) {
      console.error("❌ [DB] Instrumentation: MongoDB 초기 연결 실패 — 첫 요청 시 재시도:", e.message);
    }
  }
}
