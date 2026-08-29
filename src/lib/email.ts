import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

export async function sendVerificationEmail(to: string, code: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@family-planner.local";
  const subject = `[Family Planner] 이메일 인증 코드: ${code}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#FFF8F0;border-radius:24px;border:1px solid #FFE0CC">
      <div style="width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,#FF6B6B,#FF8E53);display:flex;align-items:center;justify-content:center;color:white;font-size:24px">🏡</div>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#2D3436">Family Planner 인증 코드</h2>
      <p style="color:#636E72;font-size:14px">아래 6자리 코드를 5분 안에 입력해주세요.</p>
      <div style="margin:20px 0;padding:16px;background:white;border:2px dashed #FF6B6B;border-radius:16px;text-align:center">
        <div style="font-size:32px;font-weight:900;letter-spacing:0.3em;color:#FF6B6B">${code}</div>
        <div style="font-size:12px;color:#B2BEC3;margin-top:4px">5분 후 만료 • 5회 시도 제한</div>
      </div>
      <p style="font-size:12px;color:#B2BEC3">본인이 요청하지 않았다면 무시하세요. 하나의 이메일로 여러 계정 생성이 가능합니다(인증 후 10분 유효).</p>
    </div>
  `;
  const text = `Family Planner 인증 코드: ${code} (5분 유효)`;

  const tx = getTransporter();
  if (!tx) {
    console.log(`📧 [MOCK EMAIL] to=${to} code=${code} — SMTP 미설정으로 실제 발송 안 함 (콘솔/응답으로 확인)`);
    return { mocked: true, code };
  }
  try {
    await Promise.race([
      tx.sendMail({ from, to, subject, html, text }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP 타임아웃(8초) — Gmail 앱비밀번호/네트워크 확인 필요")), 8000)),
    ]);
    console.log(`📧 [EMAIL] 인증 코드 발송됨 to=${to} code=${code}`);
    return { mocked: false };
  } catch (e: any) {
    console.error(`❌ [EMAIL] Gmail 발송 실패 to=${to} code=${code} error=${e.message}`);
    throw new Error(`이메일 발송 실패: ${e.message} — Gmail 앱비밀번호와 SMTP 설정을 확인하세요`);
  }
}

export async function sendAccountInfoEmail(to: string, usernames: string[]) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@family-planner.local";
  const subject = `[Family Planner] 아이디 찾기 결과`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#FFF8F0;border-radius:24px;border:1px solid #FFE0CC">
      <h2 style="color:#2D3436">아이디 찾기 결과</h2>
      <p style="color:#636E72">이 이메일로 가입된 계정:</p>
      <ul style="background:white;padding:16px;border-radius:16px;border:1px solid #FFE0CC">${usernames.map((u) => `<li style="font-weight:800">${u}</li>`).join("")}</ul>
      <p style="font-size:12px;color:#B2BEC3">비밀번호는 보안을 위해 이메일로 직접 전송되지 않습니다. ‘비밀번호 재설정’을 이용하세요.</p>
    </div>
  `;
  const tx = getTransporter();
  if (!tx) {
    console.log(`📧 [MOCK EMAIL] 아이디 찾기 to=${to} usernames=${usernames.join(",")}`);
    return { mocked: true, usernames };
  }
  try {
    await Promise.race([
      tx.sendMail({ from, to, subject, html }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP 타임아웃")), 8000)),
    ]);
    return { mocked: false };
  } catch (e: any) {
    console.error(`❌ [EMAIL] 아이디 찾기 발송 실패: ${e.message}`);
    throw new Error(`이메일 발송 실패: ${e.message}`);
  }
}

export async function sendPasswordResetEmail(to: string, username: string, resetCode: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@family-planner.local";
  const subject = `[Family Planner] 비밀번호 재설정 코드`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#FFF8F0;border-radius:24px">
      <h2>${username}님 비밀번호 재설정</h2>
      <p>아래 코드를 5분 안에 입력해 새 비밀번호를 설정하세요.</p>
      <div style="font-size:32px;font-weight:900;letter-spacing:0.3em;color:#FF6B6B;text-align:center;padding:16px;background:white;border:2px dashed #FF6B6B;border-radius:16px">${resetCode}</div>
    </div>
  `;
  const tx = getTransporter();
  if (!tx) {
    console.log(`📧 [MOCK EMAIL] 비번 재설정 to=${to} user=${username} code=${resetCode}`);
    return { mocked: true, code: resetCode };
  }
  try {
    await Promise.race([
      tx.sendMail({ from, to, subject, html }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP 타임아웃")), 8000)),
    ]);
    return { mocked: false };
  } catch (e: any) {
    console.error(`❌ [EMAIL] 비번 재설정 발송 실패: ${e.message}`);
    throw new Error(`이메일 발송 실패: ${e.message}`);
  }
}
