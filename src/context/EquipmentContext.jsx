import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
} from "react";
import { supabase } from "../lib/supabaseClient";
import { canManageInventory, isOrgAdmin } from "@shared/roles";
import { deleteByIds } from "../lib/deleteRows";
import UserContext from "./UserContext";
import TeamContext from "./TeamContext";

// Table names are fixed — dev/prod separation comes from the local Supabase
// stack, not env-swapped table names (the old VITE_EQUIPMENT_TABLE indirection
// pointed at _dev tables that no migration creates, silently breaking dev).
const EQUIPMENT_TABLE = "equipment_items";

const EquipmentContext = createContext();

export const EquipmentProvider = ({ children }) => {
  const { orgId, loadingOrg, role, teamId: assignedTeamId, devRoleOverride, features } = useContext(UserContext) || {};

  // When teams are disabled, inventory is a single flat pool scoped to the org
  // (equipment rows carry team_id = null) and there is no team to select.
  const teamsEnabled = features?.teams_enabled !== false;

  // Read active team for scoping equipment queries
  const { activeTeamId } = useContext(TeamContext) || {};

  // Role-based permission flags (mirrors database RLS)
  const isCoordinator = !!role && isOrgAdmin(role);
  const canAdd    = !!role && canManageInventory(role); // crew cannot add items
  const canDelete = isCoordinator;                      // admin/owner only
  const canMove   = true;                               // any role that can edit a row may move it (move_equipment RPC enforces team scope)
  const canEdit   = !!role && canManageInventory(role); // crew cannot edit metadata

  // The effective team scope for queries:
  // - crew/dept_head: locked to their assigned team (from organization_members)
  // - admin/owner: use the actively selected team, or null (meaning see all)
  // Dev override: when testing as crew/dept_head from an admin account that has
  // no assignedTeamId, fall back to activeTeamId so inventory still loads.
  const effectiveTeamId = isCoordinator
    ? activeTeamId
    : (assignedTeamId ?? (import.meta.env.DEV && devRoleOverride ? activeTeamId : null));

  const [equipmentData, setEquipmentData] = useState([]);
  // True while the initial equipment fetch is in-flight (or when the active team
  // changes and a new fetch starts). Used by the Dashboard to suppress the
  // WelcomeBanner / EmptyState flash that would otherwise appear before data arrives.
  const [loadingEquipment, setLoadingEquipment] = useState(true);

  // Locations loaded from the DB locations table (source of truth)
  const [locations, setLocations] = useState([]);

  // allLocations for dropdowns — only active location names, sorted
  const allLocations = locations
    .filter((l) => l.is_active !== false)
    .map((l) => l.name)
    .sort();

  const [uploadedPDFItems, setUploadedPDFItems] = useState([]);
  const [pdfUploadModalOpen, setPdfUploadModalOpen] = useState(false);
  const [pdfParsingStatus, setPdfParsingStatus] = useState("idle");
  const [reviewTableVisible, setReviewTableVisible] = useState(false);
  const [assignAllLocation, setAssignAllLocation] = useState("");
  const [importSummaryMessage, setImportSummaryMessage] = useState("");

  // --- Audit logging: the equipment_items trigger logs create/update/move/
  // delete; merges are logged inside the move_equipment RPC.

  // Saves a new location to the DB and refreshes the list.
  // Returns the new location row or null if it already exists.
  const registerLocation = async (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed || !orgId) return null;

    const alreadyExists = locations.some(
      (l) => l.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (alreadyExists) return null;

    const { data, error } = await supabase
      .from("locations")
      .insert({ org_id: orgId, name: trimmed })
      .select("id, name, description, is_active")
      .single();

    if (error) {
      console.warn("Failed to register location", error);
      return null;
    }

    setLocations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data;
  };

  const safeDateOnly = (value) => {
    if (!value) return null;
    // Accept either YYYY-MM-DD or ISO strings; return YYYY-MM-DD
    const s = String(value);
    if (s.includes("T")) return s.split("T")[0];
    // If already date-only, keep it
    return s;
  };

  const normalizeItemForInsert = (item) => {
    // item_id is optional; keep duplicates allowed
    const itemId = item?.item_id ?? item?.itemId ?? item?.id ?? null;

    // team_id: prefer explicit override on the item, else the active team when
    // teams are on. Teams off → always null (flat org-wide pool).
    const teamId =
      item?.team_id !== undefined
        ? item.team_id
        : (teamsEnabled ? (activeTeamId ?? null) : null);

    return {
      org_id: orgId ?? null,
      team_id: teamId,
      item_id: itemId ? String(itemId) : null,
      name: String(item?.name ?? "").trim() || "(Unnamed)",
      category: String(item?.category ?? "").trim() || null,
      source: String(item?.source ?? "").trim() || null,
      quantity: Number.isFinite(Number(item?.quantity))
        ? Number(item.quantity)
        : 1,
      reserve_min: Number.isFinite(
        Number(item?.reserveMin ?? item?.reserve_min),
      )
        ? Number(item?.reserveMin ?? item?.reserve_min)
        : 0,
      start_date: safeDateOnly(
        item?.startDate ??
          item?.start_date ??
          item?.rentalStart ??
          item?.rental_start,
      ),
      end_date: safeDateOnly(
        item?.endDate ?? item?.end_date ?? item?.rentalEnd ?? item?.rental_end,
      ),
      location: String(item?.location ?? "Unassigned").trim() || "Unassigned",
      status: String(item?.status ?? "Available"),
      updated_by: String(item?.updatedBy ?? item?.updated_by ?? "admin"),
    };
  };

  const normalizeRowFromDb = (row) => ({
    id: row.id,

    // Production scoping
    team_id: row.team_id ?? null,

    // Legacy fields expected by the current Dashboard.jsx
    itemId: row.item_id ?? "",
    category: row.category ?? "",
    source: row.source ?? "",
    status: row.status ?? "Available",
    rentalStart: row.start_date ?? null,
    rentalEnd: row.end_date ?? null,
    updatedBy: row.updated_by ?? "admin",
    reserveMin: Number.isFinite(Number(row.reserve_min))
      ? Number(row.reserve_min)
      : 0,

    // New-style fields (keep for future migration)
    item_id: row.item_id ?? null,
    name: row.name ?? "",
    quantity: Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : 0,
    reserve_min: row.reserve_min ?? 0,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    location: row.location,
    created_at: row.created_at,
  });

  const loadEquipmentFromSupabase = useCallback(async () => {
    let query = supabase.from(EQUIPMENT_TABLE).select("*");

    if (teamsEnabled) {
      // Teams on: a team must be selected before inventory is shown.
      if (!effectiveTeamId) return [];
      query = query.eq("team_id", effectiveTeamId);
    } else {
      // Teams off: one flat pool scoped to the org (RLS enforces membership).
      if (!orgId) return [];
      query = query.eq("org_id", orgId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(normalizeRowFromDb);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsEnabled, effectiveTeamId, orgId]);

  // Load equipment from Supabase on app start (Supabase is the single source of truth)
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setLoadingEquipment(true);
      try {
        const rows = await loadEquipmentFromSupabase();
        if (!cancelled) {
          setEquipmentData(rows);
          setLoadingEquipment(false);
        }
      } catch (err) {
        console.error("Failed to load equipment from Supabase", err);
        if (!cancelled) {
          setEquipmentData([]);
          setLoadingEquipment(false);
        }
        window.toast?.error?.(
          err?.message || "Failed to load inventory from Supabase",
        );
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, [loadEquipmentFromSupabase]);

  // Load locations from DB whenever orgId is available
  const loadLocations = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, description, is_active")
        .eq("org_id", orgId)
        .order("name", { ascending: true });

      if (error) throw error;
      setLocations(data ?? []);
    } catch (err) {
      console.error("Failed to load locations", err);
      setLocations([]);
    }
  }, [orgId]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // ── Realtime subscriptions ────────────────────────────────────────────────
  // Supabase broadcasts row-level changes to all connected clients in the org.
  // Each event is merged into local state so the UI updates without a reload.
  //
  // One-time setup required in Supabase (run once in SQL editor):
  //   alter publication supabase_realtime add table equipment_items;
  //   alter publication supabase_realtime add table locations;
  //
  // Or enable per-table in Dashboard → Database → Replication.
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`equipment-org-${orgId}`)
      // Equipment inserts from other clients
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: EQUIPMENT_TABLE,
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const row = normalizeRowFromDb(payload.new);

          // Only apply if this row belongs to our current scope. Teams off:
          // the whole org pool is in scope. Teams on: match the active team
          // (or, for admin/owner with no filter, everything).
          const rowTeamId = payload.new?.team_id ?? null;
          const inScope = !teamsEnabled
            ? true
            : effectiveTeamId
              ? rowTeamId === effectiveTeamId
              : true;
          if (!inScope) return;

          setEquipmentData((prev) => {
            // Skip if we already applied this row optimistically
            if (prev.some((x) => String(x.id) === String(row.id))) return prev;
            return [row, ...prev];
          });
        },
      )
      // Equipment updates from other clients
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: EQUIPMENT_TABLE,
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const row = normalizeRowFromDb(payload.new);
          setEquipmentData((prev) =>
            prev.map((x) => (String(x.id) === String(row.id) ? row : x)),
          );
        },
      )
      // Equipment deletes from other clients
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: EQUIPMENT_TABLE,
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const deletedId = String(payload.old?.id);
          setEquipmentData((prev) =>
            prev.filter((x) => String(x.id) !== deletedId),
          );
        },
      )
      // Locations: any change → just reload (simpler than merging location objects)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "locations",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          loadLocations();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[Realtime] equipment channel error — falling back to polling");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  // effectiveTeamId / teamsEnabled included so INSERT scoping stays current
  }, [orgId, loadLocations, effectiveTeamId, teamsEnabled]); // eslint-disable-line react-hooks/exhaustive-deps
  // normalizeRowFromDb is a stable pure fn defined in this scope; omitting from deps is intentional.

  // Insert many items (used by PDF import). Duplicates are allowed.
  // opts.silent: no toasts — the caller reports success/failure itself
  // (used by moveEquipment so one move shows one toast, not three).
  const addMultipleItems = async (items, { silent = false } = {}) => {
    // Org scoping: inserts must always include org_id.
    // If org bootstrap hasn't completed yet, block the insert.
    if (!orgId) {
      const msg = loadingOrg
        ? "Account setup is still loading. Try again in a moment."
        : "No organization found for this user.";
      if (!silent) window.toast?.error?.(msg);
      throw new Error(msg);
    }

    const rowsToInsert = (items ?? []).map(normalizeItemForInsert);

    const { data, error } = await supabase
      .from(EQUIPMENT_TABLE)
      .insert(rowsToInsert)
      .select("*");

    if (error) {
      console.error("Supabase insert failed", error);
      if (!silent) window.toast?.error?.(error.message || "Failed to add items");
      throw error;
    }

    const normalized = (data ?? []).map(normalizeRowFromDb);

    // Prepend newest items to match the load order (created_at desc)
    setEquipmentData((prev) => [...normalized, ...prev]);

    if (!silent) window.toast?.success?.(`${normalized.length} items added`);
    return normalized;
  };

  // Delete one item. An RLS-refused DELETE returns 2xx with zero rows, so
  // deleteByIds asks for the deleted id back and re-reads it when missing:
  // "denied" (row still there) is an error; "gone" (already deleted
  // elsewhere) is treated as success.
  const deleteItem = async (rowId, { silent = false } = {}) => {
    if (!rowId) return;

    const result = await deleteByIds(EQUIPMENT_TABLE, [rowId]);

    if (result.error) {
      console.error("Supabase delete failed", result.error);
      if (!silent) window.toast?.error?.(result.error.message || "Failed to delete item");
      throw result.error;
    }
    if (result.denied.length > 0) {
      const err = new Error("You don't have permission to delete this item.");
      if (!silent) window.toast?.error?.(err.message);
      throw err;
    }

    setEquipmentData((prev) =>
      prev.filter((x) => String(x.id) !== String(rowId)),
    );
    if (!silent) window.toast?.success?.("Item deleted");
  };

  // Bulk delete in as few requests as possible (chunks of 100 ids). Never
  // throws for per-row outcomes: returns which ids are gone (deleted now or
  // already gone) and which were not deleted, so the caller can prune its
  // selection and report "Deleted X of Y". No toasts — the caller reports.
  const deleteEquipmentMany = async (ids) => {
    const result = await deleteByIds(EQUIPMENT_TABLE, ids);
    const removedIds = [...result.deleted, ...result.gone];
    if (removedIds.length > 0) {
      const removed = new Set(removedIds);
      setEquipmentData((prev) => prev.filter((x) => !removed.has(String(x.id))));
    }
    if (result.error) console.error("Supabase bulk delete failed", result.error);
    return {
      removedIds,
      notDeletedIds: [...result.denied, ...result.failed],
      error: result.error,
    };
  };

  // --- Legacy API expected by Dashboard.jsx (Option B) ---
  const equipment = Array.isArray(equipmentData) ? equipmentData : [];

  const addEquipment = async (item, opts) => {
    const inserted = await addMultipleItems([item], opts);
    return inserted?.[0];
  };

  const deleteEquipment = async (rowId, opts) => deleteItem(rowId, opts);

  // opts.silent: no toasts (see addMultipleItems).
  const updateEquipment = async (rowId, patch, { silent = false } = {}) => {
    if (!rowId) return;

    const updatePayload = {
      item_id: patch?.itemId ?? patch?.item_id ?? undefined,
      name: patch?.name ?? undefined,
      category: patch?.category ?? undefined,
      source: patch?.source ?? undefined,
      quantity:
        patch?.quantity !== undefined ? Number(patch.quantity) : undefined,
      reserve_min:
        patch?.reserveMin !== undefined || patch?.reserve_min !== undefined
          ? Number(patch?.reserveMin ?? patch?.reserve_min)
          : undefined,
      location: patch?.location ?? undefined,
      status: patch?.status ?? undefined,
      start_date: safeDateOnly(
        patch?.rentalStart ?? patch?.startDate ?? patch?.start_date,
      ),
      end_date: safeDateOnly(
        patch?.rentalEnd ?? patch?.endDate ?? patch?.end_date,
      ),
      updated_by: String(patch?.updatedBy ?? patch?.updated_by ?? "admin"),
    };

    // Remove undefined keys so we don't overwrite fields unintentionally
    Object.keys(updatePayload).forEach((k) => {
      if (updatePayload[k] === undefined) delete updatePayload[k];
    });

    const { data, error } = await supabase
      .from(EQUIPMENT_TABLE)
      .update(updatePayload)
      .eq("id", rowId)
      .select("*")
      .single();

    if (error) {
      console.error("Supabase update failed", error);
      if (!silent) window.toast?.error?.(error.message || "Failed to update item");
      throw error;
    }

    const normalized = normalizeRowFromDb(data);
    setEquipmentData((prev) =>
      prev.map((x) => (String(x.id) === String(rowId) ? normalized : x)),
    );
    if (!silent) window.toast?.success?.("Item updated");
    return normalized;
  };

  // Folds a move_equipment result into local state. The returned rows are the
  // server's post-move truth; realtime echoes of the same rows are idempotent.
  const applyMoveResult = (res) => {
    if (!res) return;
    setEquipmentData((prev) => {
      let next = prev;
      if (res.kind === "merge") {
        next = next.filter((x) => String(x.id) !== String(res.source_id));
      }
      for (const row of [res.source, res.dest]) {
        if (!row) continue;
        const n = normalizeRowFromDb(row);
        next = next.some((x) => String(x.id) === String(n.id))
          ? next.map((x) => (String(x.id) === String(n.id) ? n : x))
          : [n, ...next];
      }
      return next;
    });
  };

  // Moves `qty` units of a row to `newLocation` (qty === null → the whole row,
  // used by bulk "Apply location"). One move_equipment RPC call: the server
  // checks the caller may edit the row, finds an identical row at the
  // destination to merge into, and does decrement/insert or increment/delete
  // plus the merge audit row in a single transaction — so a move can never
  // half-apply. Throws on failure (callers show the error); returns the result.
  const moveEquipment = async (rowId, qty, newLocation, actor, { silent = false } = {}) => {
    const location = String(newLocation ?? "").trim();
    if (!rowId || !location) throw new Error("Choose a destination location");

    const wholeRow = qty === null;
    const qtyNum = Math.floor(Number(qty));
    if (!wholeRow && (!Number.isFinite(qtyNum) || qtyNum <= 0)) {
      throw new Error("Quantity must be at least 1");
    }

    const { data, error } = await supabase.rpc("move_equipment", {
      p_source: String(rowId),
      p_qty: wholeRow ? null : qtyNum,
      p_to_location: location,
      p_updated_by: actor ? String(actor) : null,
    });

    if (error) {
      console.error("move_equipment failed", error);
      // D22 option C: a caller who may not add locations (crew) may move only
      // to an existing, active location. Say so instead of the raw message.
      if (error.code === "22023" && /existing location/.test(String(error.message ?? ""))) {
        throw new Error(
          `"${location}" is not one of your organization's locations. Pick a location from the list — only owners, admins and department heads can add new ones.`,
        );
      }
      throw error;
    }

    applyMoveResult(data);

    if (data?.kind === "noop") {
      throw new Error("Item is already at that location");
    }

    if (!silent) {
      if (!wholeRow && Number(data?.moved_qty) < qtyNum) {
        window.toast?.success?.(`Moved ${data.moved_qty} — only ${data.moved_qty} were left`);
      } else {
        window.toast?.success?.("Item moved");
      }
    }
    return data;
  };

  const clearImportSummary = () => setImportSummaryMessage("");

  const refreshEquipment = async () => {
    try {
      const rows = await loadEquipmentFromSupabase();
      setEquipmentData(rows);
      return rows;
    } catch (err) {
      console.error("Failed to refresh equipment", err);
      window.toast?.error?.(err.message || "Failed to refresh");
      throw err;
    }
  };

  const mergeUploadedPDFItems = async () => {
    try {
      const inserted = await addMultipleItems(uploadedPDFItems);

      // Reset uploaded items and show confirmation
      setUploadedPDFItems([]);
      setReviewTableVisible(false);
      setImportSummaryMessage(`${inserted.length} items added to inventory.`);
    } catch (err) {
      console.error("Failed to merge uploaded PDF items", err);
      setImportSummaryMessage("Import failed. Please try again.");
    }
  };

  return (
    <EquipmentContext.Provider
      value={{
        equipmentData,
        setEquipmentData,
        equipment,
        addEquipment,
        deleteEquipment,
        deleteEquipmentMany,
        updateEquipment,
        moveEquipment,
        clearImportSummary,
        // Permission flags — mirror the database RLS
        // Use these to show/hide UI controls; the DB will enforce them regardless
        canAdd,
        canDelete,
        canMove,
        canEdit,
        // False when no team is selected — Dashboard shows a "pick a team" prompt instead of inventory
        // Teams off: always "selected" (flat org pool) so the dashboard shows
        // inventory instead of the team-picker. Teams on: need an active team.
        hasTeamSelected: !teamsEnabled || !!effectiveTeamId,
        // True while the equipment fetch is in-flight — suppresses empty-state flash
        loadingEquipment,
        locations,       // full location objects [{ id, name, description, is_active }]
        allLocations,    // just active names, for dropdowns
        registerLocation,
        loadLocations,
        setLocations,
        uploadedPDFItems,
        setUploadedPDFItems,
        pdfUploadModalOpen,
        setPdfUploadModalOpen,
        pdfParsingStatus,
        setPdfParsingStatus,
        reviewTableVisible,
        setReviewTableVisible,
        assignAllLocation,
        setAssignAllLocation,
        importSummaryMessage,
        setImportSummaryMessage,
        addMultipleItems,
        deleteItem,
        refreshEquipment,
        mergeUploadedPDFItems,
      }}
    >
      {children}
    </EquipmentContext.Provider>
  );
};

export default EquipmentContext;
