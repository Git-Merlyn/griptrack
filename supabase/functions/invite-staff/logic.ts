// invite-staff (TODO 9.24): the "invited to join" notice for invitees who
// already have an account. GoTrue sends nothing to them, and invite-staff must
// never mint a sign-in link for someone else's account (audit C1), so this is
// a plain notice sent through Resend that only says where to sign in.
import { JOIN_HTML, JOIN_SUBJECT, JOIN_TEXT } from "./joinEmail.ts";

/** invite_target_status values that get the notice. `other_org` never does:
 * accepting can't move them (one org per account) and D12 is deferred. */
export const NOTIFY_TARGETS = ["no_org", "placeholder_org"] as const;

export function shouldNotify(target: unknown): boolean {
  return (NOTIFY_TARGETS as readonly unknown[]).includes(target);
}

export const DEFAULT_FROM = "GripTrack <no-reply@griptrack.app>";
const MAX_NAME = 80;

/** One line, no control characters, capped: org and inviter names are
 * typed by users and end up in a subject header and an inbox. */
export function cleanName(value: string, fallback: string): string {
  // deno-lint-ignore no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  if (!flat) return fallback;
  return flat.length > MAX_NAME ? `${flat.slice(0, MAX_NAME - 1).trimEnd()}…` : flat;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fill(template: string, slots: Record<string, string>): string {
  return template.replace(/%%([A-Z_]+)%%/g, (whole, key: string) => slots[key] ?? whole);
}

export interface JoinEmailInput {
  to: string;
  orgName: string;
  inviterName: string;
  appUrl: string;
}

export interface JoinEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function buildJoinEmail({ to, orgName, inviterName, appUrl }: JoinEmailInput): JoinEmail {
  const org = cleanName(orgName, "a team");
  const inviter = cleanName(inviterName, "Someone");
  const signInUrl = `${appUrl}/auth`;
  const plain = { ORG: org, INVITER: inviter, EMAIL: to, SIGN_IN_URL: signInUrl };
  const subject = fill(JOIN_SUBJECT, plain);
  const escaped = Object.fromEntries(
    Object.entries({ ...plain, SUBJECT: subject }).map(([k, v]) => [k, escapeHtml(v)]),
  );
  return { to, subject, html: fill(JOIN_HTML, escaped), text: fill(JOIN_TEXT, plain) };
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** POST the notice to Resend. Throws on a missing key or a non-2xx reply;
 * the caller logs and moves on, so the invite response never changes. */
export async function sendJoinEmail(
  email: JoinEmail,
  { apiKey, from = DEFAULT_FROM, fetchFn = fetch }: { apiKey: string | undefined; from?: string; fetchFn?: FetchLike },
): Promise<void> {
  if (!apiKey) throw new Error("RESEND_API_KEY is not set; skipped the invite notice");
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
}
