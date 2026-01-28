import { createContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const EquipmentContext = createContext();

export const EquipmentProvider = ({ children }) => {
  const [equipmentData, setEquipmentData] = useState([]);
  const [locations, setLocations] = useState([]);
  const [uploadedPDFItems, setUploadedPDFItems] = useState([]);
  const [pdfUploadModalOpen, setPdfUploadModalOpen] = useState(false);
  const [pdfParsingStatus, setPdfParsingStatus] = useState("idle");
  const [reviewTableVisible, setReviewTableVisible] = useState(false);
  const [assignAllLocation, setAssignAllLocation] = useState("");
  const [importSummaryMessage, setImportSummaryMessage] = useState("");

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

    return {
      item_id: itemId ? String(itemId) : null,
      name: String(item?.name ?? "").trim() || "(Unnamed)",
      quantity: Number.isFinite(Number(item?.quantity))
        ? Number(item.quantity)
        : 1,
      start_date: safeDateOnly(
        item?.startDate ??
          item?.start_date ??
          item?.rentalStart ??
          item?.rental_start
      ),
      end_date: safeDateOnly(
        item?.endDate ?? item?.end_date ?? item?.rentalEnd ?? item?.rental_end
      ),
      location: String(item?.location ?? "Unassigned").trim() || "Unassigned",
      status: String(item?.status ?? "Available"),
      updated_by: String(item?.updatedBy ?? item?.updated_by ?? "admin"),
    };
  };

  const normalizeRowFromDb = (row) => ({
    id: row.id,

    // Legacy fields expected by the current Dashboard.jsx
    itemId: row.item_id ?? "",
    status: row.status ?? "Available",
    rentalStart: row.start_date ?? null,
    rentalEnd: row.end_date ?? null,
    updatedBy: row.updated_by ?? "admin",

    // New-style fields (keep for future migration)
    item_id: row.item_id ?? null,
    name: row.name,
    quantity: row.quantity,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    location: row.location,
    created_at: row.created_at,
  });

  const loadEquipmentFromSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("equipment_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(normalizeRowFromDb);
  }, []);

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
          err?.message || "Failed to load inventory from Supabase"
        );
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, [loadEquipmentFromSupabase]);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const { data, error } = await supabase
          .from("equipment_items")
          .select("location");

        if (error) throw error;

        const locs = Array.from(
          new Set((data || []).map((r) => r.location).filter(Boolean))
        ).sort();

        setLocations(locs);
      } catch (err) {
        console.error("Failed to load locations", err);
        setLocations([]);
      }
    };

    loadLocations();
  }, []);

  // Insert many items (used by PDF import). Duplicates are allowed.
  const addMultipleItems = async (items) => {
    const rowsToInsert = (items ?? []).map(normalizeItemForInsert);

    const { data, error } = await supabase
      .from("equipment_items")
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
      .from("equipment_items")
      .delete()
      .eq("id", rowId);

    if (error) {
      console.error("Supabase delete failed", error);
      window.toast?.error?.(error.message || "Failed to delete item");
      throw error;
    }

    setEquipmentData((prev) =>
      prev.filter((x) => String(x.id) !== String(rowId))
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
      quantity:
        patch?.quantity !== undefined ? Number(patch.quantity) : undefined,
      location: patch?.location ?? undefined,
      status: patch?.status ?? undefined,
      start_date: safeDateOnly(
        patch?.rentalStart ?? patch?.startDate ?? patch?.start_date
      ),
      end_date: safeDateOnly(
        patch?.rentalEnd ?? patch?.endDate ?? patch?.end_date
      ),
      updated_by: String(patch?.updatedBy ?? patch?.updated_by ?? "admin"),
    };

    // Remove undefined keys so we don't overwrite fields unintentionally
    Object.keys(updatePayload).forEach((k) => {
      if (updatePayload[k] === undefined) delete updatePayload[k];
    });

    const { data, error } = await supabase
      .from("equipment_items")
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
      prev.map((x) => (String(x.id) === String(rowId) ? normalized : x))
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

    const currentQty = Number(current.quantity) || 0;
    const moveQty = Math.min(Number(qty) || 0, currentQty);
    if (moveQty <= 0) return;

    // If moving all, just update location
    if (moveQty === currentQty) {
      await updateEquipment(rowId, { ...current, location: newLocation });
      window.toast?.success?.("Item moved");
      return;
    }

    // Partial move: decrement source row, then insert a new row for destination
    await updateEquipment(rowId, {
      ...current,
      quantity: currentQty - moveQty,
    });

    await addEquipment({
      itemId: current.itemId,
      name: current.name,
      quantity: moveQty,
      location: newLocation,
      status: current.status ?? "Available",
      rentalStart: current.rentalStart ?? null,
      rentalEnd: current.rentalEnd ?? null,
      updatedBy: current.updatedBy ?? "admin",
    });

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
        locations,
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
