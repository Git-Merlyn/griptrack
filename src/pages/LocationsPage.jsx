import { useState, useContext } from "react";
import { supabase } from "@/lib/supabaseClient";
import EquipmentContext from "@/context/EquipmentContext";
import useUser from "@/context/useUser";

const LocationsPage = () => {
  const { orgId, role } = useUser();
  const { locations, loadLocations, equipment } = useContext(EquipmentContext);
  const isAdmin = role === "owner" || role === "admin";

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

  // Count equipment items per location name
  const countByLocation = (equipment ?? []).reduce((acc, item) => {
    const loc = item.location ?? "";
    acc[loc] = (acc[loc] ?? 0) + 1;
    return acc;
  }, {});

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
      setCreateError(error.message);
    } else {
      setNewName("");
      setNewDesc("");
      await loadLocations();
    }

    setCreating(false);
  };

  const handleToggleActive = async (loc) => {
    await supabase
      .from("locations")
      .update({ is_active: !loc.is_active })
      .eq("id", loc.id);
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

    // Update the location record
    const { error } = await supabase
      .from("locations")
      .update({ name })
      .eq("id", loc.id);

    if (error) {
      setRenameError(error.message);
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
    const itemCount = countByLocation[loc.name] ?? 0;
    if (itemCount > 0) return; // Guard — button is disabled, but just in case

    await supabase.from("locations").delete().eq("id", loc.id);
    setConfirmDeleteId(null);
    await loadLocations();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Locations</h1>
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
          const itemCount = countByLocation[loc.name] ?? 0;
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
                        <span className="font-semibold text-white">
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
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </p>
                    </>
                  )}
                </div>

                {/* Actions — admins only */}
                {isAdmin && !isRenaming && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startRename(loc)}
                      className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1"
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(loc)}
                      className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1"
                    >
                      {loc.is_active ? "Deactivate" : "Reactivate"}
                    </button>

                    {itemCount === 0 && (
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
                            className="text-xs text-gray-400 hover:text-white px-2 py-1"
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
