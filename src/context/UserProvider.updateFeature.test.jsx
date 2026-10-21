import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useContext } from "react";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from,
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
  },
}));

import UserProvider from "./UserProvider";
import UserContext from "./UserContext";

function query(result) {
  const q = {};
  for (const m of ["update", "eq", "select"]) q[m] = vi.fn(() => q);
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
}

async function renderProvider() {
  let ctx;
  const Probe = () => {
    ctx = useContext(UserContext);
    return null;
  };
  render(
    <UserProvider>
      <Probe />
    </UserProvider>,
  );
  await waitFor(() => expect(ctx.loadingOrg).toBe(false));
  return () => ctx;
}

beforeEach(() => from.mockReset());

describe("UserProvider.updateFeature (L2)", () => {
  it("does not flip the local flag when RLS filtered the UPDATE to zero rows", async () => {
    const get = await renderProvider();
    from.mockReturnValueOnce(query({ data: [], error: null }));

    let res;
    await act(async () => {
      res = await get().updateFeature("teams_enabled", true);
    });
    expect(res.error?.message).toBe("Only the organization owner can change features.");
    expect(get().features.teams_enabled).toBe(false);
  });

  it("applies the stored features when the UPDATE returned the row", async () => {
    const get = await renderProvider();
    from.mockReturnValueOnce(
      query({ data: [{ id: "org", features: { teams_enabled: true, requests_enabled: false } }], error: null }),
    );

    let res;
    await act(async () => {
      res = await get().updateFeature("teams_enabled", true);
    });
    expect(res.error).toBeNull();
    expect(get().features).toEqual({ teams_enabled: true, requests_enabled: false });
  });

  it("applyOrgName / applyProfile update the onboarding flags", async () => {
    const get = await renderProvider();
    act(() => get().applyOrgName("New Company"));
    expect(get().needsOrgSetup).toBe(true);
    act(() => get().applyOrgName("Polaris Grip"));
    expect(get().orgName).toBe("Polaris Grip");
    expect(get().needsOrgSetup).toBe(false);

    act(() => get().applyProfile({ id: "u1", email: "a@b.c", full_name: "" }));
    expect(get().needsProfileSetup).toBe(true);
    act(() => get().applyProfile({ id: "u1", email: "a@b.c", full_name: "Ada" }));
    expect(get().needsProfileSetup).toBe(false);
    expect(get().profile.full_name).toBe("Ada");
  });
});
