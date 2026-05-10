// Category collection — seeded ~25, runtime CRUD via /api/categories.
//
// Soft-delete via `active: false`. Items in itemCatalog referencing an
// archived category remain in the DB but are filtered from pickers.
//
// Uniqueness: case-insensitive on (programId, name) among ACTIVE rows.
// We use a compound index with collation strength=2 to express
// case-insensitive uniqueness; we include `active` in the index so an
// archived category doesn't block re-creation under the same name.

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from "mongoose";
import type { Unit } from "../../types";

export interface ICategory {
  _id: Types.ObjectId;
  name: string;
  programId: Types.ObjectId;
  programName: string; // denormalized — survives program edits (programs are static anyway)
  defaultUnit: Unit;
  active: boolean;
  createdBy: string; // Clerk userId; sentinel for synthetic seed rows
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    programName: { type: String, required: true },
    defaultUnit: { type: String, required: true, enum: ["count", "lbs"] },
    active: { type: Boolean, required: true, default: true },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as Types.ObjectId).toString();
        delete ret._id;
        if (ret.programId) ret.programId = (ret.programId as Types.ObjectId).toString();
        if (ret.createdAt instanceof Date) ret.createdAt = ret.createdAt.toISOString();
        if (ret.updatedAt instanceof Date) ret.updatedAt = ret.updatedAt.toISOString();
        return ret;
      },
    },
  },
);

// Per CONTRACTS §8 + the brief: case-insensitive uniqueness on
// (programId, name) among ACTIVE rows.
categorySchema.index(
  { programId: 1, name: 1, active: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    name: "programId_name_active_ci_unique",
  },
);
categorySchema.index({ programId: 1, active: 1 });
categorySchema.index({ active: 1, name: 1 });

export const Category: Model<ICategory> =
  (mongoose.models.Category as Model<ICategory>) ??
  mongoose.model<ICategory>("Category", categorySchema, "categories");

export type CategoryDoc = HydratedDocument<ICategory>;
