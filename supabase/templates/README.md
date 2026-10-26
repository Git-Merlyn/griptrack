# Auth email templates

All six Supabase Auth emails share one layout in the app's dark palette (cyan `#4debf9` accent on `#0f1117` / `#1a1d23`).

| File | Dashboard template | Subject |
|---|---|---|
| `confirmation.html` | Confirm signup | Confirm your GripTrack account |
| `invite.html` | Invite user | You've been invited to GripTrack |
| `magic_link.html` | Magic link | Your GripTrack sign-in link |
| `email_change.html` | Change email address | Confirm your new GripTrack email |
| `recovery.html` | Reset password | Reset your GripTrack password |
| `reauthentication.html` | Reauthentication | Your GripTrack verification code |

**Edit** `build.py`, not the HTML, then run `python3 supabase/templates/build.py`. It rewrites the HTML files and the `[auth.email.template.*]` blocks in `supabase/config.toml`.

**Local:** the CLI reads these files on `supabase start`. Emails land in Mailpit at http://127.0.0.1:54324.

**Production:** the hosted project does not read these files. In the Supabase dashboard, go to Authentication > Emails. For each template, paste the file's whole contents into the body, set the subject from the table, and save. `invite.html` reads `org_name` and `invited_by_name`, which `invite-staff` puts in the invite metadata.
