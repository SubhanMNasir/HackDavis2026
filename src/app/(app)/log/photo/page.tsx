"use client";

// Photo Capture — Phase 3: input + heic2any + canvas downscale + recognize call.
// Per wellspring-build-brief.md §Screen 3 and CONTRACTS §6.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Card,
  H2,
  PageHeader,
  PrimaryButton,
  Subtle,
  Toast,
  TopAppBar,
} from "../../../components/wellspring/shared";
import { apiClient, ApiClientError } from "../../../lib/api-client";
import { toastForCode } from "../../../lib/error-toast-map";

const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB raw upload guard
const MAX_RESULT_BYTES = 5 * 1024 * 1024; // 5 MB after downscale (per /api/recognize limit)
const PRIMARY_LONGEST_EDGE = 2048;
const FALLBACK_LONGEST_EDGE = 1600;

const HEIC_MIME = ["image/heic", "image/heif"];

function isHeic(file: File): boolean {
  if (HEIC_MIME.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}

/** Render a Blob/File into a canvas downscaled so longest edge <= maxEdge, return JPEG blob. */
async function downscaleToJpeg(source: Blob, maxEdge: number, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Image decode failed"));
      i.src = url;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error("Image has no dimensions");
    const longest = Math.max(w, h);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d unavailable");
    ctx.drawImage(img, 0, 0, tw, th);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

export default function PhotoPage() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [busyLabel, setBusyLabel] = React.useState("Recognizing…");
  const [errorToast, setErrorToast] = React.useState<string | null>(null);

  const reset = () => {
    setBusy(false);
    setBusyLabel("Recognizing…");
    if (inputRef.current) inputRef.current.value = "";
  };

  const openPicker = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_INPUT_BYTES) {
      setErrorToast("Image too large. Try a smaller photo.");
      reset();
      return;
    }

    setBusy(true);
    setBusyLabel("Preparing photo…");

    try {
      let working: Blob = file;

      if (isHeic(file)) {
        try {
          const heic2anyMod = (await import("heic2any")).default;
          const out = await heic2anyMod({ blob: file, toType: "image/jpeg", quality: 0.85 });
          working = Array.isArray(out) ? out[0] : out;
        } catch {
          setErrorToast(toastForCode("INVALID_IMAGE"));
          reset();
          return;
        }
      }

      let scaled: Blob;
      try {
        scaled = await downscaleToJpeg(working, PRIMARY_LONGEST_EDGE);
      } catch {
        setErrorToast(toastForCode("INVALID_IMAGE"));
        reset();
        return;
      }

      if (scaled.size > MAX_RESULT_BYTES) {
        try {
          scaled = await downscaleToJpeg(working, FALLBACK_LONGEST_EDGE);
        } catch {
          setErrorToast(toastForCode("INVALID_IMAGE"));
          reset();
          return;
        }
        if (scaled.size > MAX_RESULT_BYTES) {
          setErrorToast("Image too large. Try a smaller photo.");
          reset();
          return;
        }
      }

      const dataUrl = await blobToDataUrl(scaled);
      setBusyLabel("Recognizing…");

      const result = await apiClient.recognizeImage({
        image: dataUrl,
        mimeType: "image/jpeg",
      });

      if (result.matchedCount === 0) {
        setErrorToast("Could not match item to catalog. Try again or manually select.");
        reset();
        router.push("/log");
        return;
      }

      sessionStorage.setItem(
        "wellspring:recognized",
        JSON.stringify({
          items: result.items,
          photoDataUrl: dataUrl,
          capturedAt: new Date().toISOString(),
        }),
      );
      router.push("/log/review");
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorToast(toastForCode(err.code));
      } else {
        setErrorToast(toastForCode("INTERNAL"));
      }
      reset();
    }
  };

  return (
    <>
      <div className="md:hidden">
        <TopAppBar title="Photo entry" back={{ href: "/log" }} />
      </div>
      <div className="hidden md:block">
        <PageHeader title="Photo entry" subtitle="Snap a pile and we'll fill in the items." />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />

      <div className="mx-auto grid w-full max-w-[1024px] gap-4 px-4 py-5 md:grid-cols-2 md:px-6">
        {errorToast && (
          <div className="md:col-span-2">
            <Toast tone="error" onDismiss={() => setErrorToast(null)}>
              {errorToast}
            </Toast>
          </div>
        )}

        {/* Drop zone — also acts as picker target. */}
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-3 rounded-[12px] bg-white py-12 text-center disabled:opacity-50"
          style={{
            border: "1px dashed var(--brand-border)",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
          }}
        >
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
          <Subtle>JPEG / PNG / WebP / HEIC up to 15 MB.</Subtle>
        </button>

        {/* Tips card */}
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

      {/* Sticky CTA */}
      <div className="sticky bottom-16 z-20 px-4 pb-4 md:static md:px-6 md:pb-6">
        <PrimaryButton type="button" onClick={openPicker} disabled={busy}>
          {busy ? busyLabel : "Open Camera"}
        </PrimaryButton>
      </div>

      {/* Loading overlay */}
      {busy && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ background: "rgba(15, 23, 42, 0.45)" }}
          aria-live="polite"
          role="status"
        >
          <div
            className="flex flex-col items-center gap-3 rounded-[12px] bg-white px-6 py-5"
            style={{ boxShadow: "0 4px 12px rgba(15, 23, 42, 0.18)" }}
          >
            <span
              className="inline-block h-8 w-8 animate-spin rounded-full"
              style={{
                border: "3px solid var(--brand-border)",
                borderTopColor: "var(--brand-green)",
              }}
              aria-hidden
            />
            <span style={{ fontSize: 14, fontWeight: 500 }}>{busyLabel}</span>
          </div>
        </div>
      )}
    </>
  );
}
