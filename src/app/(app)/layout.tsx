// Authenticated app shell. Wraps every signed-in route with the BottomTabBar
// (mobile) and IpadSidebar (md+). Clerk middleware already enforces auth, so
// we can fetch the current user safely.

import * as React from "react";
import { currentUser } from "@clerk/nextjs/server";
import { AppShell, type AppShellUser } from "./AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  const fullName = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.username || null;
  const email = u?.primaryEmailAddress?.emailAddress ?? null;
  const user: AppShellUser = { name: fullName, email };
  return <AppShell user={user}>{children}</AppShell>;
}
