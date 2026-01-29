import Sidebar from "../Sidebar";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-text">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
