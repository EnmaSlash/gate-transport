export type CarrierFetchErrorCode = "LINK_INVALID_OR_EXPIRED" | "NETWORK" | "UNKNOWN";

export class CarrierFetchError extends Error {
  code: CarrierFetchErrorCode;
  constructor(code: CarrierFetchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

async function parseJsonSafely(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function carrierFetchJson(
  token: string,
  input: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: any } | { ok: false; error: CarrierFetchError }> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await parseJsonSafely(res);

    if (res.status === 404 && typeof data?.code === "string" && data.code.startsWith("CARRIER_INVITE_")) {
      return {
        ok: false,
        error: new CarrierFetchError(
          "LINK_INVALID_OR_EXPIRED",
          "Link invalid/expired. Ask dispatch for a new link.",
        ),
      };
    }

    if (!res.ok) {
      const detail =
        (typeof data?.detail === "string" && data.detail) ||
        (typeof data?.error === "string" && data.error) ||
        `Request failed (${res.status})`;
      return { ok: false, error: new CarrierFetchError("UNKNOWN", detail) };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, error: new CarrierFetchError("NETWORK", "Network error") };
  }
}

export async function carrierPostJson(
  token: string,
  url: string,
  body: any = {},
): Promise<{ ok: true; data: any } | { ok: false; error: CarrierFetchError }> {
  return carrierFetchJson(token, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

