# Database tests

Two kinds of SQL tests live under `supabase/`. CI (`.github/workflows/ci.yml`, job `db`) runs both against a fresh `supabase start` with every migration applied.

| Where | Kind | Run locally |
|---|---|---|
| `supabase/tests/database/*.test.sql` | pgTAP (`plan()` / `finish()`) | `npm run test:db` (= `supabase test db supabase/tests/database`) |
| `supabase/tests/*.sql` (top level), `supabase/behavior-tests/*.sql` | plain psql scripts that `raise exception` on failure | `docker exec -i supabase_db_griptrack psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < <file>` |

Rules:
- Every file runs inside `BEGIN ... ROLLBACK` and creates its own fixtures; nothing may persist.
- Never run a bare `supabase test db` without a path: pg_prove would also pick up the plain scripts and fail them ("No plan found").
- Simulate a user with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';` and go back with `reset role;`.
- New orgs are on the Free plan (there is no org trial). Writes made while `request.jwt.claims` is set (even after `reset role`) are plan-limited by the `enforce_plan_limits` triggers (Free: 50 items, 1 active location, no invites). If a fixture org will exceed that under a JWT, give it a paid plan right after creating it: `update public.subscriptions set plan = 'team', status = 'active' where org_id = '<org id>';`. Never loosen the trigger in a test.
- Checks 1-3 of `01_privileges.test.sql` pin RPC signatures that store-distributed mobile builds call. Add overloads; never change or drop those signatures.
