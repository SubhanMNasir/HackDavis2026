// Cached Mongoose connection helper for Wellspring.
//
// Standard Next.js + serverless pattern: cache the connection promise on the
// `globalThis` object so Lambda warm-starts (and Next.js dev HMR) reuse the
// same connection instead of opening a new socket per request.
//
// All `/api/**` route handlers MUST `await connectMongo()` before touching
// the database, and MUST also export `runtime = "nodejs"` (Mongoose is not
// edge-compatible).

import mongoose, { type Mongoose } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  // We don't throw here at module import time — that would break local
  // development for routes that never touch the DB (e.g. /api/health).
  // We DO throw inside `connectMongo()` so the failure shows up at the
  // first DB call instead of silently hanging.
  // eslint-disable-next-line no-console
  console.warn("[mongoose] MONGODB_URI is not set — DB calls will fail.");
}

interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

// Augment globalThis so the cache survives HMR + lambda warm-starts.
declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache =
  globalThis.__mongooseCache ?? { conn: null, promise: null };

if (!globalThis.__mongooseCache) {
  globalThis.__mongooseCache = cache;
}

export async function connectMongo(): Promise<Mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not set");
    }

    // Mongoose 9 strict defaults are fine for our schemas; we set a few
    // extras that matter in serverless.
    cache.promise = mongoose.connect(MONGODB_URI, {
      // Keep buffering off so we surface connection issues fast instead of
      // appearing to hang inside route handlers.
      bufferCommands: false,
      // Reasonable serverless defaults.
      serverSelectionTimeoutMS: 10_000,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    // On failure, clear the promise so the next request can retry.
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}
