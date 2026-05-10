// Donation collection — the hot collection. Snapshots categoryName +
// programName at write time; renames consolidate at aggregation time
// via categoryId, NOT by mutating donation rows.
//
// Soft-delete via `deleted: true`. Reports + list endpoints filter
// `deleted: { $ne: true }`.

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from "mongoose";
import type { Unit, DonationSource } from "../../types";

export interface IDonation {
  _id: Types.ObjectId;
  loggedBy: string; // Clerk userId
  loggedByName: string; // full name; UI abbreviates
  itemId: Types.ObjectId | null;
  itemName: string;
  categoryId: Types.ObjectId;
  categoryName: string; // snapshot
  programName: string; // snapshot
  quantity: number;
  unit: Unit;
  estimatedValue: number; // USD total for this entry
  source: DonationSource;
  photoUrl: string | null; // MVP: always null
  notes: string | null;
  donatedAt: Date;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const donationSchema = new Schema<IDonation>(
  {
    loggedBy: { type: String, required: true },
    loggedByName: { type: String, required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "CatalogItem", default: null },
    itemName: { type: String, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    categoryName: { type: String, required: true },
    programName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, enum: ["count", "lbs"] },
    estimatedValue: { type: Number, required: true, min: 0, default: 0 },
    source: {
      type: String,
      required: true,
      enum: ["photo_ai", "quick_pick", "manual", "barcode"],
    },
    photoUrl: { type: String, default: null },
    notes: { type: String, default: null },
    donatedAt: { type: Date, required: true, default: () => new Date() },
    deleted: { type: Boolean, required: true, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as Types.ObjectId).toString();
        delete ret._id;
        if (ret.itemId) ret.itemId = (ret.itemId as Types.ObjectId).toString();
        if (ret.categoryId) ret.categoryId = (ret.categoryId as Types.ObjectId).toString();
        if (ret.donatedAt instanceof Date) ret.donatedAt = ret.donatedAt.toISOString();
        if (ret.createdAt instanceof Date) ret.createdAt = ret.createdAt.toISOString();
        if (ret.updatedAt instanceof Date) ret.updatedAt = ret.updatedAt.toISOString();
        return ret;
      },
    },
  },
);

// Per CONTRACTS §8: list endpoints sort by donatedAt DESC; Reports
// aggregations filter by date + deleted; per-user views filter by
// loggedBy.
donationSchema.index({ donatedAt: -1 });
donationSchema.index({ deleted: 1, donatedAt: -1 });
donationSchema.index({ loggedBy: 1, donatedAt: -1 });
donationSchema.index({ categoryId: 1, donatedAt: -1 });

export const Donation: Model<IDonation> =
  (mongoose.models.Donation as Model<IDonation>) ??
  mongoose.model<IDonation>("Donation", donationSchema, "donations");

export type DonationDoc = HydratedDocument<IDonation>;
