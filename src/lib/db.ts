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
      .then(async (m) => {
        console.log(`✅ [DB] MongoDB 연결 성공! host=${(m.connection as any).host} db=${m.connection.name} readyState=${m.connection.readyState}`);
        m.connection.on("error", (err) => console.error("❌ [DB] MongoDB 오류:", err.message));
        m.connection.on("disconnected", () => console.warn("⚠️ [DB] MongoDB 연결 끊김"));
        // 마이그레이션: email unique + 잘못된 id unique 인덱스 제거
        try {
          const db = m.connection.db;
          if (db) {
            const col = db.collection("users");
            const indexes: any[] = await col.indexes();
            for (const idx of indexes) {
              // email unique 제거 (다계정 허용)
              if (idx.key?.email === 1 && idx.unique) {
                console.log(`🔧 [DB] email unique 인덱스 제거 중: ${idx.name}`);
                await col.dropIndex(idx.name);
                console.log("✅ [DB] email unique 인덱스 제거 완료");
              }
              // 잘못된 id unique 제거 (오래된 스키마 잔재: id:null 중복 오류 유발)
              if (idx.key?.id === 1 && idx.unique) {
                console.log(`🔧 [DB] 잘못된 id unique 인덱스 제거 중: ${idx.name} key=${JSON.stringify(idx.key)}`);
                await col.dropIndex(idx.name);
                console.log("✅ [DB] id unique 인덱스 제거 완료 — '중복된 id {\"id\":null}' 버그 해결");
              }
            }
            // 로그: 현재 인덱스 상태
            const after: any[] = await col.indexes();
            console.log(`[DB] 현재 users 인덱스: ${after.map((i) => `${i.name}(${JSON.stringify(i.key)}${i.unique ? ",unique" : ""})`).join(", ")}`);
          }
        } catch (e: any) {
          console.warn("[DB] 인덱스 마이그레이션 스킵:", e.message);
        }
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
