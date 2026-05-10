// Photo Capture — Phase 1 shell only.
// Phase 3 wires <input type="file" capture="environment"> → /api/recognize.
// Per wellspring-build-brief.md §Screen 3.

import * as React from "react";
import {
  Camera,
  Card,
  H2,
  PageHeader,
  PrimaryButton,
  Subtle,
  TopAppBar,
} from "../../../components/wellspring/shared";

export default function PhotoPage() {
  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Photo entry" back={{ href: "/log" }} />
      </div>
      <div className="hidden md:block">
        <PageHeader title="Photo entry" subtitle="Snap a pile and we'll fill in the items." />
      </div>

      <div className="mx-auto grid w-full max-w-[1024px] gap-4 px-4 py-5 md:grid-cols-2 md:px-6">
        {/* Drop zone */}
        <Card className="flex flex-col items-center justify-center gap-3 py-12 text-center" padded={false}>
          <span
            className="inline-flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: "var(--brand-tint)",
              color: "var(--brand-green-dark)",
              border: "1px solid var(--brand-border)",
            }}
          >
            <Camera size={28} strokeWidth={1.5} />
          </span>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Tap to take a photo</div>
          <Subtle>or choose from gallery</Subtle>
          <Subtle>JPEG / PNG / WebP up to 5 MB.</Subtle>
        </Card>

        {/* Tips card (iPad: right column; mobile: stacks below) */}
        <Card className="flex flex-col gap-3">
          <H2>Tips for good photos</H2>
          <ul className="flex flex-col gap-2" style={{ fontSize: 14 }}>
            <li>Get the whole pile in frame.</li>
            <li>Bright, even light works best.</li>
            <li>Spread items so labels are visible.</li>
            <li>One batch per photo.</li>
          </ul>
          <Card
            padded
            className="mt-2"
            style={{
              background: "var(--brand-tint)",
              border: "1px solid var(--brand-border)",
            }}
          >
            <Subtle>
              AI will list each item with a quantity and estimated value. You&apos;ll review before saving.
            </Subtle>
          </Card>
        </Card>
      </div>

      {/* Sticky footer CTA on mobile */}
      <div className="sticky bottom-16 z-20 px-4 pb-4 md:static md:px-6 md:pb-6">
        <PrimaryButton type="button">Open Camera</PrimaryButton>
      </div>
    </>
  );
}
