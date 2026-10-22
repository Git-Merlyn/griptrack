import React from "react";
import { statusClass, qtyTextClass, getQty } from "./utils/helpers";

const MobileDashboard = ({
  sortedEquipment,

  bulkMode,
  selectedIds,
  isSelected,
  toggleSelected,
  selectAllVisible,
  deselectVisible,
  clearSelection,

  onOpenDetails,
  onOpenEdit,
  onOpenMove,
  canEdit = true,
}) => {
  // sortedEquipment is the current page; compare row by row (see DesktopDashboard).
  const allVisibleSelected =
    sortedEquipment.length > 0 && sortedEquipment.every((r) => isSelected(r.id));
  const someVisibleSelected = sortedEquipment.some((r) => isSelected(r.id));

  return (
    <div className="flex flex-col gap-3 -mx-1">
      {bulkMode && (
        <div className="flex items-center justify-between px-2 mb-2">
          <label className="flex items-center gap-2 text-sm text-gray-300 select-none">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
              }}
              onChange={(e) => {
                if (e.target.checked) selectAllVisible();
                else deselectVisible();
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
                    aria-label={`Select ${item.name}`}
                    checked={isSelected(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  Select
                </label>
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenDetails(item)}
                  className="block w-full font-semibold text-accent truncate text-left hover:underline underline-offset-2"
                >
                  {item.name}
                </button>

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
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onOpenEdit(item)}
                    className="btn-edit-sm"
                  >
                    Edit
                  </button>
                )}

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
