"use client";

// Quick Pick — Phase 2: multi-select tiles + sticky save bar.
// Per wellspring-build-brief.md §Screen 5.

import * as React from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem, Category, Program, Unit } from "@/lib/types";
import {
  Card,
  Check,
  ChipFilter,
  EmptyState,
  H2,
  Minus,
  NewCategoryModal,
  Plus,
  PrimaryButton,
  PageHeader,
  Subtle,
  TextInput,
  Toast,
  TopAppBar,
  Zap,
} from "../../../components/wellspring/shared";
import {
  apiClient,
  ApiClientError,
  type CreateDonationItem,
} from "../../../lib/api-client";
import { toastForCode } from "../../../lib/error-toast-map";

interface SelectedRow {
  /** Stable key for the row — catalogItem.id (every selection comes from a tile). */
  itemId: string;
  itemName: string;
  categoryId: string;
  unit: Unit;
  quantity: number;
  /** Per-unit price snapshot from the catalog at selection time. */
  unitPrice: number;
  /** Total estimated value (qty × unitPrice, user-editable). */
  estimatedValue: number;
}

export default function QuickPickPage() {
  const router = useRouter();

  const [programs, setPrograms] = React.useState<Program[]>(
    () => apiClient.getCachedPrograms() ?? [],
  );
  const [categories, setCategories] = React.useState<Category[]>(
    () => apiClient.getCachedCategories() ?? [],
  );
  const [items, setItems] = React.useState<CatalogItem[]>([]);

  const [activeCategoryId, setActiveCategoryId] = React.useState<string | "all">("all");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);
  const [successToast, setSuccessToast] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<SelectedRow[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [showNewCategory, setShowNewCategory] = React.useState(false);

  React.useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
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

  // Filtering — by active chip + free-text query.
  const filteredItems = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (activeCategoryId !== "all" && it.categoryId !== activeCategoryId) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, activeCategoryId, query]);

  // Group by category.
  const grouped = React.useMemo(() => {
    const map = new Map<string, { categoryName: string; items: CatalogItem[] }>();
    for (const it of filteredItems) {
      const key = it.categoryId;
      if (!map.has(key)) map.set(key, { categoryName: it.categoryName, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values());
  }, [filteredItems]);

  const selectedById = React.useMemo(() => {
    const m = new Map<string, SelectedRow>();
    for (const r of selected) m.set(r.itemId, r);
    return m;
  }, [selected]);

  const totalValue = selected.reduce((sum, r) => sum + (Number.isFinite(r.estimatedValue) ? r.estimatedValue : 0), 0);

  const addItem = (it: CatalogItem) => {
    setSelected((prev) => {
      if (prev.some((r) => r.itemId === it.id)) return prev;
      return [
        ...prev,
        {
          itemId: it.id,
          itemName: it.name,
          categoryId: it.categoryId,
          unit: it.defaultUnit,
          quantity: 1,
          unitPrice: it.estimatedValuePerUnit,
          estimatedValue: it.estimatedValuePerUnit,
        },
      ];
    });
  };

  const removeItem = (itemId: string) => {
    setSelected((prev) => prev.filter((r) => r.itemId !== itemId));
  };

  const updateRow = (itemId: string, patch: Partial<SelectedRow>) => {
    setSelected((prev) =>
      prev.map((r) => {
        if (r.itemId !== itemId) return r;
        const next = { ...r, ...patch };
        // If quantity changed and value wasn't manually patched, recompute.
        if (patch.quantity !== undefined && patch.estimatedValue === undefined) {
          next.estimatedValue = +(next.quantity * r.unitPrice).toFixed(2);
        }
        return next;
      }),
    );
  };

  const handleSaveAll = async () => {
    if (selected.length === 0 || submitting) return;
    setErrorToast(null);

    // Validate quantities by unit.
    for (const r of selected) {
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
    const payload: CreateDonationItem[] = selected.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      categoryId: r.categoryId,
      quantity: r.quantity,
      unit: r.unit,
      estimatedValue: r.estimatedValue,
      source: "quick_pick",
      photoUrl: null,
    }));
    try {
      await apiClient.createDonations(payload);
      setSuccessToast(`Logged ${selected.length} item${selected.length === 1 ? "" : "s"}`);
      router.push("/log");
    } catch (err) {
      if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code, err.message));
      else setErrorToast(toastForCode("INTERNAL"));
      setSubmitting(false);
    }
  };

  const handleNewCategoryCreated = (cat: Category) => {
    apiClient.invalidateCategoriesCache();
    setCategories((prev) => {
      if (prev.some((c) => c.id === cat.id)) return prev;
      return [...prev, cat].sort((a, b) => a.name.localeCompare(b.name));
    });
    setActiveCategoryId(cat.id);
  };

  const showStickyBar = selected.length > 0;

  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Quick Pick" back={{ href: "/log" }} />
      </div>
      <div className="hidden md:block">
        <PageHeader title="Quick Pick" subtitle="Tap items to log them." />
      </div>

      <div
        className={`mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-4 py-4 md:px-6 ${
          showStickyBar ? "pb-28 md:pb-32" : ""
        }`}
      >
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

        {/* Search */}
        <TextInput
          placeholder="Search items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Category chips: All + each seeded category + + New category */}
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="flex gap-2">
            <ChipFilter
              active={activeCategoryId === "all"}
              onClick={() => setActiveCategoryId("all")}
            >
              All
            </ChipFilter>
            {categories.map((c) => (
              <ChipFilter
                key={c.id}
                active={activeCategoryId === c.id}
                onClick={() => setActiveCategoryId(c.id)}
              >
                {c.name}
              </ChipFilter>
            ))}
            <button
              type="button"
              onClick={() => setShowNewCategory(true)}
              className="whitespace-nowrap rounded-full px-3 py-1.5 transition"
              style={{
                background: "white",
                color: "var(--brand-green-dark)",
                border: "1px dashed var(--brand-border)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              + New category
            </button>
          </div>
        </div>

        {/* Item grid */}
        {loading ? (
          <Card className="flex items-center justify-center py-10">
            <Subtle>Loading items…</Subtle>
          </Card>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No matching items"
            body="Try a different category or search term."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map((g) => (
              <section key={g.categoryName} className="flex flex-col gap-2">
                <H2>{g.categoryName}</H2>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {g.items.map((it) => {
                    const sel = selectedById.get(it.id);
                    return (
                      <ItemTile
                        key={it.id}
                        item={it}
                        selectedRow={sel}
                        onAdd={() => addItem(it)}
                        onRemove={() => removeItem(it.id)}
                        onChangeQuantity={(n) => updateRow(it.id, { quantity: n })}
                        onChangeValue={(v) => updateRow(it.id, { estimatedValue: v })}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      {showStickyBar && (
        <div
          className="fixed inset-x-0 z-30 bg-white px-4 py-3 md:left-60"
          style={{ borderTop: "1px solid var(--border-default)", bottom: 0 }}
        >
          <div className="mx-auto flex w-full max-w-[1024px] items-center justify-between gap-3">
            <div className="flex flex-col">
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {selected.length} item{selected.length === 1 ? "" : "s"} ·{" "}
                <span style={{ color: "var(--brand-green)" }}>${totalValue.toFixed(2)}</span>
              </span>
              <Subtle>
                <span>Tap items to add, then save when you&apos;re done.</span>
              </Subtle>
            </div>
            <PrimaryButton
              type="button"
              fullWidth={false}
              onClick={handleSaveAll}
              disabled={submitting || selected.length === 0}
            >
              {submitting ? "Saving…" : "Save all"}
            </PrimaryButton>
          </div>
        </div>
      )}

      <NewCategoryModal
        isOpen={showNewCategory}
        onClose={() => setShowNewCategory(false)}
        programs={programs}
        defaultProgramId={undefined}
        onCreated={handleNewCategoryCreated}
      />
    </>
  );
}

function ItemTile({
  item,
  selectedRow,
  onAdd,
  onRemove,
  onChangeQuantity,
  onChangeValue,
}: {
  item: CatalogItem;
  selectedRow: SelectedRow | undefined;
  onAdd: () => void;
  onRemove: () => void;
  onChangeQuantity: (next: number) => void;
  onChangeValue: (next: number) => void;
}) {
  // Local string buffers so the user can erase to empty without us snapping back to "0".
  // Refs track the last value we emitted upward so the resync effect doesn't loop back
  // and overwrite the user's in-progress text with the same value they just typed.
  const [qtyText, setQtyText] = React.useState<string>(
    selectedRow ? String(selectedRow.quantity) : "",
  );
  const [valueText, setValueText] = React.useState<string>(
    selectedRow ? String(selectedRow.estimatedValue) : "",
  );
  const lastEmittedQty = React.useRef<number | null>(selectedRow?.quantity ?? null);
  const lastEmittedValue = React.useRef<number | null>(selectedRow?.estimatedValue ?? null);

  React.useEffect(() => {
    if (!selectedRow) {
      lastEmittedQty.current = null;
      lastEmittedValue.current = null;
      setQtyText("");
      setValueText("");
      return;
    }
    if (selectedRow.quantity !== lastEmittedQty.current) {
      setQtyText(String(selectedRow.quantity));
      lastEmittedQty.current = selectedRow.quantity;
    }
    if (selectedRow.estimatedValue !== lastEmittedValue.current) {
      setValueText(String(selectedRow.estimatedValue));
      lastEmittedValue.current = selectedRow.estimatedValue;
    }
  }, [selectedRow]);

  if (!selectedRow) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="flex flex-col gap-2 rounded-[12px] bg-white p-3 text-left transition hover:bg-slate-50"
        style={{
          border: "1px solid var(--border-default)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{item.name}</span>
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-full"
            style={{
              background: "var(--brand-tint)",
              color: "var(--brand-green-dark)",
              border: "1px solid var(--brand-border)",
            }}
          >
            <Plus size={14} strokeWidth={1.75} />
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.defaultUnit}</span>
      </button>
    );
  }

  const step = selectedRow.unit === "count" ? 1 : 0.1;
  const dec = () => {
    const next = Math.max(step, +(selectedRow.quantity - step).toFixed(2));
    setQtyText(String(next));
    lastEmittedQty.current = next;
    onChangeQuantity(next);
  };
  const inc = () => {
    const next = +(selectedRow.quantity + step).toFixed(2);
    setQtyText(String(next));
    lastEmittedQty.current = next;
    onChangeQuantity(next);
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] bg-white p-3"
      style={{
        border: "2px solid var(--brand-green)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{item.name}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full"
          style={{
            background: "var(--brand-green)",
            color: "white",
          }}
        >
          <Check size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div
          className="inline-flex items-center rounded-[8px]"
          style={{ border: "1px solid var(--border-default)" }}
        >
          <button onClick={dec} className="px-2 py-1" aria-label="Decrease">
            <Minus size={14} strokeWidth={1.5} color="var(--text-secondary)" />
          </button>
          <input
            type="number"
            inputMode={selectedRow.unit === "count" ? "numeric" : "decimal"}
            step={step}
            min={0}
            value={qtyText}
            onChange={(e) => {
              const text = e.target.value;
              setQtyText(text);
              if (text === "") return;
              const n = Number(text);
              if (Number.isFinite(n) && n >= 0) {
                lastEmittedQty.current = n;
                onChangeQuantity(n);
              }
            }}
            className="w-14 px-1 py-1 tabular-nums text-center outline-none"
            style={{ fontSize: 13, fontWeight: 500, background: "transparent", border: "none" }}
            aria-label="Quantity"
          />
          <button onClick={inc} className="px-2 py-1" aria-label="Increase">
            <Plus size={14} strokeWidth={1.5} color="var(--text-secondary)" />
          </button>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{selectedRow.unit}</span>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          value={valueText}
          onChange={(e) => {
            const text = e.target.value;
            setValueText(text);
            if (text === "") {
              lastEmittedValue.current = 0;
              onChangeValue(0);
              return;
            }
            const n = Number(text);
            if (Number.isFinite(n) && n >= 0) {
              lastEmittedValue.current = n;
              onChangeValue(n);
            }
          }}
          className="w-full rounded-[6px] px-2 py-1 tabular-nums outline-none transition focus:border-[var(--brand-green)]"
          style={{
            border: "1px solid var(--border-default)",
            fontSize: 13,
            fontWeight: 500,
          }}
          aria-label="Estimated value"
        />
      </div>
    </div>
  );
}
