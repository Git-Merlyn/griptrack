# Auth email templates

All six Supabase Auth emails share one layout in the app's dark palette (cyan `#4debf9` accent on `#0f1117` / `#1a1d23`).

| File | Dashboard template | Subject |
|---|---|---|
| `confirmation.html` | Confirm signup | Confirm your GripTrack Account |
| `invite.html` | Invite user | You've been invited to GripTrack |
| `magic_link.html` | Magic link | Your GripTrack sign-in link |
| `email_change.html` | Change email address | Confirm your new GripTrack email |
| `recovery.html` | Reset password | Reset your GripTrack Password |
| `reauthentication.html` | Reauthentication | Your GripTrack verification code |

**Edit** `build.py`, not the HTML, then run `python3 supabase/templates/build.py`. It rewrites the HTML files and the `[auth.email.template.*]` blocks in `supabase/config.toml`.

**Local:** the CLI reads these files on `supabase start`. Emails land in Mailpit at http://127.0.0.1:54324.

**Production:** the hosted project does not read these files. In the Supabase dashboard, go to Authentication > Emails. For each template, paste the file's whole contents into the body, set the subject from the table, and save. `invite.html` reads `org_name` and `invited_by_name`, which `invite-staff` puts in the invite metadata.

## Invite notice for existing accounts (not an auth email)

GoTrue sends nothing when an invited address already has an account, and `invite-staff` must never mint a sign-in link for it. Instead, for invitees with no org or only an untouched auto-created org, `invite-staff` sends a plain "sign in to join" notice through Resend (TODO 9.24). `build.py` writes it to `supabase/functions/invite-staff/joinEmail.ts` in the same layout; after rebuilding, deploy `invite-staff`. Secrets: `RESEND_API_KEY` (required, or the notice is skipped and logged) and optionally `INVITE_EMAIL_FROM` (default `GripTrack <no-reply@griptrack.app>`).
