// Profile — Phase 1 wiring. Renders the current user's name + avatar via
// formatDisplayName / getInitials. Stats are placeholders until Phase 2 wires
// GET /api/profile/me.
// Per wellspring-build-brief.md §Screen 10.

import * as React from "react";
import { currentUser } from "@clerk/nextjs/server";
import {
  Avatar,
  Card,
  ChipFilter,
  PageHeader,
  SecondaryButton,
  StatCard,
  Subtle,
  TopAppBar,
} from "../../components/wellspring/shared";
import { formatDisplayName } from "@/lib/format-name";

const RANGES = ["This month", "Last month", "Q2", "YTD", "All time"] as const;

export default async function ProfilePage() {
  const u = await currentUser();
  const fullName = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.username || null;
  const displayName = formatDisplayName(fullName);
  const email = u?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Profile" />
      </div>
      <div className="hidden md:block">
        <PageHeader title="Profile" subtitle="Your shifts, contributions, and account." />
      </div>

      <div className="mx-auto grid w-full max-w-[1024px] gap-4 px-4 py-4 md:grid-cols-2 md:px-6">
        {/* Header card */}
        <Card padded={false} className="md:col-span-2 overflow-hidden">
          <div
            style={{
              background:
                "linear-gradient(160deg, var(--brand-green-darkest), var(--brand-green-dark) 50%, var(--brand-green))",
              height: 80,
            }}
          />
          <div className="-mt-8 flex flex-wrap items-end gap-4 px-5 pb-5">
            <Avatar name={fullName} size={64} className="ring-4 ring-white" />
            <div className="flex flex-col">
              <span style={{ fontSize: 18, fontWeight: 600 }}>{displayName}</span>
              <Subtle>Volunteer</Subtle>
              {email && <Subtle>{email}</Subtle>}
            </div>
          </div>
        </Card>

        {/* Range chips */}
        <div className="md:col-span-2 -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="flex gap-2">
            {RANGES.map((r, i) => (
              <ChipFilter key={r} active={i === 0}>
                {r}
              </ChipFilter>
            ))}
          </div>
        </div>

        {/* Stats — placeholder */}
        <StatCard label="My entries" value="0" />
        <StatCard label="Value logged" value="$0" emphasis />

        {/* Top categories card */}
        <Card className="md:col-span-1">
          <div className="mb-2" style={{ fontSize: 15, fontWeight: 600 }}>
            My top categories
          </div>
          <Subtle>Top categories appear here once you&apos;ve logged donations.</Subtle>
        </Card>

        {/* Recent entries (iPad column) */}
        <Card className="md:col-span-1">
          <div className="mb-2" style={{ fontSize: 15, fontWeight: 600 }}>
            Recent entries
          </div>
          <Subtle>Phase 2 wires GET /api/profile/me.</Subtle>
        </Card>

        {/* Settings rows */}
        <Card className="md:col-span-2 flex flex-col gap-1" padded={false}>
          <button className="flex items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50">
            <span style={{ fontSize: 15, fontWeight: 500 }}>Account &amp; email</span>
            <Subtle>›</Subtle>
          </button>
          <div className="h-px" style={{ background: "var(--border-default)" }} />
          <button className="flex items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50">
            <span style={{ fontSize: 15, fontWeight: 500 }}>Notifications</span>
            <Subtle>On ›</Subtle>
          </button>
        </Card>

        <div className="md:col-span-2">
          <SecondaryButton
            type="button"
            fullWidth
            style={{ borderColor: "var(--error)", color: "var(--error)" }}
          >
            Sign out
          </SecondaryButton>
        </div>
      </div>
    </>
  );
}
