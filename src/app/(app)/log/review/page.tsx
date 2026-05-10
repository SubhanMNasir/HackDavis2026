"use client";

// AI Review — Phase 3: editable rows + save bar + inline new category.
// Per wellspring-build-brief.md §Screen 4 and CONTRACTS §6.

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Category, Program, RecognizedItem, Unit } from "@/lib/types";
import {
  AlertTriangle,
  Camera,
  Card,
  CategoryPill,
  Check,
  ChevronRight,
  EmptyState,
  Field,
  Minus,
  NewCategoryModal,
  NumberInput,
  PageHeader,
  Plus,
  PrimaryButton,
  Subtle,
  Toast,
  TopAppBar,
  X,
} from "../../../components/wellspring/shared";
import {
  apiClient,
  ApiClientError,
  type CreateDonationItem,
} from "../../../lib/api-client";
import { toastForCode } from "../../../lib/error-toast-map";

const STORAGE_KEY = "wellspring:recognized";

interface SessionPayload {
  items: RecognizedItem[];
  photoDataUrl: string;
  capturedAt: string;
}

interface RowState {
  rowId: string;
  itemId: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string;
  programName: string | null;
  quantity: number;
  unit: Unit;
  estimatedValue: number;
  matched: boolean;
  warning?: "not_in_catalog";
  /** Original snapshot for "Edited" detection. */
  initial: {
    categoryId: string | null;
    quantity: number;
    unit: Unit;
    estimatedValue: number;
  };
  deleted: boolean;
}

function makeRowId() {
  return `r_${Math.random().toString(36).slice(2, 10)}`;
}

function fromRecognized(item: RecognizedItem): RowState {
  return {
    rowId: makeRowId(),
    itemId: item.itemId,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    programName: item.programName,
    quantity: item.suggestedQuantity,
    unit: item.unit,
    estimatedValue: item.estimatedValue,
    matched: item.matched,
    warning: item.warning,
    initial: {
      categoryId: item.categoryId,
      quantity: item.suggestedQuantity,
      unit: item.unit,
      estimatedValue: item.estimatedValue,
    },
    deleted: false,
  };
}

function isDirty(r: RowState): boolean {
  return (
    r.categoryId !== r.initial.categoryId ||
    r.quantity !== r.initial.quantity ||
    r.unit !== r.initial.unit ||
    r.estimatedValue !== r.initial.estimatedValue
  );
}

export default function AiReviewPage() {
  const router = useRouter();

  const [hydrated, setHydrated] = React.useState(false);
  const [photoDataUrl, setPhotoDataUrl] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<RowState[]>([]);

  const [programs, setPrograms] = React.useState<Program[]>(
    () => apiClient.getCachedPrograms() ?? [],
  );
  const [categories, setCategories] = React.useState<Category[]>(
    () => apiClient.getCachedCategories() ?? [],
  );
  const [categoriesLoading, setCategoriesLoading] = React.useState(true);

  const [errorToast, setErrorToast] = React.useState<string | null>(null);
  const [successToast, setSuccessToast] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  // Which row's "+ New category" was clicked (so we can autoselect the result).
  const [newCategoryRowId, setNewCategoryRowId] = React.useState<string | null>(null);

  // Hydrate from sessionStorage on mount.
  React.useEffect(() => {
    let cancelled = false;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        router.replace("/log/photo");
        return;
      }
      const parsed = JSON.parse(raw) as SessionPayload;
      if (!parsed?.items?.length) {
        router.replace("/log/photo");
        return;
      }
      if (!cancelled) {
        setRows(parsed.items.map(fromRecognized));
        setPhotoDataUrl(parsed.photoDataUrl ?? null);
        setHydrated(true);
      }
    } catch {
      router.replace("/log/photo");
    }
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Categories + programs load.
  React.useEffect(() => {
    const ac = new AbortController();
    setCategoriesLoading(true);
    Promise.all([
      apiClient.getPrograms(ac.signal),
      apiClient.getCategories({ active: true }, ac.signal),
    ])
      .then(([prgs, cats]) => {
        setPrograms(prgs);
        setCategories(cats);
        apiClient.warmCache({ programs: prgs, categories: cats });
        setCategoriesLoading(false);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setCategoriesLoading(false);
        if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code));
        else setErrorToast(toastForCode("INTERNAL"));
      });
    return () => ac.abort();
  }, []);

  const visibleRows = React.useMemo(() => rows.filter((r) => !r.deleted), [rows]);
  const totalValue = React.useMemo(
    () => visibleRows.reduce((s, r) => s + (Number.isFinite(r.estimatedValue) ? r.estimatedValue : 0), 0),
    [visibleRows],
  );

  const updateRow = (rowId: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const deleteRow = (rowId: string) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, deleted: true } : r)));
  };

  const handleSelectCategory = (rowId: string, cat: Category) => {
    updateRow(rowId, {
      categoryId: cat.id,
      categoryName: cat.name,
      programName: cat.programName,
    });
  };

  const handleNewCategoryCreated = (cat: Category) => {
    apiClient.invalidateCategoriesCache();
    setCategories((prev) => {
      if (prev.some((c) => c.id === cat.id)) return prev;
      return [...prev, cat].sort((a, b) => a.name.localeCompare(b.name));
    });
    if (newCategoryRowId) {
      handleSelectCategory(newCategoryRowId, cat);
    }
    setNewCategoryRowId(null);
  };

  const handleSaveAll = async () => {
    if (submitting) return;
    setErrorToast(null);

    if (visibleRows.length === 0) {
      setErrorToast("Add at least one item before saving.");
      return;
    }

    for (const r of visibleRows) {
      if (!r.categoryId) {
        setErrorToast("Pick a category for every item");
        return;
      }
      if (!Number.isFinite(r.quantity) || r.quantity <= 0) {
        setErrorToast("Each item needs a quantity greater than zero.");
        return;
      }
      if (r.unit === "count" && !Number.isInteger(r.quantity)) {
        setErrorToast("Count items must use whole numbers.");
        return;
      }
      if (!Number.isFinite(r.estimatedValue) || r.estimatedValue < 0) {
        setErrorToast("Each item needs a valid estimated value.");
        return;
      }
    }

    setSubmitting(true);
    const payload: CreateDonationItem[] = visibleRows.map((r) => ({
      itemId: r.itemId,
      itemName: r.name,
      categoryId: r.categoryId as string,
      quantity: r.quantity,
      unit: r.unit,
      estimatedValue: r.estimatedValue,
      source: "photo_ai",
      photoUrl: null,
      notes: null,
    }));

    try {
      const res = await apiClient.createDonations(payload);
      sessionStorage.removeItem(STORAGE_KEY);
      const created = res.createdCount;
      setSuccessToast(`Saved ${created} donation${created === 1 ? "" : "s"}`);
      router.push("/history");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiClientError) {
        setErrorToast(toastForCode(err.code, err.message));
      } else {
        setErrorToast(toastForCode("INTERNAL"));
      }
    }
  };

  const handleDiscard = () => {
    if (visibleRows.length > 0 && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    router.push("/log");
  };

  const matchedCount = visibleRows.length;
  const dollars = totalValue.toFixed(2);
  const showStickyBar = visibleRows.length > 0;

  if (!hydrated) {
    return (
      <Card className="m-4 flex items-center justify-center py-10">
        <Subtle>Loading review…</Subtle>
      </Card>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <TopAppBar
          title="Review items"
          back={{ href: "/log" }}
          right={
            <PrimaryButton
              type="button"
              fullWidth={false}
              className="px-3 py-1.5"
              onClick={handleSaveAll}
              disabled={submitting || visibleRows.length === 0}
            >
              <span style={{ fontSize: 13 }}>
                {submitting ? "Saving…" : `Save ${visibleRows.length}`}
              </span>
            </PrimaryButton>
          }
        />
      </div>
      <div className="hidden md:block">
        <PageHeader
          title="Review items"
          subtitle="Tweak quantities, fix categories, then save the batch."
          right={
            <PrimaryButton
              type="button"
              fullWidth={false}
              onClick={handleSaveAll}
              disabled={submitting || visibleRows.length === 0}
            >
              {submitting ? "Saving…" : `Save all · $${dollars}`}
            </PrimaryButton>
          }
        />
      </div>

      <div className={`mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-4 py-4 md:px-6 ${showStickyBar ? "pb-28 md:pb-32" : ""}`}>
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

        {/* Captured photo strip */}
        <div
          className="rounded-[12px] overflow-hidden"
          style={{
            height: 60,
            background: photoDataUrl
              ? `center / cover no-repeat url(${JSON.stringify(photoDataUrl)})`
              : "linear-gradient(160deg, #1F4D08, #2A6B0A 50%, #39900E)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingInline: 16,
            fontSize: 13,
            fontWeight: 500,
            position: "relative",
          }}
        >
          {!photoDataUrl && <span>No photo</span>}
        </div>

        {/* AI match banner */}
        <div
          className="flex items-center gap-2 rounded-[12px] px-3 py-2"
          style={{
            background: "#F7FEE7",
            border: "1px solid #D9F99D",
            color: "#2A6B0A",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <Check size={16} strokeWidth={1.75} />
          <span>
            AI found {matchedCount} item{matchedCount === 1 ? "" : "s"} — review and edit before saving.
          </span>
        </div>

        {visibleRows.length === 0 ? (
          <EmptyState
            icon={Camera}
            title="No items to review"
            body="All items were removed. Take a new photo to start over."
            action={
              <PrimaryButton type="button" fullWidth={false} onClick={() => router.push("/log/photo")}>
                Take new photo
              </PrimaryButton>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => {
              if (r.deleted) return null;
              return (
                <ReviewRowCard
                  key={r.rowId}
                  row={r}
                  categories={categories}
                  categoriesLoading={categoriesLoading}
                  onChangeCategory={(cat) => handleSelectCategory(r.rowId, cat)}
                  onChangeQuantity={(n) => updateRow(r.rowId, { quantity: n })}
                  onChangeUnit={(u) => updateRow(r.rowId, { unit: u })}
                  onChangeValue={(v) => updateRow(r.rowId, { estimatedValue: v })}
                  onDelete={() => deleteRow(r.rowId)}
                  onOpenNewCategory={() => setNewCategoryRowId(r.rowId)}
                />
              );
            })}
          </div>
        )}

        {confirmDiscard && (
          <Card padded style={{ border: "1px solid var(--error)" }}>
            <div className="flex flex-col gap-2">
              <Subtle>Discard the recognized items? This can&apos;t be undone.</Subtle>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="flex-1 rounded-[8px] px-3 py-2"
                  style={{ border: "1px solid var(--border-default)", fontSize: 14, fontWeight: 500 }}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="flex-1 rounded-[8px] px-3 py-2"
                  style={{ background: "var(--error)", color: "white", fontSize: 14, fontWeight: 500 }}
                >
                  Discard
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Sticky save/discard footer */}
      {showStickyBar && (
        <div
          className="fixed inset-x-0 z-30 bg-white px-4 py-3 md:left-60"
          style={{ borderTop: "1px solid var(--border-default)", bottom: 0 }}
        >
          <div className="mx-auto flex w-full max-w-[1024px] items-center justify-between gap-3">
            <div className="flex flex-col">
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {visibleRows.length} item{visibleRows.length === 1 ? "" : "s"} ·{" "}
                <span style={{ color: "var(--brand-green)" }}>${dollars}</span>
              </span>
              <Subtle>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="underline"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Discard
                </button>
              </Subtle>
            </div>
            <PrimaryButton
              type="button"
              fullWidth={false}
              onClick={handleSaveAll}
              disabled={submitting || visibleRows.length === 0}
            >
              {submitting ? "Saving…" : `Save all · $${dollars}`}
            </PrimaryButton>
          </div>
        </div>
      )}

      <NewCategoryModal
        isOpen={newCategoryRowId !== null}
        onClose={() => setNewCategoryRowId(null)}
        programs={programs}
        defaultProgramId={undefined}
        onCreated={handleNewCategoryCreated}
      />
    </>
  );
}

// ---------- Per-row card ----------

function ReviewRowCard({
  row,
  categories,
  categoriesLoading,
  onChangeCategory,
  onChangeQuantity,
  onChangeUnit,
  onChangeValue,
  onDelete,
  onOpenNewCategory,
}: {
  row: RowState;
  categories: Category[];
  categoriesLoading: boolean;
  onChangeCategory: (cat: Category) => void;
  onChangeQuantity: (n: number) => void;
  onChangeUnit: (u: Unit) => void;
  onChangeValue: (v: number) => void;
  onDelete: () => void;
  onOpenNewCategory: () => void;
}) {
  const dirty = isDirty(row);
  const notInCatalog = row.warning === "not_in_catalog";

  return (
    <Card className="flex flex-col gap-3">
      {/* Row 1: name + chips + delete */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{row.name}</span>
          <div className="flex flex-wrap items-center gap-2">
            <CategoryDropdown
              row={row}
              categories={categories}
              loading={categoriesLoading}
              onSelect={onChangeCategory}
              onOpenNewCategory={onOpenNewCategory}
            />
            {notInCatalog && (
              <CategoryPill tone="red" icon={AlertTriangle}>
                Not in catalog
              </CategoryPill>
            )}
            {dirty && <CategoryPill tone="amber">Edited</CategoryPill>}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove item"
          className="-m-1 rounded-[8px] p-2 transition hover:bg-slate-100"
          style={{ color: "var(--text-secondary)" }}
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      {/* Row 2: stepper + unit + value */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Quantity">
          <div
            className="inline-flex items-center rounded-[8px]"
            style={{ border: "1px solid var(--border-default)" }}
          >
            <button
              type="button"
              onClick={() => {
                const step = row.unit === "count" ? 1 : 0.1;
                const next = +(row.quantity - step).toFixed(1);
                onChangeQuantity(Math.max(step, next));
              }}
              className="px-3 py-2"
              aria-label="Decrease quantity"
            >
              <Minus size={16} strokeWidth={1.5} color="var(--text-secondary)" />
            </button>
            <input
              type="number"
              min={0}
              step={row.unit === "count" ? 1 : 0.1}
              value={row.quantity}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChangeQuantity(Number.isFinite(n) ? n : 0);
              }}
              className="w-16 px-1 py-2 text-center tabular-nums outline-none"
              style={{ fontSize: 14, fontWeight: 500 }}
            />
            <button
              type="button"
              onClick={() => {
                const step = row.unit === "count" ? 1 : 0.1;
                onChangeQuantity(+(row.quantity + step).toFixed(1));
              }}
              className="px-3 py-2"
              aria-label="Increase quantity"
            >
              <Plus size={16} strokeWidth={1.5} color="var(--text-secondary)" />
            </button>
          </div>
        </Field>

        <Field label="Unit">
          <select
            value={row.unit}
            onChange={(e) => onChangeUnit(e.target.value as Unit)}
            className="rounded-[8px] bg-white px-3 py-2.5 outline-none"
            style={{
              border: "1px solid var(--border-default)",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            <option value="count">count</option>
            <option value="lbs">lbs</option>
          </select>
        </Field>

        <Field label="Value">
          <div className="relative">
            <span
              aria-hidden
              className="absolute inset-y-0 left-3 flex items-center"
              style={{ color: "var(--text-secondary)", fontSize: 14 }}
            >
              $
            </span>
            <NumberInput
              min={0}
              step={0.01}
              value={row.estimatedValue}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChangeValue(Number.isFinite(n) ? n : 0);
              }}
              className="pl-7"
              style={{ width: 110 }}
            />
          </div>
        </Field>
      </div>
    </Card>
  );
}

// ---------- Category dropdown (custom popover with grouped items + footer link) ----------

function CategoryDropdown({
  row,
  categories,
  loading,
  onSelect,
  onOpenNewCategory,
}: {
  row: RowState;
  categories: Category[];
  loading: boolean;
  onSelect: (cat: Category) => void;
  onOpenNewCategory: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Group by program for display.
  const grouped = React.useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      const key = c.programName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).map(([programName, cats]) => ({
      programName,
      cats: cats.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [categories]);

  const tone = row.categoryId ? "green" : "red";
  const labelText = row.categoryName || "Pick category";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 transition"
        style={{
          background: tone === "green" ? "var(--brand-tint)" : "#FEE2E2",
          color: tone === "green" ? "var(--brand-green-dark)" : "#B91C1C",
          border: tone === "green" ? "1px solid var(--brand-border)" : "1px solid #FECACA",
          fontSize: 12,
          fontWeight: 500,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="max-w-[180px] truncate">{labelText}</span>
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1 w-[280px] overflow-hidden rounded-[10px] bg-white"
          style={{
            border: "1px solid var(--border-default)",
            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.14)",
          }}
          role="listbox"
        >
          <div className="max-h-[280px] overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-2">
                <Subtle>Loading categories…</Subtle>
              </div>
            ) : grouped.length === 0 ? (
              <div className="px-3 py-2">
                <Subtle>No categories yet.</Subtle>
              </div>
            ) : (
              grouped.map((g) => (
                <div key={g.programName} className="py-1">
                  <div
                    className="px-3 py-1"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {g.programName}
                  </div>
                  {g.cats.map((c) => {
                    const active = c.id === row.categoryId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onSelect(c);
                          setOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-slate-50"
                        role="option"
                        aria-selected={active}
                      >
                        <span style={{ fontSize: 14, fontWeight: active ? 600 : 400 }}>{c.name}</span>
                        {active && (
                          <Check size={14} strokeWidth={2} color="var(--brand-green)" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenNewCategory();
            }}
            className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-left transition hover:bg-slate-50"
            style={{
              borderColor: "var(--border-default)",
              color: "var(--brand-green-dark)",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <Plus size={14} strokeWidth={1.75} />
            <span>New category</span>
          </button>
        </div>
      )}
    </div>
  );
}

