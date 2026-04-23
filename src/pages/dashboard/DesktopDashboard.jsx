import React from "react";
import {
  statusClass,
  qtyTextClass,
  getQty,
  dateTextClass,
} from "./utils/helpers";

const DesktopDashboard = ({
  sortedEquipment,
  bulkMode,
  selectedIds,
  isSelected,
  toggleSelected,
  selectAllVisible,
  clearSelection,

  toggleSort,
  sortArrow,

  editingId,

  onOpenDetails,
  onOpenEdit,
  onOpenMove,
}) => {
  return (
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

              <td className="p-2">
                <button
                  type="button"
                  onClick={() => onOpenDetails(item)}
                  className="text-accent font-medium hover:underline underline-offset-2 text-left"
                >
                  {item.name}
                </button>
              </td>

              <td className="p-2">{item.category || "-"}</td>

              <td className="p-2">{item.source || "-"}</td>

              <td className="p-2">{item.location}</td>

              <td className={`p-2 ${statusClass(item.status)}`}>
                <span className="font-normal">{item.status}</span>
              </td>

              <td className="p-2">
                <span className={qtyTextClass(item)}>{getQty(item)}</span>
              </td>

              <td className="p-2">
                <span className={dateTextClass(item.rentalStart, "start")}>
                  {item.rentalStart || "-"}
                </span>
              </td>

              <td className="p-2">
                <span className={dateTextClass(item.rentalEnd, "end")}>
                  {item.rentalEnd || "-"}
                </span>
              </td>

              <td className="p-2 whitespace-nowrap">
                <div className="flex items-center gap-2">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DesktopDashboard;
