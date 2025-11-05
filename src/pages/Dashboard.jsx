import React, { useContext, useState } from "react";
import EquipmentContext from "../context/EquipmentContext";
import UserContext from "../context/UserContext";

const Dashboard = () => {
  const {
    equipment,
    addEquipment,
    deleteEquipment,
    updateEquipment,
    moveEquipment,
  } = useContext(EquipmentContext);
  const { user } = useContext(UserContext);

  const allLocations = Array.from(
    new Set(equipment.map((e) => e.location).filter(Boolean))
  ).sort();

  const [newItem, setNewItem] = useState({
    name: "",
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

  // Quick Edit state
  const [quickName, setQuickName] = useState("");
  const [quickFromId, setQuickFromId] = useState("");
  const [quickQty, setQuickQty] = useState(1);
  const [quickTo, setQuickTo] = useState("");

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
      name: "",
      location: "",
      status: "Available",
      rentalStart: "",
      rentalEnd: "",
      quantity: 1,
    });
  };

  const handleEdit = (item) => {
    setNewItem({
      name: item.name,
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
      name: "",
      location: "",
      status: "Available",
      rentalStart: "",
      rentalEnd: "",
      quantity: 1,
    });
  };

  const statusClass = (status) => {
    switch (status) {
      case "Available":
        return "text-success";
      case "Out":
        return "text-warning";
      case "Damaged":
        return "text-danger";
      default:
        return "text-text";
    }
  };

  const handleMoveSubmit = () => {
    if (!movingItem || moveData.qty <= 0 || !moveData.newLocation) return;
    moveEquipment(movingItem.id, moveData.qty, moveData.newLocation);
    setMovingItem(null);
    setMoveData({ qty: 1, newLocation: "" });
  };

  const handleAddNewLocation = () => {
    const trimmed = newLocationName.trim();
    if (!trimmed) return;

    // Create a dummy entry to register the new location (keeps existing behaviour)
    addEquipment({
      name: "__placeholder__",
      location: trimmed,
      status: "Available",
      quantity: 0,
      updatedBy: user?.username || "admin",
    });

    // Route the new location into the appropriate field depending on caller
    if (isAddingLocationTo === "new") {
      setNewItem((prev) => ({ ...prev, location: trimmed }));
    } else if (isAddingLocationTo === "move") {
      setMoveData((prev) => ({ ...prev, newLocation: trimmed }));
    } else if (isAddingLocationTo === "quick") {
      setQuickTo(trimmed);
    }

    setNewLocationName("");
    setIsAddingLocationTo(null);
    setShowAddLocationModal(false);
  };

  // Quick Edit helpers
  const names = Array.from(
    new Set(
      equipment.map((e) => e.name).filter((n) => n && n !== "__placeholder__")
    )
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
    const entry = equipment.find((e) => String(e.id) === String(id));
    setQuickQty(entry ? entry.quantity || 1 : 1);
  };

  const handleQuickMove = () => {
    if (!quickName || !quickFromId || !quickTo || quickQty <= 0) return;
    moveEquipment(Number(quickFromId), Number(quickQty), quickTo);
    // clear
    setQuickName("");
    setQuickFromId("");
    setQuickQty(1);
    setQuickTo("");
  };

  return (
    <div className="p-8 flex flex-col gap-6 text-text relative">
      <h2 className="text-3xl font-bold text-accent">Dashboard</h2>

      <div className="bg-surface rounded-xl p-6 shadow-md overflow-x-auto">
        <div className="min-w-[700px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="p-2 whitespace-nowrap">Name</th>
                <th className="p-2 whitespace-nowrap">Location</th>
                <th className="p-2 whitespace-nowrap">Status</th>
                <th className="p-2 whitespace-nowrap">Qty</th>
                <th className="p-2 whitespace-nowrap">Start</th>
                <th className="p-2 whitespace-nowrap">End</th>
                <th className="p-2 whitespace-nowrap">Updated By</th>
                <th className="p-2 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {equipment
                .filter((item) => item.name !== "__placeholder__")
                .map((item) => (
                  <tr key={item.id} className="border-b border-gray-700">
                    <td className="p-2 text-accent font-medium">{item.name}</td>
                    <td className="p-2">{item.location}</td>
                    <td
                      className={`p-2 font-semibold ${statusClass(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </td>
                    <td className="p-2">{item.quantity || 1}</td>
                    <td className="p-2">{item.rentalStart || "-"}</td>
                    <td className="p-2">{item.rentalEnd || "-"}</td>
                    <td className="p-2">{item.updatedBy}</td>
                    <td className="p-2 whitespace-nowrap">
                      <button
                        onClick={() => handleEdit(item)}
                        className="text-blue-400 hover:underline"
                      >
                        Edit
                      </button>
                      <span className="mx-1 text-gray-400">|</span>
                      <button
                        onClick={() => setMovingItem(item)}
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
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-surface p-6 rounded-xl w-full shadow-md">
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
            <option value="Available">Available</option>
            <option value="Out">Out</option>
            <option value="Damaged">Damaged</option>
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
            className="px-4 py-2 bg-accent text-white rounded hover:bg-cyan-400"
          >
            {editingId ? "Update" : "Add"}
          </button>
          {editingId && (
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Quick Edit Section */}
      <div className="bg-surface p-6 rounded-xl w-full shadow-md">
        <h3 className="text-xl font-bold mb-4 text-center text-accent">
          Quick Edit
        </h3>
        <div className="flex justify-center gap-4 mb-8">
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
            {entriesForName(quickName).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.location} — {entry.quantity || 1}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            max={
              equipment.find((e) => String(e.id) === String(quickFromId))
                ?.quantity || 1
            }
            value={quickQty}
            onChange={(e) => setQuickQty(parseInt(e.target.value) || 1)}
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
            className="bg-sky-400 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded w-[140px]"
            disabled={!quickName || !quickFromId || !quickTo}
          >
            Quick Move
          </button>
        </div>
      </div>

      {/* Move Modal */}
      {movingItem && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
          <div className="bg-surface p-6 rounded-xl w-[90%] max-w-md shadow-lg">
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
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
          <div className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg">
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
    </div>
  );
};

export default Dashboard;
