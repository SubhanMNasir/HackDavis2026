"use client";

// Quick Pick — Phase 1 wiring: fetches /api/categories + /api/catalog and
// renders a category-chip filter + grouped item grid. No multi-select / save
// flow yet (that's Phase 2).
// Per wellspring-build-brief.md §Screen 5.

import * as React from "react";
import type { CatalogItem, Category } from "@/lib/types";
import {
  Card,
  ChipFilter,
  EmptyState,
  H2,
  PageHeader,
  Plus,
  Subtle,
  TextInput,
  Toast,
  TopAppBar,
  Zap,
} from "../../../components/wellspring/shared";
import { listCatalog, listCategories } from "../../../lib/api-client";
import { ApiClientError } from "../../../lib/api-client";
import { toastForCode } from "../../../lib/error-toast-map";

export default function QuickPickPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [activeCategoryId, setActiveCategoryId] = React.useState<string | "all">("all");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    Promise.all([
      listCategories({ active: true }, ac.signal),
      listCatalog({ active: true }, ac.signal),
    ])
      .then(([cats, its]) => {
        setCategories(cats);
        setItems(its);
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

  // Group by category for nicer rendering.
  const grouped = React.useMemo(() => {
    const map = new Map<string, { categoryName: string; items: CatalogItem[] }>();
    for (const it of filteredItems) {
      const key = it.categoryId;
      if (!map.has(key)) map.set(key, { categoryName: it.categoryName, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values());
  }, [filteredItems]);

  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Quick Pick" back={{ href: "/log" }} />
      </div>
      <div className="hidden md:block">
        <PageHeader title="Quick Pick" subtitle="Tap items to log them." />
      </div>

      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-4 py-4 md:px-6">
        {errorToast && <Toast tone="error" onDismiss={() => setErrorToast(null)}>{errorToast}</Toast>}

        {/* Search */}
        <TextInput
          placeholder="Search items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Category chips: All + each seeded category */}
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
                  {g.items.map((it) => (
                    <ItemTile key={it.id} item={it} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <Card padded className="md:hidden" style={{ background: "var(--brand-tint)", border: "1px solid var(--brand-border)" }}>
          <Subtle>
            Multi-select + save coming next — Phase 1 wires the picker only.
          </Subtle>
        </Card>
      </div>
    </>
  );
}

function ItemTile({ item }: { item: CatalogItem }) {
  return (
    <button
      type="button"
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
