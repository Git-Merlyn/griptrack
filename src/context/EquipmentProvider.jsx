import { useState } from "react";
import EquipmentContext from "./EquipmentContext";

const EquipmentProvider = ({ children }) => {
  const [equipment, setEquipment] = useState([
    {
      id: 1,
      name: "Camera A",
      location: "Truck 1",
      status: "Available",
      updatedBy: "admin",
    },
    {
      id: 2,
      name: "Tripod B",
      location: "Truck 2",
      status: "Out",
      updatedBy: "admin",
    },
    {
      id: 3,
      name: "Mic C",
      location: "Storage",
      status: "Damaged",
      updatedBy: "admin",
    },
  ]);

  const addEquipment = (item) => {
    setEquipment((prev) => [...prev, { ...item, id: Date.now() }]);
  };

  const updateEquipment = (id, updates) => {
    setEquipment((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const deleteEquipment = (id) => {
    setEquipment((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <EquipmentContext.Provider
      value={{ equipment, addEquipment, updateEquipment, deleteEquipment }}
    >
      {children}
    </EquipmentContext.Provider>
  );
};

export default EquipmentProvider;
