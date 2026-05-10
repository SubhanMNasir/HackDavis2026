"use client";

// Wellspring design-system primitives.
// Source of truth for visual identity: src/imports/wellspring-build-brief.md.
// Brand color is exactly #39900E (var(--brand-green)).
// Names everywhere come pre-formatted via lib/format-name — never hand-format.

import * as React from "react";
import {
  Leaf,
  ChevronLeft,
  ChevronRight,
  Camera,
  Zap,
  PenLine,
  BarChart2,
  History,
  User,
  Plus,
  Minus,
  X,
  Check,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { getInitials } from "../../../lib/format-name";

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export interface WellspringLogoProps {
  size?: number;
  className?: string;
}

/** Green-gradient circle with a white Lucide Leaf in the center. */
export function WellspringLogo({ size = 32, className = "" }: WellspringLogoProps) {
  const px = `${size}px`;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white shadow-sm ${className}`}
      style={{
        width: px,
        height: px,
        background:
          "linear-gradient(160deg, var(--brand-green-darkest), var(--brand-green-dark) 50%, var(--brand-green))",
      }}
      aria-hidden
    >
      <Leaf size={Math.round(size * 0.55)} strokeWidth={1.5} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Typography helpers — never use Tailwind size/weight utilities (per brief).
// ---------------------------------------------------------------------------

export function H1({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={className} style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.5 }}>
      {children}
    </h1>
  );
}

export function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={className} style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.5 }}>
      {children}
    </h2>
  );
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={className} style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}>
      {children}
    </span>
  );
}

export function Body({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={className} style={{ fontSize: 15, fontWeight: 400, lineHeight: 1.5 }}>
      {children}
    </span>
  );
}

export function Subtle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={className}
      style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: "var(--text-secondary)" }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type BaseButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
};

export function PrimaryButton({
  children,
  className = "",
  fullWidth = true,
  ...rest
}: BaseButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[8px] px-4 py-3 text-white shadow-sm transition active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      style={{ background: "var(--cta-amber)", fontSize: 15, fontWeight: 500 }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  fullWidth = false,
  ...rest
}: BaseButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[8px] px-4 py-3 transition active:translate-y-px disabled:opacity-50 ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      style={{
        background: "transparent",
        border: "1px solid var(--brand-green)",
        color: "var(--brand-green-dark)",
        fontSize: 15,
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  fullWidth = false,
  ...rest
}: BaseButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[8px] px-3 py-2 transition active:translate-y-px ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 500 }}
    >
      {children}
    </button>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  ariaLabel: string;
  size?: number;
}

export function IconButton({ icon: Icon, ariaLabel, size = 20, className = "", ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-[8px] p-2 transition hover:bg-slate-100 ${className}`}
    >
      <Icon size={size} strokeWidth={1.5} color="var(--text-secondary)" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cards / Sections / Lists
// ---------------------------------------------------------------------------

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ children, className = "", padded = true, style, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-[12px] bg-white ${padded ? "p-4" : ""} ${className}`}
      style={{
        border: "1px solid var(--border-default)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between">
          {title ? <Label>{title}</Label> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ListItem({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  className = "",
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const isInteractive = typeof onClick === "function";
  const Wrapper = (isInteractive ? "button" : "div") as "button" | "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
        isInteractive ? "transition hover:bg-slate-50" : ""
      } ${className}`}
    >
      {leading}
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: "var(--text-secondary)" }}>
            {subtitle}
          </div>
        )}
      </div>
      {trailing}
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// Pills / Chips
// ---------------------------------------------------------------------------

export type PillTone = "slate" | "green" | "amber" | "red";

const PILL_TONES: Record<PillTone, { bg: string; text: string; border: string }> = {
  slate: { bg: "#F1F5F9", text: "#475569", border: "#E2E8F0" },
  green: { bg: "var(--brand-tint)", text: "var(--brand-green-dark)", border: "var(--brand-border)" },
  amber: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  red: { bg: "#FEE2E2", text: "#B91C1C", border: "#FECACA" },
};

export function CategoryPill({
  children,
  tone = "slate",
  icon: Icon,
  className = "",
}: {
  children: React.ReactNode;
  tone?: PillTone;
  icon?: LucideIcon;
  className?: string;
}) {
  const t = PILL_TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${className}`}
      style={{
        background: t.bg,
        color: t.text,
        border: `1px solid ${t.border}`,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {Icon && <Icon size={12} strokeWidth={1.75} />}
      {children}
    </span>
  );
}

export function ChipFilter({
  children,
  active = false,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 transition ${className}`}
      style={{
        background: active ? "var(--brand-green)" : "white",
        color: active ? "white" : "var(--text-secondary)",
        border: `1px solid ${active ? "var(--brand-green)" : "var(--border-default)"}`,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Avatar — deterministic green/amber/slate from a string seed.
// ---------------------------------------------------------------------------

const AVATAR_TONES: PillTone[] = ["green", "amber", "slate"];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickAvatarTone(seed: string): PillTone {
  return AVATAR_TONES[hashSeed(seed) % AVATAR_TONES.length];
}

export function Avatar({
  name,
  seed,
  size = 36,
  tone,
  className = "",
}: {
  /** Pass the user's full name; component computes initials via getInitials. */
  name: string | null | undefined;
  /** Optional seed for tone pick — defaults to the name itself. */
  seed?: string;
  size?: number;
  tone?: PillTone;
  className?: string;
}) {
  const initials = getInitials(name);
  const palette = PILL_TONES[tone ?? pickAvatarTone(seed ?? name ?? "?")];
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        fontSize: Math.round(size * 0.38),
        fontWeight: 600,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

export function StatCard({
  label,
  value,
  emphasis = false,
  hint,
  className = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  emphasis?: boolean;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col gap-1 ${className}`}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{label}</span>
      <span
        style={{
          fontSize: 28,
          fontWeight: 600,
          lineHeight: 1.2,
          color: emphasis ? "var(--brand-green)" : "var(--text-primary)",
        }}
      >
        {value}
      </span>
      {hint && (
        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>{hint}</span>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty states / Toasts
// ---------------------------------------------------------------------------

export function EmptyState({
  icon: Icon = Leaf,
  title,
  body,
  action,
  className = "",
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col items-center gap-3 text-center py-10 ${className}`}>
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 48,
          height: 48,
          background: "var(--brand-tint)",
          color: "var(--brand-green-dark)",
          border: "1px solid var(--brand-border)",
        }}
      >
        <Icon size={22} strokeWidth={1.5} />
      </span>
      <H2>{title}</H2>
      {body && <Subtle>{body}</Subtle>}
      {action}
    </Card>
  );
}

export type ToastTone = "info" | "success" | "error";

export function Toast({
  tone = "info",
  children,
  onDismiss,
  className = "",
}: {
  tone?: ToastTone;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const palette =
    tone === "success"
      ? { bg: "var(--brand-tint)", text: "var(--brand-green-dark)", border: "var(--brand-border)" }
      : tone === "error"
        ? { bg: "#FEE2E2", text: "#B91C1C", border: "#FECACA" }
        : { bg: "white", text: "var(--text-primary)", border: "var(--border-default)" };
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-[12px] px-3 py-2 shadow-sm ${className}`}
      style={{
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div className="flex-1" style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.5 }}>
        {children}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="-m-1 p-1">
          <X size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal / Sheet — controlled, no portal needed for MVP scaffolding.
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 w-full max-w-[520px] rounded-[12px] bg-white p-5"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)" }}
      >
        {title && <div className="mb-3"><H2>{title}</H2></div>}
        <div className="flex flex-col gap-3">{children}</div>
        {footer && <div className="mt-4 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 w-full rounded-t-[16px] bg-white p-5 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: "0 -2px 12px rgba(15, 23, 42, 0.12)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        {title && <div className="mb-3"><H2>{title}</H2></div>}
        <div className="flex flex-col gap-3">{children}</div>
        {footer && <div className="mt-4 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper (qty +/-)
// ---------------------------------------------------------------------------

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  ariaLabel = "Quantity",
  className = "",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(1)));
  const inc = () => onChange(typeof max === "number" ? Math.min(max, +(value + step).toFixed(1)) : +(value + step).toFixed(1));
  return (
    <div
      className={`inline-flex items-center rounded-[8px] ${className}`}
      style={{ border: "1px solid var(--border-default)" }}
      aria-label={ariaLabel}
      role="group"
    >
      <button onClick={dec} className="px-2 py-1.5" aria-label="Decrease">
        <Minus size={16} strokeWidth={1.5} color="var(--text-secondary)" />
      </button>
      <span className="px-3 tabular-nums" style={{ fontSize: 15, fontWeight: 500 }}>
        {value}
      </span>
      <button onClick={inc} className="px-2 py-1.5" aria-label="Increase">
        <Plus size={16} strokeWidth={1.5} color="var(--text-secondary)" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  required = false,
  className = "",
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
          {label}
          {required && <span style={{ color: "var(--error)" }}> *</span>}
        </span>
      )}
      {children}
      {error && <span style={{ fontSize: 12, color: "var(--error)" }}>{error}</span>}
      {!error && hint && (
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{hint}</span>
      )}
    </label>
  );
}

const baseInput =
  "w-full rounded-[8px] bg-white px-3 py-2.5 outline-none transition focus:border-[var(--brand-green)]";
const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border-default)",
  fontSize: 15,
  fontWeight: 400,
  color: "var(--text-primary)",
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", style, ...rest } = props;
  return <input {...rest} className={`${baseInput} ${className}`} style={{ ...inputStyle, ...style }} />;
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", style, ...rest } = props;
  return (
    <input
      {...rest}
      type="number"
      className={`${baseInput} tabular-nums ${className}`}
      style={{ ...inputStyle, ...style }}
    />
  );
}

export function MoneyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", style, ...rest } = props;
  return (
    <div className={`relative ${className}`}>
      <span
        aria-hidden
        className="absolute inset-y-0 left-3 flex items-center"
        style={{ color: "var(--text-secondary)", fontSize: 15 }}
      >
        $
      </span>
      <input
        {...rest}
        inputMode="decimal"
        className={`${baseInput} tabular-nums pl-7`}
        style={{ ...inputStyle, ...style }}
      />
    </div>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", style, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`${baseInput} ${className}`}
      style={{ ...inputStyle, minHeight: 96, ...style }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", style, children, ...rest } = props;
  return (
    <select {...rest} className={`${baseInput} ${className}`} style={{ ...inputStyle, ...style }}>
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Segmented control (used for count/lbs unit picker)
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  options: ReadonlyArray<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex rounded-[8px] p-0.5 ${className}`}
      style={{ background: "#F1F5F9", border: "1px solid var(--border-default)" }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="rounded-[6px] px-3 py-1.5 transition"
            style={{
              background: active ? "white" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 500,
              boxShadow: active ? "0 1px 3px rgba(15, 23, 42, 0.08)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top app bar
// ---------------------------------------------------------------------------

export function TopAppBar({
  title,
  back,
  right,
}: {
  title: React.ReactNode;
  back?: { onClick?: () => void; href?: string };
  right?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between bg-white px-3"
      style={{ borderBottom: "1px solid var(--border-default)" }}
    >
      <div className="flex w-10 items-center justify-start">
        {back &&
          (back.href ? (
            <a href={back.href} aria-label="Back" className="-m-1 p-1">
              <ChevronLeft size={22} strokeWidth={1.5} color="var(--text-secondary)" />
            </a>
          ) : (
            <button onClick={back.onClick} aria-label="Back" className="-m-1 p-1">
              <ChevronLeft size={22} strokeWidth={1.5} color="var(--text-secondary)" />
            </button>
          ))}
      </div>
      <div className="flex-1 text-center" style={{ fontSize: 16, fontWeight: 600 }}>
        {title}
      </div>
      <div className="flex w-10 items-center justify-end">{right}</div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Bottom tab bar (mobile, 4 tabs)
// ---------------------------------------------------------------------------

export interface TabDef {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const APP_TABS: ReadonlyArray<TabDef> = [
  { href: "/log", label: "Log", icon: Camera },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/history", label: "History", icon: History },
  { href: "/profile", label: "Profile", icon: User },
] as const;

/** Match a pathname against a tab href (with section matching for /log/*). */
export function isTabActive(tabHref: string, pathname: string): boolean {
  if (tabHref === "/log") return pathname === "/log" || pathname.startsWith("/log/");
  return pathname === tabHref || pathname.startsWith(`${tabHref}/`);
}

export function BottomTabBar({
  tabs = APP_TABS,
  pathname,
  className = "",
}: {
  tabs?: ReadonlyArray<TabDef>;
  pathname: string;
  className?: string;
}) {
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-30 flex items-stretch bg-white md:hidden ${className}`}
      style={{ borderTop: "1px solid var(--border-default)" }}
    >
      {tabs.map((t) => {
        const active = isTabActive(t.href, pathname);
        const Icon = t.icon;
        return (
          <a
            key={t.href}
            href={t.href}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
            aria-current={active ? "page" : undefined}
          >
            <Icon
              size={22}
              strokeWidth={active ? 2 : 1.5}
              color={active ? "var(--brand-green)" : "var(--text-secondary)"}
              fill={active ? "var(--brand-tint)" : "none"}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: active ? "var(--brand-green)" : "var(--text-secondary)",
              }}
            >
              {t.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// iPad shell — 240px sidebar + main content. Hidden below md breakpoint.
// ---------------------------------------------------------------------------

export function IpadSidebar({
  pathname,
  user,
  onSignOut,
}: {
  pathname: string;
  user?: { name: string | null | undefined; email?: string | null };
  onSignOut?: () => void;
}) {
  const tabs = APP_TABS;
  return (
    <aside
      className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-white"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex items-center gap-3 px-5 py-5">
        <WellspringLogo size={36} />
        <div className="flex flex-col">
          <span style={{ fontSize: 15, fontWeight: 600 }}>Wellspring</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Volunteer</span>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {tabs.map((t) => {
          const active = isTabActive(t.href, pathname);
          const Icon = t.icon;
          return (
            <a
              key={t.href}
              href={t.href}
              className="flex items-center gap-3 rounded-[8px] px-3 py-2 transition hover:bg-slate-50"
              style={{
                background: active ? "var(--brand-tint)" : "transparent",
                color: active ? "var(--brand-green-dark)" : "var(--text-primary)",
              }}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                size={18}
                strokeWidth={1.5}
                color={active ? "var(--brand-green-dark)" : "var(--text-secondary)"}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{t.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 px-3 pb-5">
        <div
          className="my-3 h-px"
          style={{ background: "var(--border-default)" }}
          aria-hidden
        />
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2 text-left transition hover:bg-slate-50"
            style={{ color: "var(--error)", fontSize: 14, fontWeight: 500 }}
          >
            Sign out
          </button>
        )}
        {user?.name && (
          <div className="flex items-center gap-3 rounded-[8px] px-3 py-2">
            <Avatar name={user.name} size={32} />
            <div className="flex flex-col min-w-0">
              <span style={{ fontSize: 13, fontWeight: 500 }} className="truncate">
                {user.name}
              </span>
              {user.email && (
                <span
                  style={{ fontSize: 12, color: "var(--text-secondary)" }}
                  className="truncate"
                >
                  {user.email}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export function IpadShell({
  sidebar,
  children,
  className = "",
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-screen ${className}`}>
      {sidebar}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-6 py-5 ${className}`}>
      <div className="min-w-0">
        <H1>{title}</H1>
        {subtitle && <Subtle>{subtitle}</Subtle>}
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Method card (used on Log Hub: Photo / Quick Pick / Manual)
// ---------------------------------------------------------------------------

export type MethodCardTone = "amber" | "green" | "slate";

const METHOD_CARD_TONES: Record<MethodCardTone, { iconBg: string; iconColor: string; border: string; bg: string }> = {
  amber: {
    iconBg: "#FEF3C7",
    iconColor: "#B45309",
    border: "#F59E0B",
    bg: "#FFFBEB",
  },
  green: {
    iconBg: "var(--brand-tint)",
    iconColor: "var(--brand-green-dark)",
    border: "var(--brand-border)",
    bg: "white",
  },
  slate: {
    iconBg: "#F1F5F9",
    iconColor: "#475569",
    border: "var(--border-default)",
    bg: "white",
  },
};

export function MethodCard({
  href,
  icon: Icon,
  title,
  subtitle,
  tone = "slate",
}: {
  href: string;
  icon: LucideIcon;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  tone?: MethodCardTone;
}) {
  const t = METHOD_CARD_TONES[tone];
  return (
    <a
      href={href}
      className="flex w-full items-center gap-4 rounded-[12px] p-4 transition active:translate-y-px"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
      }}
    >
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-[12px]"
        style={{ background: t.iconBg, color: t.iconColor }}
      >
        <Icon size={24} strokeWidth={1.5} />
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {subtitle}
        </div>
      </div>
      <ChevronRight size={20} strokeWidth={1.5} color="var(--text-secondary)" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// New Category Modal — POST /api/categories then bubbles the new Category up.
// Used from Manual Entry, Quick Pick, and (Phase 3) AI Review.
// Per wellspring-build-brief.md §Screen 4b — must use Count/Lbs segmented
// control (the produce tip below).
// ---------------------------------------------------------------------------

export function NewCategoryModal({
  programs,
  defaultProgramId,
  isOpen,
  onClose,
  onCreated,
}: {
  programs: import("@/lib/types").Program[];
  defaultProgramId?: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (category: import("@/lib/types").Category) => void;
}) {
  const [name, setName] = React.useState("");
  const [programId, setProgramId] = React.useState<string>(defaultProgramId ?? programs[0]?.id ?? "");
  const [defaultUnit, setDefaultUnit] = React.useState<import("@/lib/types").Unit>("count");
  const [submitting, setSubmitting] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  // Reset state when reopening; preselect defaultProgramId or first program.
  React.useEffect(() => {
    if (isOpen) {
      setName("");
      setProgramId(defaultProgramId ?? programs[0]?.id ?? "");
      setDefaultUnit("count");
      setFieldError(null);
      setSubmitting(false);
    }
  }, [isOpen, defaultProgramId, programs]);

  const handleSubmit = async () => {
    setFieldError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldError("Category name is required.");
      return;
    }
    if (!programId) {
      setFieldError("Pick a program for this category.");
      return;
    }
    setSubmitting(true);
    try {
      const { apiClient, ApiClientError } = await import("../../lib/api-client");
      const cat = await apiClient.createCategory({ name: trimmed, programId, defaultUnit });
      apiClient.invalidateCategoriesCache();
      onCreated(cat);
      onClose();
    } catch (err) {
      const e = err as { code?: string; message?: string; name?: string };
      if (e?.name === "ApiClientError" && e.code === "CONFLICT") {
        setFieldError("A category with this name already exists in that program.");
      } else if (e?.name === "ApiClientError" && e.code === "VALIDATION_ERROR") {
        setFieldError(e.message || "Please check the form and try again.");
      } else {
        setFieldError(e?.message || "Couldn't create the category. Please try again.");
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="New category"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="button" fullWidth={false} onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create category"}
          </PrimaryButton>
        </>
      }
    >
      <Field label="Category name" required error={fieldError ?? undefined}>
        <TextInput
          autoFocus
          placeholder="e.g. Toothbrushes"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Program" required>
        <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
          <option value="" disabled>
            Pick a program…
          </option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Default measurement"
        hint={
          <>
            Most produce is measured in <strong>lbs</strong>. Use <strong>count</strong> for packaged
            items like diapers or toothbrushes.
          </>
        }
      >
        <Segmented<import("@/lib/types").Unit>
          ariaLabel="Default measurement"
          options={[
            { value: "count", label: "Count" },
            { value: "lbs", label: "Lbs" },
          ]}
          value={defaultUnit}
          onChange={setDefaultUnit}
        />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Re-export commonly-used icons so screens don't repeat lucide imports.
// ---------------------------------------------------------------------------

export {
  Camera,
  Zap,
  PenLine,
  Plus,
  Minus,
  X,
  Check,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Leaf,
  BarChart2,
  History,
  User,
};
export type { LucideIcon };
