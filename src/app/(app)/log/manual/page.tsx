"use client";

// Manual Entry — Phase 2: full submit wiring against POST /api/donations.
// Per wellspring-build-brief.md §Screen 6.

import * as React from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem, Category, Program, Unit } from "@/lib/types";
import {
  Card,
  Field,
  GhostButton,
  MoneyInput,
  NewCategoryModal,
  NumberInput,
  PageHeader,
  Plus,
  PrimaryButton,
  Segmented,
  Select,
  Subtle,
  TextInput,
  Textarea,
  Toast,
  TopAppBar,
} from "../../../components/wellspring/shared";
import {
  apiClient,
  ApiClientError,
  type CreateDonationItem,
} from "../../../lib/api-client";
import { toastForCode } from "../../../lib/error-toast-map";
import { APP_TZ } from "@/lib/timezone";

const UNIT_OPTIONS: ReadonlyArray<{ value: Unit; label: string }> = [
  { value: "count", label: "Count" },
  { value: "lbs", label: "Lbs" },
] as const;

/** Today's date (YYYY-MM-DD) computed in Pacific. */
function todayPacificIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA gives YYYY-MM-DD directly.
  return fmt.format(new Date());
}

/**
 * Convert a YYYY-MM-DD string (interpreted as a date in Pacific) to UTC ISO of
 * Pacific 00:00 on that day. We compute the Pacific TZ offset for that calendar
 * date so DST transitions are handled correctly.
 */
function pacificDateToUtcIso(dateOnly: string): string {
  // Parse YYYY-MM-DD parts.
  const [yStr, mStr, dStr] = dateOnly.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error("Invalid date");
  }

  // Step 1: pretend the parts are UTC midnight.
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);

  // Step 2: ask Intl what time that UTC instant is in Pacific. The delta tells
  // us how to shift to make the Pacific clock read 00:00 of (y,m,d).
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
  if (ph === 24) ph = 0; // some browsers report 24 instead of 00
  const pmin = get("minute");
  const psec = get("second");
  const pacificAsUtc = Date.UTC(py, pm - 1, pd, ph, pmin, psec);
  const offsetMs = pacificAsUtc - utcGuess; // Pacific's UTC offset (negative for PST/PDT)
  // Pacific midnight in UTC = utcGuess - offset (since offset is the amount Pacific is behind/ahead of UTC).
  return new Date(utcGuess - offsetMs).toISOString();
}

export default function ManualEntryPage() {
  const router = useRouter();

  const [programs, setPrograms] = React.useState<Program[]>(
    () => apiClient.getCachedPrograms() ?? [],
  );
  const [categories, setCategories] = React.useState<Category[]>(
    () => apiClient.getCachedCategories() ?? [],
  );
  const [items, setItems] = React.useState<CatalogItem[]>([]);

  const [errorToast, setErrorToast] = React.useState<string | null>(null);
  const [successToast, setSuccessToast] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [loadingCatalog, setLoadingCatalog] = React.useState(true);
  const [showNewCategory, setShowNewCategory] = React.useState(false);

  // Form state
  const [itemName, setItemName] = React.useState("");
  const [programId, setProgramId] = React.useState<string>("");
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [itemId, setItemId] = React.useState<string | null>(null);
  const [quantity, setQuantity] = React.useState<string>("1");
  const [unit, setUnit] = React.useState<Unit>("count");
  const [estimatedValue, setEstimatedValue] = React.useState<string>("");
  const [donatedAt, setDonatedAt] = React.useState<string>(todayPacificIso());
  const [notes, setNotes] = React.useState<string>("");

  React.useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      apiClient.getPrograms(ac.signal),
      apiClient.getCategories({ active: true }, ac.signal),
      apiClient.getCatalog({ active: true }, ac.signal),
    ])
      .then(([prgs, cats, its]) => {
        setPrograms(prgs);
        setCategories(cats);
        setItems(its);
        apiClient.warmCache({ programs: prgs, categories: cats });
        setLoadingCatalog(false);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setLoadingCatalog(false);
        if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code));
        else setErrorToast(toastForCode("INTERNAL"));
      });
    return () => ac.abort();
  }, []);

  // Categories filtered by selected program.
  const filteredCategories = React.useMemo(() => {
    if (!programId) return categories;
    return categories.filter((c) => c.programId === programId);
  }, [categories, programId]);

  // Items filtered by selected category.
  const filteredItems = React.useMemo(() => {
    if (!categoryId) return items;
    return items.filter((it) => it.categoryId === categoryId);
  }, [items, categoryId]);

  // When program changes, reset category + item if they no longer belong.
  React.useEffect(() => {
    if (!programId || !categoryId) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat && cat.programId !== programId) {
      setCategoryId("");
      setItemId(null);
    }
  }, [programId, categoryId, categories]);

  // When category changes, prefill default unit + clear stale item selection.
  React.useEffect(() => {
    if (!categoryId) {
      setItemId(null);
      return;
    }
    const cat = categories.find((c) => c.id === categoryId);
    if (cat) setUnit(cat.defaultUnit);
    // Clear item selection if it no longer belongs to this category.
    if (itemId) {
      const it = items.find((i) => i.id === itemId);
      if (!it || it.categoryId !== categoryId) setItemId(null);
    }
  }, [categoryId, categories, items, itemId]);

  // Resolve typed itemName against the catalog so we set itemId where possible.
  React.useEffect(() => {
    if (!itemName.trim() || !categoryId) return;
    const exact = items.find(
      (it) => it.categoryId === categoryId && it.name.toLowerCase() === itemName.trim().toLowerCase(),
    );
    setItemId(exact ? exact.id : null);
    if (exact && unit !== exact.defaultUnit) {
      setUnit(exact.defaultUnit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemName, items, categoryId]);

  const isValid = (() => {
    if (!itemName.trim()) return false;
    if (!programId) return false;
    if (!categoryId) return false;
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) return false;
    if (unit === "count" && !Number.isInteger(q)) return false;
    const v = Number(estimatedValue);
    if (!Number.isFinite(v) || v < 0) return false;
    if (!donatedAt) return false;
    return true;
  })();

  const handleSubmit = async () => {
    if (submitting) return;
    setErrorToast(null);
    if (!isValid) {
      setErrorToast("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    const payload: CreateDonationItem = {
      itemId,
      itemName: itemName.trim(),
      categoryId,
      quantity: Number(quantity),
      unit,
      estimatedValue: Number(estimatedValue),
      source: "manual",
      photoUrl: null,
      notes: notes.trim() || null,
      donatedAt: pacificDateToUtcIso(donatedAt),
    };
    try {
      await apiClient.createDonations([payload]);
      setSuccessToast("Donation logged");
      router.push("/log");
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorToast(toastForCode(err.code, err.message));
      } else {
        setErrorToast(toastForCode("INTERNAL"));
      }
      setSubmitting(false);
    }
  };

  const handleNewCategoryCreated = (cat: Category) => {
    apiClient.invalidateCategoriesCache();
    setCategories((prev) => {
      // Replace if exists, else prepend
      const existing = prev.findIndex((c) => c.id === cat.id);
      if (existing >= 0) {
        const copy = prev.slice();
        copy[existing] = cat;
        return copy;
      }
      return [...prev, cat].sort((a, b) => a.name.localeCompare(b.name));
    });
    setProgramId(cat.programId);
    setCategoryId(cat.id);
    setUnit(cat.defaultUnit);
  };

  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Manual entry" back={{ href: "/log" }} />
      </div>
      <div className="hidden md:block">
        <PageHeader
          title="Manual entry"
          subtitle="Type a donation in yourself."
          right={
            <PrimaryButton
              type="button"
              fullWidth={false}
              onClick={handleSubmit}
              disabled={!isValid || submitting}
            >
              {submitting ? "Saving…" : "Save"}
            </PrimaryButton>
          }
        />
      </div>

      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-4 md:px-6">
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

        <Card className="flex flex-col gap-4">
          {loadingCatalog && programs.length === 0 && <Subtle>Loading form…</Subtle>}

          <Field label="Item name" required>
            <TextInput
              list="manual-item-suggestions"
              placeholder="e.g. Canned Black Beans"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
            />
            <datalist id="manual-item-suggestions">
              {filteredItems.map((it) => (
                <option key={it.id} value={it.name} />
              ))}
            </datalist>
          </Field>

          <Field label="Program" required>
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">Select a program…</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category" required>
            <div className="flex flex-col gap-2">
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={programs.length === 0}
              >
                <option value="">Select a category…</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <GhostButton
                type="button"
                onClick={() => setShowNewCategory(true)}
                className="self-start"
              >
                <Plus size={14} strokeWidth={1.75} />
                <span>New category</span>
              </GhostButton>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" required>
              <NumberInput
                min={0}
                step={unit === "count" ? 1 : 0.1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>

            <Field label="Unit">
              <Segmented ariaLabel="Unit" options={UNIT_OPTIONS} value={unit} onChange={setUnit} />
            </Field>
          </div>

          <Field label="Estimated value" required>
            <MoneyInput
              placeholder="0.00"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
            />
          </Field>

          <Field label="Date received" required>
            <TextInput
              type="date"
              value={donatedAt}
              onChange={(e) => setDonatedAt(e.target.value)}
            />
          </Field>

          <Field label="Notes" hint="Optional">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {/* Mobile sticky save */}
          <div className="md:hidden">
            <PrimaryButton type="button" onClick={handleSubmit} disabled={!isValid || submitting}>
              {submitting ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </Card>
      </div>

      <NewCategoryModal
        isOpen={showNewCategory}
        onClose={() => setShowNewCategory(false)}
        programs={programs}
        defaultProgramId={programId || undefined}
        onCreated={handleNewCategoryCreated}
      />
    </>
  );
}
