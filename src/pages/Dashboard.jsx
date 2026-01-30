import React, { useContext, useState, useEffect, useMemo } from "react";
import UploadPDFModal from "../components/UploadPDFModal";
import EquipmentContext from "../context/EquipmentContext";
import UserContext from "../context/UserContext";

const Dashboard = () => {
  const {
    equipment,
    allLocations: contextLocations,
    addEquipment,
    deleteEquipment,
    updateEquipment,
    moveEquipment,
    // importSummaryMessage and clearImportSummary are optional — if your EquipmentContext
    // provides them they will be used to show an import toast after PDF imports.
    importSummaryMessage,
    clearImportSummary,
  } = useContext(EquipmentContext);
  const { user } = useContext(UserContext);

  // Custom locations (so we don't pollute inventory with __placeholder__ rows)
  const [customLocations, setCustomLocations] = useState([]);

  // Load custom locations once
  useEffect(() => {
    try {
      const raw = localStorage.getItem("griptrack_custom_locations");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCustomLocations(parsed);
      }
    } catch (e) {
      console.warn("Failed to load custom locations", e);
    }
  }, []);

  // Persist custom locations
  useEffect(() => {
    try {
      localStorage.setItem(
        "griptrack_custom_locations",
        JSON.stringify(customLocations),
      );
    } catch (e) {
      console.warn("Failed to save custom locations", e);
    }
  }, [customLocations]);

  const allLocations = Array.from(
    new Set([
      ...(Array.isArray(contextLocations) ? contextLocations : []),
      ...equipment.map((e) => e.location).filter(Boolean),
      ...customLocations.filter(Boolean),
    ]),
  ).sort();

  const statusOptions = Array.from(
    new Set([
      "Available",
      "Out",
      "Damaged",
      ...equipment.map((e) => e.status).filter(Boolean),
    ]),
  ).sort((a, b) => String(a).localeCompare(String(b)));

  const [newItem, setNewItem] = useState({
    itemId: "",
    name: "",
    category: "",
    source: "",
    location: "",
    status: "Available",
    rentalStart: "",
    rentalEnd: "",
    quantity: 1,
  });

  const [editingId, setEditingId] = useState(null);
  const [movingItem, setMovingItem] = useState(null);
  const [moveData, setMoveData] = useState({ qty: 1, newLocation: "" });

  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [isAddingLocationTo, setIsAddingLocationTo] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [importInProgress, setImportInProgress] = useState(false);

  // Quick Edit state
  const [quickName, setQuickName] = useState("");
  const [quickFromId, setQuickFromId] = useState("");
  const [quickQty, setQuickQty] = useState(1);
  const [quickTo, setQuickTo] = useState("");

  // Toast for import summary
  const [showToast, setShowToast] = useState(false);
  // Bulk select mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // array of item.id strings
  const [bulkLocation, setBulkLocation] = useState("");

  // Table sorting
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc"); // 'asc' | 'desc'
  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Mobile layout
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileEditModal, setShowMobileEditModal] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const sortArrow = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  useEffect(() => {
    if (importSummaryMessage) {
      setShowToast(true);
      const t = setTimeout(() => {
        setShowToast(false);
        if (typeof clearImportSummary === "function") clearImportSummary();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [importSummaryMessage, clearImportSummary]);

  // Escape hatch: close any open modal/backdrop with Escape
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setShowUploadModal(false);
      setShowAddLocationModal(false);
      setMovingItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleAddOrUpdate = () => {
    if (!newItem.name || !newItem.location || newItem.quantity <= 0) return;
    if (newItem.rentalEnd && newItem.rentalStart > newItem.rentalEnd) return;

    if (editingId !== null) {
      updateEquipment(editingId, {
        ...newItem,
        updatedBy: user?.username || "admin",
      });
      setEditingId(null);
    } else {
      addEquipment({ ...newItem, updatedBy: user?.username || "admin" });
    }

    setNewItem({
      itemId: "",
      name: "",
      category: "",
      source: "",
      location: "",
      status: "Available",
      rentalStart: "",
      rentalEnd: "",
      quantity: 1,
    });
  };

  const handleEdit = (item) => {
    setNewItem({
      itemId: item.itemId || "",
      name: item.name,
      category: item.category || "",
      source: item.source || "",
      location: item.location,
      status: item.status,
      rentalStart: item.rentalStart || "",
      rentalEnd: item.rentalEnd || "",
      quantity: item.quantity || 1,
    });
    setEditingId(item.id);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewItem({
      itemId: "",
      name: "",
      category: "",
      source: "",
      location: "",
      status: "Available",
      rentalStart: "",
      rentalEnd: "",
      quantity: 1,
    });
  };

  const statusClass = (status) => {
    const s = String(status || "")
      .trim()
      .toLowerCase();
    if (s === "available") return "text-success";
    if (s === "out") return "text-warning";
    if (s === "damaged") return "text-danger";
    // Anything else (Unopened/Partial/Nearly Empty/etc)
    return "text-text";
  };

  const handleInlineChange = (field, value) => {
    setNewItem((prev) => ({ ...prev, [field]: value }));
  };
  const isSelected = (id) => selectedIds.includes(String(id));

  const toggleSelected = (id) => {
    const sid = String(id);
    setSelectedIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
  };

  const selectAllVisible = () => {
    const ids = sortedEquipment.map((it) => String(it.id));
    setSelectedIds(ids);
  };

  const clearSelection = () => setSelectedIds([]);

  useEffect(() => {
    if (!bulkMode) {
      setSelectedIds([]);
      setBulkLocation("");
    }
  }, [bulkMode]);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected item(s)?`)) return;

    try {
      for (const id of selectedIds) {
        await Promise.resolve(deleteEquipment(id));
      }
      window.toast?.success?.(`Deleted ${selectedIds.length} item(s)`);
      clearSelection();
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Bulk delete failed");
    }
  };

  const handleBulkSetLocation = async () => {
    if (selectedIds.length === 0) return;
    if (!bulkLocation) return;

    try {
      for (const id of selectedIds) {
        const row = equipment.find((e) => String(e.id) === String(id));
        if (!row) continue;

        await Promise.resolve(
          updateEquipment(row.id, {
            itemId: row.itemId || "",
            name: row.name,
            category: row.category || "",
            source: row.source || "",
            location: bulkLocation,
            status: row.status || "Available",
            rentalStart: row.rentalStart || "",
            rentalEnd: row.rentalEnd || "",
            quantity: row.quantity || 1,
            updatedBy: user?.username || "admin",
          }),
        );
      }

      window.toast?.success?.(
        `Updated location for ${selectedIds.length} item(s)`,
      );
      setBulkLocation("");
      clearSelection();
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Bulk location update failed");
    }
  };

  const handleMoveSubmit = async () => {
    if (!movingItem || moveData.qty <= 0 || !moveData.newLocation) return;
    try {
      console.log("[MoveSubmit] movingItem", movingItem);
      window.toast?.info?.(
        `MoveSubmit id=${movingItem?.id || "-"} itemId=${
          movingItem?.itemId || "-"
        } name=${movingItem?.name || "-"}`,
      );
      const qtyToMove = Math.max(1, Number(moveData.qty) || 1);
      await moveEquipment(movingItem.id, qtyToMove, moveData.newLocation);
      setMovingItem(null);
      setMoveData({ qty: 1, newLocation: "" });
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Move failed");
    }
  };

  const handleAddNewLocation = () => {
    const trimmed = newLocationName.trim();
    if (!trimmed) return;

    // Register location without polluting inventory
    setCustomLocations((prev) => {
      const exists = prev.some(
        (l) => String(l).toLowerCase() === String(trimmed).toLowerCase(),
      );
      return exists ? prev : [...prev, trimmed];
    });

    // Route the new location into the appropriate field depending on caller
    if (isAddingLocationTo === "new") {
      setNewItem((prev) => ({ ...prev, location: trimmed }));
    } else if (isAddingLocationTo === "move") {
      setMoveData((prev) => ({ ...prev, newLocation: trimmed }));
    } else if (isAddingLocationTo === "quick") {
      setQuickTo(trimmed);
    } else if (isAddingLocationTo === "bulk") {
      setBulkLocation(trimmed);
    }

    setNewLocationName("");
    setIsAddingLocationTo(null);
    setShowAddLocationModal(false);
  };

  // Quick Edit helpers
  const names = Array.from(
    new Set(
      equipment.map((e) => e.name).filter((n) => n && n !== "__placeholder__"),
    ),
  ).sort();

  const entriesForName = (name) =>
    equipment.filter((e) => e.name === name && e.name !== "__placeholder__");

  const handleQuickNameChange = (name) => {
    setQuickName(name);
    setQuickFromId("");
    setQuickQty(1);
    setQuickTo("");
  };

  const handleQuickFromChange = (id) => {
    setQuickFromId(id);
  };

  const handleQuickMove = async () => {
    if (!quickName || !quickFromId || !quickTo) return;

    const entry = equipment.find((e) => String(e.id) === String(quickFromId));

    if (!entry) {
      window.toast?.error?.(
        "Quick move failed: could not resolve selected item",
      );
      return;
    }

    const max = Number(entry.quantity) || 1;
    const qtyToMove = Math.min(Math.max(Number(quickQty) || 1, 1), max);

    try {
      console.log("[QuickMove] entry", entry);
      window.toast?.info?.(
        `QuickMove id=${entry?.id} itemId=${entry?.itemId || "-"} name=${
          entry?.name || "-"
        }`,
      );
      await moveEquipment(entry.id, qtyToMove, quickTo);
      window.toast?.success?.(`Moved ${qtyToMove} to ${quickTo}`);

      // clear
      setQuickName("");
      setQuickFromId("");
      setQuickQty(1);
      setQuickTo("");
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Quick move failed");
    }
  };

  const handlePdfUpload = (items) => {
    if (!Array.isArray(items) || items.length === 0) return;

    items.forEach((item) => {
      if (!item.name || !item.location || item.quantity <= 0) return;

      addEquipment({
        itemId: item.id || "",
        name: item.name,
        category: item.category || "", // ✅ add this
        source: item.source || "",
        location: item.location,
        status: item.status || "Available", // ✅ optional but recommended
        rentalStart: item.startDate || "",
        rentalEnd: item.endDate || "",
        quantity: item.quantity || 1,
        updatedBy: user?.username || "admin",
      });
    });
  };

  const visibleEquipment = useMemo(() => {
    const list = Array.isArray(equipment) ? equipment : [];
    return list.filter((item) => item?.name && item.name !== "__placeholder__");
  }, [equipment]);

  const filteredVisibleEquipment = useMemo(() => {
    const q = String(searchQuery || "")
      .trim()
      .toLowerCase();
    if (!q) return visibleEquipment;

    return visibleEquipment.filter((e) => {
      const hay = [
        e?.name,
        e?.itemId,
        e?.category,
        e?.source,
        e?.location,
        e?.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [visibleEquipment, searchQuery]);

  const sortedEquipment = useMemo(() => {
    const rows = [...filteredVisibleEquipment];

    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      const getVal = (row) => {
        switch (sortKey) {
          case "qty":
            return Number(row.quantity) || 0;
          case "start":
            return row.rentalStart || "";
          case "end":
            return row.rentalEnd || "";
          case "status":
            return row.status || "";
          case "location":
            return row.location || "";
          case "category":
            return row.category || "";
          case "source":
            return row.source || "";
          case "updatedBy":
            return row.updatedBy || "";
          case "name":
          default:
            return row.name || "";
        }
      };

      const av = getVal(a);
      const bv = getVal(b);

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }

      return (
        String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * dir
      );
    });

    return rows;
  }, [filteredVisibleEquipment, sortKey, sortDir]);

  return (
    <div className="px-3 sm:px-6 md:p-8 flex flex-col gap-6 text-text relative">
      <h2 className="text-3xl font-bold text-accent">Dashboard</h2>
      <div className="text-xs text-gray-500 mb-2"></div>
      <button
        onClick={() => setShowUploadModal(true)}
        disabled={importInProgress}
        className={`absolute top-8 right-8 px-4 py-2 rounded text-white ${
          importInProgress ? "bg-gray-500" : "bg-accent hover:bg-cyan-400"
        }`}
      >
        {importInProgress ? "Importing..." : "Upload"}
      </button>

      {/* Toast / Import summary */}
      {showToast && importSummaryMessage && (
        <div className="fixed right-6 top-6 z-50">
          <div className="bg-surface border border-gray-700 text-text px-4 py-3 rounded shadow-md flex items-start gap-3 max-w-sm">
            <div className="flex-1">
              <div className="font-semibold text-accent">Import Complete</div>
              <div className="text-sm text-gray-300">
                {importSummaryMessage}
              </div>
            </div>
            <button
              onClick={() => {
                setShowToast(false);
                if (typeof clearImportSummary === "function")
                  clearImportSummary();
              }}
              className="text-gray-400 hover:text-gray-200 ml-2"
              aria-label="dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-xl p-6 shadow-md overflow-x-auto">
        {/* Bulk toolbar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, ID, category, location, status…"
              className="w-full max-w-md px-3 py-2 rounded-lg bg-surface border border-gray-700 text-text placeholder:text-text/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="px-3 py-2 rounded-lg border border-gray-700 text-text/70 hover:text-accent hover:border-accent/60 transition"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBulkMode((v) => !v)}
              className="px-3 py-2 rounded bg-gray-700 text-white hover:bg-gray-600"
            >
              {bulkMode ? "Exit Multi-Select" : "Multi-Select"}
            </button>

            {bulkMode && (
              <span className="text-sm text-gray-300">
                Selected:{" "}
                <span className="font-semibold">{selectedIds.length}</span>
              </span>
            )}
          </div>

          {bulkMode && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkLocation}
                onChange={(e) => {
                  if (e.target.value === "__add_new__") {
                    setIsAddingLocationTo("bulk");
                    setShowAddLocationModal(true);
                  } else {
                    setBulkLocation(e.target.value);
                  }
                }}
                className="px-3 py-2 rounded bg-white text-black min-w-[220px]"
              >
                <option value="">Set location for selected...</option>
                {allLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
                <option value="__add_new__">➕ Add new location...</option>
              </select>

              <button
                type="button"
                onClick={handleBulkSetLocation}
                disabled={selectedIds.length === 0 || !bulkLocation}
                className={`px-3 py-2 rounded text-slate-100 ${
                  selectedIds.length === 0 || !bulkLocation
                    ? "bg-gray-600"
                    : "bg-accent hover:bg-cyan-400"
                }`}
              >
                Apply
              </button>

              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedIds.length === 0}
                className={`px-3 py-2 rounded text-white ${
                  selectedIds.length === 0
                    ? "bg-gray-600"
                    : "bg-red-600 hover:bg-red-500"
                }`}
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Inventory List */}
        {isMobile ? (
          <div className="flex flex-col gap-3 -mx-1">
            {bulkMode && (
              <div className="flex items-center justify-between px-2 mb-2">
                <label className="flex items-center gap-2 text-sm text-gray-300 select-none">
                  <input
                    type="checkbox"
                    checked={
                      sortedEquipment.length > 0 &&
                      selectedIds.length === sortedEquipment.length
                    }
                    onChange={(e) => {
                      if (e.target.checked) selectAllVisible();
                      else clearSelection();
                    }}
                  />
                  Select all
                </label>

                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-sm text-gray-400 hover:text-accent"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {sortedEquipment.map((item) => (
              <div
                key={String(item.id)}
                className="bg-surface border border-gray-700 rounded-xl p-4 mx-1"
              >
                <div className="flex flex-col gap-3">
                  {bulkMode && (
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-gray-300 select-none">
                        <input
                          type="checkbox"
                          checked={isSelected(item.id)}
                          onChange={() => toggleSelected(item.id)}
                        />
                        Select
                      </label>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-accent truncate">
                        {item.name}
                      </div>

                      <div className="text-sm text-gray-300 mt-2">
                        <span className="text-gray-400">Category:</span>{" "}
                        {item.category || "-"}
                      </div>

                      <div className="text-sm text-gray-300">
                        <span className="text-gray-400">Location:</span>{" "}
                        {item.location || "-"}
                      </div>
                      <div className="text-sm text-gray-300">
                        <span className="text-gray-400">Status:</span>{" "}
                        <span className={statusClass(item.status)}>
                          {item.status || "-"}
                        </span>
                      </div>
                      <div className="text-sm text-gray-300">
                        <span className="text-gray-400">Qty:</span>{" "}
                        {item.quantity || 1}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleEdit(item);
                          setShowMobileEditModal(true);
                        }}
                        disabled={editingId !== null}
                        className={`px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-600/20 text-blue-200 ${
                          editingId !== null
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMovingItem({ ...item });
                          setMoveData({ qty: 1, newLocation: "" });
                        }}
                        className="px-3 py-2 rounded-lg border border-yellow-500/30 bg-yellow-600/15 text-yellow-200"
                      >
                        Move
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEquipment(item.id)}
                        className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-600/15 text-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="min-w-[700px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-600">
                  {bulkMode && (
                    <th className="p-2 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={
                          sortedEquipment.length > 0 &&
                          selectedIds.length === sortedEquipment.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) selectAllVisible();
                          else clearSelection();
                        }}
                      />
                    </th>
                  )}

                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="hover:underline"
                    >
                      Name{sortArrow("name")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("category")}
                      className="hover:underline"
                    >
                      Category{sortArrow("category")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("source")}
                      className="hover:underline"
                    >
                      Source{sortArrow("source")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("location")}
                      className="hover:underline"
                    >
                      Location{sortArrow("location")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("status")}
                      className="hover:underline"
                    >
                      Status{sortArrow("status")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("qty")}
                      className="hover:underline"
                    >
                      Qty{sortArrow("qty")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("start")}
                      className="hover:underline"
                    >
                      Start{sortArrow("start")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("end")}
                      className="hover:underline"
                    >
                      End{sortArrow("end")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort("updatedBy")}
                      className="hover:underline"
                    >
                      Updated By{sortArrow("updatedBy")}
                    </button>
                  </th>
                  <th className="p-2 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEquipment.map((item, idx) => (
                  <tr
                    key={`${item.id}-${item.location}-${item.name}-${idx}`}
                    className="border-b border-gray-700"
                  >
                    {bulkMode && (
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={isSelected(item.id)}
                          onChange={() => toggleSelected(item.id)}
                        />
                      </td>
                    )}

                    <td className="p-2 text-accent font-medium">
                      {editingId === item.id ? (
                        <input
                          type="text"
                          value={newItem.name}
                          onChange={(e) =>
                            handleInlineChange("name", e.target.value)
                          }
                          className="w-full px-2 py-1 rounded bg-white text-black"
                        />
                      ) : (
                        item.name
                      )}
                    </td>

                    <td className="p-2">
                      {editingId === item.id ? (
                        <input
                          type="text"
                          value={newItem.category}
                          onChange={(e) =>
                            handleInlineChange("category", e.target.value)
                          }
                          className="w-full px-2 py-1 rounded bg-white text-black"
                        />
                      ) : (
                        item.category || "-"
                      )}
                    </td>
                    <td className="p-2">
                      {editingId === item.id ? (
                        <input
                          type="text"
                          value={newItem.source}
                          onChange={(e) =>
                            handleInlineChange("source", e.target.value)
                          }
                          className="w-full px-2 py-1 rounded bg-white text-black"
                        />
                      ) : (
                        item.source || "-"
                      )}
                    </td>

                    <td className="p-2">
                      {editingId === item.id ? (
                        <select
                          value={newItem.location}
                          onChange={(e) => {
                            if (e.target.value === "__add_new__") {
                              setIsAddingLocationTo("new");
                              setShowAddLocationModal(true);
                            } else {
                              handleInlineChange("location", e.target.value);
                            }
                          }}
                          className="w-full px-2 py-1 rounded bg-white text-black"
                        >
                          <option value="">Select location</option>
                          {allLocations.map((loc) => (
                            <option key={loc} value={loc}>
                              {loc}
                            </option>
                          ))}
                          <option value="__add_new__">
                            ➕ Add new location...
                          </option>
                        </select>
                      ) : (
                        item.location
                      )}
                    </td>

                    <td
                      className={`p-2 font-semibold ${statusClass(item.status)}`}
                    >
                      {editingId === item.id ? (
                        <select
                          value={newItem.status}
                          onChange={(e) =>
                            handleInlineChange("status", e.target.value)
                          }
                          className="w-full px-2 py-1 rounded bg-white text-black font-normal"
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        item.status
                      )}
                    </td>

                    <td className="p-2">
                      {editingId === item.id ? (
                        <input
                          type="number"
                          min="1"
                          value={newItem.quantity}
                          onChange={(e) =>
                            handleInlineChange(
                              "quantity",
                              parseInt(e.target.value, 10) || 1,
                            )
                          }
                          className="w-full px-2 py-1 rounded bg-white text-black"
                        />
                      ) : (
                        item.quantity || 1
                      )}
                    </td>

                    <td className="p-2">
                      {editingId === item.id ? (
                        <input
                          type="date"
                          value={newItem.rentalStart || ""}
                          onChange={(e) =>
                            handleInlineChange("rentalStart", e.target.value)
                          }
                          className="w-full px-2 py-1 rounded bg-white text-black"
                        />
                      ) : (
                        item.rentalStart || "-"
                      )}
                    </td>

                    <td className="p-2">
                      {editingId === item.id ? (
                        <input
                          type="date"
                          value={newItem.rentalEnd || ""}
                          onChange={(e) =>
                            handleInlineChange("rentalEnd", e.target.value)
                          }
                          className="w-full px-2 py-1 rounded bg-white text-black"
                        />
                      ) : (
                        item.rentalEnd || "-"
                      )}
                    </td>

                    <td className="p-2">{item.updatedBy}</td>

                    <td className="p-2 whitespace-nowrap">
                      {editingId === item.id ? (
                        <>
                          <button
                            onClick={handleAddOrUpdate}
                            className="text-green-400 hover:underline"
                          >
                            Save
                          </button>
                          <span className="mx-1 text-gray-400">|</span>
                          <button
                            onClick={handleCancelEdit}
                            className="text-gray-300 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(item)}
                            disabled={editingId !== null}
                            className={`text-blue-400 hover:underline ${
                              editingId !== null
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                          >
                            Edit
                          </button>
                          <span className="mx-1 text-gray-400">|</span>
                          <button
                            onClick={() => {
                              setMovingItem({ ...item });
                              setMoveData({ qty: 1, newLocation: "" });
                            }}
                            className="text-yellow-400 hover:underline"
                          >
                            Move
                          </button>
                          <span className="mx-1 text-gray-400">|</span>
                          <button
                            onClick={() => deleteEquipment(item.id)}
                            className="text-red-400 hover:underline"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="hidden md:block bg-surface p-6 rounded-xl w-full shadow-md">
        <h3 className="text-xl font-bold mb-4 text-center text-accent">
          {editingId ? "Edit Equipment" : "Add New Equipment"}
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Name"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <input
            type="text"
            placeholder="Category"
            value={newItem.category}
            onChange={(e) =>
              setNewItem({ ...newItem, category: e.target.value })
            }
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <input
            type="text"
            placeholder="Source"
            value={newItem.source}
            onChange={(e) => setNewItem({ ...newItem, source: e.target.value })}
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <select
            value={newItem.location}
            onChange={(e) => {
              if (e.target.value === "__add_new__") {
                setIsAddingLocationTo("new");
                setShowAddLocationModal(true);
              } else {
                setNewItem({ ...newItem, location: e.target.value });
              }
            }}
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          >
            <option value="">Select location</option>
            {allLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            <option value="__add_new__">➕ Add new location...</option>
          </select>

          <input
            type="number"
            placeholder="Qty"
            min="1"
            value={newItem.quantity}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                quantity: parseInt(e.target.value) || 1,
              })
            }
            className="flex-1 min-w-[100px] px-3 py-2 rounded bg-white text-black"
          />
          <select
            value={newItem.status}
            onChange={(e) => setNewItem({ ...newItem, status: e.target.value })}
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={newItem.rentalStart}
            onChange={(e) =>
              setNewItem({ ...newItem, rentalStart: e.target.value })
            }
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <input
            type="date"
            value={newItem.rentalEnd}
            onChange={(e) =>
              setNewItem({ ...newItem, rentalEnd: e.target.value })
            }
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <button
            onClick={handleAddOrUpdate}
            className="px-4 py-2 bg-accent text-slate-100 rounded hover:bg-cyan-400"
          >
            {editingId ? "Update" : "Add"}
          </button>
          {editingId && (
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-gray-600 text-slate-100 rounded hover:bg-gray-500"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Quick Edit Section */}
      <div className="hidden md:block bg-surface p-6 rounded-xl w-full shadow-md">
        <h3 className="text-xl font-bold mb-4 text-center text-accent">
          Quick Edit
        </h3>
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <select
            value={quickName}
            onChange={(e) => handleQuickNameChange(e.target.value)}
            className="px-4 py-2 rounded w-[220px] text-black"
          >
            <option value="">Select item</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select
            value={quickFromId}
            onChange={(e) => handleQuickFromChange(e.target.value)}
            className="px-4 py-2 rounded w-[220px] text-black"
            disabled={!quickName}
          >
            <option value="">From (location - qty)</option>
            {entriesForName(quickName).map((entry, idx) => (
              <option
                key={`${entry.id}-${entry.location}-${idx}`}
                value={entry.id}
              >
                {entry.location} — {entry.quantity || 1}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={quickQty === "" ? "" : quickQty}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setQuickQty("");
                return;
              }
              const v = parseInt(raw, 10);
              if (!Number.isFinite(v)) return;
              setQuickQty(v);
            }}
            className="px-4 py-2 rounded w-[120px] text-black text-center"
            disabled={!quickFromId}
          />

          <select
            value={quickTo}
            onChange={(e) => {
              if (e.target.value === "__add_new__") {
                setIsAddingLocationTo("quick");
                setShowAddLocationModal(true);
              } else {
                setQuickTo(e.target.value);
              }
            }}
            className="px-4 py-2 rounded w-[220px] text-black"
            disabled={!quickFromId}
          >
            <option value="">To (location)</option>
            {allLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            <option value="__add_new__">➕ Add new location...</option>
          </select>

          <button
            onClick={handleQuickMove}
            className="bg-accent hover:bg-cyan-400 text-white font-bold py-2 px-4 rounded w-[140px]"
            disabled={!quickName || !quickFromId || !quickTo}
          >
            Quick Move
          </button>
        </div>
      </div>

      {/* Mobile Edit Modal */}
      {isMobile && showMobileEditModal && editingId !== null && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => {
            setShowMobileEditModal(false);
            handleCancelEdit();
          }}
        >
          <div
            className="bg-surface rounded-xl w-[94%] max-w-md shadow-lg max-h-[calc(100dvh-24px)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-[calc(env(safe-area-inset-top)+12px)] pb-4">
              <h3 className="text-xl font-bold text-accent">Edit Item</h3>
            </div>

            <div className="px-6 pb-6 overflow-y-auto flex-1">
              <div className="flex flex-col gap-3">
                <label className="text-sm text-gray-300">Name</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => handleInlineChange("name", e.target.value)}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />

                <label className="text-sm text-gray-300">Category</label>
                <input
                  type="text"
                  value={newItem.category}
                  onChange={(e) =>
                    handleInlineChange("category", e.target.value)
                  }
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />

                <label className="text-sm text-gray-300">Location</label>
                <select
                  value={newItem.location}
                  onChange={(e) => {
                    if (e.target.value === "__add_new__") {
                      setIsAddingLocationTo("new");
                      setShowAddLocationModal(true);
                    } else {
                      handleInlineChange("location", e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                >
                  <option value="">Select location</option>
                  {allLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                  <option value="__add_new__">➕ Add new location...</option>
                </select>

                <label className="text-sm text-gray-300">Status</label>
                <select
                  value={newItem.status}
                  onChange={(e) => handleInlineChange("status", e.target.value)}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <label className="text-sm text-gray-300">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={newItem.quantity}
                  onChange={(e) =>
                    handleInlineChange(
                      "quantity",
                      parseInt(e.target.value, 10) || 1,
                    )
                  }
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
              </div>
            </div>

            <div className="px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)] border-t border-white/10 bg-surface">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileEditModal(false);
                    handleCancelEdit();
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleAddOrUpdate();
                    setShowMobileEditModal(false);
                  }}
                  className="px-4 py-2 bg-accent text-white rounded hover:bg-cyan-400"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {movingItem && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => setMovingItem(null)}
        >
          <div
            className="bg-surface p-6 rounded-xl w-[90%] max-w-md shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-accent mb-4">
              Move {movingItem.name}
            </h3>
            <div className="flex flex-col gap-3">
              <label className="text-sm text-gray-300">
                Quantity to move (max {movingItem.quantity}):
              </label>
              <input
                type="number"
                min="1"
                max={movingItem.quantity}
                value={moveData.qty}
                onChange={(e) =>
                  setMoveData({
                    ...moveData,
                    qty: parseInt(e.target.value) || 1,
                  })
                }
                className="px-3 py-2 rounded bg-white text-black"
              />
              <label className="text-sm text-gray-300">New location:</label>
              <select
                value={moveData.newLocation}
                onChange={(e) => {
                  if (e.target.value === "__add_new__") {
                    setIsAddingLocationTo("move");
                    setShowAddLocationModal(true);
                  } else {
                    setMoveData({ ...moveData, newLocation: e.target.value });
                  }
                }}
                className="px-3 py-2 rounded bg-white text-black"
              >
                <option value="">Select location</option>
                {allLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
                <option value="__add_new__">➕ Add new location...</option>
              </select>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setMovingItem(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMoveSubmit}
                  className="px-4 py-2 bg-accent text-white rounded hover:bg-cyan-400"
                >
                  Confirm Move
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {showAddLocationModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => {
            setShowAddLocationModal(false);
            setNewLocationName("");
            setIsAddingLocationTo(null);
          }}
        >
          <div
            className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-accent mb-4">
              Add New Location
            </h3>
            <input
              type="text"
              placeholder="New location name"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              className="w-full px-3 py-2 mb-4 rounded bg-white text-black"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddLocationModal(false);
                  setNewLocationName("");
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNewLocation}
                className="px-4 py-2 bg-accent text-white rounded hover:bg-cyan-400"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {showUploadModal && (
        <UploadPDFModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUpload={handlePdfUpload}
          setImportInProgress={setImportInProgress}
          allLocations={allLocations}
        />
      )}
    </div>
  );
};

export default Dashboard;
