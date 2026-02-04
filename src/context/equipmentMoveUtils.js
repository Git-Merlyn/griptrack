// src/context/equipmentMoveUtils.js

export function isSameItemForMerge(a, b) {
  return (
    String(a?.itemId || "") === String(b?.itemId || "") &&
    String(a?.name || "") === String(b?.name || "") &&
    String(a?.category || "") === String(b?.category || "") &&
    String(a?.source || "") === String(b?.source || "") &&
    String(a?.status || "") === String(b?.status || "") &&
    String(a?.rentalStart || "") === String(b?.rentalStart || "") &&
    String(a?.rentalEnd || "") === String(b?.rentalEnd || "")
  );
}

export function findMergeDestination({
  equipment,
  currentId,
  newLocation,
  current,
}) {
  const rows = Array.isArray(equipment) ? equipment : [];
  const targetLoc = String(newLocation || "");
  const currentLoc = String(current?.location || "");

  // Do not merge within the same location
  if (targetLoc && currentLoc && targetLoc === currentLoc) return undefined;

  return rows.find(
    (x) =>
      String(x?.id) !== String(currentId) &&
      String(x?.location || "") === targetLoc &&
      isSameItemForMerge(x, current),
  );
}
