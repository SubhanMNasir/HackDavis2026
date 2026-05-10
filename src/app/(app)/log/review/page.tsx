// AI Review — Phase 1 shell only. Phase 3 wires the recognized-items table,
// inline category creation, and POST /api/donations { source: "photo_ai" }.
// Per wellspring-build-brief.md §Screen 4.

import * as React from "react";
import {
  Card,
  EmptyState,
  PageHeader,
  PrimaryButton,
  Subtle,
  TopAppBar,
  Camera,
  Check,
} from "../../../components/wellspring/shared";

export default function AiReviewPage() {
  return (
    <>
      <div className="md:hidden">
        <TopAppBar
          title="Review items"
          back={{ href: "/log" }}
          right={
            <PrimaryButton type="button" disabled fullWidth={false} className="px-3 py-1.5">
              <span style={{ fontSize: 13 }}>Save all</span>
            </PrimaryButton>
          }
        />
      </div>
      <div className="hidden md:block">
        <PageHeader
          title="Review items"
          subtitle="Tweak quantities, fix categories, then save the batch."
          right={
            <PrimaryButton type="button" disabled fullWidth={false}>
              Save all · $0.00
            </PrimaryButton>
          }
        />
      </div>

      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-4 py-4 md:px-6">
        {/* Captured photo strip */}
        <div
          className="rounded-[12px]"
          style={{
            height: 60,
            background: "linear-gradient(160deg, #1F4D08, #2A6B0A 50%, #39900E)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingInline: 16,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Captured photo
        </div>

        {/* AI match banner — exact wording per brief */}
        <div
          className="flex items-center gap-2 rounded-[12px] px-3 py-2"
          style={{
            background: "var(--brand-tint)",
            border: "1px solid var(--brand-border)",
            color: "var(--brand-green-dark)",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <Check size={16} strokeWidth={1.75} />
          <span>AI found 0 items — review and edit before saving.</span>
        </div>

        <EmptyState
          icon={Camera}
          title="No photo captured yet"
          body="The AI review screen renders matched items from /api/recognize. Phase 3 wiring."
        />

        <Card padded style={{ background: "var(--brand-tint)", border: "1px solid var(--brand-border)" }}>
          <Subtle>
            Phase 1 ships only the route shell — capture, recognition, and save are Phase 3.
          </Subtle>
        </Card>
      </div>
    </>
  );
}
