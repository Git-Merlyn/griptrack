import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
} from "react";
import { supabase } from "../lib/supabaseClient";
import { findMergeDestination } from "./equipmentMoveUtils";
import UserContext from "./UserContext";
import ProductionContext from "./ProductionContext";

// Allow dev/prod separation via env var
const EQUIPMENT_TABLE =
  import.meta.env.VITE_EQUIPMENT_TABLE || "equipment_items";

const AUDIT_TABLE =
  import.meta.env.VITE_EQUIPMENT_AUDIT_TABLE || "equipment_audit";

const EquipmentContext = createContext();

export const EquipmentProvider = ({ children }) => {
  const { orgId, loadingOrg } = useContext(UserContext) || {};

  // Read active production so we can scope equipment queries
  const { activeProductionId } = useContext(ProductionContext) || {};

  const [equipmentData, setEquipmentData] = useState([]);

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

  // --- Audit logging (DB trigger handles create/update/delete).
  // We only write explicit MERGE events here so we can include meta.merged_from_id.
  const logMergeEvent = async ({
    mergedIntoId,
    mergedFromId,
    movedQty,
    fromLocation,
    toLocation,
    actor,
  }) => {
    try {
      await supabase.from(AUDIT_TABLE).insert({
        org_id: orgId ?? null,
        equipment_id: String(mergedIntoId),
        action: "merge",
        actor: String(actor || "admin"),
        from_location: fromLocation ? String(fromLocation) : null,
        to_location: toLocation ? String(toLocation) : null,
        delta_qty: Number.isFinite(Number(movedQty)) ? Number(movedQty) : null,
        meta: {
          merged_from_id: String(mergedFromId),
          merged_into_id: String(mergedIntoId),
        },
      });
    } catch (e) {
      // Audit should never block core inventory actions
      console.warn("Failed to write merge audit event", e);
    }
  };

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

    // production_id: prefer explicit override on the item, fall back to active production
    const productionId =
      item?.production_id !== undefined
        ? item.production_id
        : (activeProductionId ?? null);

    return {
      org_id: orgId ?? null,
      production_id: productionId,
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
    production_id: row.production_id ?? null,

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
    name: row.name,
    quantity: row.quantity,
    reserve_min: row.reserve_min ?? 0,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    location: row.location,
    created_at: row.created_at,
  });

  const loadEquipmentFromSupabase = useCallback(async () => {
    let query = supabase
      .from(EQUIPMENT_TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    // Scope to the active production, or to the General pool (production_id IS NULL)
    if (activeProductionId) {
      query = query.eq("production_id", activeProductionId);
    } else {
      query = query.is("production_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(normalizeRowFromDb);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProductionId]);

  // Load equipment from Supabase on app start (Supabase is the single source of truth)
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const rows = await loadEquipmentFromSupabase();
        if (!cancelled) setEquipmentData(rows);
      } catch (err) {
        console.error("Failed to load equipment from Supabase", err);
        if (!cancelled) setEquipmentData([]);
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

          // Only apply if this row belongs to our current production scope
          const rowProdId = payload.new?.production_id ?? null;
          const inScope = activeProductionId
            ? rowProdId === activeProductionId
            : rowProdId === null;
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
  // activeProductionId included so INSERT scoping stays current when switching productions
  }, [orgId, loadLocations, activeProductionId]); // eslint-disable-line react-hooks/exhaustive-deps
  // normalizeRowFromDb is a stable pure fn defined in this scope; omitting from deps is intentional.

  // Insert many items (used by PDF import). Duplicates are allowed.
  const addMultipleItems = async (items) => {
    // Org scoping: inserts must always include org_id.
    // If org bootstrap hasn't completed yet, block the insert.
    if (!orgId) {
      const msg = loadingOrg
        ? "Account setup is still loading. Try again in a moment."
        : "No organization found for this user.";
      window.toast?.error?.(msg);
      throw new Error(msg);
    }

    const rowsToInsert = (items ?? []).map(normalizeItemForInsert);

    const { data, error } = await supabase
      .from(EQUIPMENT_TABLE)
      .insert(rowsToInsert)
      .select("*");

    if (error) {
      console.error("Supabase insert failed", error);
      window.toast?.error?.(error.message || "Failed to add items");
      throw error;
    }

    const normalized = (data ?? []).map(normalizeRowFromDb);

    // Prepend newest items to match the load order (created_at desc)
    setEquipmentData((prev) => [...normalized, ...prev]);

    window.toast?.success?.(`${normalized.length} items added`);
    return normalized;
  };

  const deleteItem = async (rowId) => {
    if (!rowId) return;

    const { error } = await supabase
      .from(EQUIPMENT_TABLE)
      .delete()
      .eq("id", rowId);

    if (error) {
      console.error("Supabase delete failed", error);
      window.toast?.error?.(error.message || "Failed to delete item");
      throw error;
    }

    setEquipmentData((prev) =>
      prev.filter((x) => String(x.id) !== String(rowId)),
    );
    window.toast?.success?.("Item deleted");
  };

  // --- Legacy API expected by Dashboard.jsx (Option B) ---
  const equipment = Array.isArray(equipmentData) ? equipmentData : [];

  const addEquipment = async (item) => {
    const inserted = await addMultipleItems([item]);
    return inserted?.[0];
  };

  const deleteEquipment = async (rowId) => deleteItem(rowId);

  const updateEquipment = async (rowId, patch) => {
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
      window.toast?.error?.(error.message || "Failed to update item");
      throw error;
    }

    const normalized = normalizeRowFromDb(data);
    setEquipmentData((prev) =>
      prev.map((x) => (String(x.id) === String(rowId) ? normalized : x)),
    );
    window.toast?.success?.("Item updated");
    return normalized;
  };

  const moveEquipment = async (rowId, qty, newLocation) => {
    if (!rowId || !newLocation || !qty || qty <= 0) return;

    const id = String(rowId);
    const current = equipment.find((x) => String(x.id) === id);
    if (!current) {
      window.toast?.error?.("Item not found");
      return;
    }

    const existingDest = findMergeDestination({
      equipment,
      currentId: id,
      newLocation,
      current,
    });

    const currentQty = Number(current.quantity) || 0;
    const moveQty = Math.min(Number(qty) || 0, currentQty);
    if (moveQty <= 0) return;

    // If moving all quantity
    if (moveQty === currentQty) {
      if (existingDest) {
        // Merge into destination and delete source row
        await updateEquipment(existingDest.id, {
          ...existingDest,
          quantity: (Number(existingDest.quantity) || 0) + currentQty,
        });

        // Explicit merge audit event (includes merged_from_id)
        await logMergeEvent({
          mergedIntoId: existingDest.id,
          mergedFromId: id,
          movedQty: currentQty,
          fromLocation: current.location,
          toLocation: newLocation,
          actor: current.updatedBy,
        });

        await deleteEquipment(rowId);
      } else {
        // No destination row to merge into; just update location
        await updateEquipment(rowId, { ...current, location: newLocation });
      }

      window.toast?.success?.("Item moved");
      return;
    }

    // Partial move:
    // 1) Decrement source row
    await updateEquipment(rowId, {
      ...current,
      quantity: currentQty - moveQty,
    });

    // 2) Merge into an existing destination row if it exists
    if (existingDest) {
      await updateEquipment(existingDest.id, {
        ...existingDest,
        quantity: (Number(existingDest.quantity) || 0) + moveQty,
      });

      // Explicit merge audit event (includes merged_from_id)
      await logMergeEvent({
        mergedIntoId: existingDest.id,
        mergedFromId: id,
        movedQty: moveQty,
        fromLocation: current.location,
        toLocation: newLocation,
        actor: current.updatedBy,
      });
    } else {
      // Otherwise insert a new destination row
      await addEquipment({
        itemId: current.itemId,
        name: current.name,
        category: current.category ?? "",
        source: current.source ?? "",
        quantity: moveQty,
        reserveMin: Number(current.reserveMin) || 0,
        location: newLocation,
        status: current.status ?? "Available",
        rentalStart: current.rentalStart ?? null,
        rentalEnd: current.rentalEnd ?? null,
        updatedBy: current.updatedBy ?? "admin",
      });
    }

    window.toast?.success?.("Item moved");
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
        updateEquipment,
        moveEquipment,
        clearImportSummary,
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
