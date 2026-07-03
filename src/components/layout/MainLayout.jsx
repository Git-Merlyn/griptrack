import { useEffect, useRef, useState } from "react";
import Sidebar from "../Sidebar";
import TrialBanner from "../TrialBanner";
import { Outlet, useLocation } from "react-router-dom";

const MainLayout = () => {
  const location = useLocation();
  const mainRef = useRef(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("gt_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });

  // Scroll the content pane back to the top on every route change.
  // The <main> element is the scroll container (overflow-y-auto), not window,
  // so window.scrollTo does nothing — we need to scroll the ref directly.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "gt_sidebar_collapsed",
        sidebarCollapsed ? "1" : "0",
      );
    } catch (e) {
      // ignore storage write failures (private mode, disabled storage, etc.)
      void e;
    }
  }, [sidebarCollapsed]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-text">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
      />

      <main ref={mainRef} className="flex-1 overflow-y-auto flex flex-col">
        <TrialBanner />
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
