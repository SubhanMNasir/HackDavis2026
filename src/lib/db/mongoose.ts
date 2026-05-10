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

// Note: we read MONGODB_URI inside `connectMongo()` (not at module load
// time) so callers that load .env at runtime — e.g. the seed script's
// inline loader, or Next.js's per-request env injection — see the value.

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
    const rawUri = process.env.MONGODB_URI;
    if (!rawUri) {
      throw new Error("MONGODB_URI is not set");
    }

    // Defensive normalization: if the password contains an unescaped '@',
    // the connection string parser will choke ("Protocol and host list are
    // required"). Detect that case (more than one '@' between scheme and
    // host) and percent-encode the password segment. This is a no-op for
    // already-valid URIs.
    const uri = normalizeMongoUri(rawUri);

    // Mongoose 9 strict defaults are fine for our schemas; we set a few
    // extras that matter in serverless.
    cache.promise = mongoose.connect(uri, {
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

/**
 * Percent-encode a literal '@' inside the password segment of a MongoDB
 * connection string. The credentials portion is everything between the
 * scheme `://` and the LAST `@` before the host. If that portion itself
 * contains additional `@` characters, we encode them as `%40` in just the
 * password slot (i.e. after the first `:` inside credentials).
 *
 * Examples:
 *   "mongodb+srv://admin:p@ss@host/db" -> "mongodb+srv://admin:p%40ss@host/db"
 *   "mongodb://user@host/db"           -> "mongodb://user@host/db"   (no password — no-op)
 *   "mongodb+srv://user:pass@host/db"  -> unchanged
 */
function normalizeMongoUri(uri: string): string {
  const schemeIdx = uri.indexOf("://");
  if (schemeIdx === -1) return uri;

  const afterScheme = schemeIdx + 3;
  // The host segment ends at the first '/' or '?' after credentials.
  const tail = uri.indexOf("/", afterScheme);
  const queryStart = uri.indexOf("?", afterScheme);
  let pathStart = -1;
  if (tail !== -1 && queryStart !== -1) pathStart = Math.min(tail, queryStart);
  else if (tail !== -1) pathStart = tail;
  else if (queryStart !== -1) pathStart = queryStart;

  const authorityEnd = pathStart === -1 ? uri.length : pathStart;
  const authority = uri.slice(afterScheme, authorityEnd);

  // Last '@' in the authority is the credentials/host separator.
  const lastAt = authority.lastIndexOf("@");
  if (lastAt === -1) return uri; // no credentials, nothing to fix

  const credentials = authority.slice(0, lastAt);
  const host = authority.slice(lastAt + 1);

  const colonIdx = credentials.indexOf(":");
  if (colonIdx === -1) return uri; // username only, no password to encode

  const username = credentials.slice(0, colonIdx);
  const password = credentials.slice(colonIdx + 1);

  // If the password has any '@' (or other reserved chars), encode just it.
  // We deliberately DON'T touch the username — that's almost never the source
  // of these issues and re-encoding could double-encode existing escapes.
  if (!password.includes("@")) return uri;

  const encodedPassword = encodeURIComponent(password);
  const newAuthority = `${username}:${encodedPassword}@${host}`;
  return uri.slice(0, afterScheme) + newAuthority + uri.slice(authorityEnd);
}
