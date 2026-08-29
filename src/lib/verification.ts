type Entry = {
  code: string;
  expiresAt: number;
  verified: boolean;
  verifiedAt?: number;
  attempts: number;
  lastSent: number;
};

const store = new Map<string, Entry>();
declare global {
  var __verifyStore: Map<string, Entry> | undefined;
}
const map: Map<string, Entry> = global.__verifyStore || (global.__verifyStore = store);

const CODE_TTL = 5 * 60 * 1000; // 5분
const VERIFIED_TTL = 10 * 60 * 1000; // 인증 후 10분 내 가입 허용
const RESEND_INTERVAL = 30 * 1000; // 30초

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function setCode(email: string, code: string) {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const prev = map.get(key);
  if (prev && now - prev.lastSent < RESEND_INTERVAL) {
    const wait = Math.ceil((RESEND_INTERVAL - (now - prev.lastSent)) / 1000);
    throw new Error(`재전송은 ${wait}초 후에 가능해요`);
  }
  map.set(key, { code, expiresAt: now + CODE_TTL, verified: false, attempts: 0, lastSent: now });
}

export function verifyCode(email: string, code: string): { ok: boolean; error?: string } {
  const key = email.toLowerCase().trim();
  const entry = map.get(key);
  if (!entry) return { ok: false, error: "인증 코드를 먼저 발송해주세요" };
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return { ok: false, error: "인증 코드가 만료됐어요. 다시 발송해주세요" };
  }
  if (entry.attempts >= 5) return { ok: false, error: "시도 횟수 초과(5회). 다시 발송해주세요" };
  entry.attempts++;
  if (entry.code !== code.trim()) return { ok: false, error: `인증 코드가 틀렸어요 (${entry.attempts}/5)` };
  entry.verified = true;
  entry.verifiedAt = Date.now();
  entry.expiresAt = Date.now() + VERIFIED_TTL; // 인증 유효 연장
  map.set(key, entry);
  return { ok: true };
}

export function isVerified(email: string): boolean {
  const key = email.toLowerCase().trim();
  const entry = map.get(key);
  if (!entry || !entry.verified) return false;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return false;
  }
  return true;
}

export function consumeVerified(email: string) {
  // keep verified for multiple accounts within TTL - don't delete, allow reuse
  // optionally we could keep it
}

export function clearVerified(email: string) {
  map.delete(email.toLowerCase().trim());
}

// cleanup every 10 min
if (!(global as any).__verifyCleanup) {
  (global as any).__verifyCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of map.entries()) {
      if (now > v.expiresAt) map.delete(k);
    }
  }, 60 * 1000);
}
