import React from "react";

const MoveModal = ({
  isOpen,
  movingItem,
  moveData,
  setMoveData,
  allLocations,
  onRequestAddLocation,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen || !movingItem) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
      onClick={onCancel}
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
              if (e.target.value === "__add_new__") onRequestAddLocation();
              else setMoveData({ ...moveData, newLocation: e.target.value });
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
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} className="btn-accent">
              Confirm Move
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoveModal;
