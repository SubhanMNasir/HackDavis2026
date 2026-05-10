// POST /api/donations
//
// Bulk create endpoint per CONTRACTS §4.4. Manual Entry sends an array of
// length 1; Quick Pick / AI Review send N.
//
// Server denormalizes loggedBy/loggedByName from Clerk and
// categoryName/programName from the looked-up Category. One
// `donation.created` audit event is emitted per inserted row.

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectMongo } from "@/lib/db/mongoose";
import { Donation } from "@/lib/db/models/donation";
import { Category } from "@/lib/db/models/category";
import { requireAuth } from "@/lib/auth/requireAuth";
import { recordEvent } from "@/lib/audit";
import { jsonError, jsonErrorFromException } from "@/lib/api/errors";
import type { Donation as WireDonation } from "@/lib/types";

export const runtime = "nodejs";

const objectIdRefinement = (val: string) => Types.ObjectId.isValid(val);

const donationItemSchema = z.object({
  itemId: z
    .string()
    .refine(objectIdRefinement, { message: "Invalid itemId" })
    .nullable()
    .optional()
    .default(null),
  itemName: z.string().min(1, "itemName is required"),
  categoryId: z.string().refine(objectIdRefinement, { message: "Invalid categoryId" }),
  quantity: z.number().positive("quantity must be greater than 0"),
  unit: z.enum(["count", "lbs"]),
  estimatedValue: z.number().min(0, "estimatedValue must be >= 0"),
  source: z.enum(["photo_ai", "quick_pick", "manual", "barcode"]),
  photoUrl: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  donatedAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: "donatedAt must be ISO" })
    .optional(),
});

const bodySchema = z.object({
  donations: z.array(donationItemSchema).min(1, "donations must be a non-empty array"),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    await connectMongo();

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, "VALIDATION_ERROR", "Body must be JSON");
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(400, "VALIDATION_ERROR", first.message, {
        field: first.path.join("."),
      });
    }
    const items = parsed.data.donations;

    // Resolve unique categories in one query so a 50-row Quick Pick save
    // doesn't fan out into 50 lookups.
    const uniqueCategoryIds = Array.from(new Set(items.map((i) => i.categoryId)));
    const categoryDocs = await Category.find({
      _id: { $in: uniqueCategoryIds.map((id) => new Types.ObjectId(id)) },
    });
    const categoryMap = new Map<string, (typeof categoryDocs)[number]>();
    for (const doc of categoryDocs) categoryMap.set(String(doc._id), doc);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cat = categoryMap.get(it.categoryId);
      if (!cat || !cat.active) {
        return jsonError(400, "VALIDATION_ERROR", "Unknown or inactive categoryId", {
          index: i,
          field: "categoryId",
        });
      }
    }

    const docsToInsert = items.map((it) => {
      const cat = categoryMap.get(it.categoryId)!;
      return {
        loggedBy: auth.userId,
        loggedByName: auth.fullName,
        itemId: it.itemId ? new Types.ObjectId(it.itemId) : null,
        itemName: it.itemName,
        categoryId: cat._id,
        categoryName: cat.name,
        programName: cat.programName,
        quantity: it.quantity,
        unit: it.unit,
        estimatedValue: it.estimatedValue,
        source: it.source,
        photoUrl: it.photoUrl ?? null,
        notes: it.notes ?? null,
        donatedAt: it.donatedAt ? new Date(it.donatedAt) : new Date(),
        deleted: false,
      };
    });

    const inserted = await Donation.insertMany(docsToInsert);

    for (const doc of inserted) {
      const summary = `${auth.displayName} logged ${doc.quantity} ${doc.unit} ${doc.itemName} (${doc.categoryName})`;
      await recordEvent(
        "donation.created",
        { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
        { id: String(doc._id), label: doc.itemName },
        summary,
      );
    }

    const donations: WireDonation[] = inserted.map(
      (d) => d.toJSON() as unknown as WireDonation,
    );

    return NextResponse.json(
      { donations, createdCount: donations.length },
      { status: 201 },
    );
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
