import { NavLink } from "react-router-dom";

const Sidebar = () => {
  return (
    <div className="w-64 bg-surface border-r border-gray-700 h-full px-0 pt-4 pb-6 flex flex-col shadow-md">
      <h2 className="text-xl font-bold mb-6 px-4 text-accent">GripTrack</h2>
      <nav className="flex flex-col gap-0.5">
        {[
          { label: "Dashboard", path: "/" },
          { label: "Equipment", path: "/equipment" },
          { label: "Requests", path: "/requests" },
          { label: "Logout", path: "/logout" },
        ].map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end
            className={({ isActive }) =>
              `w-full px-4 py-2 text-left transition-colors ${
                isActive
                  ? "bg-accent/20 text-accent font-semibold"
                  : "text-text/60 hover:text-accent"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
