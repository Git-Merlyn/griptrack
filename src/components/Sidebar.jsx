import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import FeedbackModal from "./feedback/FeedbackModal";
import useUser from "@/context/useUser";

const Sidebar = ({ collapsed = false, onToggleCollapsed }) => {
  const { role, logout } = useUser();
  const isOwner = role === "owner";
  const isAdmin = role === "owner" || role === "admin";

  // Mobile drawer
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Feedback modal (desktop)
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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

  const closeDrawer = () => setDrawerOpen(false);

  const navLinkClass = (isActive, navCollapsed) =>
    `w-full ${navCollapsed ? "px-2" : "px-4"} py-2 text-left transition-colors ${
      navCollapsed ? "text-center" : ""
    } ${isActive ? "bg-accent/20 text-accent font-semibold" : "text-text/60 hover:text-accent"}`;

  const NavItems = ({ onDone, collapsed: navCollapsed = false }) => (
    <nav className="flex flex-col gap-0.5">
      <NavLink
        to="/"
        end
        onClick={() => onDone?.()}
        title="Dashboard"
        className={({ isActive }) => navLinkClass(isActive, navCollapsed)}
      >
        {navCollapsed ? "D" : "Dashboard"}
      </NavLink>

      {isAdmin && (
        <NavLink
          to="/staff"
          onClick={() => onDone?.()}
          title="Staff"
          className={({ isActive }) => navLinkClass(isActive, navCollapsed)}
        >
          {navCollapsed ? "S" : "Staff"}
        </NavLink>
      )}

      {isOwner && (
        <NavLink
          to="/billing"
          onClick={() => onDone?.()}
          title="Billing"
          className={({ isActive }) => navLinkClass(isActive, navCollapsed)}
        >
          {navCollapsed ? "B" : "Billing"}
        </NavLink>
      )}

      <button
        type="button"
        onClick={() => {
          onDone?.();
          setFeedbackOpen(true);
        }}
        title="Beta Feedback"
        className={`w-full ${navCollapsed ? "px-2" : "px-4"} py-2 text-left transition-colors ${
          navCollapsed ? "text-center" : ""
        } text-text/60 hover:text-accent`}
      >
        {navCollapsed ? "F" : "Beta Feedback"}
      </button>

      <button
        type="button"
        onClick={() => {
          onDone?.();
          logout();
        }}
        title="Logout"
        className={`w-full ${navCollapsed ? "px-2" : "px-4"} py-2 text-left transition-colors ${
          navCollapsed ? "text-center" : ""
        } text-text/60 hover:text-accent`}
      >
        {navCollapsed ? "O" : "Logout"}
      </button>
    </nav>
  );

  const DesktopSidebar = () => (
    <div
      className={`hidden md:flex ${
        collapsed ? "w-20" : "w-64"
      } bg-surface border-r border-gray-700 h-full px-0 pt-4 pb-6 flex-col shadow-md`}
    >
      {/* Desktop header styled like mobile */}
      <div className="flex items-center justify-between px-4">
        <button
          type="button"
          className="btn-secondary-sm"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          ☰
        </button>

        {!collapsed && (
          <h2 className="text-xl font-bold text-accent">GripTrack</h2>
        )}

        {/* spacer to keep title centered */}
        <div className="w-10" />
      </div>

      <div className={collapsed ? "mt-4" : "mt-6"}>
        <NavItems collapsed={collapsed} />
      </div>
    </div>
  );

  // Mobile top bar + drawer
  const MobileShell = () => (
    <>
      <div className="md:hidden sticky top-0 z-40 bg-surface border-b border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            className="btn-secondary-sm"
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
                className="btn-secondary-sm"
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

      {/* Quick feedback modal (desktop + mobile) */}
      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </>
  );
};

export default Sidebar;
