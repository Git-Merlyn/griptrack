import React from "react";

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

  statusClass,
  qtyTextClass,
  getQty,
  dateTextClass,

  allLocations,
  statusOptions,

  editingId,
  showDesktopEditModal,
  newItem,
  handleInlineChange,
  onRequestAddLocation,

  onOpenDetails,
  onOpenEdit,
  onOpenMove,

  onCancelInlineEdit,
  onSaveInlineEdit,
  onRequestDeleteInline,
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

              <td className="p-2 text-accent font-medium">
                {editingId === item.id && !showDesktopEditModal ? (
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => handleInlineChange("name", e.target.value)}
                    className="w-full px-2 py-1 rounded bg-white text-black"
                  />
                ) : (
                  item.name
                )}
              </td>

              <td className="p-2">
                {editingId === item.id && !showDesktopEditModal ? (
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
                {editingId === item.id && !showDesktopEditModal ? (
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
                {editingId === item.id && !showDesktopEditModal ? (
                  <select
                    value={newItem.location}
                    onChange={(e) => {
                      if (e.target.value === "__add_new__") {
                        onRequestAddLocation?.();
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
                    <option value="__add_new__">➕ Add new location...</option>
                  </select>
                ) : (
                  item.location
                )}
              </td>

              <td className={`p-2 ${statusClass(item.status)}`}>
                {editingId === item.id && !showDesktopEditModal ? (
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
                  <span className="font-normal">{item.status}</span>
                )}
              </td>

              <td className="p-2">
                {editingId === item.id && !showDesktopEditModal ? (
                  <input
                    type="number"
                    min="0"
                    value={newItem.quantity === "" ? "" : newItem.quantity}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return handleInlineChange("quantity", "");
                      const v = parseInt(raw, 10);
                      handleInlineChange(
                        "quantity",
                        Number.isFinite(v) ? v : 0,
                      );
                    }}
                    className="w-full px-2 py-1 rounded bg-white text-black"
                  />
                ) : (
                  <span className={qtyTextClass(item)}>{getQty(item)}</span>
                )}
              </td>

              <td className="p-2">
                {editingId === item.id && !showDesktopEditModal ? (
                  <input
                    type="date"
                    value={newItem.rentalStart || ""}
                    onChange={(e) =>
                      handleInlineChange("rentalStart", e.target.value)
                    }
                    className="w-full px-2 py-1 rounded bg-white text-black"
                  />
                ) : (
                  <span className={dateTextClass(item.rentalStart, "start")}>
                    {item.rentalStart || "-"}
                  </span>
                )}
              </td>

              <td className="p-2">
                {editingId === item.id && !showDesktopEditModal ? (
                  <input
                    type="date"
                    value={newItem.rentalEnd || ""}
                    onChange={(e) =>
                      handleInlineChange("rentalEnd", e.target.value)
                    }
                    className="w-full px-2 py-1 rounded bg-white text-black"
                  />
                ) : (
                  <span className={dateTextClass(item.rentalEnd, "end")}>
                    {item.rentalEnd || "-"}
                  </span>
                )}
              </td>

              <td className="p-2 whitespace-nowrap">
                {editingId === item.id && !showDesktopEditModal ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onCancelInlineEdit}
                      className="btn-secondary-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={onSaveInlineEdit}
                      className="btn-accent-sm"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={onRequestDeleteInline}
                      className="btn-danger-sm"
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
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
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DesktopDashboard;
