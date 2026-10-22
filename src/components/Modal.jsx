import React from "react";
import useDialog from "@/hooks/useDialog";

const Modal = ({ isOpen, onClose, title, children }) => {
  const { panelRef, titleId } = useDialog({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black bg-opacity-50 overflow-y-auto p-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-surface rounded-lg shadow-lg w-full max-w-2xl relative max-h-[calc(100dvh-32px)] sm:max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="flex justify-between items-center border-b border-gray-700 px-6 py-4">
          <h2
            id={titleId}
            className="text-lg font-semibold text-heading"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary-sm"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-6 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+96px)]">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
