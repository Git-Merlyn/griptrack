// Badge label/color for every equipment_audit.action value written by either
// platform: create/update/move/delete (DB trigger), merge (web merge flow),
// edit/damage (mobile explicit writes — mobile uses "edit" where web's trigger
// writes "update" for the same kind of change).
export const ACTION_META = {
  create: { label: "Created", className: "bg-green-700/40 text-green-300" },
  update: { label: "Updated", className: "bg-blue-700/40 text-blue-300" },
  edit:   { label: "Updated", className: "bg-blue-700/40 text-blue-300" },
  move:   { label: "Moved",   className: "bg-purple-700/40 text-purple-300" },
  merge:  { label: "Merged",  className: "bg-amber-700/40 text-amber-300" },
  damage: { label: "Damaged", className: "bg-red-700/40 text-red-300" },
  delete: { label: "Deleted", className: "bg-red-700/40 text-red-300" },
};

export function getActionMeta(action) {
  return (
    ACTION_META[action] ?? {
      label: action || "Unknown",
      className: "bg-gray-700/40 text-gray-300",
    }
  );
}
