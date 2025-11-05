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
    setEquipment((prev) => {
      const existingIndex = prev.findIndex(
        (eq) =>
          eq.name === item.name &&
          eq.location === item.location &&
          eq.status === item.status
      );

      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += item.quantity;
        return updated;
      }

      return [...prev, { ...item, id: Date.now() }];
    });
  };

  const updateEquipment = (id, updates) => {
    setEquipment((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const deleteEquipment = (id) => {
    setEquipment((prev) => prev.filter((item) => item.id !== id));
  };

  const moveEquipment = (id, moveQty, newLocation) => {
    setEquipment((prev) => {
      const updated = [...prev];
      const index = updated.findIndex((eq) => eq.id === id);
      if (index === -1) return prev;

      const original = updated[index];
      if (original.quantity < moveQty) return prev;

      // Subtract from original
      updated[index] = {
        ...original,
        quantity: original.quantity - moveQty,
      };

      // Remove if empty
      if (updated[index].quantity === 0) {
        updated.splice(index, 1);
      }

      // Merge into new location
      const existingAtNewIndex = updated.findIndex(
        (eq) =>
          eq.name === original.name &&
          eq.status === original.status &&
          eq.location === newLocation
      );

      if (existingAtNewIndex !== -1) {
        updated[existingAtNewIndex] = {
          ...updated[existingAtNewIndex],
          quantity: updated[existingAtNewIndex].quantity + moveQty,
        };
      } else {
        updated.push({
          ...original,
          id: Date.now(),
          location: newLocation,
          quantity: moveQty,
        });
      }

      return updated;
    });
  };

  return (
    <EquipmentContext.Provider
      value={{
        equipment,
        addEquipment,
        updateEquipment,
        deleteEquipment,
        moveEquipment,
      }}
    >
      {children}
    </EquipmentContext.Provider>
  );
};

export default EquipmentProvider;
