// API 라우트 → Socket.IO 방으로 이벤트 발송.
// server.js 와 같은 프로세스일 때만 동작하고, 그 외(next start 단독 등)에는
// 조용히 no-op → 클라이언트의 폴링 폴백이 커버한다.

interface Emitter {
  to(room: string): { emit(event: string, data: any): void };
}

function getIO(): Emitter | null {
  try {
    const fn = (global as any).__socketIO;
    if (typeof fn !== "function") return null;
    return fn() || null;
  } catch {
    return null;
  }
}

export function emitToGroup(groupId: string, event: string, data: any) {
  try {
    getIO()?.to(`group:${groupId}`).emit(event, data);
  } catch {}
}

export function emitToUser(userId: string, event: string, data: any) {
  try {
    getIO()?.to(`user:${userId}`).emit(event, data);
  } catch {}
}

// 이벤트명: 'message:new' | 'vote:update' | 'dm:new' | 'location:update'
