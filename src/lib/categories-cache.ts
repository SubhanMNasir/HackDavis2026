// 60s in-memory cache of the active categories list.
//
// Wired in Phase 3 by `POST /api/recognize` to build Gemini's dynamic
// `responseSchema` enum. Phase 1 just stands the module up so callers can
// import it without a placeholder shim.
//
// Mutators (POST/PATCH/DELETE /api/categories) MUST call
// `invalidateCategoriesCache()` so the next /api/recognize call picks up
// the new shape.

import { connectMongo } from "./db/mongoose";
import { Category } from "./db/models/category";

export interface CachedCategory {
  id: string; // ObjectId hex
  name: string;
  programId: string;
  programName: string;
  defaultUnit: "count" | "lbs";
}

interface CacheEntry {
  data: CachedCategory[];
  expiresAt: number; // ms epoch
}

const TTL_MS = 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __categoriesCache: CacheEntry | null | undefined;
}

if (globalThis.__categoriesCache === undefined) {
  globalThis.__categoriesCache = null;
}

/**
 * Returns the cached active-categories list, refreshing from Mongo when
 * the entry is missing or expired. The DB read filters `active: true` and
 * sorts by name ASC for stable Gemini schema output.
 */
export async function getCachedCategories(): Promise<CachedCategory[]> {
  const now = Date.now();
  const cached = globalThis.__categoriesCache;
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  await connectMongo();
  const docs = await Category.find({ active: true })
    .sort({ name: 1 })
    .select({ name: 1, programId: 1, programName: 1, defaultUnit: 1 })
    .lean();

  const data: CachedCategory[] = docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    programId: String(d.programId),
    programName: d.programName,
    defaultUnit: d.defaultUnit,
  }));

  globalThis.__categoriesCache = { data, expiresAt: now + TTL_MS };
  return data;
}

/**
 * Drop the cache so the next `getCachedCategories()` call hits Mongo.
 * Call this from every successful POST/PATCH/DELETE /api/categories.
 */
export function invalidateCategoriesCache(): void {
  globalThis.__categoriesCache = null;
}
