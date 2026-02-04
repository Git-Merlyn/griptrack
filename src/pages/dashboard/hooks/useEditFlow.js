import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * useEditFlow
 * Owns add/edit state for a single item and the open/close state for edit modals.
 *
 * Inputs:
 * - isMobile: boolean
 * - onBeforeOpen?: () => void   (optional: e.g., close other modals)
 * - defaults?: partial item defaults
 */
export default function useEditFlow({ isMobile, onBeforeOpen, defaults } = {}) {
  const defaultItem = useMemo(
    () => ({
      itemId: "",
      name: "",
      category: "",
      source: "",
      location: "",
      status: "Available",
      rentalStart: "",
      rentalEnd: "",
      quantity: 1,
      reserveMin: 0,
      ...(defaults || {}),
    }),
    [defaults],
  );

  const [editingId, setEditingId] = useState(null);
  const [newItem, setNewItem] = useState(defaultItem);

  const [showMobileEditModal, setShowMobileEditModal] = useState(false);
  const [showDesktopEditModal, setShowDesktopEditModal] = useState(false);

  // Keep newItem defaults in sync if defaults change
  useEffect(() => {
    // Only reset when not actively editing
    if (editingId === null && !showMobileEditModal && !showDesktopEditModal) {
      setNewItem(defaultItem);
    }
  }, [defaultItem, editingId, showMobileEditModal, showDesktopEditModal]);

  const openAdd = useCallback(() => {
    if (typeof onBeforeOpen === "function") onBeforeOpen();
    setEditingId(null);
    setNewItem(defaultItem);
    if (isMobile) setShowMobileEditModal(true);
    else setShowDesktopEditModal(true);
  }, [defaultItem, isMobile, onBeforeOpen]);

  const openEditForItem = useCallback(
    (item) => {
      if (!item) return;
      if (typeof onBeforeOpen === "function") onBeforeOpen();
      setEditingId(item.id ?? null);
      setNewItem({
        itemId: item.itemId || "",
        name: item.name || "",
        category: item.category || "",
        source: item.source || "",
        location: item.location || "",
        status: item.status || "Available",
        rentalStart: item.rentalStart || "",
        rentalEnd: item.rentalEnd || "",
        quantity: Number(item.quantity) || 0,
        reserveMin: Number(item.reserveMin) || 0,
      });
      if (isMobile) setShowMobileEditModal(true);
      else setShowDesktopEditModal(true);
    },
    [isMobile, onBeforeOpen],
  );

  const closeEdit = useCallback(() => {
    setShowMobileEditModal(false);
    setShowDesktopEditModal(false);
  }, []);

  const cancelEdit = useCallback(() => {
    closeEdit();
    setEditingId(null);
    setNewItem(defaultItem);
  }, [closeEdit, defaultItem]);

  const setField = useCallback((field, value) => {
    setNewItem((prev) => ({ ...prev, [field]: value }));
  }, []);

  return {
    editingId,
    setEditingId,
    newItem,
    setNewItem,

    showMobileEditModal,
    setShowMobileEditModal,
    showDesktopEditModal,
    setShowDesktopEditModal,

    openAdd,
    openEditForItem,
    closeEdit,
    cancelEdit,

    setField,
  };
}
