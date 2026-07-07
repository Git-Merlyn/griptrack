// Terms of Service — plain-language, GripTrack-specific.
// Reviewed drafts, not legal advice; get counsel review before major scale.
import LegalLayout from "./LegalLayout";

const TermsPage = () => (
  <LegalLayout title="Terms of Service" updated="July 7, 2026">
    <p>
      These terms govern your use of GripTrack — the web application at
      griptrack.app and the GripTrack mobile app (together, the "Service").
      By creating an account or using the Service you agree to these terms.
    </p>

    <h2>The service</h2>
    <p>
      GripTrack is inventory-management software for film and television
      equipment: tracking gear, locations, movements, teams, and requests.
      We may add, change, or remove features as the product evolves.
    </p>

    <h2>Your account</h2>
    <ul>
      <li>You must provide accurate information and keep your password secure. You're responsible for activity under your account.</li>
      <li>Organization owners control their organization's data and who can access it. Inviting someone grants them the access their role implies.</li>
      <li>You may delete your account at any time from within the app. Owners deleting their account permanently delete their organization and all of its data.</li>
    </ul>

    <h2>Acceptable use</h2>
    <p>
      Don't misuse the Service: no unlawful use, no attempting to breach
      security or access other organizations' data, no reselling the Service,
      no automated scraping, and no interfering with its operation. We may
      suspend or terminate accounts that violate these rules.
    </p>

    <h2>Subscriptions &amp; billing</h2>
    <ul>
      <li>Paid plans are billed through Stripe on a recurring basis until cancelled. You can cancel any time from Billing; access continues to the end of the paid period.</li>
      <li>Free trials convert or expire as described at signup. We'll notify you before a trial ends where practical.</li>
      <li>Prices may change with reasonable advance notice; changes apply from your next billing cycle.</li>
      <li>Except where required by law, payments are non-refundable — though if something's gone wrong, contact us and we'll be reasonable.</li>
    </ul>

    <h2>Your data</h2>
    <p>
      Your organization's inventory data belongs to you. You grant us the
      limited rights needed to host, process, back up, and display it in
      order to provide the Service. Our handling of personal information is
      described in the <a href="/privacy">Privacy Policy</a>.
    </p>

    <h2>Availability &amp; beta features</h2>
    <p>
      We aim for high availability but the Service is provided "as is" and
      "as available", without warranties of any kind, express or implied.
      Features marked beta may change or be withdrawn. You are responsible
      for maintaining independent records where the stakes require it.
    </p>

    <h2>Limitation of liability</h2>
    <p>
      To the maximum extent permitted by law, GripTrack and its operator are
      not liable for indirect, incidental, special, consequential, or
      exemplary damages — including lost profits, lost data, or business
      interruption — arising from your use of the Service. Our total
      aggregate liability is limited to the amounts you paid us in the twelve
      months before the claim (or CAD $50 if you're on a free plan). Nothing
      in these terms limits liability that cannot be limited by law.
    </p>

    <h2>Termination</h2>
    <p>
      You can stop using the Service or delete your account at any time. We
      may suspend or terminate accounts for breach of these terms, with
      notice where practical. On termination, the deletion rules described in
      the Privacy Policy apply.
    </p>

    <h2>Governing law</h2>
    <p>
      These terms are governed by the laws of the Province of Nova Scotia and
      the federal laws of Canada applicable there. Disputes will be resolved
      in the courts of Nova Scotia.
    </p>

    <h2>Changes to these terms</h2>
    <p>
      We may update these terms; we'll update the date above and notify you
      of material changes. Continuing to use the Service after changes take
      effect means you accept them.
    </p>

    <h2>Contact</h2>
    <p>
      <a href="mailto:support@griptrack.app">support@griptrack.app</a>
    </p>
  </LegalLayout>
);

export default TermsPage;
