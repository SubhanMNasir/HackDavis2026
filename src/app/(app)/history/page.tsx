"use client";

// History — read-only audit feed (GET /api/events) bucketed by Pacific date
// with Today / Yesterday / older sections. Editing/deleting donations is
// done from the Quick Pick / Review screens before saving — once an entry
// lands in History it's immutable.
// Per wellspring-build-brief.md §Screen 9.

import * as React from "react";
import type { AuditEvent } from "@/lib/types";
import {
  Avatar,
  Card,
  EmptyState,
  History as HistoryGlyph,
  IconButton,
  ListItem,
  PageHeader,
  PrimaryButton,
  Subtle,
  TextInput,
  Toast,
  TopAppBar,
} from "../../components/wellspring/shared";
import { apiClient, ApiClientError } from "../../lib/api-client";
import { toastForCode } from "../../lib/error-toast-map";
import { APP_TZ } from "@/lib/timezone";
import { formatDisplayName } from "@/lib/format-name";

// ---------- Pacific date helpers ----------

/** YYYY-MM-DD in Pacific for a given Date. */
function pacificDateKey(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

/** Add days to a YYYY-MM-DD Pacific date string. */
function addDaysToPacificKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** "May 7" — Pacific month + day, no year. */
function pacificMonthDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    month: "short",
    day: "numeric",
  }).format(d);
}

/** "3:45 PM" — Pacific time. */
function pacificClock(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

interface Bucket {
  key: string;
  label: string;
  events: AuditEvent[];
}

// ---------- Page ----------

export default function HistoryPage() {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    apiClient
      .getEvents(
        { from: from.toISOString(), to: now.toISOString(), limit: 100 },
        ac.signal,
      )
      .then((evs) => {
        setEvents(evs);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setLoading(false);
        if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code));
        else setErrorToast(toastForCode("INTERNAL"));
      });
    return () => ac.abort();
  }, []);

  // Free-text filter — case-insensitive substring on the pre-formatted
  // summary plus actor/target labels. Cheap, runs on every keystroke.
  const filteredEvents = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) => {
      const haystack = `${ev.summary} ${ev.actorName} ${ev.targetLabel}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [events, query]);

  // ---- Bucketing ----
  const buckets = React.useMemo<Bucket[]>(() => {
    if (filteredEvents.length === 0) return [];
    const todayKey = pacificDateKey(new Date());
    const yesterdayKey = addDaysToPacificKey(todayKey, -1);
    const labelFor = (key: string, sample: Date) => {
      if (key === todayKey) return "Today";
      if (key === yesterdayKey) return "Yesterday";
      return pacificMonthDay(sample);
    };
    const map = new Map<string, Bucket>();
    for (const ev of filteredEvents) {
      const dt = new Date(ev.createdAt);
      const key = pacificDateKey(dt);
      if (!map.has(key)) {
        map.set(key, { key, label: labelFor(key, dt), events: [] });
      }
      map.get(key)!.events.push(ev);
    }
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [filteredEvents]);

  return (
    <>
      <div className="md:hidden">
        <TopAppBar
          title="History"
          right={<IconButton icon={HistoryGlyph} ariaLabel="Filter" />}
        />
      </div>
      <div className="hidden md:block">
        <PageHeader
          title="History"
          subtitle="Every donation, category change, and edit."
          right={
            <div className="flex items-center gap-2">
              <TextInput
                placeholder="Search activity…"
                className="w-[280px]"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          }
        />
      </div>

      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-4 py-4 md:px-6">
        {errorToast && (
          <Toast tone="error" onDismiss={() => setErrorToast(null)}>
            {errorToast}
          </Toast>
        )}

        {/* Mobile-only search (iPad has the input in the page header). */}
        <div className="md:hidden">
          <TextInput
            placeholder="Search activity…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <Card className="flex items-center justify-center py-10">
            <Subtle>Loading activity…</Subtle>
          </Card>
        ) : buckets.length === 0 ? (
          query.trim() ? (
            <EmptyState
              icon={HistoryGlyph}
              title="No matches"
              body={`Nothing in your activity matches “${query.trim()}”.`}
            />
          ) : (
            <EmptyState
              icon={HistoryGlyph}
              title="No donations yet"
              body="Log your first one to see it here."
              action={
                <PrimaryButton type="button" fullWidth={false} onClick={() => (window.location.href = "/log")}>
                  Log a donation
                </PrimaryButton>
              }
            />
          )
        ) : (
          <div className="flex flex-col gap-4">
            {buckets.map((b) => (
              <section key={b.key} className="flex flex-col gap-2">
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    letterSpacing: 0.2,
                    textTransform: "uppercase",
                    paddingInline: 4,
                  }}
                >
                  {b.label}
                </div>
                <Card padded={false}>
                  {b.events.map((ev, i) => (
                    <React.Fragment key={ev.id}>
                      {i > 0 && (
                        <div
                          className="h-px"
                          style={{ background: "var(--border-default)" }}
                          aria-hidden
                        />
                      )}
                      <ListItem
                        leading={<Avatar name={ev.actorName} size={36} />}
                        title={ev.summary}
                        subtitle={
                          <span>
                            {formatDisplayName(ev.actorName)} · {pacificClock(new Date(ev.createdAt))}
                          </span>
                        }
                      />
                    </React.Fragment>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
