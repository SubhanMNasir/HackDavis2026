// History — Phase 1 shell. Phase 2 wires GET /api/events with Today / Yesterday
// / older buckets bucketed in APP_TZ (America/Los_Angeles).
// Per wellspring-build-brief.md §Screen 9.

import * as React from "react";
import {
  Card,
  EmptyState,
  History as HistoryGlyph,
  IconButton,
  PageHeader,
  Subtle,
  TextInput,
  TopAppBar,
} from "../../components/wellspring/shared";

export default function HistoryPage() {
  return (
    <>
      <div className="md:hidden">
        <TopAppBar
          title="History"
          right={
            <IconButton icon={HistoryGlyph} ariaLabel="Filter" />
          }
        />
      </div>
      <div className="hidden md:block">
        <PageHeader
          title="History"
          subtitle="Every donation, category change, and edit."
          right={
            <div className="flex items-center gap-2">
              <TextInput placeholder="Search activity…" className="w-[280px]" />
            </div>
          }
        />
      </div>

      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-4 py-4 md:px-6">
        <Card padded style={{ background: "var(--brand-tint)", border: "1px solid var(--brand-border)" }}>
          <Subtle>
            Phase 2 wires the live audit feed (GET /api/events) with Today / Yesterday buckets in
            America/Los_Angeles.
          </Subtle>
        </Card>

        <EmptyState
          icon={HistoryGlyph}
          title="No activity yet"
          body="Logged donations and category changes will appear here, newest first."
        />
      </div>
    </>
  );
}
