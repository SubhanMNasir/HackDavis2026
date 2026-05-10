// Minimal centered shell for authentication routes (sign-in / sign-up).
// No tab bar, no sidebar — just the page content on the page background.

import * as React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] p-0 md:p-6">
      <div className="w-full md:max-w-[1024px]">{children}</div>
    </div>
  );
}
