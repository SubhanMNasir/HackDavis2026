"use client";

// History — Phase 2: live audit feed (GET /api/events) bucketed by Pacific
// date with Today / Yesterday / older sections. Tapping your own
// donation.created event opens an edit/delete Sheet.
// Per wellspring-build-brief.md §Screen 9.

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import type { AuditEvent, Category, Donation, Unit } from "@/lib/types";
import {
  Avatar,
  Card,
  EmptyState,
  Field,
  History as HistoryGlyph,
  IconButton,
  ListItem,
  MoneyInput,
  NumberInput,
  PageHeader,
  PrimaryButton,
  Segmented,
  Select,
  Sheet,
  Subtle,
  Textarea,
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
  const { user } = useUser();
  const currentUserId = user?.id ?? null;

  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);
  const [successToast, setSuccessToast] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  // Sheet state — for editing one of *your* donation.created events.
  const [sheetEvent, setSheetEvent] = React.useState<AuditEvent | null>(null);
  const [sheetMode, setSheetMode] = React.useState<"actions" | "edit">("actions");
  const [editing, setEditing] = React.useState<Donation | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const [categories, setCategories] = React.useState<Category[]>(
    () => apiClient.getCachedCategories() ?? [],
  );

  const fetchEvents = React.useCallback(async (signal?: AbortSignal) => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const evs = await apiClient.getEvents(
      { from: from.toISOString(), to: now.toISOString(), limit: 100 },
      signal,
    );
    setEvents(evs);
  }, []);

  React.useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    fetchEvents(ac.signal)
      .then(() => setLoading(false))
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setLoading(false);
        if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code));
        else setErrorToast(toastForCode("INTERNAL"));
      });
    return () => ac.abort();
  }, [fetchEvents]);

  // Categories load (for the edit form's Category dropdown).
  React.useEffect(() => {
    if (categories.length > 0) return;
    apiClient
      .getCategories({ active: true })
      .then((cats) => {
        setCategories(cats);
        apiClient.warmCache({ categories: cats });
      })
      .catch(() => {
        /* non-fatal here; the dropdown just stays sparse */
      });
  }, [categories.length]);

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
    // Sort by key DESC.
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [filteredEvents]);

  // ---- Sheet helpers ----
  const isOwnDonationCreated = (ev: AuditEvent) =>
    ev.type === "donation.created" && currentUserId !== null && ev.actorId === currentUserId;

  const openSheet = (ev: AuditEvent) => {
    if (!isOwnDonationCreated(ev)) return;
    setSheetEvent(ev);
    setSheetMode("actions");
    setEditing(null);
    setConfirmingDelete(false);
  };

  const closeSheet = () => {
    if (savingEdit) return;
    setSheetEvent(null);
    setSheetMode("actions");
    setEditing(null);
    setConfirmingDelete(false);
  };

  const startEdit = async () => {
    if (!sheetEvent) return;
    // Fetch the donation row by listing recent donations and finding the one
    // matching targetId. Cheaper than a fresh GET /api/donations/:id route.
    try {
      // Use a wider window since the user might be editing an older entry.
      const allMine = await (
        await import("../../lib/api-client")
      ).listDonations({ mine: true, limit: 200 });
      const found = allMine.find((d) => d.id === sheetEvent.targetId);
      if (!found) {
        setErrorToast("That donation could no longer be found.");
        closeSheet();
        return;
      }
      setEditing(found);
      setSheetMode("edit");
    } catch (err) {
      if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code));
      else setErrorToast(toastForCode("INTERNAL"));
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    if (!Number.isFinite(editing.quantity) || editing.quantity <= 0) {
      setErrorToast("Quantity must be greater than zero.");
      return;
    }
    if (editing.unit === "count" && !Number.isInteger(editing.quantity)) {
      setErrorToast("Count items must use whole numbers.");
      return;
    }
    if (!Number.isFinite(editing.estimatedValue) || editing.estimatedValue < 0) {
      setErrorToast("Estimated value must be zero or more.");
      return;
    }
    setSavingEdit(true);
    try {
      await apiClient.updateDonation(editing.id, {
        quantity: editing.quantity,
        unit: editing.unit,
        estimatedValue: editing.estimatedValue,
        notes: editing.notes,
        categoryId: editing.categoryId,
      });
      setSuccessToast("Donation updated");
      closeSheet();
      await fetchEvents();
    } catch (err) {
      if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code, err.message));
      else setErrorToast(toastForCode("INTERNAL"));
    } finally {
      setSavingEdit(false);
    }
  };

  const submitDelete = async () => {
    if (!sheetEvent) return;
    setSavingEdit(true);
    try {
      await apiClient.deleteDonation(sheetEvent.targetId);
      setSuccessToast("Donation deleted");
      closeSheet();
      await fetchEvents();
    } catch (err) {
      if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code, err.message));
      else setErrorToast(toastForCode("INTERNAL"));
    } finally {
      setSavingEdit(false);
    }
  };

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
        {successToast && (
          <Toast tone="success" onDismiss={() => setSuccessToast(null)}>
            {successToast}
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
                        onClick={isOwnDonationCreated(ev) ? () => openSheet(ev) : undefined}
                      />
                    </React.Fragment>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Edit / delete sheet (only when we have an own donation.created event) */}
      <Sheet
        open={!!sheetEvent}
        onClose={closeSheet}
        title={sheetMode === "edit" ? "Edit donation" : sheetEvent?.targetLabel || "Donation"}
      >
        {sheetMode === "actions" && sheetEvent && (
          <div className="flex flex-col gap-2">
            <Subtle>{sheetEvent.summary}</Subtle>
            <PrimaryButton type="button" onClick={startEdit}>
              Edit
            </PrimaryButton>
            {!confirmingDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-[8px] px-4 py-3"
                style={{ color: "var(--error)", fontSize: 15, fontWeight: 500, border: "1px solid var(--error)" }}
              >
                Delete
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-[8px] p-3" style={{ border: "1px solid var(--error)" }}>
                <Subtle>Delete this donation? This cannot be undone.</Subtle>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="flex-1 rounded-[8px] px-3 py-2"
                    style={{ border: "1px solid var(--border-default)", fontSize: 14, fontWeight: 500 }}
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitDelete}
                    className="flex-1 rounded-[8px] px-3 py-2"
                    style={{
                      background: "var(--error)",
                      color: "white",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                    disabled={savingEdit}
                  >
                    {savingEdit ? "Deleting…" : "Confirm delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {sheetMode === "edit" && editing && (
          <div className="flex flex-col gap-3">
            <Subtle>{editing.itemName}</Subtle>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity">
                <NumberInput
                  min={0}
                  step={editing.unit === "count" ? 1 : 0.1}
                  value={editing.quantity}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setEditing({ ...editing, quantity: Number.isFinite(n) ? n : 0 });
                  }}
                />
              </Field>
              <Field label="Unit">
                <Segmented<Unit>
                  ariaLabel="Unit"
                  options={[
                    { value: "count", label: "Count" },
                    { value: "lbs", label: "Lbs" },
                  ]}
                  value={editing.unit}
                  onChange={(u) => setEditing({ ...editing, unit: u })}
                />
              </Field>
            </div>

            <Field label="Estimated value">
              <MoneyInput
                value={editing.estimatedValue}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setEditing({ ...editing, estimatedValue: Number.isFinite(n) ? n : 0 });
                }}
              />
            </Field>

            <Field label="Category">
              <Select
                value={editing.categoryId}
                onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}
              >
                {categories.length === 0 && <option value={editing.categoryId}>{editing.categoryName}</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Notes" hint="Optional">
              <Textarea
                rows={3}
                value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </Field>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeSheet}
                className="flex-1 rounded-[8px] px-3 py-2.5"
                style={{ border: "1px solid var(--border-default)", fontSize: 14, fontWeight: 500 }}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <PrimaryButton type="button" onClick={submitEdit} disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
