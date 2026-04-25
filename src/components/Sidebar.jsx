// src/components/Sidebar.jsx

import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import FeedbackModal from "./feedback/FeedbackModal";
import useUser from "@/context/useUser";
import useTrial from "@/hooks/useTrial";
import useTeam from "@/context/useTeam";
import useTheme from "@/hooks/useTheme";
import { supabase } from "@/lib/supabaseClient";

// ── Icons ─────────────────────────────────────────────────────────────────────
// Inline SVGs so we don't need an icon library.
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d)
      ? d.map((path, i) => <path key={i} d={path} />)
      : <path d={d} />}
  </svg>
);

const Icons = {
  Dashboard: () => <Icon d={["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"]} />,
  Staff:     () => <Icon d={["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M23 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"]} />,
  Locations: () => <Icon d={["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"]} />,
  Teams:     () => <Icon d={["M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z", "M12 14c-7 0-9 3-9 5v1h18v-1c0-2-2-5-9-5z"]} />,
  Requests:  () => <Icon d={["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"]} />,
  Billing:   () => <Icon d={["M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z", "M2 11h20"]} />,
  Feedback:  () => <Icon d={["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"]} />,
  Settings:  () => <Icon d={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"]} />,
  Moon:      () => <Icon d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  Sun:       () => <Icon d={["M12 1v2", "M12 21v2", "M4.22 4.22l1.42 1.42", "M18.36 18.36l1.42 1.42", "M1 12h2", "M21 12h2", "M4.22 19.78l1.42-1.42", "M18.36 5.64l1.42-1.42", "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"]} />,
  Password:  () => <Icon d={["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"]} />,
  Logout:    () => <Icon d={["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"]} />,
};

// ── SettingsPanel ─────────────────────────────────────────────────────────────
function SettingsPanel({ collapsed, onClose }) {
  const { logout, profile, role } = useUser();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isOwner = role === "owner";

  const [view, setView] = useState("menu"); // "menu" | "password"
  const [pwState, setPwState] = useState({ current: "", next: "", confirm: "", busy: false, err: "", ok: false });

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (pwState.next !== pwState.confirm) {
      setPwState((s) => ({ ...s, err: "Passwords don't match" }));
      return;
    }
    if (pwState.next.length < 8) {
      setPwState((s) => ({ ...s, err: "Password must be at least 8 characters" }));
      return;
    }
    setPwState((s) => ({ ...s, busy: true, err: "" }));
    const { error } = await supabase.auth.updateUser({ password: pwState.next });
    if (error) {
      setPwState((s) => ({ ...s, busy: false, err: error.message }));
    } else {
      setPwState((s) => ({ ...s, busy: false, ok: true, current: "", next: "", confirm: "" }));
    }
  };

  // Panel positioning: above the settings button, left-aligned
  const panelClass = collapsed
    ? "left-16 bottom-2"
    : "left-2 bottom-14";

  return (
    <div className={`fixed ${panelClass} z-50 w-72 bg-surface border border-gray-700 rounded-xl shadow-2xl`}>
      {view === "menu" ? (
        <div className="flex flex-col">
          {/* Profile header */}
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-text font-medium text-sm truncate">
              {profile?.full_name || "Your account"}
            </p>
            <p className="text-gray-500 text-xs truncate">{profile?.email || ""}</p>
          </div>

          {/* Menu items */}
          <div className="flex flex-col py-1">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/5 transition text-left"
            >
              <div className="flex items-center gap-2.5 text-text text-sm">
                {isDark ? <Icons.Moon /> : <Icons.Sun />}
                <span>{isDark ? "Dark mode" : "Light mode"}</span>
              </div>
              {/* Toggle pill */}
              <div className={`relative w-9 h-5 rounded-full transition-colors ${isDark ? "bg-accent/30" : "bg-gray-600"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${isDark ? "left-4 bg-accent" : "left-0.5 bg-gray-300"}`} />
              </div>
            </button>

            {/* Change password */}
            <button
              type="button"
              onClick={() => setView("password")}
              className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/5 transition text-text text-sm"
            >
              <Icons.Password />
              <span>Change password</span>
            </button>

            {/* Billing — owners only */}
            {isOwner && (
              <button
                type="button"
                onClick={() => { navigate("/billing"); onClose(); }}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/5 transition text-text text-sm"
              >
                <Icons.Billing />
                <span>Billing &amp; plan</span>
              </button>
            )}

            <div className="border-t border-gray-700 my-1" />

            {/* Logout */}
            <button
              type="button"
              onClick={() => { logout(); onClose(); }}
              className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-danger/10 transition text-danger text-sm"
            >
              <Icons.Logout />
              <span>Log out</span>
            </button>
          </div>
        </div>
      ) : (
        /* Change password form */
        <div className="flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
            <button type="button" onClick={() => setView("menu")} className="text-gray-400 hover:text-text">
              ←
            </button>
            <p className="text-text font-medium text-sm">Change password</p>
          </div>
          <form onSubmit={handlePasswordSave} className="flex flex-col gap-3 p-4">
            <input
              type="password"
              placeholder="New password"
              value={pwState.next}
              onChange={(e) => setPwState((s) => ({ ...s, next: e.target.value, err: "", ok: false }))}
              className="w-full px-3 py-2 rounded bg-white text-black text-sm"
              required
              minLength={8}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={pwState.confirm}
              onChange={(e) => setPwState((s) => ({ ...s, confirm: e.target.value, err: "", ok: false }))}
              className="w-full px-3 py-2 rounded bg-white text-black text-sm"
              required
            />
            {pwState.err && <p className="text-danger text-xs">{pwState.err}</p>}
            {pwState.ok  && <p className="text-success text-xs">Password updated!</p>}
            <button
              type="submit"
              disabled={pwState.busy}
              className={pwState.busy ? "btn-disabled" : "btn-accent"}
            >
              {pwState.busy ? "Saving…" : "Save password"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const Sidebar = ({ collapsed = false, onToggleCollapsed }) => {
  const { role } = useUser();
  const isOwner = role === "owner";
  const isAdmin = role === "owner" || role === "admin";

  const { isTrialActive, isTrialExpired, daysLeft } = useTrial();
  const { activeTeam, activeTeamId, canSwitchTeams } = useTeam();

  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

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

  // Close settings panel on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  const navLinkClass = (isActive, navCollapsed) =>
    `w-full flex items-center gap-3 ${navCollapsed ? "px-0 justify-center" : "px-4"} py-2.5 rounded-lg transition-colors ${
      isActive
        ? "bg-accent/15 text-accent font-semibold"
        : "text-text/60 hover:text-text hover:bg-white/5"
    }`;

  const NavItems = ({ onDone, navCollapsed = false }) => (
    <nav className="flex flex-col gap-0.5 px-2">
      <NavLink to="/" end onClick={() => onDone?.()} title="Dashboard"
        className={({ isActive }) => navLinkClass(isActive, navCollapsed)}>
        <Icons.Dashboard />
        {!navCollapsed && <span>Dashboard</span>}
      </NavLink>

      {/* Active team sub-indicator */}
      {!navCollapsed && activeTeamId && activeTeam && (
        <NavLink to="/teams" onClick={() => onDone?.()} title={`Team: ${activeTeam.name}`}
          className={({ isActive }) =>
            `ml-4 flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs transition-colors ${
              isActive ? "text-accent" : "text-text/50 hover:text-text/80"
            }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
          <span className="truncate">{activeTeam.name}</span>
        </NavLink>
      )}

      {isAdmin && (
        <NavLink to="/staff" onClick={() => onDone?.()} title="Staff"
          className={({ isActive }) => navLinkClass(isActive, navCollapsed)}>
          <Icons.Staff />
          {!navCollapsed && <span>Staff</span>}
        </NavLink>
      )}

      {isAdmin && (
        <NavLink to="/locations" onClick={() => onDone?.()} title="Locations"
          className={({ isActive }) => navLinkClass(isActive, navCollapsed)}>
          <Icons.Locations />
          {!navCollapsed && <span>Locations</span>}
        </NavLink>
      )}

      {(isAdmin || !canSwitchTeams) && (
        <NavLink to="/teams" onClick={() => onDone?.()} title="Teams"
          className={({ isActive }) => navLinkClass(isActive, navCollapsed)}>
          <Icons.Teams />
          {!navCollapsed && <span>Teams</span>}
        </NavLink>
      )}

      <NavLink to="/requests" onClick={() => onDone?.()} title="Requests"
        className={({ isActive }) => navLinkClass(isActive, navCollapsed)}>
        <Icons.Requests />
        {!navCollapsed && <span>Requests</span>}
      </NavLink>

      <button type="button" title="Beta Feedback"
        onClick={() => { onDone?.(); setFeedbackOpen(true); }}
        className={`w-full flex items-center gap-3 ${navCollapsed ? "px-0 justify-center" : "px-4"} py-2.5 rounded-lg transition-colors text-text/60 hover:text-text hover:bg-white/5`}>
        <Icons.Feedback />
        {!navCollapsed && <span>Beta Feedback</span>}
      </button>

      {/* Trial badge */}
      {(isTrialActive || isTrialExpired) && (
        <NavLink to="/billing" onClick={() => onDone?.()}
          title={isTrialExpired ? "Trial expired" : `Trial: ${daysLeft}d left`}
          className={({ isActive }) =>
            `w-full flex items-center gap-3 ${navCollapsed ? "px-0 justify-center" : "px-4"} py-2 rounded-lg transition-colors ${isActive ? "bg-accent/15" : ""}`
          }>
          {navCollapsed ? (
            <span className={`w-2 h-2 rounded-full ${isTrialExpired ? "bg-danger" : daysLeft <= 7 ? "bg-warning" : "bg-success"}`} />
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
              isTrialExpired ? "bg-danger/20 text-danger" : daysLeft <= 7 ? "bg-warning/20 text-warning" : "bg-success/20 text-success"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isTrialExpired ? "bg-danger" : daysLeft <= 7 ? "bg-warning" : "bg-success"}`} />
              {isTrialExpired ? "Trial expired" : `Trial: ${daysLeft}d left`}
            </span>
          )}
        </NavLink>
      )}
    </nav>
  );

  // ── Settings button + panel (desktop) ──────────────────────────────────────
  const SettingsButton = ({ navCollapsed }) => (
    <div ref={settingsRef} className="relative px-2">
      <button
        type="button"
        title="Settings"
        onClick={() => setSettingsOpen((o) => !o)}
        className={`w-full flex items-center gap-3 ${navCollapsed ? "px-0 justify-center" : "px-4"} py-2.5 rounded-lg transition-colors ${
          settingsOpen ? "bg-accent/15 text-accent" : "text-text/60 hover:text-text hover:bg-white/5"
        }`}
      >
        <Icons.Settings />
        {!navCollapsed && <span className="text-sm">Settings</span>}
      </button>

      {settingsOpen && (
        <SettingsPanel
          collapsed={navCollapsed}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );

  // ── Desktop sidebar ─────────────────────────────────────────────────────────
  const DesktopSidebar = () => (
    <div className={`hidden md:flex ${collapsed ? "w-16" : "w-64"} bg-surface border-r border-gray-700 h-full pt-4 pb-4 flex-col shadow-md transition-all duration-200`}>
      {/* Header */}
      <div className={`flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-4"} mb-4`}>
        {!collapsed && <h2 className="text-xl font-bold text-accent">GripTrack</h2>}
        <button
          type="button"
          className="btn-secondary-sm p-2"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          ☰
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto">
        <NavItems navCollapsed={collapsed} />
      </div>

      {/* Settings at bottom */}
      <div className="pt-2 border-t border-gray-700 mt-2">
        <SettingsButton navCollapsed={collapsed} />
      </div>
    </div>
  );

  // ── Mobile top bar + drawer ────────────────────────────────────────────────
  const MobileShell = () => (
    <>
      <div className="md:hidden sticky top-0 z-40 bg-surface border-b border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          <button type="button" className="btn-secondary-sm p-2"
            onClick={() => setDrawerOpen(true)} aria-label="Open menu">☰</button>
          <div className="font-bold text-accent text-lg">GripTrack</div>
          <div className="w-10" />
        </div>
      </div>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} />
          <div className="absolute left-0 top-0 h-full w-72 bg-surface border-r border-gray-700 flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
              <div className="font-bold text-accent text-lg">GripTrack</div>
              <button type="button" className="btn-secondary-sm p-2" onClick={closeDrawer}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto pt-3">
              <NavItems onDone={closeDrawer} navCollapsed={false} />
            </div>
            <div className="border-t border-gray-700 pt-2 pb-4">
              <div className="px-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen((o) => !o)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    settingsOpen ? "bg-accent/15 text-accent" : "text-text/60 hover:text-text hover:bg-white/5"
                  }`}
                >
                  <Icons.Settings />
                  <span className="text-sm">Settings</span>
                </button>
                {settingsOpen && (
                  <SettingsPanel collapsed={false} onClose={() => { setSettingsOpen(false); closeDrawer(); }} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {isMobile ? <MobileShell /> : null}
      <DesktopSidebar />
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
};

export default Sidebar;
