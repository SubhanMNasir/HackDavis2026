"use client";

// Reports — Phase 3: preset chips + GET /api/reports + iPad bar chart + CSV download.
// Per wellspring-build-brief.md §Screen 7 and CONTRACTS §4.6.

import * as React from "react";
import type { ReportSummary } from "@/lib/types";
import {
  Card,
  ChipFilter,
  PageHeader,
  PrimaryButton,
  StatCard,
  Subtle,
  TextInput,
  Toast,
  TopAppBar,
} from "../../components/wellspring/shared";
import { apiClient, ApiClientError } from "../../lib/api-client";
import { toastForCode } from "../../lib/error-toast-map";
import { APP_TZ } from "@/lib/timezone";

type Preset = "This month" | "Last month" | "YTD" | "Custom";
const PRESETS: ReadonlyArray<Preset> = ["This month", "Last month", "YTD", "Custom"];

// ---------- Pacific date helpers (local; do not extend lib/timezone.ts here) ----------

function pacificParts(d: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, dd] = fmt.format(d).split("-").map(Number);
  return { year: y, month: m, day: dd };
}

/**
 * Convert "Pacific clock time (year, month, day, hour, minute, second)" → UTC ISO.
 * Handles DST by computing the Pacific TZ offset for the target wall-clock instant.
 */
function pacificWallToUtcIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): string {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
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
  let ph = get("hour");
  if (ph === 24) ph = 0;
  const pacificAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), ph, get("minute"), get("second"));
  const offset = pacificAsUtc - utcGuess;
  return new Date(utcGuess - offset).toISOString();
}

function lastDayOfMonth(year: number, month: number): number {
  // month is 1-12. JS Date(0, year, month, 0) gives last day of (month-1) but easier:
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function rangeForPreset(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } | null {
  const now = new Date();
  const { year, month } = pacificParts(now);
  switch (preset) {
    case "This month": {
      return {
        from: pacificWallToUtcIso(year, month, 1, 0, 0, 0),
        to: now.toISOString(),
      };
    }
    case "Last month": {
      const lmYear = month === 1 ? year - 1 : year;
      const lmMonth = month === 1 ? 12 : month - 1;
      const last = lastDayOfMonth(lmYear, lmMonth);
      return {
        from: pacificWallToUtcIso(lmYear, lmMonth, 1, 0, 0, 0),
        to: pacificWallToUtcIso(lmYear, lmMonth, last, 23, 59, 59),
      };
    }
    case "YTD": {
      return {
        from: pacificWallToUtcIso(year, 1, 1, 0, 0, 0),
        to: now.toISOString(),
      };
    }
    case "Custom": {
      if (!customFrom || !customTo) return null;
      const [fy, fm, fd] = customFrom.split("-").map(Number);
      const [ty, tm, td] = customTo.split("-").map(Number);
      if (![fy, fm, fd, ty, tm, td].every(Number.isFinite)) return null;
      return {
        from: pacificWallToUtcIso(fy, fm, fd, 0, 0, 0),
        to: pacificWallToUtcIso(ty, tm, td, 23, 59, 59),
      };
    }
  }
}

// ---------- Page ----------

export default function ReportsPage() {
  const [preset, setPreset] = React.useState<Preset>("This month");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  const [summary, setSummary] = React.useState<ReportSummary | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [csvBusy, setCsvBusy] = React.useState(false);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);

  const range = React.useMemo(
    () => rangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  // Fetch on range change.
  React.useEffect(() => {
    if (!range) {
      setSummary(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    apiClient
      .getReport({ from: range.from, to: range.to, groupBy: "item" }, ac.signal)
      .then((res) => {
        setSummary(res);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setLoading(false);
        if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code));
        else setErrorToast(toastForCode("INTERNAL"));
      });
    return () => ac.abort();
  }, [range]);

  const handleExportCsv = async () => {
    if (!range) return;
    if (csvBusy) return;
    setCsvBusy(true);
    try {
      const { blob, filename } = await apiClient.downloadReportsCsv({
        from: range.from,
        to: range.to,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? "wellspring-donations.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      if (err instanceof ApiClientError) setErrorToast(toastForCode(err.code));
      else setErrorToast(toastForCode("INTERNAL"));
    } finally {
      setCsvBusy(false);
    }
  };

  const totalValue = summary?.totalValue ?? 0;
  const entryCount = summary?.entryCount ?? 0;
  const rows = summary?.rows ?? [];
  const top5 = rows.slice(0, 5);
  const topRow = top5[0];
  const csvDisabled =
    !range || csvBusy || loading || entryCount === 0 || !range.from || !range.to;

  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Reports" />
      </div>
      <div className="hidden md:block">
        <PageHeader title="Reports" subtitle="Date-range totals and top items." />
      </div>

      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-4 py-4 md:px-6">
        {errorToast && (
          <Toast tone="error" onDismiss={() => setErrorToast(null)}>
            {errorToast}
          </Toast>
        )}

        {/* Preset chips */}
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <ChipFilter
                key={p}
                active={p === preset}
                onClick={() => {
                  setPreset(p);
                  if (p !== "Custom") {
                    setCustomFrom("");
                    setCustomTo("");
                  }
                }}
              >
                {p}
              </ChipFilter>
            ))}
          </div>
        </div>

        {/* Custom date inputs (visible only when preset === "Custom") */}
        {preset === "Custom" && (
          <Card className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <label className="flex flex-col gap-1.5 md:flex-1">
              <span style={{ fontSize: 13, fontWeight: 500 }}>From</span>
              <TextInput
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 md:flex-1">
              <span style={{ fontSize: 13, fontWeight: 500 }}>To</span>
              <TextInput
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </Card>
        )}

        {/* Mobile: 2 stat cards. iPad: 4 stat cards. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Total value"
            value={`$${totalValue.toFixed(2)}`}
            emphasis
          />
          <StatCard label="Entries logged" value={String(entryCount)} />
          <div className="hidden md:block">
            <StatCard label="Top item" value={summary?.topItem ?? "—"} />
          </div>
          <div className="hidden md:block">
            <StatCard label="Top category" value={summary?.topCategory ?? "—"} />
          </div>
        </div>

        {/* By-item table card (always shown) */}
        <Card padded={false}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>By item</span>
            <Subtle>Sorted by total value</Subtle>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Subtle>Loading…</Subtle>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Subtle>No donations in this range.</Subtle>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div
                className="grid items-center gap-2 px-4 py-2"
                style={{
                  gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.5fr) auto auto",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  borderBottom: "1px solid var(--border-default)",
                }}
              >
                <span>Item</span>
                <span>Category</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Total</span>
              </div>
              {rows.map((r, i) => (
                <div
                  key={`${r.itemName}-${r.categoryId}`}
                  className="grid items-center gap-2 px-4 py-2.5"
                  style={{
                    gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.5fr) auto auto",
                    fontSize: 14,
                    background: i % 2 === 1 ? "#F8FAFC" : "white",
                  }}
                >
                  <span className="truncate" style={{ fontWeight: 500 }}>
                    {r.itemName}
                  </span>
                  <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                    {r.categoryName}
                  </span>
                  <span className="text-right tabular-nums">
                    {r.totalQuantity} {r.unit}
                  </span>
                  <span className="text-right tabular-nums" style={{ fontWeight: 600 }}>
                    ${r.totalValue.toFixed(2)}
                  </span>
                </div>
              ))}
            </>
          )}
        </Card>

        {/* iPad-only top-5 chart card */}
        <div className="hidden md:block">
          <Card>
            <div className="mb-2" style={{ fontSize: 15, fontWeight: 600 }}>
              Top 5 items
            </div>
            {loading ? (
              <Subtle>Loading…</Subtle>
            ) : top5.length === 0 ? (
              <Subtle>No items in this range.</Subtle>
            ) : (
              <div className="flex flex-col gap-2">
                {top5.map((row, i) => {
                  const pct =
                    topRow && topRow.totalValue > 0
                      ? (row.totalValue / topRow.totalValue) * 100
                      : 0;
                  return (
                    <div key={`${row.itemName}-${i}`} className="flex items-center gap-3">
                      <span className="w-32 truncate" style={{ fontSize: 13 }}>
                        {row.itemName}
                      </span>
                      <div
                        className="h-3 flex-1 overflow-hidden rounded-full"
                        style={{ background: "#F1F5F9" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, pct)}%`,
                            background:
                              "linear-gradient(90deg, var(--brand-green-dark), var(--brand-green))",
                          }}
                        />
                      </div>
                      <span className="w-20 text-right tabular-nums" style={{ fontSize: 13 }}>
                        ${row.totalValue.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Footer card: grand total + Export CSV */}
        <Card padded style={{ background: "#F8FAFC" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Subtle>Grand total</Subtle>
              <div style={{ fontSize: 22, fontWeight: 600, color: "var(--brand-green)" }}>
                ${totalValue.toFixed(2)}
              </div>
            </div>
            <PrimaryButton
              type="button"
              fullWidth={false}
              onClick={handleExportCsv}
              disabled={csvDisabled}
            >
              {csvBusy ? "Preparing…" : "Export CSV"}
            </PrimaryButton>
          </div>
        </Card>

      </div>
    </>
  );
}
