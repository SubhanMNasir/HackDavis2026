// Log Hub — three method cards: Photo, Quick Pick, Manual.
// Per wellspring-build-brief.md §Screen 2.

import * as React from "react";
import { Camera, MethodCard, PageHeader, PenLine, TopAppBar, Zap } from "../../components/wellspring/shared";

export default function LogHubPage() {
  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden">
        <TopAppBar title="Log a donation" />
      </div>
      {/* iPad page header */}
      <div className="hidden md:block">
        <PageHeader title="Log a donation" subtitle="Pick a method to get started." />
      </div>

      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 py-5 md:px-6">
        <MethodCard
          href="/log/photo"
          tone="amber"
          icon={Camera}
          title="Photo"
          subtitle="Snap a pile, AI fills the form"
        />
        <MethodCard
          href="/log/quick"
          tone="green"
          icon={Zap}
          title="Quick Pick"
          subtitle="Choose from common items"
        />
        <MethodCard
          href="/log/manual"
          tone="slate"
          icon={PenLine}
          title="Manual Entry"
          subtitle="Type it in yourself"
        />
      </div>
    </>
  );
}
