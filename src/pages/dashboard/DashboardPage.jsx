import React, { useContext, useState, useEffect } from "react";
import ImportFileModal from "@/components/ImportFileModal";
import EquipmentContext from "@/context/EquipmentContext";
import useUser from "@/context/useUser";
import DesktopDashboard from "./DesktopDashboard";
import MobileDashboard from "./MobileDashboard";
import EditModal from "./components/EditModal";
import DetailsModal from "./components/DetailsModal";
import ConfirmDeleteModal from "./components/ConfirmDeleteModal";
import MoveModal from "./components/MoveModal";
import AddLocationModal from "./components/AddLocationModal";
import ExportModal from "./components/ExportModal";
import useBulkSelection from "./hooks/useBulkSelection";
import useInventoryView from "./hooks/useInventoryView";
import useEditFlow from "./hooks/useEditFlow";
import useLocation from "./hooks/useLocation";
import useExport from "./hooks/useExport";
// (helpers import removed, now unused)
import { matchFileItemsToEquipment } from "./utils/pdfSelect";

// --- Presentational components (extracted from DashboardPage for readability) ---

const InventoryCard = ({ children }) => {
  return (
    <div className="bg-surface rounded-xl p-6 shadow-md overflow-x-auto">
      {children}
    </div>
  );
};

const DashboardHeader = ({
  importInProgress,
  onAddItem,
  onImport,
  onExport,
  hideActions = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-3xl font-bold text-accent">Dashboard</h2>

      {!hideActions && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onAddItem} className="btn-accent">
            <span className="whitespace-nowrap">Add Item</span>
          </button>

          <button
            type="button"
            onClick={onImport}
            disabled={importInProgress}
            className={importInProgress ? "btn-disabled" : "btn-secondary"}
          >
            <span className="whitespace-nowrap">
              {importInProgress ? "Importing..." : "Import"}
            </span>
          </button>

          <button type="button" onClick={onExport} className="btn-secondary">
            <span className="whitespace-nowrap">Export</span>
          </button>
        </div>
      )}
    </div>
  );
};

const ImportToast = ({ show, message, onDismiss }) => {
  if (!show || !message) return null;

  return (
    <div className="fixed right-6 top-6 z-50">
      <div className="bg-surface border border-gray-700 text-text px-4 py-3 rounded shadow-md flex items-start gap-3 max-w-sm">
        <div className="flex-1">
          <div className="font-semibold text-accent">Import Complete</div>
          <div className="text-sm text-gray-300">{message}</div>
        </div>

        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-200 ml-2"
          aria-label="dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

const BulkToolbar = ({
  searchQuery,
  setSearchQuery,

  bulkMode,
  toggleBulkMode,

  onSelectFromFile,
  selectedCount,

  bulkLocation,
  setBulkLocation,
  allLocations,
  onAddNewLocation,

  onApplyBulkLocation,
  onBulkDelete,
}) => {
  return (
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
            className="btn-secondary-sm"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleBulkMode}
          className="btn-secondary-sm"
        >
          {bulkMode ? "Exit Multi-Select" : "Multi-Select"}
        </button>

        {bulkMode && (
          <button
            type="button"
            onClick={onSelectFromFile}
            className="btn-secondary-sm"
          >
            Select from File
          </button>
        )}

        {bulkMode && (
          <span className="text-sm text-gray-300">
            Selected: <span className="font-semibold">{selectedCount}</span>
          </span>
        )}
      </div>

      {bulkMode && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bulkLocation}
            onChange={(e) => {
              if (e.target.value === "__add_new__") onAddNewLocation();
              else setBulkLocation(e.target.value);
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
            onClick={onApplyBulkLocation}
            disabled={selectedCount === 0 || !bulkLocation}
            className={
              selectedCount === 0 || !bulkLocation
                ? "btn-disabled-sm"
                : "btn-accent-sm"
            }
          >
            Apply
          </button>

          <button
            type="button"
            onClick={onBulkDelete}
            disabled={selectedCount === 0}
            className={
              selectedCount === 0 ? "btn-disabled-sm" : "btn-danger-sm"
            }
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

const DashboardPage = () => {
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
  const { user } = useUser();

  const { allLocations, addCustomLocation } = useLocation({
    contextLocations,
    equipment,
  });

  const statusOptions = Array.from(
    new Set([
      "Available",
      "Out",
      "Damaged",
      ...equipment.map((e) => e.status).filter(Boolean),
    ]),
  ).sort((a, b) => String(a).localeCompare(String(b)));

  // Edit/Add modal state and logic handled by useEditFlow below
  const [movingItem, setMovingItem] = useState(null);
  const [moveData, setMoveData] = useState({ qty: 1, newLocation: "" });
  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Bulk delete confirmation modal
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState(null); // { ids: string[] }

  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [isAddingLocationTo, setIsAddingLocationTo] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [importInProgress, setImportInProgress] = useState(false);

  // PDF modal mode: 'import' adds items, 'select' selects existing items for bulk actions
  const [pdfModalMode, setPdfModalMode] = useState("import");

  // Toast for import summary
  const [showToast, setShowToast] = useState(false);

  // Mobile layout
  const [isMobile, setIsMobile] = useState(false);
  // Edit modal state handled by useEditFlow below

  // Mobile "Details" modal
  const [showMobileDetailsModal, setShowMobileDetailsModal] = useState(false);
  const [mobileDetailsItem, setMobileDetailsItem] = useState(null);

  // Edit flow modal state and handlers (centralized)
  const {
    editingId,
    setEditingId,
    newItem,
    setNewItem,
    showMobileEditModal,
    showDesktopEditModal,
    openAdd,
    openEditForItem,
    closeEdit,
    cancelEdit,
    setField,
  } = useEditFlow({
    isMobile,
    onBeforeOpen: () => {
      // Ensure other overlays don't conflict
      setShowMobileDetailsModal(false);
      setMobileDetailsItem(null);
    },
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

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

  const handleAddOrUpdate = () => {
    const qtyNum = newItem.quantity === "" ? 0 : Number(newItem.quantity) || 0;
    const reserveNum = Number(newItem.reserveMin) || 0;
    if (!newItem.name || !newItem.location) return;
    // Allow qty 0 only when reserveMin > 0
    if (qtyNum <= 0 && reserveNum <= 0) return;
    if (newItem.rentalEnd && newItem.rentalStart > newItem.rentalEnd) return;

    if (editingId !== null) {
      updateEquipment(editingId, {
        ...newItem,
        quantity: qtyNum,
        reserveMin: Number(newItem.reserveMin) || 0,
        updatedBy: user?.username || "admin",
      });
      setEditingId(null);
    } else {
      addEquipment({
        ...newItem,
        quantity: qtyNum,
        reserveMin: Number(newItem.reserveMin) || 0,
        updatedBy: user?.username || "admin",
      });
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
      reserveMin: 0,
    });
  };

  const confirmAndDelete = (id, name) => {
    if (!id) return;
    setDeleteTarget({ id, name: name || "" });
  };

  const performDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleteBusy(true);
    try {
      await Promise.resolve(deleteEquipment(deleteTarget.id));
      window.toast?.success?.("Item deleted");
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setBulkDeleteTarget({ ids: [...selectedIds] });
  };

  const performBulkDelete = async () => {
    const ids = bulkDeleteTarget?.ids;
    if (!Array.isArray(ids) || ids.length === 0) return;

    setDeleteBusy(true);
    try {
      for (const id of ids) {
        await Promise.resolve(deleteEquipment(id));
      }
      window.toast?.success?.(`Deleted ${ids.length} item(s)`);
      setBulkDeleteTarget(null);
      clearSelection();
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Bulk delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  // Select existing DB rows based on parsed PDF lines (no DB writes)
  const handlePdfSelect = (items) => {
    if (!Array.isArray(items) || items.length === 0) return;

    const { ids, ambiguous, notFound } = matchFileItemsToEquipment({
      items,
      equipment, // ✅ FULL DB match (Option B)
    });

    // Ensure multi-select is enabled so users can act immediately
    setBulkMode(true);
    setSelectedIds(ids);

    // Feedback
    if (ids.length === 0) {
      window.toast?.error?.(
        "No matches found in the database for the uploaded file items",
      );
    } else {
      const parts = [`Selected ${ids.length} item(s)`];
      if (ambiguous) parts.push(`${ambiguous} line(s) matched multiple rows`);
      if (notFound) parts.push(`${notFound} line(s) not found`);
      window.toast?.success?.(parts.join(" • "));
    }

    // Close modal
    setShowUploadModal(false);
    setPdfModalMode("import");
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
            reserveMin: Number(row.reserveMin) || 0,
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
    addCustomLocation(trimmed);

    // Route the new location into the appropriate field depending on caller
    if (isAddingLocationTo === "new") {
      setNewItem((prev) => ({ ...prev, location: trimmed }));
    } else if (isAddingLocationTo === "move") {
      setMoveData((prev) => ({ ...prev, newLocation: trimmed }));
    } else if (isAddingLocationTo === "bulk") {
      setBulkLocation(trimmed);
    }

    setNewLocationName("");
    setIsAddingLocationTo(null);
    setShowAddLocationModal(false);
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
        reserveMin: Number(item.reserveMin) || 0,
        updatedBy: user?.username || "admin",
      });
    });
  };

  const {
    searchQuery,
    setSearchQuery,
    toggleSort,
    sortArrow,
    visibleEquipment,
    sortedEquipment,
  } = useInventoryView({ equipment });

  const {
    showExportModal,
    setShowExportModal,
    exportUseCurrentView,
    setExportUseCurrentView,
    exportScope,
    setExportScope,
    exportSingleLocation,
    setExportSingleLocation,
    exportMultiLocations,
    setExportMultiLocations,
    exportFormat,
    setExportFormat,
    getExportRows,
    doExport,
  } = useExport({
    sortedEquipment,
    visibleEquipment,
  });

  // Escape hatch: close any open modal/backdrop with Escape
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setShowUploadModal(false);
      setShowAddLocationModal(false);
      setMovingItem(null);
      setDeleteTarget(null);
      setBulkDeleteTarget(null);
      setShowExportModal(false);
      setShowMobileDetailsModal(false);
      setMobileDetailsItem(null);
      closeEdit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeEdit, setShowExportModal]);

  const {
    bulkMode,
    setBulkMode,
    selectedIds,
    setSelectedIds,
    bulkLocation,
    setBulkLocation,
    isSelected,
    toggleSelected,
    selectAllVisible,
    clearSelection,
  } = useBulkSelection({
    visibleRows: sortedEquipment,
    onExitBulkMode: () => {
      setShowMobileDetailsModal(false);
      setMobileDetailsItem(null);
    },
  });

  return (
    <div className="px-3 sm:px-6 md:p-8 flex flex-col gap-6 text-text relative">
      <DashboardHeader
        importInProgress={importInProgress}
        onAddItem={openAdd}
        onImport={() => {
          setPdfModalMode("import");
          setShowUploadModal(true);
        }}
        onExport={() => setShowExportModal(true)}
        hideActions={isMobile}
      />

      <div className="text-xs text-gray-500 mb-2"></div>

      <ImportToast
        show={showToast}
        message={importSummaryMessage}
        onDismiss={() => {
          setShowToast(false);
          if (typeof clearImportSummary === "function") clearImportSummary();
        }}
      />

      {isMobile && (
        <div className="flex items-center justify-start gap-2 -mb-2">
          <button type="button" onClick={openAdd} className="btn-accent">
            <span className="whitespace-nowrap">Add Item</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPdfModalMode("import");
              setShowUploadModal(true);
            }}
            disabled={importInProgress}
            className={importInProgress ? "btn-disabled" : "btn-secondary"}
          >
            <span className="whitespace-nowrap">
              {importInProgress ? "Importing..." : "Import"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="btn-secondary"
          >
            <span className="whitespace-nowrap">Export</span>
          </button>
        </div>
      )}

      <InventoryCard>
        <BulkToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          bulkMode={bulkMode}
          toggleBulkMode={() => setBulkMode((v) => !v)}
          onSelectFromFile={() => {
            setPdfModalMode("select");
            setShowUploadModal(true);
          }}
          selectedCount={selectedIds.length}
          bulkLocation={bulkLocation}
          setBulkLocation={setBulkLocation}
          allLocations={allLocations}
          onAddNewLocation={() => {
            setIsAddingLocationTo("bulk");
            setShowAddLocationModal(true);
          }}
          onApplyBulkLocation={handleBulkSetLocation}
          onBulkDelete={handleBulkDelete}
        />

        {/* Inventory List */}
        {isMobile ? (
          <MobileDashboard
            sortedEquipment={sortedEquipment}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            isSelected={isSelected}
            toggleSelected={toggleSelected}
            selectAllVisible={selectAllVisible}
            clearSelection={clearSelection}
            editingId={editingId}
            onOpenDetails={(item) => {
              setMobileDetailsItem(item);
              setShowMobileDetailsModal(true);
            }}
            onOpenEdit={(item) => {
              openEditForItem(item);
            }}
            onOpenMove={(item) => {
              setMovingItem({ ...item });
              setMoveData({ qty: 1, newLocation: "" });
            }}
          />
        ) : (
          <DesktopDashboard
            sortedEquipment={sortedEquipment}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            isSelected={isSelected}
            toggleSelected={toggleSelected}
            selectAllVisible={selectAllVisible}
            clearSelection={clearSelection}
            toggleSort={toggleSort}
            sortArrow={sortArrow}
            editingId={editingId}
            onOpenDetails={(item) => {
              setMobileDetailsItem(item);
              setShowMobileDetailsModal(true);
            }}
            onOpenEdit={(item) => {
              openEditForItem(item);
            }}
            onOpenMove={(item) => {
              setMovingItem({ ...item });
              setMoveData({ qty: 1, newLocation: "" });
            }}
          />
        )}
      </InventoryCard>

      {/* Desktop inline Add/Edit form removed */}

      {/* Quick Edit Section removed */}

      {/* Edit Modals */}
      <EditModal
        isOpen={isMobile && showMobileEditModal}
        variant="mobile"
        title={editingId ? "Edit Item" : "Add Item"}
        newItem={newItem}
        onChangeField={setField}
        handleInlineChange={setField}
        allLocations={allLocations}
        statusOptions={statusOptions}
        onRequestAddLocation={() => {
          setIsAddingLocationTo("new");
          setShowAddLocationModal(true);
        }}
        onCancel={() => {
          cancelEdit();
        }}
        onSave={() => {
          handleAddOrUpdate();
          closeEdit();
        }}
        onDelete={() => {
          const id = editingId;
          const name = newItem?.name;
          if (!id) return;
          confirmAndDelete(id, name);
        }}
      />

      <EditModal
        isOpen={!isMobile && showDesktopEditModal}
        variant="desktop"
        title={editingId ? "Edit Item" : "Add Item"}
        newItem={newItem}
        onChangeField={setField}
        handleInlineChange={setField}
        allLocations={allLocations}
        statusOptions={statusOptions}
        onRequestAddLocation={() => {
          setIsAddingLocationTo("new");
          setShowAddLocationModal(true);
        }}
        onCancel={() => {
          cancelEdit();
        }}
        onSave={() => {
          handleAddOrUpdate();
          closeEdit();
        }}
        onDelete={() => {
          const id = editingId;
          const name = newItem?.name;
          if (!id) return;
          confirmAndDelete(id, name);
        }}
      />

      {/* Details Modal */}
      <DetailsModal
        isOpen={showMobileDetailsModal && !!mobileDetailsItem}
        item={mobileDetailsItem}
        isMobile={isMobile}
        onClose={() => {
          setShowMobileDetailsModal(false);
          setMobileDetailsItem(null);
        }}
      />

      {/* Bulk Delete */}
      <ConfirmDeleteModal
        isOpen={!!bulkDeleteTarget}
        target={bulkDeleteTarget}
        busy={deleteBusy}
        onCancel={() => setBulkDeleteTarget(null)}
        onConfirm={performBulkDelete}
      />

      {/* Single Delete */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        target={deleteTarget}
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={performDelete}
      />

      {/* Move */}
      <MoveModal
        isOpen={!!movingItem}
        movingItem={movingItem}
        moveData={moveData}
        setMoveData={setMoveData}
        allLocations={allLocations}
        onRequestAddLocation={() => {
          setIsAddingLocationTo("move");
          setShowAddLocationModal(true);
        }}
        onCancel={() => setMovingItem(null)}
        onConfirm={handleMoveSubmit}
      />

      {/* Add Location */}
      <AddLocationModal
        isOpen={showAddLocationModal}
        value={newLocationName}
        onChange={setNewLocationName}
        onCancel={() => {
          setShowAddLocationModal(false);
          setNewLocationName("");
          setIsAddingLocationTo(null);
        }}
        onAdd={handleAddNewLocation}
      />

      {/* Import File Modal (keep as-is) */}
      {showUploadModal && (
        <ImportFileModal
          isOpen={showUploadModal}
          onClose={() => {
            setShowUploadModal(false);
            setPdfModalMode("import");
          }}
          onUpload={(items) => {
            if (pdfModalMode === "select") handlePdfSelect(items);
            else handlePdfUpload(items);
          }}
          mode={pdfModalMode}
          setImportInProgress={setImportInProgress}
          allLocations={allLocations}
        />
      )}

      {/* Export */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        exportUseCurrentView={exportUseCurrentView}
        setExportUseCurrentView={setExportUseCurrentView}
        exportScope={exportScope}
        setExportScope={setExportScope}
        exportSingleLocation={exportSingleLocation}
        setExportSingleLocation={setExportSingleLocation}
        exportMultiLocations={exportMultiLocations}
        setExportMultiLocations={setExportMultiLocations}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        allLocations={allLocations}
        getExportRows={getExportRows}
        onDoExport={() => {
          const result = doExport(); // doExport internally uses getExportRows + format
          if (!result?.count) return;

          window.toast?.success?.(`Exported ${result.count} item(s)`);
          setShowExportModal(false);
        }}
      />
    </div>
  );
};

export default DashboardPage;
