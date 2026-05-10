// Typed wrapper around every endpoint in CONTRACTS §4.
// On 401 → redirects to /sign-in.
// On non-2xx → throws an ApiClientError carrying { code, message, details }.
// Never sets denormalized fields (loggedBy*, *Name, createdAt, updatedAt, deleted).

import type {
  ApiError,
  AuditEvent,
  AuditEventType,
  CatalogItem,
  Category,
  Donation,
  DonationSource,
  Program,
  ProfileResponse,
  RecognizedItem,
  ReportSummary,
  Unit,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

interface FetchJsonOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Optional AbortSignal so callers can cancel. */
  signal?: AbortSignal;
}

async function fetchJson<T>(path: string, opts: FetchJsonOpts = {}): Promise<T> {
  const { method = "GET", body, signal } = opts;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
      // Clerk's session cookie is sent automatically; same-origin is implicit.
      credentials: "same-origin",
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    throw new ApiClientError(0, "NETWORK", "Network request failed");
  }

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/sign-in";
    }
    throw new ApiClientError(401, "UNAUTHENTICATED", "Sign in required");
  }

  // Some endpoints return a CSV body; callers handle those via fetchBlob below.
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  let parsed: unknown = undefined;
  const text = await res.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON body — surface it on errors only.
      if (!res.ok) {
        throw new ApiClientError(res.status, "INTERNAL", text || res.statusText);
      }
      return undefined as unknown as T;
    }
  }

  if (!res.ok) {
    const env = parsed as Partial<ApiError> | undefined;
    const code = env?.error?.code ?? "INTERNAL";
    const message = env?.error?.message ?? res.statusText;
    throw new ApiClientError(res.status, code, message, env?.error?.details);
  }

  return parsed as T;
}

/** For binary downloads (CSV). Same auth/error semantics. */
async function fetchBlob(path: string, opts: FetchJsonOpts = {}): Promise<{ blob: Blob; filename: string | null }> {
  const { method = "GET", body, signal } = opts;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    throw new ApiClientError(0, "NETWORK", "Network request failed");
  }

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/sign-in";
    }
    throw new ApiClientError(401, "UNAUTHENTICATED", "Sign in required");
  }

  if (!res.ok) {
    const text = await res.text();
    let code = "INTERNAL";
    let message = res.statusText;
    try {
      const env = JSON.parse(text) as Partial<ApiError> | undefined;
      if (env?.error) {
        code = env.error.code ?? code;
        message = env.error.message ?? message;
      }
    } catch {
      message = text || message;
    }
    throw new ApiClientError(res.status, code, message);
  }

  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(cd);
  return { blob: await res.blob(), filename: m?.[1] ?? null };
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// ---------------------------------------------------------------------------
// Programs (§4.2)
// ---------------------------------------------------------------------------

export async function listPrograms(signal?: AbortSignal): Promise<Program[]> {
  const json = await fetchJson<{ programs: Program[] }>("/api/programs", { signal });
  return json.programs;
}

// ---------------------------------------------------------------------------
// Categories (§4.3)
// ---------------------------------------------------------------------------

export interface ListCategoriesParams {
  programId?: string;
  active?: boolean;
}

export async function listCategories(
  params: ListCategoriesParams = {},
  signal?: AbortSignal,
): Promise<Category[]> {
  const qs = buildQuery({
    programId: params.programId,
    active: params.active === undefined ? undefined : String(params.active),
  });
  const json = await fetchJson<{ categories: Category[] }>(`/api/categories${qs}`, { signal });
  return json.categories;
}

export interface CreateCategoryBody {
  name: string;
  programId: string;
  defaultUnit: Unit;
}

export async function createCategory(body: CreateCategoryBody): Promise<Category> {
  const json = await fetchJson<{ category: Category }>("/api/categories", {
    method: "POST",
    body,
  });
  return json.category;
}

export interface UpdateCategoryBody {
  name?: string;
  defaultUnit?: Unit;
}

export async function updateCategory(id: string, body: UpdateCategoryBody): Promise<Category> {
  const json = await fetchJson<{ category: Category }>(`/api/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
  return json.category;
}

export async function archiveCategory(id: string): Promise<{ archived: true; id: string }> {
  return fetchJson<{ archived: true; id: string }>(`/api/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Catalog (§4.1)
// ---------------------------------------------------------------------------

export interface ListCatalogParams {
  categoryId?: string;
  q?: string;
  active?: boolean;
}

export async function listCatalog(
  params: ListCatalogParams = {},
  signal?: AbortSignal,
): Promise<CatalogItem[]> {
  const qs = buildQuery({
    categoryId: params.categoryId,
    q: params.q,
    active: params.active === undefined ? undefined : String(params.active),
  });
  const json = await fetchJson<{ items: CatalogItem[] }>(`/api/catalog${qs}`, { signal });
  return json.items;
}

// ---------------------------------------------------------------------------
// Donations (§4.4)
// ---------------------------------------------------------------------------

/** Per-row payload for POST /api/donations. NEVER includes denormalized fields. */
export interface CreateDonationItem {
  itemId: string | null;
  itemName: string;
  categoryId: string;
  quantity: number;
  unit: Unit;
  estimatedValue: number;
  source: DonationSource;
  photoUrl?: string | null; // MVP always null
  notes?: string | null;
  donatedAt?: string;
}

export async function createDonations(
  donations: CreateDonationItem[],
): Promise<{ donations: Donation[]; createdCount: number }> {
  return fetchJson<{ donations: Donation[]; createdCount: number }>("/api/donations", {
    method: "POST",
    body: { donations },
  });
}

export interface ListDonationsParams {
  mine?: boolean;
  from?: string;
  to?: string;
  includeDeleted?: boolean;
  limit?: number;
}

export async function listDonations(
  params: ListDonationsParams = {},
  signal?: AbortSignal,
): Promise<Donation[]> {
  const qs = buildQuery({
    mine: params.mine === undefined ? undefined : String(params.mine),
    from: params.from,
    to: params.to,
    includeDeleted: params.includeDeleted === undefined ? undefined : String(params.includeDeleted),
    limit: params.limit,
  });
  const json = await fetchJson<{ donations: Donation[] }>(`/api/donations${qs}`, { signal });
  return json.donations;
}

export interface UpdateDonationBody {
  quantity?: number;
  unit?: Unit;
  estimatedValue?: number;
  notes?: string | null;
  donatedAt?: string;
  categoryId?: string;
}

export async function updateDonation(id: string, body: UpdateDonationBody): Promise<Donation> {
  const json = await fetchJson<{ donation: Donation }>(`/api/donations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
  return json.donation;
}

export async function deleteDonation(id: string): Promise<{ deleted: true; id: string }> {
  return fetchJson<{ deleted: true; id: string }>(`/api/donations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// AI recognition (§4.5)
// ---------------------------------------------------------------------------

export interface RecognizeBody {
  image: string; // base64 (data: prefix tolerated)
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface RecognizeResponse {
  items: RecognizedItem[];
  rawCount: number;
  matchedCount: number;
}

export async function recognizeImage(body: RecognizeBody): Promise<RecognizeResponse> {
  return fetchJson<RecognizeResponse>("/api/recognize", { method: "POST", body });
}

// ---------------------------------------------------------------------------
// Reports (§4.6)
// ---------------------------------------------------------------------------

export interface ReportsParams {
  from: string;
  to: string;
  groupBy?: "item" | "category" | "program";
}

export async function getReport(
  params: ReportsParams,
  signal?: AbortSignal,
): Promise<ReportSummary> {
  const qs = buildQuery({
    from: params.from,
    to: params.to,
    groupBy: params.groupBy,
  });
  return fetchJson<ReportSummary>(`/api/reports${qs}`, { signal });
}

export interface ReportsCsvParams {
  from: string;
  to: string;
}

/** Returns the CSV blob + parsed filename from the Content-Disposition header. */
export async function downloadReportsCsv(params: ReportsCsvParams) {
  const qs = buildQuery({ from: params.from, to: params.to });
  return fetchBlob(`/api/reports/csv${qs}`);
}

// ---------------------------------------------------------------------------
// Audit / History (§4.7)
// ---------------------------------------------------------------------------

export interface ListEventsParams {
  from?: string;
  to?: string;
  actor?: string;
  type?: AuditEventType[];
  limit?: number;
}

export async function listEvents(
  params: ListEventsParams = {},
  signal?: AbortSignal,
): Promise<AuditEvent[]> {
  const qs = buildQuery({
    from: params.from,
    to: params.to,
    actor: params.actor,
    type: params.type ? params.type.join(",") : undefined,
    limit: params.limit,
  });
  const json = await fetchJson<{ events: AuditEvent[] }>(`/api/events${qs}`, { signal });
  return json.events;
}

// ---------------------------------------------------------------------------
// Profile (§4.9)
// ---------------------------------------------------------------------------

export interface ProfileMeParams {
  from: string;
  to: string;
}

export async function getProfileMe(
  params: ProfileMeParams,
  signal?: AbortSignal,
): Promise<ProfileResponse> {
  const qs = buildQuery({ from: params.from, to: params.to });
  return fetchJson<ProfileResponse>(`/api/profile/me${qs}`, { signal });
}
