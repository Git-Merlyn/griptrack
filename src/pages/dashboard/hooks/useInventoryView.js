import { useMemo, useState } from "react";

export default function useInventoryView({
  equipment,
  initialSortKey = "name",
  initialSortDir = "asc",
} = {}) {
  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Table sorting
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDir, setSortDir] = useState(initialSortDir); // 'asc' | 'desc'

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const sortArrow = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const visibleEquipment = useMemo(() => {
    const list = Array.isArray(equipment) ? equipment : [];
    return list.filter((item) => item?.name && item.name !== "__placeholder__");
  }, [equipment]);

  const filteredVisibleEquipment = useMemo(() => {
    const q = String(searchQuery || "")
      .trim()
      .toLowerCase();
    if (!q) return visibleEquipment;

    return visibleEquipment.filter((e) => {
      const name = String(e?.name || "").toLowerCase();
      return name.includes(q);
    });
  }, [visibleEquipment, searchQuery]);

  const sortedEquipment = useMemo(() => {
    const rows = [...filteredVisibleEquipment];

    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      const getVal = (row) => {
        switch (sortKey) {
          case "qty":
            return Number(row.quantity) || 0;
          case "start":
            return row.rentalStart || "";
          case "end":
            return row.rentalEnd || "";
          case "status":
            return row.status || "";
          case "location":
            return row.location || "";
          case "category":
            return row.category || "";
          case "source":
            return row.source || "";
          case "updatedBy":
            return row.updatedBy || "";
          case "name":
          default:
            return row.name || "";
        }
      };

      const av = getVal(a);
      const bv = getVal(b);

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }

      return (
        String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * dir
      );
    });

    return rows;
  }, [filteredVisibleEquipment, sortKey, sortDir]);

  return {
    searchQuery,
    setSearchQuery,
    sortKey,
    sortDir,
    toggleSort,
    sortArrow,
    visibleEquipment,
    sortedEquipment,
  };
}
