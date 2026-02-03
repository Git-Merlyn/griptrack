import React from "react";

const MobileDashboard = ({
  sortedEquipment,

  bulkMode,
  selectedIds,
  isSelected,
  toggleSelected,
  selectAllVisible,
  clearSelection,

  statusClass,
  qtyTextClass,
  getQty,

  editingId,

  onOpenDetails,
  onOpenEdit,
  onOpenMove,
}) => {
  return (
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
                  <span className={qtyTextClass(item)}>{getQty(item)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenDetails(item)}
                  className="btn-secondary-sm"
                >
                  Details
                </button>

                <button
                  type="button"
                  onClick={() => onOpenEdit(item)}
                  disabled={editingId !== null}
                  className={
                    editingId !== null ? "btn-disabled-sm" : "btn-edit-sm"
                  }
                >
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => onOpenMove(item)}
                  className="btn-move-sm"
                >
                  Move
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MobileDashboard;
