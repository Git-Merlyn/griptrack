// src/App.jsx
import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import MainLayout from "./components/layout/MainLayout";
import PasswordGate from "./components/PasswordGate";
import Auth from "./pages/Auth";
import { useUser } from "./context/useUser";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

const App = () => {
  const { authUser, loadingOrg } = useUser();

  return (
    <PasswordGate>
      {!authUser ? (
        <>
          <Auth />
          <Analytics />
          <SpeedInsights />
        </>
      ) : loadingOrg ? (
        <>
          <div className="min-h-screen flex items-center justify-center bg-black text-gray-200">
            Loading…
          </div>
          <Analytics />
          <SpeedInsights />
        </>
      ) : (
        <>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Dashboard />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>

          <Analytics />
          <SpeedInsights />
        </>
      )}
    </PasswordGate>
  );
};

export default App;
