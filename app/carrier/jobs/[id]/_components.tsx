"use client";

// ----- Auth -----

export function getCarrierToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("t");
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function withCarrierToken(path: string, tokenOverride?: string): string {
  const t = tokenOverride ?? getCarrierToken();
  if (!t) return path;
  return path.includes("?") ? `${path}&t=${encodeURIComponent(t)}` : `${path}?t=${encodeURIComponent(t)}`;
}

export function authHeaders(json = true, tokenOverride?: string): Record<string, string> {
  const token = tokenOverride ?? getCarrierToken();
  const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ----- API helpers -----

export async function uploadFile(file: File, jobId: string, tokenOverride?: string): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("jobId", jobId);
  const headers = authHeaders(false, tokenOverride);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers,
    body: form,
  });
  const data = await res.json();
  if (!data.ok) return null;
  return data.storageKey;
}

export async function submitEvidenceItems(
  jobId: string,
  items: { type: string; storageKey?: string; value?: string }[],
  tokenOverride?: string,
): Promise<{ ok: boolean; accepted?: number; error?: string }> {
  const res = await fetch(`/api/jobs/${jobId}/evidence`, {
    method: "POST",
    headers: authHeaders(true, tokenOverride),
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.detail || data.error || "Failed" };
  return { ok: true, accepted: data.inserted };
}

export async function doAction(
  jobId: string,
  endpoint: string,
  body: Record<string, unknown> = {},
  tokenOverride?: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/jobs/${jobId}/${endpoint}`, {
    method: "POST",
    headers: authHeaders(true, tokenOverride),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.detail || data.error || "Failed" };
  return { ok: true };
}

export async function fetchReview(jobId: string, tokenOverride?: string) {
  const res = await fetch(`/api/jobs/${jobId}/review`, { headers: authHeaders(true, tokenOverride) });
  return res.json();
}

// ----- Routing -----

export function statusRoute(jobId: string, status: string): string {
  if (["ASSIGNED", "ACCEPTED"].includes(status)) return withCarrierToken(`/carrier/jobs/${jobId}/pickup`);
  if (status === "PICKUP_CONFIRMED") return withCarrierToken(`/carrier/jobs/${jobId}/delivery`);
  return withCarrierToken(`/carrier/jobs/${jobId}/status`);
}

export function statusRouteForToken(token: string, status: string): string {
  if (["ASSIGNED", "ACCEPTED"].includes(status)) return `/c/${encodeURIComponent(token)}/pickup`;
  if (status === "PICKUP_CONFIRMED") return `/c/${encodeURIComponent(token)}/delivery`;
  return `/c/${encodeURIComponent(token)}/status`;
}
