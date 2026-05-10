// User collection — JIT-upserted on every authenticated API call.
// `_id` is the Clerk user ID string (e.g. "user_2abc..."), per CONTRACTS §1.

import mongoose, { Schema, type Model, type HydratedDocument } from "mongoose";

export interface IUser {
  _id: string; // Clerk userId
  name: string; // full name as stored in Clerk
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, default: "Volunteer" },
    email: { type: String, required: true, default: "" },
  },
  {
    timestamps: true,
    // _id is a string Clerk userId, not an auto-generated ObjectId.
    _id: false,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id;
        delete ret._id;
        if (ret.createdAt instanceof Date) ret.createdAt = ret.createdAt.toISOString();
        if (ret.updatedAt instanceof Date) ret.updatedAt = ret.updatedAt.toISOString();
        return ret;
      },
    },
  },
);

// Avoid model recompilation in Next.js dev HMR.
export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) ??
  mongoose.model<IUser>("User", userSchema, "users");

export type UserDoc = HydratedDocument<IUser>;
