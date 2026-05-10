// Reports — Phase 1 shell. Phase 3 wires preset chips → GET /api/reports
// (mobile: 2 stat cards + by-item table; iPad: 4 stat cards + table + top-5
// horizontal bar chart rendered with plain divs, no recharts).
// Per wellspring-build-brief.md §Screen 7.

import * as React from "react";
import {
  Card,
  ChipFilter,
  PageHeader,
  PrimaryButton,
  StatCard,
  Subtle,
  TopAppBar,
} from "../../components/wellspring/shared";

const PRESETS = ["This month", "Last month", "Q2", "YTD", "Custom"] as const;

export default function ReportsPage() {
  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Reports" />
      </div>
      <div className="hidden md:block">
        <PageHeader title="Reports" subtitle="Date-range totals and top items." />
      </div>

      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-4 py-4 md:px-6">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="flex gap-2">
            {PRESETS.map((p, i) => (
              <ChipFilter key={p} active={i === 0}>
                {p}
              </ChipFilter>
            ))}
          </div>
        </div>

        {/* Mobile: 2 stat cards. iPad: 4 stat cards. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total value" value="$0" emphasis />
          <StatCard label="Entries logged" value="0" />
          <div className="hidden md:block">
            <StatCard label="Top item" value="—" />
          </div>
          <div className="hidden md:block">
            <StatCard label="Top category" value="—" />
          </div>
        </div>

        {/* By-item table placeholder */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <span style={{ fontSize: 15, fontWeight: 600 }}>By item</span>
            <Subtle>Sort by total value</Subtle>
          </div>
          <Subtle>Phase 3 fetches from /api/reports and renders rows here.</Subtle>
        </Card>

        {/* iPad-only top-5 chart placeholder */}
        <div className="hidden md:block">
          <Card>
            <div className="mb-2" style={{ fontSize: 15, fontWeight: 600 }}>
              Top 5 items
            </div>
            <div className="flex flex-col gap-2">
              {[80, 60, 45, 30, 18].map((pct, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-32 truncate" style={{ fontSize: 13 }}>
                    Sample item {i + 1}
                  </span>
                  <div
                    className="h-3 flex-1 overflow-hidden rounded-full"
                    style={{ background: "#F1F5F9" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, var(--brand-green-dark), var(--brand-green))",
                      }}
                    />
                  </div>
                  <span className="w-16 text-right tabular-nums" style={{ fontSize: 13 }}>
                    $0.00
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Footer total + single Export CSV entry point */}
        <Card padded style={{ background: "#F8FAFC" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Subtle>Grand total</Subtle>
              <div style={{ fontSize: 22, fontWeight: 600, color: "var(--brand-green)" }}>
                $0.00
              </div>
            </div>
            <PrimaryButton type="button" fullWidth={false} disabled>
              Export CSV
            </PrimaryButton>
          </div>
        </Card>
      </div>
    </>
  );
}
