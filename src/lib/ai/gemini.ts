// Gemini 2.5 Flash adapter for `POST /api/recognize` (CONTRACTS §4.5).
//
// Encapsulates the Gemini call + post-processing:
//   1. Builds a dynamic JSON `responseSchema` whose `category` property is
//      enum-constrained to the active categories list (so the model can't
//      invent categories the volunteer doesn't have).
//   2. Sends the image as base64 inlineData with a system instruction
//      tailored to the women's-shelter donation context.
//   3. Parses the strict-JSON response and matches each suggestion against
//      the catalog by case-insensitive substring on `name + aliases`.
//   4. Returns an array of RecognizedItem in wire shape; the route handler
//      adds `matchedCount` and HTTP wrapping.
//
// Errors are normalized into the project's ApiError so the route can let
// them bubble through `jsonErrorFromException`. Rate-limit hits become
// `429 RATE_LIMITED`; everything else becomes `502 AI_UNAVAILABLE`.

import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  SchemaType,
  type ResponseSchema,
} from "@google/generative-ai";
import { ApiError } from "../api/errors";
import type { CachedCategory } from "../categories-cache";
import type { ICatalogItem } from "../db/models/catalogItem";
import type { Unit, RecognizedItem } from "../types";

const MODEL_NAME = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = [
  "You are looking at a donation drop-off pile at a women's shelter.",
  "Identify each distinct donated food or household item visible in the image.",
  "For each item, choose exactly one category from the provided enum.",
  "Estimate quantity sensibly: a number that a volunteer would write on a clipboard.",
  "Use canonical English item names a volunteer would write — for example",
  "  'Canned Black Beans' (not 'beans in a can'),",
  "  'Size 4 Diapers' (not 'baby diapers, size 4 maybe'),",
  "  'Whole Milk' (not 'gallon of dairy product').",
  "For unit, use 'count' for discrete items (cans, packs, boxes, jars, diapers, bottles)",
  "  and 'lbs' for loose produce, meat, bulk grains, or other weight-priced foods.",
  "estimatedValue is the volunteer's best dollar estimate for the entire entry,",
  "  based on typical retail value (one number per item, total — not per unit).",
  "Return ONLY items you can clearly see; never hallucinate items that aren't in the photo.",
].join(" ");

interface CatalogMatchInput
  extends Pick<
    ICatalogItem,
    "name" | "categoryName" | "programName" | "defaultUnit" | "estimatedValuePerUnit" | "aliases" | "active"
  > {
  _id: { toString(): string };
  categoryId: { toString(): string };
}

export interface RecognizeArgs {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  categories: CachedCategory[];
  catalog: CatalogMatchInput[];
}

export interface RecognizeResult {
  items: RecognizedItem[];
  rawCount: number;
}

interface RawAiItem {
  name?: unknown;
  category?: unknown;
  quantity?: unknown;
  unit?: unknown;
  estimatedValue?: unknown;
}

/**
 * Build the strict JSON schema Gemini must produce. The `category` enum is
 * populated from the active categories cache so the model can only assign
 * items to categories the volunteer actually has — newly-created categories
 * become available as soon as the cache is invalidated (per CONTRACTS §4.5).
 */
function buildResponseSchema(categoryNames: string[]): ResponseSchema {
  return {
    type: SchemaType.OBJECT,
    properties: {
      items: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            category: {
              type: SchemaType.STRING,
              format: "enum",
              enum: categoryNames,
            },
            quantity: { type: SchemaType.NUMBER },
            unit: {
              type: SchemaType.STRING,
              format: "enum",
              enum: ["count", "lbs"],
            },
            estimatedValue: { type: SchemaType.NUMBER },
          },
          required: ["name", "category", "quantity", "unit", "estimatedValue"],
        },
      },
    },
    required: ["items"],
  };
}

function normalizeUnit(raw: unknown): Unit | null {
  if (raw === "count" || raw === "lbs") return raw;
  return null;
}

function toFiniteNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Case-insensitive substring match: an AI-suggested name matches a catalog
 * row if the suggestion contains the canonical name or any alias as a
 * substring, OR vice-versa (so "beans" matches "Canned Black Beans" while
 * "Canned Black Beans" still matches a catalog row named "Black Beans").
 */
function findCatalogMatch(
  suggestedName: string,
  catalog: CatalogMatchInput[],
): CatalogMatchInput | null {
  const needle = suggestedName.trim().toLowerCase();
  if (!needle) return null;

  for (const row of catalog) {
    if (!row.active) continue;
    const haystacks = [row.name, ...(row.aliases ?? [])]
      .map((s) => s.toLowerCase())
      .filter(Boolean);
    for (const hay of haystacks) {
      if (hay.includes(needle) || needle.includes(hay)) return row;
    }
  }
  return null;
}

export async function recognizeItemsFromImage(
  args: RecognizeArgs,
): Promise<RecognizeResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new ApiError(502, "AI_UNAVAILABLE", "AI is unavailable — try Quick Pick");
  }

  const categoryNames = args.categories.map((c) => c.name);
  // Gemini requires a non-empty enum. If the categories cache is empty
  // (e.g. fresh DB before seed), surface as AI_UNAVAILABLE — the FE flow
  // already handles that bail-out path.
  if (categoryNames.length === 0) {
    throw new ApiError(502, "AI_UNAVAILABLE", "AI is unavailable — try Quick Pick");
  }

  const responseSchema = buildResponseSchema(categoryNames);

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  let raw: { items?: RawAiItem[] } | null = null;
  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: args.mimeType,
          data: args.buffer.toString("base64"),
        },
      },
    ]);
    const text = result.response.text();
    raw = JSON.parse(text) as { items?: RawAiItem[] };
  } catch (err) {
    // Rate limit → 429; everything else → 502.
    if (err instanceof GoogleGenerativeAIFetchError) {
      const status = err.status ?? 0;
      const reason = err.errorDetails?.[0]?.reason ?? "";
      if (status === 429 || reason === "RESOURCE_EXHAUSTED") {
        throw new ApiError(429, "RATE_LIMITED", "AI is rate-limited — try again in a moment");
      }
    }
    throw new ApiError(502, "AI_UNAVAILABLE", "AI is unavailable — try Quick Pick");
  }

  const aiItems = Array.isArray(raw?.items) ? raw!.items : [];
  const items: RecognizedItem[] = aiItems.map((it) => {
    const aiName = typeof it.name === "string" ? it.name.trim() : "";
    const aiCategory = typeof it.category === "string" ? it.category : "";
    const aiQty = toFiniteNumber(it.quantity, 1);
    const aiUnit = normalizeUnit(it.unit);
    const aiValue = toFiniteNumber(it.estimatedValue, 0);

    const match = findCatalogMatch(aiName, args.catalog);

    if (match) {
      // Catalog is the source of truth for unit — the AI can't see weight
      // accurately, so we never let it override count↔lbs. For lbs items we
      // also blank quantity/value so the volunteer is forced to weigh + price
      // them rather than ship the AI's hallucinated number.
      const unit: Unit = match.defaultUnit;
      const isLbs = unit === "lbs";
      return {
        itemId: match._id.toString(),
        name: match.name,
        categoryId: match.categoryId.toString(),
        categoryName: match.categoryName,
        programName: match.programName,
        suggestedQuantity: isLbs ? null : aiQty,
        unit,
        estimatedValue: isLbs
          ? null
          : Math.round(aiQty * match.estimatedValuePerUnit * 100) / 100,
        matched: true,
      };
    }

    const unmatchedUnit: Unit = aiUnit ?? "count";
    const unmatchedIsLbs = unmatchedUnit === "lbs";
    return {
      itemId: null,
      name: aiName || "Unknown item",
      categoryId: null,
      categoryName: aiCategory,
      programName: null,
      suggestedQuantity: unmatchedIsLbs ? null : aiQty,
      unit: unmatchedUnit,
      estimatedValue: unmatchedIsLbs ? null : aiValue,
      matched: false,
      warning: "not_in_catalog",
    };
  });

  return { items, rawCount: aiItems.length };
}
