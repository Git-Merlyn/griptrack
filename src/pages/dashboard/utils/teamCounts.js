// src/pages/dashboard/utils/teamCounts.js

/**
 * Item count per team via HEAD count queries: no rows are transferred and the
 * result is not capped by PostgREST's max_rows (1000), unlike downloading every
 * row's team_id. Teams whose query fails are left out (the card shows "—").
 *
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchTeamItemCounts(supabase, teamIds) {
  const ids = Array.isArray(teamIds) ? teamIds : [];
  const results = await Promise.all(
    ids.map((id) =>
      supabase
        .from("equipment_items")
        .select("id", { count: "exact", head: true })
        .eq("team_id", id),
    ),
  );

  const counts = {};
  ids.forEach((id, i) => {
    const r = results[i];
    if (!r?.error && typeof r?.count === "number") counts[id] = r.count;
  });
  return counts;
}
