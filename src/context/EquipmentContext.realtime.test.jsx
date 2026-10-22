// Realtime DELETE + resync safety net (audit M1).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useContext } from "react";

const h = vi.hoisted(() => {
  const state = {
    rows: { equipment_items: [], locations: [] },
    fromCalls: [],
    listeners: [],
    statusCb: null,
  };
  // Thenable query builder: every chain method returns the builder; awaiting
  // it resolves to the rows configured for the table.
  const builder = (table) => {
    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      range: () => b,
      then: (resolve, reject) =>
        Promise.resolve({ data: state.rows[table] ?? [], error: null }).then(resolve, reject),
    };
    return b;
  };
  const channel = {
    on: (type, opts, cb) => {
      state.listeners.push({ opts, cb });
      return channel;
    },
    subscribe: (cb) => {
      state.statusCb = cb;
      return channel;
    },
  };
  const supabase = {
    from: (table) => {
      state.fromCalls.push(table);
      return builder(table);
    },
    channel: () => channel,
    removeChannel: () => {},
    rpc: async () => ({ data: null, error: null }),
  };
  return { state, supabase };
});

vi.mock("../lib/supabaseClient", () => ({ supabase: h.supabase }));

import EquipmentContext, { EquipmentProvider } from "./EquipmentContext";
import UserContext from "./UserContext";
import TeamContext from "./TeamContext";

const ORG = "11111111-1111-1111-1111-111111111111";
const item = (id) => ({ id, org_id: ORG, team_id: null, name: `Item ${id}`, quantity: 1, location: "Truck 1" });

function Probe() {
  const ctx = useContext(EquipmentContext);
  return (
    <div>
      <div data-testid="ids">{ctx.equipmentData.map((x) => x.id).join(",")}</div>
      <div data-testid="locs">{ctx.locations.map((l) => l.id).join(",")}</div>
    </div>
  );
}

const renderProvider = () =>
  render(
    <UserContext.Provider
      value={{ orgId: ORG, loadingOrg: false, role: "owner", teamId: null, features: { teams_enabled: false } }}
    >
      <TeamContext.Provider value={{ activeTeamId: null }}>
        <EquipmentProvider>
          <Probe />
        </EquipmentProvider>
      </TeamContext.Provider>
    </UserContext.Provider>,
  );

const listener = (table, event) =>
  h.state.listeners.find((l) => l.opts.table === table && l.opts.event === event);

beforeEach(() => {
  h.state.rows = {
    equipment_items: [item("a"), item("b")],
    locations: [{ id: "L1", name: "Truck 1", is_active: true }, { id: "L2", name: "Stage", is_active: true }],
  };
  h.state.fromCalls = [];
  h.state.listeners = [];
  h.state.statusCb = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EquipmentContext realtime (M1)", () => {
  it("subscribes to equipment DELETE without a filter; INSERT/UPDATE keep the org filter", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a,b"));
    expect(listener("equipment_items", "DELETE").opts.filter).toBeUndefined();
    expect(listener("equipment_items", "INSERT").opts.filter).toBe(`org_id=eq.${ORG}`);
    expect(listener("equipment_items", "UPDATE").opts.filter).toBe(`org_id=eq.${ORG}`);
    expect(listener("locations", "DELETE").opts.filter).toBeUndefined();
  });

  it("removes an item when its DELETE arrives and ignores ids it does not hold", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a,b"));
    const del = listener("equipment_items", "DELETE").cb;
    act(() => del({ old: { id: "zzz-other-org" } }));
    expect(screen.getByTestId("ids")).toHaveTextContent("a,b");
    act(() => del({ old: { id: "a" } }));
    expect(screen.getByTestId("ids")).toHaveTextContent(/^b$/);
  });

  it("removes a location when its DELETE arrives", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("locs")).toHaveTextContent("L1,L2"));
    act(() => listener("locations", "DELETE").cb({ old: { id: "L1" } }));
    expect(screen.getByTestId("locs")).toHaveTextContent(/^L2$/);
  });

  it("refetches from the server on CHANNEL_ERROR and again once re-SUBSCRIBED", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a,b"));
    h.state.rows.equipment_items = [item("b"), item("c")];
    const before = h.state.fromCalls.filter((t) => t === "equipment_items").length;
    await act(async () => h.state.statusCb("CHANNEL_ERROR"));
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("b,c"));
    await act(async () => h.state.statusCb("SUBSCRIBED"));
    const after = h.state.fromCalls.filter((t) => t === "equipment_items").length;
    expect(after - before).toBe(2);
    // A plain SUBSCRIBED (no earlier error) does not refetch.
    await act(async () => h.state.statusCb("SUBSCRIBED"));
    expect(h.state.fromCalls.filter((t) => t === "equipment_items").length).toBe(after);
  });

  it("refetches when the tab becomes visible after 30 s or more hidden", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a,b"));
    const now = vi.spyOn(Date, "now");
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const count = () => h.state.fromCalls.filter((t) => t === "equipment_items").length;
    const base = count();

    now.mockReturnValue(1_000_000);
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    now.mockReturnValue(1_010_000); // 10 s later: too short
    visibility.mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(count()).toBe(base);

    now.mockReturnValue(2_000_000);
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    now.mockReturnValue(2_045_000); // 45 s later
    visibility.mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(count()).toBe(base + 1));
  });
});
