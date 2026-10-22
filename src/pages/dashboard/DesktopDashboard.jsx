import React from "react";
import {
  statusClass,
  qtyTextClass,
  getQty,
  dateTextClass,
} from "./utils/helpers";

const SORT_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "source", label: "Source" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
  { key: "qty", label: "Qty" },
  { key: "start", label: "Start" },
  { key: "end", label: "End" },
];

const DesktopDashboard = ({
  sortedEquipment,
  bulkMode,
  isSelected,
  toggleSelected,
  selectAllVisible,
  deselectVisible,

  toggleSort,
  sortArrow,
  sortKey,
  sortDir,

  onOpenDetails,
  onOpenEdit,
  onOpenMove,
  canEdit = true,
}) => {
  // sortedEquipment is the current page. Selection can also hold rows from
  // other pages or from "Select from File", so compare row by row.
  const allVisibleSelected =
    sortedEquipment.length > 0 && sortedEquipment.every((r) => isSelected(r.id));
  const someVisibleSelected = sortedEquipment.some((r) => isSelected(r.id));

  return (
    <div className="min-w-[700px]">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-600">
            {bulkMode && (
              <th className="p-2 whitespace-nowrap">
                <input
                  type="checkbox"
                  aria-label="Select all items on this page"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                  }}
                  onChange={(e) => {
                    if (e.target.checked) selectAllVisible();
                    else deselectVisible();
                  }}
                />
              </th>
            )}

            {SORT_COLUMNS.map((col) => (
              <th
                key={col.key}
                className="p-2 whitespace-nowrap"
                aria-sort={
                  sortKey === col.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className="hover:underline"
                >
                  {col.label}
                  <span aria-hidden="true">{sortArrow(col.key)}</span>
                </button>
              </th>
            ))}

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
                    aria-label={`Select ${item.name}`}
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DesktopDashboard;
