// Socket.IO 클라이언트 싱글톤 (same-origin, 기본 /socket.io 경로).
// httpOnly 쿠키는 브라우저가 핸드셰이크에 자동 포함 → 서버가 JWT 검증.
"use client";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: false, reconnection: true, reconnectionDelayMax: 5000 });
  }
  return socket;
}

export function disconnectSocket() {
  try {
    socket?.disconnect();
  } catch {}
  socket = null;
}
