import { NavLink, useNavigate } from "react-router-dom";

const Sidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    // Mirror PasswordGate “Lock” behavior: clear any remembered unlock flag(s)
    try {
      localStorage.removeItem("griptrack_beta_unlocked_v1");
    } catch {
      // ignore
    }

    // Go back to root and force a reload so PasswordGate re-evaluates lock state
    navigate("/");
    window.location.reload();
  };

  return (
    <div className="w-64 bg-surface border-r border-gray-700 h-full px-0 pt-4 pb-6 flex flex-col shadow-md">
      <h2 className="text-xl font-bold mb-6 px-4 text-accent">GripTrack</h2>
      <nav className="flex flex-col gap-0.5">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `w-full px-4 py-2 text-left transition-colors ${
              isActive
                ? "bg-accent/20 text-accent font-semibold"
                : "text-text/60 hover:text-accent"
            }`
          }
        >
          Dashboard
        </NavLink>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full px-4 py-2 text-left transition-colors text-text/60 hover:text-accent"
        >
          Logout
        </button>
      </nav>
    </div>
  );
};

export default Sidebar;
