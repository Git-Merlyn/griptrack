#!/usr/bin/env python3
"""Build GripTrack's Supabase Auth email templates.

One layout for every auth email, in the app's dark palette (src/index.css:
background #0f1117, surface #1a1d23, accent #4debf9). Edit this file, then:

    python3 supabase/templates/build.py

It rewrites the *.html files next to it and the [auth.email.template.*]
blocks in supabase/config.toml (local stack). The hosted project does not
read these files: paste each one into the dashboard (Authentication >
Emails), with the subject below. See README.md.

It also writes supabase/functions/invite-staff/joinEmail.ts, the "invited
to join" notice invite-staff sends through Resend to people who already have
an account (TODO 9.24). That one is not an auth email: deploy invite-staff
after rebuilding it.
"""
from pathlib import Path
import json
import re

HERE = Path(__file__).resolve().parent
CONFIG = HERE.parent / "config.toml"
JOIN_TS = HERE.parent / "functions" / "invite-staff" / "joinEmail.ts"

BG = "#0f1117"        # --color-background
SURFACE = "#1a1d23"   # --color-surface
BORDER = "#2b3038"    # white/10 on surface
ACCENT = "#4debf9"    # --color-accent
HEADING = "#ffffff"   # --color-heading
BODY = "#d1d5db"      # gray-300, body copy in the app
MUTED = "#9ca3af"     # --color-text
FAINT = "#6b7280"     # gray-500
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

LAYOUT = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{{title}}</title>
</head>
<body style="margin:0;padding:0;background:{BG};">
<!-- {{comment}} -->
<div style="display:none;max-height:0;overflow:hidden;">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:{SURFACE};border:1px solid {BORDER};border-radius:16px;font-family:{FONT};">
<tr><td style="padding:28px 32px 20px;border-bottom:1px solid {BORDER};">
<div style="font-size:28px;font-weight:700;color:{ACCENT};line-height:1.2;">GripTrack</div>
<div style="font-size:14px;color:{MUTED};margin-top:6px;">Film Equipment Inventory</div>
</td></tr>
<tr><td style="padding:28px 32px 32px;">
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:{HEADING};font-weight:700;">{{heading}}</h1>
{{body}}
</td></tr>
</table>
<div style="max-width:560px;font-family:{FONT};font-size:12px;line-height:1.5;color:{FAINT};padding:16px 8px 0;">
{{footer}}
</div>
</td></tr>
</table>
</body>
</html>
"""


def p(text):
    return f'<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:{BODY};">{text}</p>'


def strong(text):
    return f'<strong style="color:{HEADING};">{text}</strong>'


def button(label):
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>'
        f'<td style="border-radius:10px;background:{ACCENT};">'
        f'<a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;padding:14px 26px;'
        f'font-size:16px;font-weight:700;color:{BG};text-decoration:none;border-radius:10px;">{label}</a>'
        "</td></tr></table>"
    )


FALLBACK = (
    f'<p style="margin:0 0 6px;font-size:13px;color:{MUTED};">If the button doesn&rsquo;t work, use this link:</p>'
    '<p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;">'
    f'<a href="{{{{ .ConfirmationURL }}}}" style="color:{ACCENT};">{{{{ .ConfirmationURL }}}}</a></p>'
)

GREETING = "{{ if .Data.full_name }}" + p("Hi {{ .Data.full_name }},") + "{{ end }}"
FOOT = (
    "This email was sent to {{ .Email }} by GripTrack. "
    "If you didn&rsquo;t ask for this, you can ignore this email."
)

TEMPLATES = {
    "confirmation": dict(
        subject="Confirm your GripTrack Account",
        heading="Confirm your email",
        preheader="One click to finish creating your GripTrack account.",
        body=GREETING
        + p("Thanks for signing up for GripTrack. Confirm this is your email address to finish creating your account.")
        + button("Confirm email")
        + FALLBACK,
        footer=FOOT,
    ),
    # invite-staff passes org_name and invited_by_name in the invite metadata.
    "invite": dict(
        subject="You've been invited to GripTrack",
        heading="You&rsquo;ve been invited",
        preheader="Join your team on GripTrack.",
        body=p(
            "{{ if .Data.invited_by_name }}" + strong("{{ .Data.invited_by_name }}") + " invited you"
            "{{ else }}You&rsquo;ve been invited{{ end }} to join "
            "{{ if .Data.org_name }}" + strong("{{ .Data.org_name }}") + " on {{ end }}GripTrack."
        )
        + p("GripTrack helps film crews track equipment, manage locations, and keep inventory organized on set.")
        + p("Click below to accept the invite and finish setting up your account.")
        + button("Accept invite")
        + FALLBACK,
        footer="This email was sent to {{ .Email }} by GripTrack. If you weren&rsquo;t expecting an invite, you can ignore this email.",
    ),
    "recovery": dict(
        subject="Reset your GripTrack Password",
        heading="Reset your password",
        preheader="Choose a new password for your GripTrack account.",
        body=GREETING
        + p("We got a request to reset the password for your GripTrack account. Click below to choose a new one. The link works once.")
        + button("Reset password")
        + FALLBACK,
        footer=(
            "This email was sent to {{ .Email }} by GripTrack. If you didn&rsquo;t ask to reset "
            "your password, you can ignore this email; your password stays the same."
        ),
    ),
    "magic_link": dict(
        subject="Your GripTrack sign-in link",
        heading="Sign in to GripTrack",
        preheader="Your one-time sign-in link.",
        body=GREETING + p("Click below to sign in. The link works once.") + button("Sign in") + FALLBACK,
        footer=FOOT,
    ),
    "email_change": dict(
        subject="Confirm your new GripTrack email",
        heading="Confirm your new email",
        preheader="Confirm the change to your GripTrack sign-in email.",
        body=GREETING
        + p(
            "You asked to change your GripTrack sign-in email from " + strong("{{ .Email }}")
            + " to " + strong("{{ .NewEmail }}") + ". Confirm the change below."
        )
        + button("Confirm new email")
        + FALLBACK,
        footer=(
            "This email was sent by GripTrack. If you didn&rsquo;t ask to change your email, "
            "ignore this email and your sign-in email stays the same."
        ),
    ),
    "reauthentication": dict(
        subject="Your GripTrack verification code",
        heading="Your verification code",
        preheader="Use this code to confirm it's you.",
        body=GREETING
        + p("Enter this code in GripTrack to confirm it&rsquo;s you:")
        + f'<div style="margin:8px 0 24px;padding:16px 20px;background:{BG};border:1px solid {BORDER};'
        f"border-radius:10px;font-family:Menlo,Consolas,monospace;font-size:28px;letter-spacing:6px;"
        f'color:{HEADING};text-align:center;">{{{{ .Token }}}}</div>',
        footer=FOOT,
    ),
}


# Sent by invite-staff (not GoTrue) to an invitee who already has an account.
# No sign-in link: just where to sign in. The %%...%% slots are filled at
# send time with HTML-escaped values (joinEmail.ts fillJoinEmail).
JOIN = dict(
    subject="You've been invited to join %%ORG%% on GripTrack",
    heading="You&rsquo;ve been invited",
    preheader="Sign in to GripTrack to join %%ORG%%.",
    body=p(strong("%%INVITER%%") + " invited you to join " + strong("%%ORG%%") + " on GripTrack.")
    + p(
        "You already have a GripTrack account, so there&rsquo;s nothing to set up. "
        "Sign in with " + strong("%%EMAIL%%") + " on the web or in the GripTrack app and you&rsquo;ll join automatically."
    )
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>'
    f'<td style="border-radius:10px;background:{ACCENT};">'
    f'<a href="%%SIGN_IN_URL%%" style="display:inline-block;padding:14px 26px;'
    f'font-size:16px;font-weight:700;color:{BG};text-decoration:none;border-radius:10px;">Open GripTrack</a>'
    "</td></tr></table>",
    footer=(
        "This email was sent to %%EMAIL%% by GripTrack. If you weren&rsquo;t expecting an invite, "
        "you can ignore this email; nothing changes until you sign in."
    ),
    text=(
        "%%INVITER%% invited you to join %%ORG%% on GripTrack.\n\n"
        "You already have a GripTrack account, so there's nothing to set up. "
        "Sign in with %%EMAIL%% on the web or in the GripTrack app and you'll join automatically.\n\n"
        "Open GripTrack: %%SIGN_IN_URL%%\n\n"
        "If you weren't expecting an invite, you can ignore this email; nothing changes until you sign in.\n"
    ),
)


def write_join_email():
    html = LAYOUT.format(
        title="%%SUBJECT%%",
        heading=JOIN["heading"],
        preheader=JOIN["preheader"],
        body=JOIN["body"],
        footer=JOIN["footer"],
        comment="GripTrack invite notice for existing accounts. Generated by supabase/templates/build.py.",
    )
    ts = (
        "// Generated by supabase/templates/build.py. Do not edit; rebuild instead.\n"
        "// %%SLOT%% values are filled by fillJoinEmail() in logic.ts.\n"
        f"export const JOIN_SUBJECT = {json.dumps(JOIN['subject'])};\n"
        f"export const JOIN_HTML = {json.dumps(html)};\n"
        f"export const JOIN_TEXT = {json.dumps(JOIN['text'])};\n"
    )
    JOIN_TS.write_text(ts)


def main():
    for name, t in TEMPLATES.items():
        html = LAYOUT.format(
            title=t["subject"],
            heading=t["heading"],
            preheader=t["preheader"],
            body=t["body"],
            footer=t["footer"],
            comment=(
                f'GripTrack auth email "{name}", subject "{t["subject"]}". '
                "Generated by build.py; paste into the dashboard (Authentication > Emails)."
            ),
        )
        (HERE / f"{name}.html").write_text(html)

    block = (
        "# GripTrack auth emails, generated by supabase/templates/build.py. The hosted\n"
        "# project's copies are pasted into the dashboard: Authentication > Emails.\n"
    )
    for name, t in TEMPLATES.items():
        block += (
            f"[auth.email.template.{name}]\n"
            f'subject = "{t["subject"]}"\n'
            f'content_path = "./supabase/templates/{name}.html"\n\n'
        )
    cfg = CONFIG.read_text()
    start = cfg.index("# GripTrack auth emails")
    end = cfg.index("# Uncomment to customize notification email template")
    CONFIG.write_text(cfg[:start] + block + cfg[end:])
    write_join_email()
    print(f"wrote {len(TEMPLATES)} templates and invite-staff/joinEmail.ts")


if __name__ == "__main__":
    main()
