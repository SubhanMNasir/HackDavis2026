// POST /api/recognize — CONTRACTS §4.5.
//
// Authenticated, READ-ONLY handler: takes a base64 image, calls Gemini with
// a dynamic enum-constrained schema, fuzzy-matches each suggestion against
// the catalog, and returns RecognizedItem[] for the AI Review screen to
// edit-then-confirm. No DB writes, no audit events — confirmation lives in
// the follow-up `POST /api/donations`.

import { NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/db/mongoose";
import { CatalogItem } from "@/lib/db/models/catalogItem";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getCachedCategories } from "@/lib/categories-cache";
import { recognizeItemsFromImage } from "@/lib/ai/gemini";
import { jsonError, jsonErrorFromException } from "@/lib/api/errors";

export const runtime = "nodejs";

// 5 MB encoded ceiling per CONTRACTS §4.5.
const MAX_IMAGE_BYTES = 5_000_000;

const bodySchema = z.object({
  image: z.string().min(1, "image is required"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/**
 * Strip the optional `data:image/...;base64,` prefix and decode to a Buffer.
 * Returns null if the body is not valid base64.
 */
function decodeImage(image: string): Buffer | null {
  const commaIdx = image.indexOf(",");
  const stripped =
    image.startsWith("data:") && commaIdx !== -1
      ? image.slice(commaIdx + 1)
      : image;
  // Quick syntactic check before attempting decode.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripped.replace(/\s/g, ""))) return null;
  try {
    const buf = Buffer.from(stripped, "base64");
    if (buf.byteLength === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    await requireAuth();

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, "VALIDATION_ERROR", "Body must be JSON");
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      // mimeType failures are user-facing image errors; everything else is
      // generic validation. Frontend's error-toast map keys off the code.
      if (first.path[0] === "mimeType") {
        return jsonError(400, "INVALID_IMAGE", "Unsupported image type", {
          field: "mimeType",
        });
      }
      return jsonError(400, "VALIDATION_ERROR", first.message, {
        field: first.path.join("."),
      });
    }
    const { image, mimeType } = parsed.data;

    const buffer = decodeImage(image);
    if (!buffer) {
      return jsonError(400, "INVALID_IMAGE", "Image could not be decoded", {
        field: "image",
      });
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return jsonError(400, "INVALID_IMAGE", "Image is too large (5 MB max)", {
        field: "image",
      });
    }

    await connectMongo();
    const [categories, catalog] = await Promise.all([
      getCachedCategories(),
      CatalogItem.find({ active: true })
        .select({ name: 1, categoryId: 1, categoryName: 1, programName: 1, defaultUnit: 1, estimatedValuePerUnit: 1, aliases: 1, active: 1 })
        .lean(),
    ]);

    const { items, rawCount } = await recognizeItemsFromImage({
      buffer,
      mimeType,
      categories,
      catalog,
    });

    const matchedCount = items.filter((i) => i.matched).length;

    return NextResponse.json({ items, rawCount, matchedCount });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
