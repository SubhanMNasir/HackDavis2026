// CatalogItem collection (`itemCatalog` in CONTRACTS §8) — seeded items
// the AI matches against. No item-level CRUD UI in MVP.
//
// Soft-delete via `active: false`.

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from "mongoose";
import type { Unit } from "../../types";

export interface ICatalogItem {
  _id: Types.ObjectId;
  name: string;
  categoryId: Types.ObjectId;
  categoryName: string; // denormalized
  programName: string; // denormalized
  defaultUnit: Unit;
  estimatedValuePerUnit: number; // USD per unit
  aliases: string[]; // for AI fuzzy-matching
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const catalogItemSchema = new Schema<ICatalogItem>(
  {
    name: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    categoryName: { type: String, required: true },
    programName: { type: String, required: true },
    defaultUnit: { type: String, required: true, enum: ["count", "lbs"] },
    estimatedValuePerUnit: { type: Number, required: true, min: 0, default: 0 },
    aliases: { type: [String], required: true, default: [] },
    active: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as Types.ObjectId).toString();
        delete ret._id;
        if (ret.categoryId) ret.categoryId = (ret.categoryId as Types.ObjectId).toString();
        if (ret.createdAt instanceof Date) ret.createdAt = ret.createdAt.toISOString();
        if (ret.updatedAt instanceof Date) ret.updatedAt = ret.updatedAt.toISOString();
        return ret;
      },
    },
  },
);

// Per CONTRACTS §8: name uniqueness within a category among active rows;
// indexes for the AI-recognize match path (name + aliases).
catalogItemSchema.index(
  { categoryId: 1, name: 1, active: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    name: "categoryId_name_active_ci_unique",
  },
);
catalogItemSchema.index({ active: 1, name: 1 });
catalogItemSchema.index({ aliases: 1 });

export const CatalogItem: Model<ICatalogItem> =
  (mongoose.models.CatalogItem as Model<ICatalogItem>) ??
  mongoose.model<ICatalogItem>("CatalogItem", catalogItemSchema, "itemCatalog");

export type CatalogItemDoc = HydratedDocument<ICatalogItem>;
