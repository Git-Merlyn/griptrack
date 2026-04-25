import { EquipmentItem } from './types';

// Status colour — matches web app statusClass()
export function statusColor(status: string | null | undefined): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'available') return '#2ecc71'; // success
  if (s === 'out') return '#ffd600';       // warning
  if (s === 'damaged') return '#ff4d4d';   // danger
  return '#9ca3af';                        // text (default)
}

// Quantity value — safe parse
export function getQty(item: EquipmentItem): number {
  const n = typeof item.quantity === 'number'
    ? item.quantity
    : parseInt(String(item.quantity ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// Quantity text colour — red when 0, yellow when below reserve
export function qtyColor(item: EquipmentItem): string {
  const q = getQty(item);
  const r = typeof item.reserve_min === 'number'
    ? item.reserve_min
    : parseInt(String(item.reserve_min ?? ''), 10) || 0;

  if (r > 0 && q === 0) return '#ff4d4d';
  if (r > 0 && q > 0 && q < r) return '#ffd600';
  return '#f1f5f9'; // slate-100
}

// Format a plain date string "YYYY-MM-DD" → "Jan 29, 2026"
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  // Append time so Date doesn't interpret as UTC midnight and shift the day
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Format a full ISO timestamp → "Jan 29, 2026"  (drops the time)
export function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
