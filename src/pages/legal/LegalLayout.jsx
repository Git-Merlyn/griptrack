// Shared shell for the public legal pages (/privacy, /terms).
import { Link } from "react-router-dom";

const LegalLayout = ({ title, updated, children }) => (
  <div className="min-h-screen bg-background text-text">
    <header className="border-b border-text/10">
      <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-accent">GripTrack</Link>
        <nav className="flex gap-4 text-sm text-text/60">
          <Link to="/privacy" className="hover:text-text transition">Privacy</Link>
          <Link to="/terms" className="hover:text-text transition">Terms</Link>
        </nav>
      </div>
    </header>

    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-text mb-1">{title}</h1>
      <p className="text-text/50 text-sm mb-8">Last updated: {updated}</p>
      {/* Legal prose styling: headings, paragraphs, lists */}
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-text/85 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text [&_h2]:mt-6 [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </main>

    <footer className="border-t border-text/10 mt-10">
      <div className="max-w-3xl mx-auto px-4 py-6 text-xs text-text/40">
        Questions? Contact <a className="text-accent underline underline-offset-2" href="mailto:support@griptrack.app">support@griptrack.app</a>
      </div>
    </footer>
  </div>
);

export default LegalLayout;
