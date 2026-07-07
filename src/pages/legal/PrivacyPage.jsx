// Privacy Policy — plain-language, GripTrack-specific.
// Reviewed drafts, not legal advice; get counsel review before major scale.
import LegalLayout from "./LegalLayout";

const PrivacyPage = () => (
  <LegalLayout title="Privacy Policy" updated="July 7, 2026">
    <p>
      GripTrack ("we", "us") is equipment inventory software for film and
      television crews, available at griptrack.app and as a mobile app. This
      policy explains what information we collect, why, and what rights you
      have over it. The short version: we collect what the product needs to
      work, we don't sell your data, and you can delete your account —
      and everything in it — yourself, at any time, from inside the app.
    </p>

    <h2>What we collect</h2>
    <ul>
      <li>
        <strong>Account information.</strong> Your email address, name, and
        password (stored as a hash — we never see your password), plus your
        role and organization membership.
      </li>
      <li>
        <strong>Inventory data you enter.</strong> Equipment items, locations,
        quantities, movement history, requests, and team structure. This data
        belongs to your organization.
      </li>
      <li>
        <strong>Diagnostics.</strong> If the app crashes or errors, we collect
        technical details (browser/device type, the error, and a session
        replay of the interface interactions that led to it) through Sentry so
        we can fix bugs. Replay collection masks typed text by default.
      </li>
      <li>
        <strong>Basic usage analytics.</strong> Anonymous page-view metrics
        (via Vercel Analytics) that don't identify you individually.
      </li>
      <li>
        <strong>Billing details.</strong> If you subscribe to a paid plan,
        payment is handled by Stripe. We never see or store your card number —
        only your subscription status and plan.
      </li>
    </ul>

    <h2>What we use it for</h2>
    <ul>
      <li>Providing the service: accounts, sync, team access, notifications.</li>
      <li>Transactional email (invites, password resets) — never marketing without consent.</li>
      <li>Fixing bugs and improving reliability.</li>
      <li>Processing subscription payments.</li>
    </ul>
    <p>
      We do <strong>not</strong> sell your personal information, and we do not
      share it with third parties except the service providers below, who
      process it on our behalf.
    </p>

    <h2>Who processes your data</h2>
    <ul>
      <li><strong>Supabase</strong> — database and authentication (hosted in the United States, AWS us-west-2).</li>
      <li><strong>Vercel</strong> — web hosting and anonymous analytics.</li>
      <li><strong>Sentry</strong> — error tracking and session replay (US region).</li>
      <li><strong>Resend</strong> — transactional email delivery.</li>
      <li><strong>Stripe</strong> — payment processing.</li>
      <li><strong>Google Workspace</strong> — support email.</li>
    </ul>
    <p>
      Your data is stored and processed in the <strong>United States</strong>.
      If you are in Canada, the EU, or elsewhere, you consent to this transfer
      by using the service; each provider maintains industry-standard
      safeguards and data-processing agreements.
    </p>

    <h2>The mobile app</h2>
    <p>
      The mobile app stores a copy of your organization's inventory on your
      device (so it works offline) and your login token in your device's
      secure storage. Camera access, if granted, is used only to scan
      equipment QR codes; photos are not collected without your action.
    </p>

    <h2>Your rights</h2>
    <ul>
      <li>
        <strong>Deletion:</strong> delete your account in-app (Settings →
        Delete account on the web; Profile → Delete account on mobile).
        If you own an organization, this permanently deletes the organization
        and all of its data. Deletion is immediate and irreversible.
      </li>
      <li>
        <strong>Access &amp; correction:</strong> you can view and edit your
        profile in-app; for a copy of your data or corrections you can't make
        yourself, email us.
      </li>
      <li>
        <strong>Complaints:</strong> Canadian users may contact the Office of
        the Privacy Commissioner of Canada; EU users their local supervisory
        authority.
      </li>
    </ul>

    <h2>Retention</h2>
    <p>
      We keep your data while your account is active. When you delete your
      account, it is removed from the live database immediately and ages out
      of encrypted backups within approximately 30 days. Error diagnostics
      age out of Sentry automatically (90 days).
    </p>

    <h2>Cookies &amp; local storage</h2>
    <p>
      We use browser local storage for your login session and interface
      preferences (theme, sidebar state). We don't use advertising or
      cross-site tracking cookies.
    </p>

    <h2>Changes</h2>
    <p>
      If we make material changes to this policy we'll update the date above
      and, for significant changes, notify you by email or in-app.
    </p>

    <h2>Contact</h2>
    <p>
      <a href="mailto:support@griptrack.app">support@griptrack.app</a>
    </p>
  </LegalLayout>
);

export default PrivacyPage;
