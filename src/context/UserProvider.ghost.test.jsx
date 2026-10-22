import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Supabase mock: one signed-in session; bootstrap_session returns `boot`. ──
let boot = null;
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "u1", email: "u1@test.dev" } } },
      })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async (name) =>
      name === "bootstrap_session" ? { data: boot, error: null } : { data: null, error: null },
    ),
    from: vi.fn(),
  },
}));

import UserProvider from "@/context/UserProvider";
import useUser from "@/context/useUser";

function Probe() {
  const u = useUser();
  if (u.loadingOrg) return <div>loading</div>;
  return (
    <div data-testid="probe">
      {JSON.stringify({
        role: u.role,
        isCoordinator: u.isCoordinator,
        isGhost: u.isGhost,
        ghostReadOnly: u.ghostReadOnly,
      })}
    </div>
  );
}

function bootFor({ role = "owner", ghost = false, ghost_write = false } = {}) {
  return {
    org_id: "org1",
    role,
    ghost,
    ghost_write,
    org: { name: "Real Co", trial_ends_at: null, features: { teams_enabled: false, requests_enabled: false } },
    subscription: null,
    team_id: null,
    profile: { id: "u1", email: "u1@test.dev", full_name: "U One", phone: null },
  };
}

async function readProbe() {
  render(
    <UserProvider>
      <Probe />
    </UserProvider>,
  );
  const el = await screen.findByTestId("probe");
  return JSON.parse(el.textContent);
}

beforeEach(() => {
  boot = null;
});

describe("UserProvider ghost flags (L1)", () => {
  it("a normal owner is not a ghost and not read-only", async () => {
    boot = bootFor({ role: "owner" });
    expect(await readProbe()).toEqual({
      role: "owner", isCoordinator: true, isGhost: false, ghostReadOnly: false,
    });
  });

  it("a ghost without armed write is read-only (role still reported as owner)", async () => {
    boot = bootFor({ role: "owner", ghost: true, ghost_write: false });
    expect(await readProbe()).toEqual({
      role: "owner", isCoordinator: true, isGhost: true, ghostReadOnly: true,
    });
  });

  it("a ghost with armed write is not read-only", async () => {
    boot = bootFor({ role: "owner", ghost: true, ghost_write: true });
    expect(await readProbe()).toEqual({
      role: "owner", isCoordinator: true, isGhost: true, ghostReadOnly: false,
    });
  });

  it("an older bootstrap payload without ghost keys is treated as not-ghost", async () => {
    const b = bootFor({ role: "crew" });
    delete b.ghost;
    delete b.ghost_write;
    boot = b;
    expect(await readProbe()).toEqual({
      role: "crew", isCoordinator: false, isGhost: false, ghostReadOnly: false,
    });
  });
});
