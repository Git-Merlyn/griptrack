import { useState, useContext, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { deleteByIds } from "@/lib/deleteRows";
import EquipmentContext from "@/context/EquipmentContext";
import useUser from "@/context/useUser";
import { planLimitMessage } from "@/lib/plan";

// Server-side count of equipment rows at a location across the WHOLE org
// (audit L23). The equipment list in EquipmentContext is scoped to the active
// team when Teams is on, and PostgREST pages at 1000 rows, so counting it
// client-side under-counts. head:true returns only the count, no rows.
async function countItemsAt(orgId, locationName) {
  const { count, error } = await supabase
    .from("equipment_items")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("location", locationName);
  if (error) throw error;
  return count ?? 0;
}

const LocationsPage = () => {
  const { orgId, isCoordinator, ghostReadOnly } = useUser();
  const { locations, loadLocations } = useContext(EquipmentContext);
  // Write controls: owner/admin, never a read-only ghost. RLS also lets
  // department heads add/rename locations; they do that in the mobile app,
  // and this page (and its sidebar link) stays owner/admin.
  const isAdmin = isCoordinator && !ghostReadOnly;

  // Create
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Rename
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Org-wide item count per location name (L23). null = still counting;
  // a null entry = that count failed (Delete stays hidden).
  const [orgCounts, setOrgCounts] = useState(null);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        locations.map(async (l) => {
          try {
            return [l.name, await countItemsAt(orgId, l.name)];
          } catch (err) {
            console.warn("Failed to count items for location", l.name, err);
            return [l.name, null];
          }
        }),
      );
      if (!cancelled) setOrgCounts(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, locations]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    const duplicate = locations.some(
      (l) => l.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      setCreateError("A location with that name already exists.");
      return;
    }

    setCreating(true);
    setCreateError("");

    const { error } = await supabase
      .from("locations")
      .insert({ org_id: orgId, name, description: newDesc.trim() || null });

    if (error) {
      setCreateError(planLimitMessage(error) ?? error.message);
    } else {
      setNewName("");
      setNewDesc("");
      await loadLocations();
    }

    setCreating(false);
  };

  const handleToggleActive = async (loc) => {
    // An RLS-refused UPDATE returns 2xx with zero rows — ask for the row back.
    const { data: changed, error } = await supabase
      .from("locations")
      .update({ is_active: !loc.is_active })
      .eq("id", loc.id)
      .select("id");
    if (error || !changed?.length) {
      window.toast?.error?.(
        planLimitMessage(error) ??
          (error?.message || "You don't have permission to change this location."),
      );
    }
    await loadLocations();
  };

  const startRename = (loc) => {
    setRenamingId(loc.id);
    setRenameValue(loc.name);
    setRenameError("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
    setRenameError("");
  };

  const handleRename = async (loc) => {
    const name = renameValue.trim();
    if (!name || name === loc.name) {
      cancelRename();
      return;
    }

    const duplicate = locations.some(
      (l) => l.id !== loc.id && l.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      setRenameError("That name is already taken.");
      return;
    }

    setRenameBusy(true);
    setRenameError("");

    // Update the location record. An RLS-refused UPDATE returns 2xx with zero
    // rows, so ask for the row back before cascading the name to equipment.
    const { data: renamed, error } = await supabase
      .from("locations")
      .update({ name })
      .eq("id", loc.id)
      .select("id");

    if (error || !renamed?.length) {
      setRenameError(error?.message || "You don't have permission to rename this location.");
      setRenameBusy(false);
      return;
    }

    // Cascade: update all equipment items using the old location name
    await supabase
      .from("equipment_items")
      .update({ location: name })
      .eq("org_id", orgId)
      .eq("location", loc.name);

    await loadLocations();
    setRenamingId(null);
    setRenameValue("");
    setRenameBusy(false);
  };

  const handleDelete = async (loc) => {
    // Re-count on the server right before deleting: another team's gear, or
    // an item added since the page loaded, must block the delete (L23).
    let itemCount;
    try {
      itemCount = await countItemsAt(orgId, loc.name);
    } catch (err) {
      setConfirmDeleteId(null);
      window.toast?.error?.(
        err?.message || "Couldn't check whether this location is in use.",
      );
      return;
    }
    if (itemCount > 0) {
      setConfirmDeleteId(null);
      setOrgCounts((prev) => ({ ...(prev ?? {}), [loc.name]: itemCount }));
      window.toast?.error?.(
        `${itemCount} ${itemCount === 1 ? "item" : "items"} across your organization still use "${loc.name}". Move them first.`,
      );
      return;
    }

    // The result used to be ignored entirely; an RLS-refused DELETE also
    // returns 2xx with zero rows — deleteByIds tells the cases apart.
    const result = await deleteByIds("locations", [loc.id]);
    setConfirmDeleteId(null);
    if (result.error || result.denied.length > 0) {
      window.toast?.error?.(
        result.error?.message || "You don't have permission to delete this location.",
      );
      return;
    }
    await loadLocations();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-heading mb-1">Locations</h1>
      <p className="text-gray-400 text-sm mb-8">
        Manage the locations available to your org — trucks, stages, storage, etc.
      </p>

      {/* Create form — admins only */}
      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="bg-surface border border-gray-700 rounded-xl p-5 mb-8"
        >
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
            Add location
          </h2>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Location name (e.g. Truck 1)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white text-black text-sm"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white text-black text-sm"
            />
            {createError && (
              <p className="text-red-400 text-sm">{createError}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="btn-accent text-sm"
              >
                {creating ? "Adding…" : "Add location"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Locations list */}
      <div className="flex flex-col gap-3">
        {locations.length === 0 && (
          <p className="text-gray-500 text-sm">No locations yet.</p>
        )}

        {locations.map((loc) => {
          const itemCount = orgCounts?.[loc.name];
          const countKnown = typeof itemCount === "number";
          const isRenaming = renamingId === loc.id;
          const isConfirmingDelete = confirmDeleteId === loc.id;

          return (
            <div
              key={loc.id}
              className={`bg-surface border rounded-xl p-4 transition-colors ${
                loc.is_active ? "border-gray-700" : "border-gray-800 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(loc);
                          if (e.key === "Escape") cancelRename();
                        }}
                        autoFocus
                        className="w-full px-3 py-1.5 rounded bg-white text-black text-sm"
                      />
                      {renameError && (
                        <p className="text-red-400 text-xs">{renameError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleRename(loc)}
                          disabled={renameBusy}
                          className="btn-accent text-xs py-1"
                        >
                          {renameBusy ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="btn-secondary text-xs py-1"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-heading">
                          {loc.name}
                        </span>
                        {!loc.is_active && (
                          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      {loc.description && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {loc.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {countKnown
                          ? `${itemCount} ${itemCount === 1 ? "item" : "items"}`
                          : orgCounts === null
                            ? "Counting items…"
                            : "Item count unavailable"}
                      </p>
                    </>
                  )}
                </div>

                {/* Actions — admins only */}
                {isAdmin && !isRenaming && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startRename(loc)}
                      className="text-xs text-gray-400 hover:text-heading transition-colors px-2 py-1"
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(loc)}
                      className="text-xs text-gray-400 hover:text-heading transition-colors px-2 py-1"
                    >
                      {loc.is_active ? "Deactivate" : "Reactivate"}
                    </button>

                    {countKnown && itemCount === 0 && (
                      isConfirmingDelete ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-400">Sure?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(loc)}
                            className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-gray-400 hover:text-heading px-2 py-1"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(loc.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1"
                        >
                          Delete
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LocationsPage;
