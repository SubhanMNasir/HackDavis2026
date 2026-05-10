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
  EditCategoryModal,
  EditItemModal,
  EmptyState,
  H2,
  Minus,
  NewCategoryModal,
  NewItemModal,
  Pencil,
  Plus,
  PrimaryButton,
  PageHeader,
  Subtle,
  TextInput,
  Toast,
  TopAppBar,
  Trash2,
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
  const [showNewItem, setShowNewItem] = React.useState(false);
  // When the modal is opened from a per-category "+ Add item" button, this
  // holds the category to pre-select. Otherwise we fall back to the active
  // chip (or none if "All" is active).
  const [newItemCategoryId, setNewItemCategoryId] = React.useState<string | undefined>(undefined);
  // Edit-mode targets: null = closed, otherwise the row to edit.
  const [editingItem, setEditingItem] = React.useState<CatalogItem | null>(null);
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(null);

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

  // Group by category. In single-category view, always emit the active
  // category's section even when empty so the "+ Add item" affordance shows
  // instead of a generic empty state.
  const grouped = React.useMemo(() => {
    const map = new Map<
      string,
      { categoryId: string; categoryName: string; items: CatalogItem[] }
    >();
    for (const it of filteredItems) {
      const key = it.categoryId;
      if (!map.has(key)) {
        map.set(key, { categoryId: it.categoryId, categoryName: it.categoryName, items: [] });
      }
      map.get(key)!.items.push(it);
    }
    if (activeCategoryId !== "all") {
      const c = categories.find((c) => c.id === activeCategoryId);
      if (!c) return [];
      return [map.get(c.id) ?? { categoryId: c.id, categoryName: c.name, items: [] }];
    }
    return Array.from(map.values());
  }, [filteredItems, categories, activeCategoryId]);

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
      if (!Number.isFinite(r.estimatedValue) || r.estimatedValue <= 0) {
        setErrorToast("Each item needs an estimated value greater than zero.");
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

  // PATCH from EditItemModal — replace the row in `items` and any selected
  // row that references it (so the visible name/unit/price stay in sync).
  const handleItemSaved = (updated: CatalogItem) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.id === updated.id ? updated : i));
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setSelected((prev) =>
      prev.map((r) =>
        r.itemId === updated.id
          ? {
              ...r,
              itemName: updated.name,
              categoryId: updated.categoryId,
              unit: updated.defaultUnit,
              unitPrice: updated.estimatedValuePerUnit,
            }
          : r,
      ),
    );
  };

  // DELETE from the trash icon — soft-archives the catalog row, removes it
  // from the visible grid, and drops it from the active selection.
  const handleItemDelete = async (item: CatalogItem) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(`Remove "${item.name}" from the catalog?`);
      if (!ok) return;
    }
    try {
      await apiClient.deleteCatalogItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelected((prev) => prev.filter((r) => r.itemId !== item.id));
      setSuccessToast(`Removed ${item.name} from catalog`);
    } catch (err) {
      if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code, err.message));
      else setErrorToast(toastForCode("INTERNAL"));
    }
  };

  // PATCH from EditCategoryModal — replace the row in `categories`, then
  // resnapshot the denormalized name/unit on every catalog item that lives
  // under it (so the section header + item tiles update without a refetch).
  const handleCategorySaved = (updated: Category) => {
    apiClient.invalidateCategoriesCache();
    setCategories((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? updated : c));
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setItems((prev) =>
      prev.map((i) =>
        i.categoryId === updated.id
          ? { ...i, categoryName: updated.name, programName: updated.programName }
          : i,
      ),
    );
    setSelected((prev) =>
      prev.map((r) =>
        r.categoryId === updated.id ? { ...r, categoryId: updated.id } : r,
      ),
    );
  };

  // DELETE category — archives + removes from the chip rail. Items in that
  // category remain in the local list but are filtered out of the grid as
  // their categoryId no longer matches an active chip.
  const handleCategoryDelete = async (cat: Category) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Remove the "${cat.name}" category? Items in it will be hidden from Quick Pick but existing donations stay intact.`,
      );
      if (!ok) return;
    }
    try {
      await apiClient.deleteCategory(cat.id);
      apiClient.invalidateCategoriesCache();
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setItems((prev) => prev.filter((i) => i.categoryId !== cat.id));
      setSelected((prev) => prev.filter((r) => r.categoryId !== cat.id));
      if (activeCategoryId === cat.id) setActiveCategoryId("all");
      setSuccessToast(`Removed ${cat.name}`);
    } catch (err) {
      if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code, err.message));
      else setErrorToast(toastForCode("INTERNAL"));
    }
  };

  // Push the new item into the local catalog, jump to its category chip so
  // it's visible in the grid, and add it to the current selection so the
  // volunteer can keep going.
  const handleNewItemCreated = (item: CatalogItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev;
      return [...prev, item].sort((a, b) => a.name.localeCompare(b.name));
    });
    setActiveCategoryId(item.categoryId);
    setSelected((prev) => {
      if (prev.some((r) => r.itemId === item.id)) return prev;
      return [
        ...prev,
        {
          itemId: item.id,
          itemName: item.name,
          categoryId: item.categoryId,
          unit: item.defaultUnit,
          quantity: 1,
          unitPrice: item.estimatedValuePerUnit,
          estimatedValue: item.estimatedValuePerUnit,
        },
      ];
    });
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

        {/* Category chips: + New category (first) → All → each seeded category */}
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="flex gap-2">
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
          </div>
        </div>

        {/* Item grid */}
        {loading ? (
          <Card className="flex items-center justify-center py-10">
            <Subtle>Loading items…</Subtle>
          </Card>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No matching items"
            body="Try a different category or search term."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map((g) => {
              const cat = categories.find((c) => c.id === g.categoryId) ?? null;
              return (
              <section key={g.categoryId} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <H2>{g.categoryName}</H2>
                    {cat && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingCategory(cat)}
                          aria-label={`Edit ${cat.name}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-slate-100"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCategoryDelete(cat)}
                          aria-label={`Remove ${cat.name}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-red-50"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <Trash2 size={13} strokeWidth={1.75} />
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewItemCategoryId(g.categoryId);
                      setShowNewItem(true);
                    }}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1"
                    style={{
                      background: "white",
                      color: "var(--brand-green-dark)",
                      border: "1px dashed var(--brand-border)",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    <Plus size={12} strokeWidth={1.75} />
                    <span>Add item</span>
                  </button>
                </div>
                {g.items.length === 0 ? (
                  <Card padded>
                    <Subtle>
                      No items in this category yet. Tap &quot;Add item&quot; above to create one.
                    </Subtle>
                  </Card>
                ) : (
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
                          onEdit={() => setEditingItem(it)}
                          onDelete={() => handleItemDelete(it)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
              );
            })}
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

      <NewItemModal
        isOpen={showNewItem}
        onClose={() => {
          setShowNewItem(false);
          setNewItemCategoryId(undefined);
        }}
        categories={categories}
        defaultCategoryId={
          newItemCategoryId ?? (activeCategoryId !== "all" ? activeCategoryId : undefined)
        }
        onCreated={handleNewItemCreated}
      />

      <EditItemModal
        item={editingItem}
        categories={categories}
        isOpen={editingItem !== null}
        onClose={() => setEditingItem(null)}
        onSaved={handleItemSaved}
      />

      <EditCategoryModal
        category={editingCategory}
        isOpen={editingCategory !== null}
        onClose={() => setEditingCategory(null)}
        onSaved={handleCategorySaved}
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
  onEdit,
  onDelete,
}: {
  item: CatalogItem;
  selectedRow: SelectedRow | undefined;
  onAdd: () => void;
  onRemove: () => void;
  onChangeQuantity: (next: number) => void;
  onChangeValue: (next: number) => void;
  onEdit: () => void;
  onDelete: () => void;
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
    // Wrapper is a div (not a button) so the Edit/Trash icon-buttons inside
    // it don't end up nested inside another button (invalid HTML). Click /
    // keyboard activation on the wrapper still triggers onAdd.
    const handleActivate = (e: React.SyntheticEvent) => {
      const target = e.target as HTMLElement;
      // Ignore clicks/keys that originated inside an action button.
      if (target.closest("[data-tile-action]")) return;
      onAdd();
    };
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleActivate(e);
          }
        }}
        className="flex cursor-pointer flex-col gap-2 rounded-[12px] bg-white p-3 text-left transition hover:bg-slate-50"
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
        <div className="flex items-center justify-between gap-2">
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.defaultUnit}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-tile-action
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              aria-label={`Edit ${item.name}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-slate-100"
              style={{ color: "var(--text-secondary)" }}
            >
              <Pencil size={12} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              data-tile-action
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label={`Remove ${item.name}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-red-50"
              style={{ color: "var(--text-secondary)" }}
            >
              <Trash2 size={12} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
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
