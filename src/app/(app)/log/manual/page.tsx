"use client";

// Manual Entry — Phase 1 wiring: program / category / item dropdowns are fed
// from /api/programs, /api/categories, /api/catalog. Save flow (POST
// /api/donations) is Phase 2.
// Per wellspring-build-brief.md §Screen 6.

import * as React from "react";
import type { CatalogItem, Category, Program, Unit } from "@/lib/types";
import {
  Card,
  Field,
  MoneyInput,
  NumberInput,
  PageHeader,
  PrimaryButton,
  Segmented,
  Select,
  Subtle,
  TextInput,
  Textarea,
  Toast,
  TopAppBar,
} from "../../../components/wellspring/shared";
import { listCatalog, listCategories, listPrograms } from "../../../lib/api-client";
import { ApiClientError } from "../../../lib/api-client";
import { toastForCode } from "../../../lib/error-toast-map";

const UNIT_OPTIONS: ReadonlyArray<{ value: Unit; label: string }> = [
  { value: "count", label: "Count" },
  { value: "lbs", label: "Lbs" },
] as const;

function todayLocalIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ManualEntryPage() {
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [items, setItems] = React.useState<CatalogItem[]>([]);

  const [errorToast, setErrorToast] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Form state
  const [itemName, setItemName] = React.useState("");
  const [programId, setProgramId] = React.useState<string>("");
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [quantity, setQuantity] = React.useState<string>("1");
  const [unit, setUnit] = React.useState<Unit>("count");
  const [estimatedValue, setEstimatedValue] = React.useState<string>("");
  const [donatedAt, setDonatedAt] = React.useState<string>(todayLocalIso());
  const [notes, setNotes] = React.useState<string>("");

  React.useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    Promise.all([
      listPrograms(ac.signal),
      listCategories({ active: true }, ac.signal),
      listCatalog({ active: true }, ac.signal),
    ])
      .then(([prgs, cats, its]) => {
        setPrograms(prgs);
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

  // Categories filtered by selected program (or all if none picked).
  const filteredCategories = React.useMemo(() => {
    if (!programId) return categories;
    return categories.filter((c) => c.programId === programId);
  }, [categories, programId]);

  // Items filtered by selected category.
  const filteredItems = React.useMemo(() => {
    if (!categoryId) return items;
    return items.filter((it) => it.categoryId === categoryId);
  }, [items, categoryId]);

  // When program changes, reset category if it doesn't belong to the new program.
  React.useEffect(() => {
    if (!programId || !categoryId) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat && cat.programId !== programId) setCategoryId("");
  }, [programId, categoryId, categories]);

  // When category changes, prefill default unit.
  React.useEffect(() => {
    if (!categoryId) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat) setUnit(cat.defaultUnit);
  }, [categoryId, categories]);

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
            <PrimaryButton type="button" fullWidth={false} disabled>
              Save
            </PrimaryButton>
          }
        />
      </div>

      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-4 md:px-6">
        {errorToast && <Toast tone="error" onDismiss={() => setErrorToast(null)}>{errorToast}</Toast>}

        <Card className="flex flex-col gap-4">
          {loading && <Subtle>Loading form…</Subtle>}

          <Field label="Item name">
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

          <Field label="Program">
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">Select a program…</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category">
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
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <NumberInput
                min={0}
                step={unit === "count" ? 1 : 0.1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>

            <Field label="Unit">
              <Segmented
                ariaLabel="Unit"
                options={UNIT_OPTIONS}
                value={unit}
                onChange={setUnit}
              />
            </Field>
          </div>

          <Field label="Estimated value">
            <MoneyInput
              placeholder="0.00"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
            />
          </Field>

          <Field label="Date received">
            <TextInput
              type="date"
              value={donatedAt}
              onChange={(e) => setDonatedAt(e.target.value)}
            />
          </Field>

          <Field label="Notes" hint="Optional">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <Card
            padded
            style={{ background: "var(--brand-tint)", border: "1px solid var(--brand-border)" }}
          >
            <Subtle>Saving wires up in Phase 2 (POST /api/donations).</Subtle>
          </Card>

          {/* Mobile sticky save */}
          <div className="md:hidden">
            <PrimaryButton type="button" disabled>
              Save
            </PrimaryButton>
          </div>
        </Card>
      </div>
    </>
  );
}
