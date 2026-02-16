import { describe, it, expect } from "vitest";
import { carrierFetchJson } from "@/app/c/_lib/carrierFetch";

describe("carrierFetchJson", () => {
  it("sets Authorization header from provided token (no localStorage)", async () => {
    const origFetch = globalThis.fetch;
    let seenAuth: string | null = null;

    globalThis.fetch = (async (_input: any, init?: any) => {
      seenAuth = init?.headers?.Authorization ?? init?.headers?.authorization ?? null;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;

    const r = await carrierFetchJson("carrier_token", "http://example.test/api/x");
    expect(r.ok).toBe(true);
    expect(seenAuth).toBe("Bearer carrier_token");

    globalThis.fetch = origFetch!;
  });
});

