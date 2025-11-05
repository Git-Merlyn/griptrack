import { NavLink } from "react-router-dom";

const Sidebar = () => {
  const linkBase = "block px-4 py-2 rounded-lg transition-colors duration-150";
  const activeStyles =
    "bg-background border border-accent text-accent font-semibold";
  const inactiveStyles = "text-muted hover:text-accent";

  return (
    <div className="w-64 bg-surface border-r border-gray-700 h-full p-4 flex flex-col shadow-md">
      <h2 className="text-xl font-bold mb-4 text-accent">GripTrack</h2>
      <nav className="flex flex-col space-y-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${linkBase} ${isActive ? activeStyles : inactiveStyles}`
          }
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/login"
          className={({ isActive }) =>
            `${linkBase} ${isActive ? activeStyles : inactiveStyles}`
          }
        >
          Login
        </NavLink>
      </nav>
    </div>
  );
};

export default Sidebar;
