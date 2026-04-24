import { useEffect, useMemo, useState } from "react";
import useDebounce from "@/hooks/useDebounce";

export const PAGE_SIZE_OPTIONS = [
  { label: "50",  value: 50 },
  { label: "100", value: 100 },
  { label: "All", value: 0 },   // 0 = no limit
];

export default function useInventoryView({
  equipment,
  initialSortKey = "name",
  initialSortDir = "asc",
} = {}) {
  // ── Search & filters ──────────────────────────────────────────────────────
  const [searchQuery,     setSearchQuery]     = useState("");
  const [filterLocation,  setFilterLocation]  = useState("");
  const [filterStatus,    setFilterStatus]    = useState("");
  const [filterCategory,  setFilterCategory]  = useState("");
  const [showBelowReserve, setShowBelowReserve] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 200);

  // ── Sorting ───────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDir, setSortDir] = useState(initialSortDir);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const sortArrow = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(50); // 0 = All

  // ── Pinned new items ──────────────────────────────────────────────────────
  // IDs of items added this session — floated to the top of the list so they're
  // immediately visible regardless of sort order. Cleared when any filter or
  // sort changes (at which point the item drops into its natural sorted position).
  const [pinnedIds, setPinnedIds] = useState(new Set());

  const pinItem = (id) => {
    if (!id) return;
    setPinnedIds((prev) => new Set([...prev, String(id)]));
  };

  // Reset to page 1 and clear pins whenever filters or sort change
  useEffect(() => {
    setPinnedIds(new Set());
    setPage(1);
  }, [debouncedSearch, filterLocation, filterStatus, filterCategory, showBelowReserve, sortKey, sortDir]);

  // Also reset page when pageSize changes
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  // ── Derived lists ─────────────────────────────────────────────────────────
  const visibleEquipment = useMemo(() => {
    const list = Array.isArray(equipment) ? equipment : [];
    return list.filter((item) => item?.name && item.name !== "__placeholder__");
  }, [equipment]);

  const filteredVisibleEquipment = useMemo(() => {
    const q = String(debouncedSearch || "").trim().toLowerCase();

    return visibleEquipment.filter((e) => {
      if (q && !String(e?.name || "").toLowerCase().includes(q)) return false;
      if (filterLocation && e?.location !== filterLocation)       return false;
      if (filterStatus   && e?.status   !== filterStatus)         return false;
      if (filterCategory && e?.category !== filterCategory)       return false;
      if (showBelowReserve) {
        const qty     = Number(e?.quantity)  || 0;
        const reserve = Number(e?.reserveMin) || 0;
        if (reserve <= 0 || qty >= reserve) return false;
      }
      return true;
    });
  }, [visibleEquipment, debouncedSearch, filterLocation, filterStatus, filterCategory, showBelowReserve]);

  // Sort — pinned items float above the sorted block
  const sortedEquipment = useMemo(() => {
    const pinned = filteredVisibleEquipment.filter((item) => pinnedIds.has(String(item.id)));
    const rest   = filteredVisibleEquipment.filter((item) => !pinnedIds.has(String(item.id)));

    rest.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      const getVal = (row) => {
        switch (sortKey) {
          case "qty":       return Number(row.quantity)  || 0;
          case "start":     return row.rentalStart       || "";
          case "end":       return row.rentalEnd         || "";
          case "status":    return row.status            || "";
          case "location":  return row.location          || "";
          case "category":  return row.category          || "";
          case "source":    return row.source            || "";
          case "updatedBy": return row.updatedBy         || "";
          case "name":
          default:          return row.name              || "";
        }
      };

      const av = getVal(a);
      const bv = getVal(b);

      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * dir;
    });

    return [...pinned, ...rest];
  }, [filteredVisibleEquipment, pinnedIds, sortKey, sortDir]);

  // Current page slice — sortedEquipment is still the full list for exports/counts
  const paginatedEquipment = useMemo(() => {
    if (pageSize === 0) return sortedEquipment;
    const start = (page - 1) * pageSize;
    return sortedEquipment.slice(start, start + pageSize);
  }, [sortedEquipment, page, pageSize]);

  const totalCount = sortedEquipment.length;
  const totalPages = pageSize === 0 ? 1 : Math.ceil(totalCount / pageSize);

  return {
    // Filter state
    searchQuery,      setSearchQuery,
    filterLocation,   setFilterLocation,
    filterStatus,     setFilterStatus,
    filterCategory,   setFilterCategory,
    showBelowReserve, setShowBelowReserve,

    // Sort state
    sortKey, sortDir, toggleSort, sortArrow,

    // Pagination state
    page, setPage,
    pageSize, setPageSize,
    totalCount, totalPages,

    // Item lists
    visibleEquipment,     // unfiltered (used for empty-state detection)
    sortedEquipment,      // full filtered+sorted list (used for exports)
    paginatedEquipment,   // current page slice (used for rendering)

    // Pin newly added items to the top
    pinItem,
  };
}
