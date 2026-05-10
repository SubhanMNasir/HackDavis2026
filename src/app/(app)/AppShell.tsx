"use client";

// Client wrapper that supplies the current pathname to BottomTabBar + IpadSidebar.
// Server layout passes the resolved Clerk user (already plain serialized) so we
// don't fetch Clerk on the client.

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { BottomTabBar, IpadShell, IpadSidebar } from "../components/wellspring/shared";

export interface AppShellUser {
  name: string | null | undefined;
  email: string | null | undefined;
}

export function AppShell({
  user,
  children,
}: {
  user: AppShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/log";
  const router = useRouter();
  const clerk = useClerk();

  const handleSignOut = React.useCallback(async () => {
    await clerk.signOut();
    router.push("/sign-in");
  }, [clerk, router]);

  return (
    <IpadShell sidebar={<IpadSidebar pathname={pathname} user={user} onSignOut={handleSignOut} />}>
      {/* Reserve space at bottom for the mobile tab bar; iPad has no tab bar. */}
      <div className="pb-16 md:pb-0">{children}</div>
      <BottomTabBar pathname={pathname} />
    </IpadShell>
  );
}
