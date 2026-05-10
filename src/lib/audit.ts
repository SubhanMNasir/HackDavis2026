// Audit-log helper. Every write route MUST go through `recordEvent` so the
// History feed (`GET /api/events`) sees the row, and so we never inline
// AuditEvent.create(...) calls anywhere else.
//
// `summary` is pre-formatted at call time using the actor's abbreviated
// displayName (per CONTRACTS §3 CHANGED 2026-05-09) — the History UI just
// renders it directly.

import { connectMongo } from "./db/mongoose";
import { AuditEvent } from "./db/models/event";
import type { AuditEventType } from "./types";

export interface AuditActor {
  /** Clerk userId, or a sentinel string for synthetic seed events. */
  actorId: string;
  /** Full name as stored on the User doc. */
  fullName: string;
  /** Pre-formatted abbreviated form (e.g. "Jessica M."). Used in `summary`. */
  displayName: string;
}

export interface AuditTarget {
  /** ObjectId hex (or sentinel) of the donation/category/item being acted on. */
  id: string;
  /** Human label used in `targetLabel`, e.g. "Size 4 Diapers" or "Diapers → Adult Diapers". */
  label: string;
}

/**
 * Insert one row into the `events` collection.
 *
 * @param type     One of the AuditEventType strings.
 * @param actor    Who did the thing (use the result of `requireAuth()`).
 * @param target   What the thing was (donation, category, item).
 * @param summary  Pre-formatted display string. SHOULD include `actor.displayName`
 *                 and SHOULD describe the change in human terms — the UI renders
 *                 this verbatim. Examples:
 *                   - "Jessica M. logged 24 Size 4 Diapers"
 *                   - "Maria T. renamed Diapers → Adult Diapers"
 *                   - "Alex K. archived Yarn"
 */
export async function recordEvent(
  type: AuditEventType,
  actor: AuditActor,
  target: AuditTarget,
  summary: string,
): Promise<void> {
  await connectMongo();
  await AuditEvent.create({
    type,
    actorId: actor.actorId,
    actorName: actor.fullName,
    targetId: target.id,
    targetLabel: target.label,
    summary,
  });
}
