import React from "react";
import useAuditLog from "../hooks/useAuditLog";

// Badge color + label per action type
const ACTION_META = {
  create: { label: "Created", className: "bg-green-700/40 text-green-300" },
  update: { label: "Updated", className: "bg-blue-700/40 text-blue-300" },
  delete: { label: "Deleted", className: "bg-red-700/40 text-red-300" },
  merge:  { label: "Merged",  className: "bg-purple-700/40 text-purple-300" },
};

const ActionBadge = ({ action }) => {
  const meta = ACTION_META[action] ?? {
    label: action ?? "Unknown",
    className: "bg-gray-700/40 text-gray-300",
  };
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${meta.className}`}
    >
      {meta.label}
    </span>
  );
};

const formatTimestamp = (ts) => {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
};

const AuditLogEntry = ({ log }) => {
  const hasLocationChange = log.from_location || log.to_location;
  const hasDelta = log.delta_qty != null;

  return (
    <li className="flex flex-col gap-1 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <ActionBadge action={log.action} />
        <span className="text-xs text-gray-500 shrink-0">
          {formatTimestamp(log.created_at)}
        </span>
      </div>

      <div className="text-xs text-gray-400 mt-0.5">
        by <span className="text-gray-200">{log.actor || "—"}</span>
      </div>

      {hasLocationChange && (
        <div className="text-xs text-gray-400 mt-0.5">
          {log.from_location && (
            <>
              from{" "}
              <span className="text-gray-200">{log.from_location}</span>
            </>
          )}
          {log.from_location && log.to_location && " → "}
          {log.to_location && (
            <>
              {!log.from_location && "to "}
              <span className="text-gray-200">{log.to_location}</span>
            </>
          )}
        </div>
      )}

      {hasDelta && (
        <div className="text-xs text-gray-400">
          qty{" "}
          <span className="text-gray-200">
            {log.delta_qty > 0 ? `+${log.delta_qty}` : log.delta_qty}
          </span>
        </div>
      )}
    </li>
  );
};

/**
 * Scrollable audit history panel for a single equipment item.
 *
 * @param {{ equipmentId: string }} props
 */
const AuditLogPanel = ({ equipmentId }) => {
  const { logs, loading, error, refresh } = useAuditLog(equipmentId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
        Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-sm">
        <span className="text-red-400">{error}</span>
        <button
          type="button"
          onClick={refresh}
          className="btn-secondary-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500 text-sm">
        No history recorded yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{logs.length} event{logs.length !== 1 ? "s" : ""}</span>
        <button
          type="button"
          onClick={refresh}
          className="text-xs text-gray-500 hover:text-gray-300 transition"
        >
          Refresh
        </button>
      </div>
      <ul className="flex flex-col">
        {logs.map((log, i) => (
          <AuditLogEntry key={log.id ?? i} log={log} />
        ))}
      </ul>
    </div>
  );
};

export default AuditLogPanel;
