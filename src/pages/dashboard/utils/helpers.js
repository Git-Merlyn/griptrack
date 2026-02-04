// src/pages/dashboard/utils/helpers.js

export const statusClass = (status) => {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (s === "available") return "text-success";
  if (s === "out") return "text-warning";
  if (s === "damaged") return "text-danger";
  return "text-text";
};

export const getQty = (row) => {
  const q = row?.quantity;
  const n = typeof q === "number" ? q : parseInt(String(q ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
};

// Reserve highlighting rules:
// - Red when reserveMin > 0 AND quantity === 0
// - Yellow when reserveMin > 0 AND 0 < quantity < reserveMin
export const qtyTextClass = (row) => {
  const q = getQty(row);
  const rRaw = row?.reserveMin;
  const r =
    typeof rRaw === "number" ? rRaw : parseInt(String(rRaw ?? ""), 10) || 0;

  if (r > 0 && q === 0) return "text-danger font-semibold";
  if (r > 0 && q > 0 && q < r) return "text-warning font-semibold";
  return "";
};

// Date warning helpers (text-only coloring, no boxes)
export const parseDateLoose = (value) => {
  if (!value || typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;

  // yyyy-mm-dd (HTML date input)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // mm/dd/yyyy
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = Number(mdy[1]);
    const dd = Number(mdy[2]);
    const yyyy = Number(mdy[3]);
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // fallback
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Returns a Tailwind text color class only (no badge/pill)
// mode: 'start' | 'end'
export const dateTextClass = (dateStr, mode) => {
  const d = parseDateLoose(dateStr);
  if (!d) return "text-gray-300";

  const today = startOfDay(new Date());
  const target = startOfDay(d);
  const diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24));

  const isWithinWeekUpcoming = diffDays >= 0 && diffDays <= 7;

  if (mode === "start") {
    // Yellow only for upcoming pickups within a week; normal after it passes
    return isWithinWeekUpcoming ? "text-yellow-300" : "text-gray-200";
  }

  // mode === 'end'
  if (target < today) return "text-red-400";
  if (isWithinWeekUpcoming) return "text-yellow-300";
  return "text-gray-200";
};

export const normalizeName = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
