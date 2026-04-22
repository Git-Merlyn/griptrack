// src/pages/dashboard/utils/auditExport.js
// Generates a CSV export of the equipment audit log (movement history).

import { csvEscape, downloadCsv } from "./export";

const AUDIT_TABLE =
  import.meta.env.VITE_EQUIPMENT_AUDIT_TABLE || "equipment_audit";

/**
 * Build a CSV string from audit log rows.
 *
 * @param {object[]} rows     - Rows from the equipment_audit table
 * @param {object}   nameMap  - Map of equipment_id → item name (built from equipment context)
 * @returns {string} UTF-8 BOM + CSV text
 */
export function auditToCsv(rows, nameMap = {}) {
  const header = [
    "Date / Time",
    "Action",
    "Item Name",
    "Item ID",
    "Actor",
    "From Location",
    "To Location",
    "Qty Change",
    "Notes",
  ];

  const formatTs = (ts) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  };

  const formatMeta = (meta) => {
    if (!meta) return "";
    if (typeof meta === "string") return meta;
    try {
      return JSON.stringify(meta);
    } catch {
      return "";
    }
  };

  const lines = [header.map(csvEscape).join(",")];

  for (const row of rows) {
    const equipId = String(row.equipment_id || "");
    const itemName = nameMap[equipId] || "";

    lines.push(
      [
        formatTs(row.created_at),
        row.action || "",
        itemName,
        equipId,
        row.actor || "",
        row.from_location || "",
        row.to_location || "",
        row.delta_qty != null ? String(row.delta_qty) : "",
        formatMeta(row.meta),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return "\ufeff" + lines.join("\n"); // UTF-8 BOM for Excel
}

/**
 * Fetch all audit events for an org and trigger a CSV download.
 *
 * @param {object} supabase   - Supabase client instance
 * @param {string} orgId      - Current org ID
 * @param {object} nameMap    - Map of equipment_id → item name
 * @returns {Promise<number>} Number of rows exported
 */
export async function fetchAndDownloadAuditCsv(supabase, orgId, nameMap = {}) {
  const { data, error } = await supabase
    .from(AUDIT_TABLE)
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10000); // generous cap — wrap reports rarely exceed this

  if (error) throw error;

  const rows = data ?? [];
  const csv = auditToCsv(rows, nameMap);
  downloadCsv(csv, "griptrack-movement-history");

  return rows.length;
}
