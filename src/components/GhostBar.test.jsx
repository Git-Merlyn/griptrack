import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const rpc = vi.hoisted(() =>
  vi.fn(async (name) => {
    if (name === "ghost_status") return { data: [{ active_org_id: null }], error: null };
    if (name === "ghost_list_orgs") {
      return { data: [{ id: "o1", name: "Org One", members: 2, equipment: 5 }], error: null };
    }
    return { data: null, error: null };
  }),
);
vi.mock("@/lib/supabaseClient", () => ({ supabase: { rpc } }));

import GhostBar from "./GhostBar";

describe("GhostBar (L7)", () => {
  it("loads ghost state without asking is_platform_admin (App gates it)", async () => {
    render(<GhostBar />);
    expect(await screen.findByText("Org One (2m · 5 items)")).toBeInTheDocument();
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names).not.toContain("is_platform_admin");
    expect(names).toEqual(expect.arrayContaining(["ghost_status", "ghost_list_orgs"]));
  });
});
