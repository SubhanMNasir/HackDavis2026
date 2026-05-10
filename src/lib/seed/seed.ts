// Idempotent seed script for the Wellspring MVP.
//
//   npm run seed   (== `tsx src/lib/seed/seed.ts`)
//
// Seeds:
//   - 4 programs (verbatim from wellspring-build-brief.md §Sample Data).
//   - ~25 categories distributed across the 4 programs.
//   - ~15 catalog items with `aliases` arrays for AI fuzzy-matching.
//   - ~10 historical AuditEvents spanning the last 7 days, with synthetic
//     actor display strings ("Maria T.", "Alex K."). Per the spec we do
//     NOT create User docs for these synthetic actors — we only put their
//     display strings into AuditEvent.actorName / .summary, with
//     `actorId` and `targetId` set to the static sentinel ObjectId
//     `000000000000000000000000` (defined as SEED_SENTINEL_ID below).
//
// All upserts key on natural identifiers (program.name, category
// (programId, name), catalogItem (categoryId, name), audit (type +
// summary)) so re-running the script is a no-op. Verified by running
// it twice and checking row counts match.

// Node 18 compatibility shim: ensure `globalThis.crypto` is the Web
// Crypto API. Newer mongodb driver versions call `crypto.getRandomValues`
// as a bare global (not the `node:crypto` module), which works on Node
// 19+ by default. On Node 18.x the global isn't injected in CJS-loaded
// modules (and tsx loads .ts as CJS), so we install it ourselves.
import { webcrypto as _nodeWebCrypto } from "node:crypto";
if (typeof globalThis.crypto === "undefined") {
  // The Node webcrypto API is Web-Crypto-compatible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = _nodeWebCrypto;
}

// Minimal .env loader — avoids adding `dotenv` as a dependency. Reads
// the .env at the repo root and populates process.env for any keys not
// already set. (Production runs on Vercel and don't need this.)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

(function loadDotEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip optional surrounding quotes.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file — that's fine; Vercel/Atlas envs are set in the platform.
  }
})();

import mongoose, { Types } from "mongoose";
import { connectMongo } from "../db/mongoose";
import { Program } from "../db/models/program";
import { Category } from "../db/models/category";
import { CatalogItem } from "../db/models/catalogItem";
import { AuditEvent } from "../db/models/event";
import { invalidateCategoriesCache } from "../categories-cache";
import type { Unit, AuditEventType } from "../types";

// Sentinel for synthetic seed rows — chosen so it can never collide with
// a real Mongo-generated ObjectId (those start with a real timestamp).
// Used for actorId, targetId on synthetic AuditEvents AND createdBy on
// every seeded category.
const SEED_SENTINEL_ID = "000000000000000000000000";

// ---------------------------------------------------------------------------
// 1. Programs (4 — verbatim from the build brief)
// ---------------------------------------------------------------------------

const PROGRAM_SEED: Array<{ name: string; slug: string; sortOrder: number }> = [
  { name: "Nutritious Meals Program", slug: "nutritious-meals", sortOrder: 0 },
  { name: "Children's Corner", slug: "childrens-corner", sortOrder: 1 },
  { name: "Women's Wellness / Safety New Services", slug: "wellness-safety", sortOrder: 2 },
  { name: "Art of Being Program", slug: "art-of-being", sortOrder: 3 },
];

// ---------------------------------------------------------------------------
// 2. Categories (~25, distributed across the 4 programs)
// ---------------------------------------------------------------------------

interface CategorySeed {
  name: string;
  programName: string; // matches a Program.name above
  defaultUnit: Unit;
}

// Mirrors the Wellspring "Donations Needed" flier — one category per
// program, items listed flat under each. (Re-seeded via reset-catalog.ts
// after the original spec-style sub-categories were retired.)
const CATEGORY_SEED: CategorySeed[] = [
  { name: "Nutritious Meals", programName: "Nutritious Meals Program", defaultUnit: "count" },
  { name: "Children's Corner", programName: "Children's Corner", defaultUnit: "count" },
  { name: "Women's Wellness", programName: "Women's Wellness / Safety New Services", defaultUnit: "count" },
  { name: "Art of Being", programName: "Art of Being Program", defaultUnit: "count" },
];

// ---------------------------------------------------------------------------
// 3. Catalog items (~15, with aliases for AI fuzzy-matching)
// ---------------------------------------------------------------------------

interface CatalogSeed {
  name: string;
  categoryName: string; // matches a Category.name above
  programName: string; // matches the parent program
  defaultUnit: Unit;
  estimatedValuePerUnit: number;
  aliases: string[];
}

const CATALOG_SEED: CatalogSeed[] = [
  // ---------------- Nutritious Meals Program ----------------
  {
    name: "Tea",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 4.0,
    aliases: ["tea bags", "herbal tea", "black tea", "green tea", "chamomile"],
  },
  {
    name: "Honey",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 5.0,
    aliases: ["honey jar", "honey bottle", "raw honey"],
  },
  {
    name: "Fruit Juice",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 3.5,
    aliases: ["juice", "orange juice", "apple juice", "juice box", "juice carton"],
  },
  {
    name: "Cream Cheese",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 3.5,
    aliases: ["cream cheese tub", "philadelphia cream cheese"],
  },
  {
    name: "Yogurt",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 1.0,
    aliases: ["yogurt cup", "bulk yogurt", "greek yogurt", "yogurt container"],
  },
  {
    name: "Olive or Canola Oil",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 7.0,
    aliases: ["olive oil", "canola oil", "cooking oil", "vegetable oil"],
  },
  {
    name: "Ground Coffee",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 8.0,
    aliases: ["coffee", "coffee grounds", "ground beans", "folgers", "maxwell house"],
  },
  {
    name: "Sugar/Sweetener Packets",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 2.0,
    aliases: ["sugar packets", "sweetener packets", "splenda", "equal", "stevia", "sugar in the raw"],
  },
  {
    name: "Coffee Stirrers",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 3.0,
    aliases: ["stirrers", "coffee stirrer", "wood stirrers"],
  },
  {
    name: "Creamer",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 4.0,
    aliases: ["coffee creamer", "non-dairy creamer", "coffee mate", "half and half"],
  },
  {
    name: "Jams/Jellies",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 4.0,
    aliases: ["jam", "jelly", "preserves", "marmalade", "smuckers"],
  },
  {
    name: "Oatmeal",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 4.0,
    aliases: ["oats", "instant oatmeal", "bulk oats", "rolled oats", "quaker oats"],
  },
  {
    name: "Cereal (Low Sugar)",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 4.5,
    aliases: ["cereal", "low sugar cereal", "cheerios", "corn flakes", "rice krispies"],
  },
  {
    name: "Plastic/Compostable Utensils",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 5.0,
    aliases: ["utensils", "plastic forks", "plastic spoons", "compostable utensils", "disposable utensils"],
  },
  {
    name: "Paper Towels",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 2.5,
    aliases: ["paper towel", "paper towel roll", "kitchen paper", "bounty"],
  },
  {
    name: "Toilet Paper",
    categoryName: "Nutritious Meals",
    programName: "Nutritious Meals Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 1.5,
    aliases: ["tp", "toilet roll", "bathroom tissue", "charmin"],
  },

  // ---------------- Women's Wellness / Safety Net Services ----------------
  {
    name: "Menstrual Pads",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 7.0,
    aliases: ["pads", "sanitary pads", "feminine pads", "period pads", "always pads"],
  },
  {
    name: "Travel-sized Toiletries",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 3.0,
    aliases: ["travel toiletries", "hotel toiletries", "mini soap", "mini shampoo", "travel kit", "travel conditioner", "travel lotion"],
  },
  {
    name: "Toothbrushes and Toothpaste",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 5.0,
    aliases: ["toothbrush", "toothpaste", "oral care kit", "colgate", "crest"],
  },
  {
    name: "Deodorant",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 4.0,
    aliases: ["antiperspirant", "deo", "stick deodorant", "speed stick", "secret"],
  },
  {
    name: "Small Reuse Packets",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 2.0,
    aliases: ["reuse packets", "refill packets", "small reusable bags"],
  },
  {
    name: "Adult Pull-up Diapers",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 15.0,
    aliases: ["adult diapers", "depends", "pull-ups adult", "incontinence briefs", "adult underwear"],
  },
  {
    name: "Bed Pads",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 20.0,
    aliases: ["chux pads", "underpads", "incontinence pads", "bed protector"],
  },
  {
    name: "New Women's Underwear",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 8.0,
    aliases: ["women's underwear", "panties", "undergarments", "ladies underwear"],
  },
  {
    name: "Grocery/Gas Gift Cards $10-$20",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 15.0,
    aliases: ["gift card", "gas card", "grocery card", "$10 gift card", "$20 gift card", "safeway card", "shell gas card"],
  },
  {
    name: "New Sweat Pants Size L-XXL",
    categoryName: "Women's Wellness",
    programName: "Women's Wellness / Safety New Services",
    defaultUnit: "count",
    estimatedValuePerUnit: 20.0,
    aliases: ["sweat pants", "sweatpants", "joggers", "women's pants", "lounge pants"],
  },

  // ---------------- Art of Being Program ----------------
  {
    name: "Yarn",
    categoryName: "Art of Being",
    programName: "Art of Being Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 5.0,
    aliases: ["knitting yarn", "crochet yarn", "ball of yarn", "skein"],
  },
  {
    name: "Art Store Gift Cards (Michael's, Blick, JoAnn)",
    categoryName: "Art of Being",
    programName: "Art of Being Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 25.0,
    aliases: ["art gift card", "michaels gift card", "joann gift card", "blick gift card", "art supplies gift card"],
  },
  {
    name: "Garment Fabric",
    categoryName: "Art of Being",
    programName: "Art of Being Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 8.0,
    aliases: ["fabric", "cloth", "sewing fabric", "cotton fabric"],
  },
  {
    name: "Mixed Media/Watercolor Paper 9x12",
    categoryName: "Art of Being",
    programName: "Art of Being Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 10.0,
    aliases: ["watercolor paper", "mixed media paper", "art paper", "painting paper", "9x12 paper"],
  },
  {
    name: "Sketchbooks 5x7 & 9x12",
    categoryName: "Art of Being",
    programName: "Art of Being Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 8.0,
    aliases: ["sketchbook", "art journal", "drawing pad", "sketch pad"],
  },
  {
    name: "Drawing Pencils, Sharpeners & Erasers",
    categoryName: "Art of Being",
    programName: "Art of Being Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 6.0,
    aliases: ["pencils", "drawing pencils", "art pencils", "erasers", "sharpeners", "graphite pencils"],
  },
  {
    name: "Adult Coloring Books",
    categoryName: "Art of Being",
    programName: "Art of Being Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 8.0,
    aliases: ["coloring book", "mandala book", "adult coloring"],
  },
  {
    name: "Fine Point Markers",
    categoryName: "Art of Being",
    programName: "Art of Being Program",
    defaultUnit: "count",
    estimatedValuePerUnit: 7.0,
    aliases: ["markers", "fine markers", "sharpie", "fine tip pens", "felt tip pens"],
  },

  // ---------------- Children's Corner ----------------
  {
    name: "Baby Wash",
    categoryName: "Children's Corner",
    programName: "Children's Corner",
    defaultUnit: "count",
    estimatedValuePerUnit: 5.0,
    aliases: ["baby body wash", "baby cleanser", "johnson's baby wash", "infant wash"],
  },
  {
    name: "Baby Lotion",
    categoryName: "Children's Corner",
    programName: "Children's Corner",
    defaultUnit: "count",
    estimatedValuePerUnit: 5.0,
    aliases: ["johnson's lotion", "infant lotion", "baby moisturizer"],
  },
  {
    name: "New Baby Bottles and Sippy Cups",
    categoryName: "Children's Corner",
    programName: "Children's Corner",
    defaultUnit: "count",
    estimatedValuePerUnit: 8.0,
    aliases: ["baby bottle", "sippy cup", "infant bottle", "tommee tippee", "dr browns"],
  },
  {
    name: "New Baby Onesies",
    categoryName: "Children's Corner",
    programName: "Children's Corner",
    defaultUnit: "count",
    estimatedValuePerUnit: 8.0,
    aliases: ["onesie", "baby onesie", "infant onesie", "bodysuit", "newborn onesie"],
  },
  {
    name: "Baby Bibs",
    categoryName: "Children's Corner",
    programName: "Children's Corner",
    defaultUnit: "count",
    estimatedValuePerUnit: 6.0,
    aliases: ["bib", "infant bib", "drool bib", "feeding bib"],
  },
  {
    name: "Disposable Diapers (Newborn, 4-6, Pull-ups)",
    categoryName: "Children's Corner",
    programName: "Children's Corner",
    defaultUnit: "count",
    estimatedValuePerUnit: 20.0,
    aliases: ["diapers", "baby diapers", "newborn diapers", "size 4 diapers", "size 5 diapers", "size 6 diapers", "pull-ups", "huggies", "pampers"],
  },
  {
    name: "Baby Formula",
    categoryName: "Children's Corner",
    programName: "Children's Corner",
    defaultUnit: "count",
    estimatedValuePerUnit: 25.0,
    aliases: ["infant formula", "similac", "enfamil", "formula powder", "formula can"],
  },
];

// ---------------------------------------------------------------------------
// 4. Historical audit events (~10, last 7 days, synthetic actors)
// ---------------------------------------------------------------------------

interface AuditSeed {
  type: AuditEventType;
  actorDisplay: string; // already abbreviated — used in summary AND actorName
  targetLabel: string;
  summary: string; // pre-formatted; uses actorDisplay verbatim
  daysAgo: number;
  hoursAgo: number;
}

const AUDIT_SEED: AuditSeed[] = [
  {
    type: "donation.created",
    actorDisplay: "Maria T.",
    targetLabel: "Bananas",
    summary: "Maria T. logged 3 lbs of Bananas",
    daysAgo: 0,
    hoursAgo: 1,
  },
  {
    type: "donation.created",
    actorDisplay: "Alex K.",
    targetLabel: "Canned Black Beans",
    summary: "Alex K. logged 12 Canned Black Beans",
    daysAgo: 0,
    hoursAgo: 3,
  },
  {
    type: "donation.created",
    actorDisplay: "Maria T.",
    targetLabel: "Size 4 Diapers",
    summary: "Maria T. logged 24 Size 4 Diapers",
    daysAgo: 1,
    hoursAgo: 2,
  },
  {
    type: "category.renamed",
    actorDisplay: "Alex K.",
    targetLabel: "Diapers → Adult Diapers",
    summary: "Alex K. renamed Diapers → Adult Diapers",
    daysAgo: 1,
    hoursAgo: 5,
  },
  {
    type: "category.created",
    actorDisplay: "Maria T.",
    targetLabel: "Reusable Bags",
    summary: "Maria T. created category Reusable Bags",
    daysAgo: 2,
    hoursAgo: 4,
  },
  {
    type: "donation.created",
    actorDisplay: "Alex K.",
    targetLabel: "Peanut Butter",
    summary: "Alex K. logged 4 lbs of Peanut Butter",
    daysAgo: 2,
    hoursAgo: 7,
  },
  {
    type: "donation.updated",
    actorDisplay: "Maria T.",
    targetLabel: "Granola Bars",
    summary: "Maria T. updated Granola Bars (qty 6 → 8)",
    daysAgo: 3,
    hoursAgo: 6,
  },
  {
    type: "donation.created",
    actorDisplay: "Alex K.",
    targetLabel: "Toothpaste",
    summary: "Alex K. logged 10 Toothpaste",
    daysAgo: 4,
    hoursAgo: 2,
  },
  {
    type: "category.archived",
    actorDisplay: "Maria T.",
    targetLabel: "Yarn",
    summary: "Maria T. archived Yarn",
    daysAgo: 5,
    hoursAgo: 8,
  },
  {
    type: "donation.created",
    actorDisplay: "Alex K.",
    targetLabel: "Apples",
    summary: "Alex K. logged 5 lbs of Apples",
    daysAgo: 6,
    hoursAgo: 3,
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function seedPrograms(): Promise<Map<string, Types.ObjectId>> {
  const byName = new Map<string, Types.ObjectId>();
  for (const p of PROGRAM_SEED) {
    const doc = await Program.findOneAndUpdate(
      { name: p.name },
      {
        $set: { slug: p.slug, sortOrder: p.sortOrder },
        $setOnInsert: { name: p.name },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    byName.set(p.name, doc._id as Types.ObjectId);
  }
  return byName;
}

async function seedCategories(
  programIds: Map<string, Types.ObjectId>,
): Promise<Map<string, { id: Types.ObjectId; programName: string }>> {
  const byName = new Map<string, { id: Types.ObjectId; programName: string }>();
  for (const c of CATEGORY_SEED) {
    const programId = programIds.get(c.programName);
    if (!programId) {
      throw new Error(`Seed bug: unknown program "${c.programName}" for category "${c.name}"`);
    }
    const doc = await Category.findOneAndUpdate(
      { programId, name: c.name },
      {
        $set: {
          programName: c.programName,
          defaultUnit: c.defaultUnit,
          active: true,
          createdBy: SEED_SENTINEL_ID,
        },
        $setOnInsert: { programId, name: c.name },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    byName.set(c.name, { id: doc._id as Types.ObjectId, programName: c.programName });
  }
  return byName;
}

async function seedCatalog(
  categories: Map<string, { id: Types.ObjectId; programName: string }>,
): Promise<number> {
  let count = 0;
  for (const it of CATALOG_SEED) {
    const cat = categories.get(it.categoryName);
    if (!cat) {
      throw new Error(`Seed bug: unknown category "${it.categoryName}" for item "${it.name}"`);
    }
    await CatalogItem.findOneAndUpdate(
      { categoryId: cat.id, name: it.name },
      {
        $set: {
          categoryName: it.categoryName,
          programName: cat.programName,
          defaultUnit: it.defaultUnit,
          estimatedValuePerUnit: it.estimatedValuePerUnit,
          aliases: it.aliases,
          active: true,
        },
        $setOnInsert: { categoryId: cat.id, name: it.name },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    count += 1;
  }
  return count;
}

async function seedAuditEvents(): Promise<number> {
  let count = 0;
  for (const e of AUDIT_SEED) {
    const ts = new Date();
    ts.setDate(ts.getDate() - e.daysAgo);
    ts.setHours(ts.getHours() - e.hoursAgo);

    // Idempotency key: (type, summary). Summary strings are unique enough
    // for the seed set that re-running doesn't duplicate rows.
    const filter = { type: e.type, summary: e.summary };
    const existing = await AuditEvent.findOne(filter).lean();
    if (existing) {
      // Already seeded — skip. Don't update timestamp on re-run; the
      // History feed should not "shift" each time we run seed.
      count += 1;
      continue;
    }
    await AuditEvent.create({
      type: e.type,
      actorId: SEED_SENTINEL_ID,
      actorName: e.actorDisplay, // synthetic — store the display string verbatim
      targetId: SEED_SENTINEL_ID,
      targetLabel: e.targetLabel,
      summary: e.summary,
      createdAt: ts,
      updatedAt: ts,
    });
    count += 1;
  }
  return count;
}

async function run() {
  const reset = process.argv.includes("--reset-catalog");

  // eslint-disable-next-line no-console
  console.log(`[seed] connecting to MongoDB${reset ? " (reset-catalog mode)" : ""}...`);
  await connectMongo();
  // eslint-disable-next-line no-console
  console.log("[seed] connected.");

  if (reset) {
    // Soft-archive the entire catalog before re-seeding. The upserts below
    // will re-activate any rows whose (programId, name) or (categoryId,
    // name) keys still match the new seed; the rest stay archived.
    // Donations/AuditEvents are independent collections — untouched.
    const cats = await Category.updateMany({}, { $set: { active: false } });
    const items = await CatalogItem.updateMany({}, { $set: { active: false } });
    // eslint-disable-next-line no-console
    console.log(
      `[seed] reset: archived ${cats.modifiedCount} categories + ${items.modifiedCount} items`,
    );
  }

  const programIds = await seedPrograms();
  // eslint-disable-next-line no-console
  console.log(`[seed] programs: ${programIds.size}`);

  const categoryIds = await seedCategories(programIds);
  // eslint-disable-next-line no-console
  console.log(`[seed] categories: ${categoryIds.size}`);

  const catalogCount = await seedCatalog(categoryIds);
  // eslint-disable-next-line no-console
  console.log(`[seed] catalog items: ${catalogCount}`);

  // Skip demo audit-event seeding in reset mode — preserves real history.
  if (!reset) {
    const auditCount = await seedAuditEvents();
    // eslint-disable-next-line no-console
    console.log(`[seed] audit events: ${auditCount}`);
  }

  // Drop the in-memory categories cache so any concurrent dev server picks
  // up the freshly-seeded categories on the next /api/recognize call.
  invalidateCategoriesCache();

  // eslint-disable-next-line no-console
  console.log("[seed] done.");
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
