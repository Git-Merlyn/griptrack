import React from "react";

const AddLocationModal = ({ isOpen, value, onChange, onCancel, onAdd }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
      onClick={onCancel}
    >
      <div
        className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-accent mb-4">Add New Location</h3>
        <input
          type="text"
          placeholder="New location name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 mb-4 rounded bg-white text-black"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={onAdd} className="btn-accent">
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddLocationModal;
