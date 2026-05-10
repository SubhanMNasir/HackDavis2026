// Program collection — 4 seeded rows, never written by the app.

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from "mongoose";

export interface IProgram {
  _id: Types.ObjectId;
  name: string; // "Nutritious Meals Program"
  slug: string; // "nutritious-meals"
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const programSchema = new Schema<IProgram>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    sortOrder: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as Types.ObjectId).toString();
        delete ret._id;
        if (ret.createdAt instanceof Date) ret.createdAt = ret.createdAt.toISOString();
        if (ret.updatedAt instanceof Date) ret.updatedAt = ret.updatedAt.toISOString();
        return ret;
      },
    },
  },
);

// Per CONTRACTS §8: name and slug should be unique across programs.
programSchema.index({ name: 1 }, { unique: true });
programSchema.index({ slug: 1 }, { unique: true });
programSchema.index({ sortOrder: 1 });

export const Program: Model<IProgram> =
  (mongoose.models.Program as Model<IProgram>) ??
  mongoose.model<IProgram>("Program", programSchema, "programs");

export type ProgramDoc = HydratedDocument<IProgram>;
