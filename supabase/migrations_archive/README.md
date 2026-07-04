# Archived migrations

These pre-date proper migration tracking — they were applied to the hosted
database by hand and don't follow the CLI's `<timestamp>_name.sql` naming, so
`supabase` commands skipped them with warnings.

Their effects (and the rest of the hand-built schema) are fully captured in
`../migrations/20260704152501_remote_schema.sql`, pulled from the live
database with `supabase db pull`. They're kept here for historical reference
only — do not apply them.

All future schema changes should be created with `supabase migration new <name>`
so they run in order everywhere.
