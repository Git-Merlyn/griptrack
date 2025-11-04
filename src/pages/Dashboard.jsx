// src/pages/Dashboard.jsx
import React, { useContext, useState } from "react";
import EquipmentContext from "../context/EquipmentContext";
import UserContext from "../context/UserContext";

const Dashboard = () => {
  const { equipment, addEquipment } = useContext(EquipmentContext);
  const { user } = useContext(UserContext);
  const [newItem, setNewItem] = useState({
    name: "",
    location: "",
    status: "Available",
  });

  const handleAdd = () => {
    if (newItem.name && newItem.location) {
      addEquipment({ ...newItem, updatedBy: user?.username || "admin" });
      setNewItem({ name: "", location: "", status: "Available" });
    }
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
        <div className="min-w-[600px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="p-2 whitespace-nowrap">Name</th>
                <th className="p-2 whitespace-nowrap">Location</th>
                <th className="p-2 whitespace-nowrap">Status</th>
                <th className="p-2 whitespace-nowrap">Updated By</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((item) => (
                <tr key={item.id} className="border-b border-gray-700">
                  <td className="p-2">{item.name}</td>
                  <td className="p-2">{item.location}</td>
                  <td
                    className={`p-2 font-semibold ${statusClass(item.status)}`}
                  >
                    {item.status}
                  </td>
                  <td className="p-2">{item.updatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Equipment Form */}
      <div className="bg-surface p-6 rounded-xl w-full shadow-md">
        <h3 className="text-xl font-bold mb-4 text-center text-accent">
          Add New Equipment
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
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-accent text-white rounded hover:bg-cyan-400"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
