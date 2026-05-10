// Auth helper for /api/** route handlers.
//
// - Pulls userId from Clerk's server-side `auth()`.
// - JIT-upserts the User doc on every authenticated call (no webhook in MVP,
//   per CONTRACTS §2 + PLAN §4).
// - Returns the shape every write route needs: full name (for denormalization
//   onto Donation.loggedByName) plus the abbreviated displayName + initials
//   (for AuditEvent.summary, Profile, etc.) computed via lib/format-name.ts.
//
// Throws an `ApiError(401, "UNAUTHENTICATED")` if no Clerk session — callers
// should let it bubble and translate via `jsonErrorFromException`.

import { auth, currentUser } from "@clerk/nextjs/server";
import { connectMongo } from "../db/mongoose";
import { User } from "../db/models/user";
import { ApiError } from "../api/errors";
import { formatDisplayName, getInitials } from "../format-name";

export interface AuthContext {
  userId: string; // Clerk userId (== User._id)
  fullName: string; // "Jessica Martinez" (raw, unabbreviated)
  displayName: string; // "Jessica M." (formatDisplayName)
  initials: string; // "JM" (getInitials)
  email: string;
}

function buildFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return "Volunteer";
}

export async function requireAuth(): Promise<AuthContext> {
  const { userId } = await auth();
  if (!userId) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  }

  // Pull profile fields from Clerk so we can JIT-mirror them.
  const clerkUser = await currentUser();
  const fullName = buildFullName(clerkUser?.firstName, clerkUser?.lastName);
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";

  await connectMongo();

  // Idempotent upsert: keep the row's name/email in sync with Clerk on every
  // request (cheap; one indexed _id lookup + maybe one write).
  await User.updateOne(
    { _id: userId },
    {
      $set: { name: fullName, email },
      $setOnInsert: { _id: userId },
    },
    { upsert: true },
  );

  return {
    userId,
    fullName,
    displayName: formatDisplayName(fullName),
    initials: getInitials(fullName),
    email,
  };
}
