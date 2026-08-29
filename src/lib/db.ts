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
    cached!.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false }).then((m) => m);
  }
  try {
    cached!.conn = await cached!.promise;
  } catch (e) {
    cached!.promise = null;
    throw e;
  }
  return cached!.conn;
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
