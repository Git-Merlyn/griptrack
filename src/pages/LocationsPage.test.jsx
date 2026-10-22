// Locations page counts and delete guard are org-wide (audit L23).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ counts: {}, deletes: [], countCalls: [] }));

// Post-WP13 LocationsPage gates write controls on isCoordinator && !ghostReadOnly.
vi.mock("@/context/useUser", () => ({
  default: () => ({ orgId: "org-1", role: "owner", isCoordinator: true, ghostReadOnly: false }),
}));
vi.mock("@/lib/supabaseClient", () => {
  const countQuery = () => {
    const filters = {};
    const q = {
      select: () => q,
      eq: (col, val) => {
        filters[col] = val;
        return q;
      },
      then: (resolve, reject) => {
        h.countCalls.push(filters.location);
        return Promise.resolve({ count: h.counts[filters.location] ?? 0, error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  const deleteQuery = () => {
    const q = {
      delete: () => q,
      eq: (_c, id) => {
        h.deletes.push(id);
        return Promise.resolve({ data: null, error: null });
      },
      in: (_c, ids) => {
        h.deletes.push(...ids);
        return q;
      },
      select: () => Promise.resolve({ data: h.deletes.map((id) => ({ id })), error: null }),
    };
    return q;
  };
  return {
    supabase: {
      from: (table) => (table === "equipment_items" ? countQuery() : deleteQuery()),
    },
  };
});

import EquipmentContext from "@/context/EquipmentContext";
import LocationsPage from "./LocationsPage";

const LOCS = [
  { id: "L1", name: "Truck 1", description: null, is_active: true },
  { id: "L2", name: "Stage", description: null, is_active: true },
];

const renderPage = () =>
  render(
    <EquipmentContext.Provider
      value={{ locations: LOCS, loadLocations: vi.fn(), equipment: [] /* team-scoped list is empty */ }}
    >
      <LocationsPage />
    </EquipmentContext.Provider>,
  );

beforeEach(() => {
  h.counts = { "Truck 1": 3, Stage: 0 };
  h.deletes = [];
  h.countCalls = [];
  window.toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
});

describe("LocationsPage (L23)", () => {
  it("shows org-wide counts, not the active team's, and hides Delete for a used location", async () => {
    renderPage();
    expect(await screen.findByText("3 items")).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();
    // Only the empty location offers Delete.
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
  });

  it("re-counts on the server before deleting and refuses when items appeared", async () => {
    renderPage();
    await screen.findByText("0 items");
    h.counts.Stage = 2; // another team added gear since the page loaded
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(window.toast.error).toHaveBeenCalled());
    expect(window.toast.error.mock.calls[0][0]).toMatch(/2 items across your organization/);
    expect(h.deletes).toEqual([]);
    expect(await screen.findByText("2 items")).toBeInTheDocument();
  });

  it("deletes when the server count is still zero", async () => {
    renderPage();
    await screen.findByText("0 items");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(h.deletes).toEqual(["L2"]));
  });
});
