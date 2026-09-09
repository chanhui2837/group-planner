// Family Planner 커스텀 서버: Next.js + Socket.IO 실시간 채널
// - `npm run dev`   → node server.js (개발 + 소켓)
// - `npm start`     → node server.js --prod (Render 프로덕션 + 소켓)
// API 라우트와 같은 Node 프로세스에서 동작하므로, 라우트는
// global.__socketIO() 로 io 인스턴스를 가져와 방에 emit 한다 (src/lib/realtime.ts).
// 소켓이 없어도 폴링 폴백이 있으므로 안전하게 no-op 처리된다.

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const prod = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const dev = !prod;
const port = parseInt(process.env.PORT || "3000", 10);
// Render는 HOSTNAME 환경변수에 컨테이너 호스트명을 주입하므로,
// 그걸 쓰면 프록시 연결이 안 됨(502). 항상 0.0.0.0에 바인딩.
const hostname = "0.0.0.0";

const JWT_SECRET = process.env.JWT_SECRET || "family-planner-secret-key-change-me-32chars!";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/family-planner";

const app = next({ dev });
const handle = app.getRequestHandler();

// ---- DB (멤버십 확인용 최소 모델) ----
let dbPromise = null;
function ensureDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!dbPromise) {
    dbPromise = mongoose.connect(MONGODB_URI, { bufferCommands: false }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}
const GroupMini =
  mongoose.models.GroupMini ||
  mongoose.model(
    "GroupMini",
    new mongoose.Schema({ members: [mongoose.Schema.Types.ObjectId] }),
    "groups"
  );

function getUserId(socket) {
  const cookie = (socket.handshake.headers && socket.handshake.headers.cookie) || "";
  const m = cookie.match(/token=([^;]+)/);
  if (!m) return null;
  try {
    const payload = jwt.verify(decodeURIComponent(m[1]), JWT_SECRET);
    return payload && payload.userId ? String(payload.userId) : null;
  } catch {
    return null;
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // /socket.io/* 는 engine.io 리스너가 처리하도록 넘김 (Next로 보내면 안 됨)
    if (req.url === "/socket.io" || (req.url && req.url.startsWith("/socket.io?")) || (req.url && req.url.startsWith("/socket.io/"))) return;
    handle(req, res, parse(req.url, true));
  });

  const io = new Server(httpServer, {
    // 기본값: polling + websocket, same-origin 이므로 CORS 불필요
  });
  global.__socketIO = () => io;

  io.use((socket, nextFn) => {
    const userId = getUserId(socket);
    if (!userId) return nextFn(new Error("unauthorized"));
    socket.data.userId = userId;
    nextFn();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);

    // 활성 그룹 방 입장 (멤버만 허용)
    socket.on("join-group", async (groupId, ack) => {
      try {
        if (typeof groupId !== "string" || !groupId) {
          if (ack) ack({ ok: false });
          return;
        }
        await ensureDB();
        const g = await GroupMini.findOne({ _id: groupId, members: userId }).select("_id").lean();
        if (!g) {
          if (ack) ack({ ok: false, error: "not-member" });
          return;
        }
        socket.join(`group:${groupId}`);
        if (ack) ack({ ok: true });
      } catch (e) {
        if (ack) ack({ ok: false });
      }
    });

    socket.on("leave-group", (groupId) => {
      if (typeof groupId === "string" && groupId) socket.leave(`group:${groupId}`);
    });
  });

  httpServer.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port} (${dev ? "dev" : "prod"}) + Socket.IO`);
  });
});
