import React, { useState } from "react";
import useRequests from "./hooks/useRequests";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META = {
  pending:  { label: "Pending",  className: "bg-yellow-700/40 text-yellow-300" },
  approved: { label: "Approved", className: "bg-green-700/40 text-green-300"  },
  denied:   { label: "Denied",   className: "bg-red-700/40 text-red-300"      },
};

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] ?? { label: status, className: "bg-gray-700/40 text-gray-300" };
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${meta.className}`}>
      {meta.label}
    </span>
  );
};

const formatDate = (ts) => {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch {
    return ts;
  }
};

// ── Sub-components ────────────────────────────────────────────────────────────

const RequestCard = ({ request, isAdmin, onApprove, onDeny, busy }) => {
  const isPending = request.status === "pending";

  return (
    <div className="bg-surface border border-gray-700 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-white text-sm">
            {request.item_name}
          </span>
          <span className="text-xs text-gray-400">
            Qty: {request.quantity}
            {request.requester_name ? ` · Requested by ${request.requester_name}` : ""}
          </span>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {request.notes && (
        <p className="text-xs text-gray-300 border-l-2 border-gray-600 pl-2">
          {request.notes}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
        <span className="text-xs text-gray-500">{formatDate(request.created_at)}</span>

        {request.reviewed_by && (
          <span className="text-xs text-gray-500">
            {request.status === "approved" ? "Approved" : "Denied"} by {request.reviewed_by}
          </span>
        )}

        {isAdmin && isPending && (
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => onApprove(request.id)}
              disabled={busy}
              className={busy ? "btn-disabled-sm" : "btn-accent-sm"}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onDeny(request.id)}
              disabled={busy}
              className={busy ? "btn-disabled-sm" : "btn-danger-sm"}
            >
              Deny
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Crew submit form
const SubmitForm = ({ onSubmit, busy }) => {
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes]       = useState("");
  const [err, setErr]           = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    const trimmed = itemName.trim();
    if (!trimmed) { setErr("Item name is required."); return; }

    try {
      await onSubmit({ itemName: trimmed, quantity, notes });
      setItemName("");
      setQuantity(1);
      setNotes("");
    } catch (e2) {
      setErr(e2?.message || "Failed to submit request.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border border-gray-700 rounded-xl p-5 mb-8"
    >
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
        Request Equipment
      </h2>

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-sm text-gray-400 block mb-1">Item name *</label>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g. 4x4 Floppy, Baby plate, 1-ton combo stand"
            className="w-full px-3 py-2 rounded bg-white text-black text-sm"
            required
          />
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="w-32 px-3 py-2 rounded bg-white text-black text-sm"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Shoot date, department, specific requirements…"
            rows={2}
            className="w-full px-3 py-2 rounded bg-white text-black text-sm resize-none"
          />
        </div>

        {err && <p className="text-red-400 text-sm">{err}</p>}

        <div>
          <button
            type="submit"
            disabled={busy}
            className={busy ? "btn-disabled" : "btn-accent"}
          >
            {busy ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    </form>
  );
};

// ── Filter tabs (admin only) ──────────────────────────────────────────────────

const FILTER_TABS = [
  { id: "all",      label: "All"      },
  { id: "pending",  label: "Pending"  },
  { id: "approved", label: "Approved" },
  { id: "denied",   label: "Denied"   },
];

// ── Main page ─────────────────────────────────────────────────────────────────

const RequestsPage = () => {
  const {
    requests, loading, error, isAdmin,
    refresh, submitRequest, reviewRequest,
  } = useRequests();

  const [reviewBusy, setReviewBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");

  const handleApprove = async (id) => {
    setReviewBusy(true);
    try {
      await reviewRequest(id, "approved");
      window.toast?.success?.("Request approved");
    } catch (e) {
      window.toast?.error?.(e?.message || "Failed to approve");
    } finally {
      setReviewBusy(false);
    }
  };

  const handleDeny = async (id) => {
    setReviewBusy(true);
    try {
      await reviewRequest(id, "denied");
      window.toast?.success?.("Request denied");
    } catch (e) {
      window.toast?.error?.(e?.message || "Failed to deny");
    } finally {
      setReviewBusy(false);
    }
  };

  const handleSubmit = async (fields) => {
    setSubmitBusy(true);
    try {
      await submitRequest(fields);
      window.toast?.success?.("Request submitted");
    } finally {
      setSubmitBusy(false);
    }
  };

  const visibleRequests = isAdmin && activeFilter !== "all"
    ? requests.filter((r) => r.status === activeFilter)
    : requests;

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">
          Equipment Requests
          {isAdmin && pendingCount > 0 && (
            <span className="ml-2 text-sm font-semibold bg-yellow-700/40 text-yellow-300 px-2 py-0.5 rounded-full align-middle">
              {pendingCount} pending
            </span>
          )}
        </h1>
        <p className="text-gray-400 text-sm">
          {isAdmin
            ? "Review and approve gear requests from your crew."
            : "Request gear from your department head or gaffer."}
        </p>
      </div>

      {/* Crew: submit form */}
      {!isAdmin && (
        <SubmitForm onSubmit={handleSubmit} busy={submitBusy} />
      )}

      {/* Admin: filter tabs */}
      {isAdmin && (
        <div className="flex gap-0 border-b border-white/10 mb-6">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                activeFilter === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Request list */}
      {loading && (
        <p className="text-gray-400 text-sm text-center py-10">Loading…</p>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-red-400 text-sm">{error}</p>
          <button type="button" onClick={refresh} className="btn-secondary-sm">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Crew: section heading */}
          {!isAdmin && requests.length > 0 && (
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
              Your Requests
            </h2>
          )}

          {visibleRequests.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-10">
              {activeFilter === "all" || !isAdmin
                ? "No requests yet."
                : `No ${activeFilter} requests.`}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleRequests.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  isAdmin={isAdmin}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                  busy={reviewBusy}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RequestsPage;
