// @vitest-environment node
// invite-staff (TODO 9.24): the "invited to join" notice for existing
// accounts. Built from user-typed names, so escaping matters; sent with a
// fake fetch (no network, no key).
import { describe, it, expect, vi } from "vitest";
import { buildJoinEmail, cleanName, escapeHtml, sendJoinEmail, shouldNotify, DEFAULT_FROM } from "./logic.ts";

const base = { to: "crew@example.com", orgName: "Cascade Grip", inviterName: "Sam Lee", appUrl: "https://griptrack.app" };

describe("shouldNotify", () => {
  it("notifies accounts with no real org and nobody else", () => {
    expect(shouldNotify("no_org")).toBe(true);
    expect(shouldNotify("placeholder_org")).toBe(true);
    for (const t of ["other_org", "member", "no_account", null, undefined, ""]) {
      expect(shouldNotify(t)).toBe(false);
    }
  });
});

describe("buildJoinEmail", () => {
  it("names the org and inviter and points at the sign-in page, with no token", () => {
    const m = buildJoinEmail(base);
    expect(m.subject).toBe("You've been invited to join Cascade Grip on GripTrack");
    expect(m.html).toContain("Sam Lee");
    expect(m.html).toContain('href="https://griptrack.app/auth"');
    expect(m.text).toContain("Open GripTrack: https://griptrack.app/auth");
    expect(m.html).not.toMatch(/%%[A-Z_]+%%/);
    expect(m.text).not.toMatch(/%%[A-Z_]+%%/);
    expect(m.html + m.text).not.toMatch(/token|access_token|type=magiclink/i);
  });

  it("escapes names in the HTML and keeps the subject on one line", () => {
    const m = buildJoinEmail({
      ...base,
      orgName: 'Evil <a href="https://x.test">Co</a>\r\nBcc: a@b.c',
      inviterName: "<script>alert(1)</script>",
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain('<a href="https://x.test">');
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject).toContain("Bcc: a@b.c"); // flattened into the text, not a header
  });

  it("falls back when names are blank", () => {
    const m = buildJoinEmail({ ...base, orgName: "  ", inviterName: "" });
    expect(m.subject).toBe("You've been invited to join a team on GripTrack");
    expect(m.text.startsWith("Someone invited you")).toBe(true);
  });
});

describe("cleanName / escapeHtml", () => {
  it("caps long names", () => {
    const long = cleanName("x".repeat(200), "f");
    expect(long.length).toBe(80);
    expect(long.endsWith("…")).toBe(true);
  });
  it("escapes all five HTML specials", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("sendJoinEmail", () => {
  const email = buildJoinEmail(base);

  it("posts to Resend with the key and default sender", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    await sendJoinEmail(email, { apiKey: "re_test", fetchFn });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: DEFAULT_FROM, to: ["crew@example.com"], subject: email.subject });
  });

  it("throws without a key, and on a Resend error", async () => {
    const fetchFn = vi.fn(async () => new Response("bad from", { status: 422 }));
    await expect(sendJoinEmail(email, { apiKey: undefined, fetchFn })).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetchFn).not.toHaveBeenCalled();
    await expect(sendJoinEmail(email, { apiKey: "re_test", fetchFn })).rejects.toThrow(/Resend 422/);
  });
});
