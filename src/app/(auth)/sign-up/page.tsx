// Sign-up screen.
// Mirrors the sign-in layout (gradient hero + Clerk form pane). The
// First/Last name fields are surfaced by Clerk only when the Clerk
// Dashboard is configured to require them — see Clerk → User &
// Authentication → Email, Phone, Username → Personal information.

"use client";

import * as React from "react";
import { SignUp } from "@clerk/nextjs";
import { Leaf } from "lucide-react";

interface LeafSpec {
  topPct: number;
  leftPct: number;
  size: number;
  rotate: number;
}

const MOBILE_LEAVES: LeafSpec[] = [
  { topPct: 8, leftPct: 12, size: 22, rotate: -18 },
  { topPct: 14, leftPct: 70, size: 30, rotate: 24 },
  { topPct: 22, leftPct: 38, size: 18, rotate: -8 },
  { topPct: 30, leftPct: 86, size: 26, rotate: 50 },
  { topPct: 36, leftPct: 6, size: 32, rotate: 14 },
  { topPct: 48, leftPct: 78, size: 20, rotate: -28 },
  { topPct: 56, leftPct: 26, size: 24, rotate: 42 },
  { topPct: 62, leftPct: 56, size: 30, rotate: -10 },
  { topPct: 72, leftPct: 14, size: 22, rotate: 32 },
  { topPct: 80, leftPct: 80, size: 28, rotate: -20 },
  { topPct: 88, leftPct: 44, size: 24, rotate: 6 },
  { topPct: 92, leftPct: 70, size: 18, rotate: -38 },
];

const IPAD_LEAVES: LeafSpec[] = [
  ...MOBILE_LEAVES,
  { topPct: 4, leftPct: 50, size: 24, rotate: 16 },
  { topPct: 18, leftPct: 22, size: 20, rotate: -34 },
  { topPct: 26, leftPct: 64, size: 30, rotate: 8 },
  { topPct: 34, leftPct: 50, size: 22, rotate: -22 },
  { topPct: 44, leftPct: 38, size: 26, rotate: 36 },
  { topPct: 52, leftPct: 8, size: 18, rotate: -14 },
  { topPct: 64, leftPct: 88, size: 24, rotate: 20 },
  { topPct: 70, leftPct: 32, size: 28, rotate: -42 },
  { topPct: 76, leftPct: 64, size: 22, rotate: 12 },
  { topPct: 84, leftPct: 22, size: 26, rotate: -6 },
  { topPct: 90, leftPct: 8, size: 20, rotate: 30 },
  { topPct: 96, leftPct: 88, size: 24, rotate: -18 },
];

const HERO_GRADIENT = "linear-gradient(160deg, #1F4D08, #2A6B0A 50%, #39900E)";

function ScatteredLeaves({ leaves }: { leaves: LeafSpec[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {leaves.map((l, i) => (
        <Leaf
          key={i}
          size={l.size}
          strokeWidth={1.5}
          color="white"
          className="absolute"
          style={{
            top: `${l.topPct}%`,
            left: `${l.leftPct}%`,
            opacity: 0.25,
            transform: `rotate(${l.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function HeroCopy({ className = "" }: { className?: string }) {
  return (
    <div className={`relative z-10 flex h-full flex-col justify-center px-6 ${className}`}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.18em",
          color: "rgba(255,255,255,0.9)",
        }}
      >
        WELLSPRING · VOLUNTEER
      </div>
      <h1
        className="mt-3"
        style={{
          fontSize: 32,
          fontWeight: 600,
          lineHeight: 1.2,
          color: "white",
          whiteSpace: "pre-line",
        }}
      >
        {"Join the team.\nLog donations."}
      </h1>
      <p
        className="mt-2"
        style={{ fontSize: 15, fontWeight: 400, color: "rgba(255,255,255,0.85)" }}
      >
        Create your volunteer account.
      </p>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <div
      className="flex w-full flex-col overflow-hidden md:flex-row md:rounded-[12px] md:border md:bg-white"
      style={{ borderColor: "var(--border-default)", boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)" }}
    >
      {/* Mobile-only: 288px hero on top */}
      <div
        className="relative md:hidden"
        style={{ height: 288, background: HERO_GRADIENT }}
      >
        <ScatteredLeaves leaves={MOBILE_LEAVES} />
        <HeroCopy />
      </div>

      {/* iPad-only: 520px gradient hero on the left */}
      <div
        className="relative hidden md:block"
        style={{ width: 520, minHeight: 600, background: HERO_GRADIENT }}
      >
        <ScatteredLeaves leaves={IPAD_LEAVES} />
        <HeroCopy />
      </div>

      {/* Form pane (mobile: full width below; iPad: right side). */}
      <div className="flex flex-1 items-center justify-center bg-white p-6 md:p-10">
        <SignUp
          routing="hash"
          signInUrl="/sign-in"
          forceRedirectUrl="/log"
          fallbackRedirectUrl="/log"
          appearance={{
            elements: {
              card: "shadow-none border-0 bg-transparent",
              footer: "hidden",
            },
          }}
        />
      </div>
    </div>
  );
}
