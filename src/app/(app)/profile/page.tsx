"use client";

// Profile — Phase 2: range chips + GET /api/profile/me aggregations.
// Per wellspring-build-brief.md §Screen 10.

import * as React from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import type { ProfileResponse } from "@/lib/types";
import {
  Avatar,
  Card,
  ChipFilter,
  PageHeader,
  SecondaryButton,
  StatCard,
  Subtle,
  TextInput,
  Toast,
  TopAppBar,
} from "../../components/wellspring/shared";
import { apiClient, ApiClientError } from "../../lib/api-client";
import { toastForCode } from "../../lib/error-toast-map";
import { APP_TZ } from "@/lib/timezone";
import { formatDisplayName } from "@/lib/format-name";

// ---------- Pacific helpers ----------

/** Parts of the current Pacific clock as numbers. */
function nowInPacific() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = fmt.format(new Date());
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

/**
 * Convert (year, month [1-12], day, hour, min, sec) interpreted in Pacific to a
 * UTC ISO. Mirrors the Pacific-offset computation used elsewhere.
 */
function pacificClockToUtcIso(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
): string {
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcGuess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const py = get("year");
  const pm = get("month");
  const pd = get("day");
  let ph = get("hour");
  if (ph === 24) ph = 0;
  const pmin = get("minute");
  const psec = get("second");
  const pacificAsUtc = Date.UTC(py, pm - 1, pd, ph, pmin, psec);
  const offsetMs = pacificAsUtc - utcGuess;
  return new Date(utcGuess - offsetMs).toISOString();
}

/** YYYY-MM-DD for an HTML date input, computed in Pacific. */
function pacificIsoDate(): string {
  const { y, m, d } = nowInPacific();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---------- Range presets ----------

type RangeKey = "today" | "this_week" | "this_month" | "this_year" | "all" | "custom";

interface Range {
  from: string;
  to: string;
}

function rangeFor(key: Exclude<RangeKey, "custom">): Range {
  const { y, m, d } = nowInPacific();
  const nowIso = new Date().toISOString();
  switch (key) {
    case "today": {
      return { from: pacificClockToUtcIso(y, m, d, 0, 0, 0), to: nowIso };
    }
    case "this_week": {
      // Monday-start week. Compute weekday in Pacific via Intl.
      const weekdayFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: APP_TZ,
        weekday: "short",
      });
      const todayUtc = pacificClockToUtcIso(y, m, d, 12, 0, 0);
      const wk = weekdayFmt.format(new Date(todayUtc));
      const order: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
      const offset = order[wk] ?? 0;
      // Subtract `offset` days from (y,m,d) — using UTC arithmetic on the date.
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - offset);
      return {
        from: pacificClockToUtcIso(
          dt.getUTCFullYear(),
          dt.getUTCMonth() + 1,
          dt.getUTCDate(),
          0,
          0,
          0,
        ),
        to: nowIso,
      };
    }
    case "this_month":
      return { from: pacificClockToUtcIso(y, m, 1, 0, 0, 0), to: nowIso };
    case "this_year":
      return { from: pacificClockToUtcIso(y, 1, 1, 0, 0, 0), to: nowIso };
    case "all":
      return { from: "1970-01-01T00:00:00.000Z", to: nowIso };
  }
}

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  this_year: "This year",
  all: "All time",
  custom: "Custom",
};

// ---------- Page ----------

export default function ProfilePage() {
  const { user } = useUser();
  const clerk = useClerk();

  const fullName = React.useMemo(() => {
    if (!user) return null;
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null;
  }, [user]);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const displayName = formatDisplayName(fullName);

  const [rangeKey, setRangeKey] = React.useState<RangeKey>("this_month");
  const [customFrom, setCustomFrom] = React.useState<string>(pacificIsoDate());
  const [customTo, setCustomTo] = React.useState<string>(pacificIsoDate());
  const [showCustom, setShowCustom] = React.useState(false);

  const [profile, setProfile] = React.useState<ProfileResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);

  const activeRange: Range = React.useMemo(() => {
    if (rangeKey === "custom") {
      // Inclusive end-of-day for the `to` side.
      const [fy, fm, fd] = customFrom.split("-").map(Number);
      const [ty, tm, td] = customTo.split("-").map(Number);
      return {
        from: pacificClockToUtcIso(fy, fm, fd, 0, 0, 0),
        to: pacificClockToUtcIso(ty, tm, td, 23, 59, 59),
      };
    }
    return rangeFor(rangeKey);
  }, [rangeKey, customFrom, customTo]);

  React.useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    apiClient
      .getProfile({ from: activeRange.from, to: activeRange.to }, ac.signal)
      .then((r) => {
        setProfile(r);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setLoading(false);
        if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code));
        else setErrorToast(toastForCode("INTERNAL"));
      });
    return () => ac.abort();
  }, [activeRange.from, activeRange.to]);

  const handleSignOut = async () => {
    await clerk.signOut();
    window.location.href = "/sign-in";
  };

  const stats = profile?.stats ?? { entryCount: 0, totalValue: 0 };
  const topCategories = profile?.topCategories ?? [];
  const recentEntries = profile?.recentEntries ?? [];

  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Profile" />
      </div>
      <div className="hidden md:block">
        <PageHeader title="Profile" subtitle="Your shifts, contributions, and account." />
      </div>

      <div className="mx-auto grid w-full max-w-[1024px] gap-4 px-4 py-4 md:grid-cols-2 md:px-6">
        {errorToast && (
          <div className="md:col-span-2">
            <Toast tone="error" onDismiss={() => setErrorToast(null)}>
              {errorToast}
            </Toast>
          </div>
        )}

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
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((r) => (
              <ChipFilter
                key={r}
                active={rangeKey === r}
                onClick={() => {
                  setRangeKey(r);
                  setShowCustom(r === "custom");
                }}
              >
                {RANGE_LABELS[r]}
              </ChipFilter>
            ))}
          </div>
        </div>

        {showCustom && (
          <Card className="md:col-span-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span style={{ fontSize: 13, fontWeight: 500 }}>From</span>
              <TextInput
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span style={{ fontSize: 13, fontWeight: 500 }}>To</span>
              <TextInput
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </Card>
        )}

        {/* Stats */}
        <StatCard label="My entries" value={loading ? "…" : String(stats.entryCount)} />
        <StatCard
          label="Value logged"
          value={loading ? "…" : `$${stats.totalValue.toFixed(2)}`}
          emphasis
        />

        {/* Top categories card */}
        <Card className="md:col-span-1">
          <div className="mb-3" style={{ fontSize: 15, fontWeight: 600 }}>
            My top categories
          </div>
          {loading ? (
            <Subtle>Loading…</Subtle>
          ) : topCategories.length === 0 ? (
            <Subtle>Top categories appear here once you&apos;ve logged donations.</Subtle>
          ) : (
            <div className="flex flex-col gap-3">
              {topCategories.map((c) => (
                <div key={c.categoryName} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{c.categoryName}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                      {c.pct}% · ${c.totalValue.toFixed(2)}
                    </span>
                  </div>
                  <div
                    className="h-2 w-full rounded-full"
                    style={{ background: "#F1F5F9" }}
                    aria-hidden
                  >
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.max(2, Math.min(100, c.pct))}%`,
                        background:
                          "linear-gradient(90deg, var(--brand-green-dark), var(--brand-green))",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent entries (iPad column) */}
        <Card className="md:col-span-1">
          <div className="mb-3" style={{ fontSize: 15, fontWeight: 600 }}>
            Recent entries
          </div>
          {loading ? (
            <Subtle>Loading…</Subtle>
          ) : recentEntries.length === 0 ? (
            <Subtle>Your most recent donations show up here.</Subtle>
          ) : (
            <div className="flex flex-col gap-2">
              {recentEntries.map((e) => (
                <div
                  key={e.donationId}
                  className="flex items-center justify-between gap-3 rounded-[8px] py-2"
                >
                  <div className="flex flex-col min-w-0">
                    <span style={{ fontSize: 14, fontWeight: 500 }} className="truncate">
                      {e.itemName}
                    </span>
                    <Subtle>
                      {e.quantity} {e.unit} ·{" "}
                      {new Intl.DateTimeFormat("en-US", {
                        timeZone: APP_TZ,
                        month: "short",
                        day: "numeric",
                      }).format(new Date(e.donatedAt))}
                    </Subtle>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-green)" }}>
                    ${e.estimatedValue.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
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
            onClick={handleSignOut}
          >
            Sign out
          </SecondaryButton>
        </div>
      </div>
    </>
  );
}
