import React, { useContext, useState } from "react";
import EquipmentContext from "../context/EquipmentContext";
import UserContext from "../context/UserContext";

const Dashboard = () => {
  const { equipment, addEquipment, deleteEquipment, updateEquipment } =
    useContext(EquipmentContext);
  const { user } = useContext(UserContext);

  const [newItem, setNewItem] = useState({
    name: "",
    location: "",
    status: "Available",
    rentalStart: "",
    rentalEnd: "",
  });

  const [editingId, setEditingId] = useState(null);
  const isEditing = editingId !== null;

  const handleAddOrUpdate = () => {
    if (!newItem.name || !newItem.location) return;

    // Date validation
    if (
      newItem.rentalStart &&
      newItem.rentalEnd &&
      newItem.rentalEnd < newItem.rentalStart
    ) {
      alert("Rental end date cannot be before start date.");
      return;
    }

    const data = {
      ...newItem,
      updatedBy: user?.username || "admin",
    };

    if (isEditing) {
      updateEquipment(editingId, data);
      setEditingId(null);
    } else {
      addEquipment(data);
    }

    setNewItem({
      name: "",
      location: "",
      status: "Available",
      rentalStart: "",
      rentalEnd: "",
    });
  };

  const handleEdit = (item) => {
    setNewItem({
      name: item.name,
      location: item.location,
      status: item.status,
      rentalStart: item.rentalStart || "",
      rentalEnd: item.rentalEnd || "",
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

  return (
    <div className="p-8 flex flex-col gap-6 text-text">
      <h2 className="text-3xl font-bold text-accent">Dashboard</h2>

      {/* Equipment Table */}
      <div className="bg-surface rounded-xl p-6 shadow-md overflow-x-auto">
        <div className="min-w-[800px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="p-2 whitespace-nowrap">Name</th>
                <th className="p-2 whitespace-nowrap">Location</th>
                <th className="p-2 whitespace-nowrap">Status</th>
                <th className="p-2 whitespace-nowrap">Start Date</th>
                <th className="p-2 whitespace-nowrap">End Date</th>
                <th className="p-2 whitespace-nowrap">Updated By</th>
                <th className="p-2 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((item) => (
                <tr key={item.id} className="border-b border-gray-700">
                  <td className="p-2 text-accent">{item.name}</td>
                  <td className="p-2">{item.location}</td>
                  <td
                    className={`p-2 font-semibold ${statusClass(item.status)}`}
                  >
                    {item.status}
                  </td>
                  <td className="p-2">{item.rentalStart || "—"}</td>
                  <td className="p-2">{item.rentalEnd || "—"}</td>
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

      {/* Add / Edit Equipment Form */}
      <div className="bg-surface p-6 rounded-xl w-full shadow-md">
        <h3 className="text-xl font-bold mb-4 text-center text-accent">
          {isEditing ? "Edit Equipment" : "Add New Equipment"}
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
            placeholder="Location"
            value={newItem.location}
            onChange={(e) =>
              setNewItem({ ...newItem, location: e.target.value })
            }
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
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
            className="px-4 py-2 bg-accent text-text rounded hover:bg-cyan-400"
          >
            {isEditing ? "Update" : "Add"}
          </button>
          {isEditing && (
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-gray-600 text-text rounded hover:bg-gray-500"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
