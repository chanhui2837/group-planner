import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/family-planner";

if (!MONGODB_URI) throw new Error("MONGODB_URI not defined");

interface GlobalMongoose {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseGlobal: GlobalMongoose | undefined;
}

let cached = global.mongooseGlobal;
if (!cached) {
  cached = global.mongooseGlobal = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached!.conn) return cached!.conn;
  if (!cached!.promise) {
    const masked = MONGODB_URI.replace(/:\/\/.*@/, "://***:***@");
    console.log(`[DB] Connecting to MongoDB... ${masked}`);
    cached!.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((m) => {
        console.log(`✅ [DB] MongoDB 연결 성공! host=${(m.connection as any).host} db=${m.connection.name} readyState=${m.connection.readyState}`);
        // 연결 이벤트 로그
        m.connection.on("error", (err) => console.error("❌ [DB] MongoDB 오류:", err.message));
        m.connection.on("disconnected", () => console.warn("⚠️ [DB] MongoDB 연결 끊김"));
        return m;
      });
  }
  try {
    cached!.conn = await cached!.promise;
    if (cached!.conn) {
      // 이미 연결된 경우에도 한번 로그 (중복 방지 위해 최초 1회만)
      if (!(global as any).__dbLogged) {
        console.log(`✅ [DB] MongoDB 연결 확인됨 - 재사용 (readyState=${cached!.conn.connection.readyState})`);
        (global as any).__dbLogged = true;
      }
    }
  } catch (e: any) {
    console.error(`❌ [DB] MongoDB 연결 실패: ${e.message} | URI=${MONGODB_URI.replace(/:\/\/.*@/, "://***:***@")}`);
    cached!.promise = null;
    throw e;
  }
  return cached!.conn;
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
