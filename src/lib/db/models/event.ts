// AuditEvent collection (`events` in CONTRACTS §8) — append-only audit
// log. Every donation / category / item write emits one row via the
// `recordEvent` helper in src/lib/audit.ts.
//
// `summary` is pre-formatted at write time using formatDisplayName()
// (CHANGED 2026-05-09 in CONTRACTS §3) so the History feed can render
// it directly without re-formatting.

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from "mongoose";
import type { AuditEventType } from "../../types";

const AUDIT_EVENT_TYPES: AuditEventType[] = [
  "donation.created",
  "donation.updated",
  "donation.deleted",
  "category.created",
  "category.renamed",
  "category.updated",
  "category.archived",
  "item.created",
  "item.updated",
  "item.archived",
];

export interface IAuditEvent {
  _id: Types.ObjectId;
  type: AuditEventType;
  actorId: string; // Clerk userId; sentinel for synthetic seed rows
  actorName: string; // full name (Clerk firstName + lastName) OR a synthetic seed string
  targetId: string; // donation/category/item id; sentinel for synthetic seed rows
  targetLabel: string; // human label
  summary: string; // pre-formatted with abbreviated actor name
  createdAt: Date;
  updatedAt: Date;
}

const auditEventSchema = new Schema<IAuditEvent>(
  {
    type: { type: String, required: true, enum: AUDIT_EVENT_TYPES },
    actorId: { type: String, required: true },
    actorName: { type: String, required: true },
    targetId: { type: String, required: true },
    targetLabel: { type: String, required: true },
    summary: { type: String, required: true },
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
        // Audit log doesn't need updatedAt on the wire; CONTRACTS §3 shows only createdAt.
        delete ret.updatedAt;
        return ret;
      },
    },
  },
);

// Per CONTRACTS §8: History feed sorts by createdAt DESC, filters
// optionally by actorId / type / date range.
auditEventSchema.index({ createdAt: -1 });
auditEventSchema.index({ actorId: 1, createdAt: -1 });
auditEventSchema.index({ type: 1, createdAt: -1 });

export const AuditEvent: Model<IAuditEvent> =
  (mongoose.models.AuditEvent as Model<IAuditEvent>) ??
  mongoose.model<IAuditEvent>("AuditEvent", auditEventSchema, "events");

export type AuditEventDoc = HydratedDocument<IAuditEvent>;
