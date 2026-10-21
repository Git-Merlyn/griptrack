// Badge label/color for every equipment_audit.action value:
//   create/update/move/delete: the equipment_items trigger (both platforms;
//     actor and user_id are derived server-side from the caller).
//   merge/damage: the log_merge_event / log_damage_event RPCs (web merge flow
//     and mobile; web has no damage flow, so marking an item "Damaged" on web
//     shows only as "update").
//   edit: legacy rows hand-written by older mobile builds; no longer written.
// A mobile damage report intentionally produces two rows: the trigger's
// "update" (status change + snapshots) and the RPC's "damage" (the notes).
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
