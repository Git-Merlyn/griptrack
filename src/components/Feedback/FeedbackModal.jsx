import React from "react";
import FeedbackForm from "./FeedbackForm";

const FeedbackModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-surface w-[92%] max-w-lg rounded-xl border border-gray-700 shadow-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold text-accent">Submit Feedback</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <FeedbackForm onSubmitted={onClose} />
      </div>
    </div>
  );
};

export default FeedbackModal;
