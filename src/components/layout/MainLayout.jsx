import { useEffect, useState } from "react";
import Sidebar from "../Sidebar";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("gt_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });

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

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
