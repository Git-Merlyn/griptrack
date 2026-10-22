// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getAppUrl, corsHeaders, DEFAULT_APP_URL, json } from "./http.ts";

describe("json()", () => {
  it("defaults to 200 with JSON + CORS headers", async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(corsHeaders["Access-Control-Allow-Headers"]);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("uses the given status and serialises arrays", async () => {
    const res = json([{ a: 1 }], 422);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual([{ a: 1 }]);
  });
});

describe("corsHeaders", () => {
  it("allows the headers supabase-js sends", () => {
    for (const h of ["authorization", "x-client-info", "apikey", "content-type"]) {
      expect(corsHeaders["Access-Control-Allow-Headers"]).toContain(h);
    }
    expect(corsHeaders["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
  });
});

describe("getAppUrl()", () => {
  const env = (v: string | undefined) => (k: string) => (k === "APP_URL" ? v : undefined);

  it("falls back to production when APP_URL is unset or blank", () => {
    expect(getAppUrl(env(undefined))).toBe(DEFAULT_APP_URL);
    expect(getAppUrl(env("   "))).toBe(DEFAULT_APP_URL);
    expect(DEFAULT_APP_URL).toBe("https://griptrack.app");
  });

  it("uses APP_URL and strips trailing slashes", () => {
    expect(getAppUrl(env("https://staging.griptrack.app/"))).toBe("https://staging.griptrack.app");
    expect(getAppUrl(env(" http://127.0.0.1:3000// "))).toBe("http://127.0.0.1:3000");
  });

  it("works with no Deno global (default getter)", () => {
    expect(getAppUrl()).toBe(DEFAULT_APP_URL);
  });
});
