import { useState, useEffect } from "react";
import EquipmentContext from "./EquipmentContext";

const STORAGE_KEY = "equipmentData";

const EquipmentProvider = ({ children }) => {
  const [equipment, setEquipment] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(equipment));
  }, [equipment]);

  const addEquipment = (item) => {
    setEquipment((prev) => [
      ...prev,
      {
        ...item,
        id: Date.now(),
        rentalStart: item.rentalStart || "",
        rentalEnd: item.rentalEnd || "",
      },
    ]);
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
