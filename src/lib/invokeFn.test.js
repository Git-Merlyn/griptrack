import { describe, it, expect, vi, beforeEach } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { functions: { invoke } },
}));

import { invokeFn } from "./invokeFn";

// Shape supabase-js gives a non-2xx: error.message is generic, the real
// reason is only in the Response body.
function httpFailure(body, status, { withResponseField = true } = {}) {
  const res = {
    status,
    json: vi.fn(async () => {
      if (body instanceof Error) throw body;
      return body;
    }),
  };
  const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    name: "FunctionsHttpError",
    context: res,
  });
  return { data: null, error, ...(withResponseField ? { response: res } : {}) };
}

beforeEach(() => invoke.mockReset());

describe("invokeFn", () => {
  it("returns data on success and passes name/options through", async () => {
    invoke.mockResolvedValue({ data: { url: "https://x" }, error: null, response: { status: 200 } });
    await expect(invokeFn("create-portal-session", { body: {} })).resolves.toEqual({ url: "https://x" });
    expect(invoke).toHaveBeenCalledWith("create-portal-session", { body: {} });
  });

  it("returns array bodies untouched (parse-rental-pdf)", async () => {
    invoke.mockResolvedValue({ data: [{ name: "C-Stand" }], error: null });
    await expect(invokeFn("parse-rental-pdf", {})).resolves.toEqual([{ name: "C-Stand" }]);
  });

  it("surfaces the function's { error } body instead of 'non-2xx'", async () => {
    invoke.mockResolvedValue(httpFailure({ error: "Admins only" }, 403));
    await expect(invokeFn("invite-staff", {})).rejects.toMatchObject({
      message: "Admins only",
      status: 403,
    });
  });

  it("falls back to error.context when supabase-js has no `response` field", async () => {
    invoke.mockResolvedValue(
      httpFailure({ error: "Invite limit reached (20 per hour)" }, 429, { withResponseField: false }),
    );
    await expect(invokeFn("invite-staff", {})).rejects.toMatchObject({
      message: "Invite limit reached (20 per hour)",
      status: 429,
    });
  });

  it("uses `message` / `msg` bodies (gateway errors)", async () => {
    invoke.mockResolvedValue(httpFailure({ msg: "Invalid JWT" }, 401));
    await expect(invokeFn("invite-staff", {})).rejects.toThrow("Invalid JWT");
  });

  it("keeps the supabase-js message when the body is not JSON", async () => {
    invoke.mockResolvedValue(httpFailure(new SyntaxError("Unexpected token <"), 502));
    await expect(invokeFn("invite-staff", {})).rejects.toThrow(
      "Edge Function returned a non-2xx status code",
    );
  });

  it("reports network failures (FunctionsFetchError has no response)", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Failed to send a request to the Edge Function"), {
        name: "FunctionsFetchError",
        context: new TypeError("Failed to fetch"),
      }),
    });
    await expect(invokeFn("invite-staff", {})).rejects.toThrow(
      "Failed to send a request to the Edge Function",
    );
  });

  it("treats a 2xx body with an `error` string as a failure", async () => {
    invoke.mockResolvedValue({ data: { error: "Team not found in this organization" }, error: null, response: { status: 200 } });
    await expect(invokeFn("invite-staff", {})).rejects.toThrow("Team not found in this organization");
  });
});
