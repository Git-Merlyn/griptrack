import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

const Sidebar = () => {
  const navigate = useNavigate();

  // Mobile drawer
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (!mobile) setDrawerOpen(false);
    };

    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const lockAndReload = () => {
    try {
      localStorage.removeItem("griptrack_beta_unlocked_v1");
    } catch {
      // ignore
    }

    // Go back to root and force a reload so PasswordGate re-evaluates lock state
    navigate("/");
    window.location.reload();
  };

  const closeDrawer = () => setDrawerOpen(false);

  const NavItems = ({ onDone }) => (
    <nav className="flex flex-col gap-0.5">
      <NavLink
        to="/"
        end
        onClick={() => onDone?.()}
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
        onClick={() => {
          onDone?.();
          lockAndReload();
        }}
        className="w-full px-4 py-2 text-left transition-colors text-text/60 hover:text-accent"
      >
        Logout
      </button>
    </nav>
  );

  // Desktop sidebar (unchanged)
  const DesktopSidebar = () => (
    <div className="hidden md:flex w-64 bg-surface border-r border-gray-700 h-full px-0 pt-4 pb-6 flex-col shadow-md">
      <h2 className="text-xl font-bold mb-6 px-4 text-accent">GripTrack</h2>
      <NavItems />
    </div>
  );

  // Mobile top bar + drawer
  const MobileShell = () => (
    <>
      <div className="md:hidden sticky top-0 z-40 bg-surface border-b border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            className="px-3 py-2 rounded bg-gray-700 text-white"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="font-bold text-accent text-lg">GripTrack</div>

          <div className="w-10" />
        </div>
      </div>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} />

          <div className="absolute left-0 top-0 h-full w-72 bg-surface border-r border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-accent text-lg">GripTrack</div>
              <button
                type="button"
                className="px-3 py-2 rounded bg-gray-700 text-white"
                onClick={closeDrawer}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <NavItems onDone={closeDrawer} />
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {isMobile ? <MobileShell /> : null}
      <DesktopSidebar />
    </>
  );
};

export default Sidebar;
