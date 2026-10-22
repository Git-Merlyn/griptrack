// src/pages/NotFound.jsx
// Rendered inside MainLayout for unknown authenticated routes (audit L29).
import { Link } from "react-router-dom";

function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-heading mb-2">Page not found</h1>
      <p className="text-gray-400 text-sm mb-6">
        The page you were looking for doesn’t exist or has moved.
      </p>
      <Link to="/" className="btn-accent inline-block">
        Back to inventory
      </Link>
    </div>
  );
}

export default NotFound;
