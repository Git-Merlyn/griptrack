import React, { useState, useEffect } from "react";
import { statusClass, dateTextClass, getQty } from "../utils/helpers";
import AuditLogPanel from "./AuditLogPanel";

const TABS = [
  { id: "details", label: "Details" },
  { id: "history", label: "History" },
];

const DetailsModal = ({ isOpen, item, isMobile, onClose }) => {
  const [activeTab, setActiveTab] = useState("details");

  // Reset to Details tab whenever a new item is opened
  useEffect(() => {
    if (isOpen) setActiveTab("details");
  }, [isOpen, item?.id]);

  if (!isOpen || !item) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl w-[94%] max-w-md shadow-lg max-h-[calc(100dvh-24px)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-[calc(env(safe-area-inset-top)+12px)] pb-0">
          <h3 className="text-xl font-bold text-accent">Details</h3>
          <div className="text-sm text-gray-300 mt-1 truncate">{item.name}</div>

          {/* Tab bar */}
          <div className="flex gap-0 mt-4 border-b border-white/10">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-accent text-accent"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {activeTab === "details" && (
            <div className="flex flex-col gap-3 text-sm">
              {!isMobile && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Item ID</span>
                  <span className="text-gray-200 text-right">
                    {item.itemId || "-"}
                  </span>
                </div>
              )}

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Category</span>
                <span className="text-gray-200 text-right">
                  {item.category || "-"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Source</span>
                <span className="text-gray-200 text-right">
                  {item.source || "-"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Location</span>
                <span className="text-gray-200 text-right">
                  {item.location || "-"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Status</span>
                <span className={"text-right " + statusClass(item.status)}>
                  {item.status || "-"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Quantity</span>
                <span className="text-gray-200 text-right">{getQty(item)}</span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Reserve minimum</span>
                <span className="text-gray-200 text-right">
                  {Number(item.reserveMin) || 0}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Start date</span>
                <span
                  className={
                    "text-right " + dateTextClass(item.rentalStart, "start")
                  }
                >
                  {item.rentalStart || "-"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">End date</span>
                <span
                  className={"text-right " + dateTextClass(item.rentalEnd, "end")}
                >
                  {item.rentalEnd || "-"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Updated by</span>
                <span className="text-gray-200 text-right">
                  {item.updatedBy || "-"}
                </span>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <AuditLogPanel equipmentId={item.id} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)] border-t border-white/10 bg-surface">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-accent">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailsModal;
