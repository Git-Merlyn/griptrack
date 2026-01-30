// src/App.jsx
import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import MainLayout from "./components/layout/MainLayout";
import PasswordGate from "./components/PasswordGate";
import { Analytics } from "@vercel/analytics/react";
import FeedbackPage from "./pages/FeedbackPage";
import { SpeedInsights } from "@vercel/speed-insights/next";

const App = () => {
  return (
    <PasswordGate>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="feedback" element={<FeedbackPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>

      <Analytics />
      <SpeedInsights />
    </PasswordGate>
  );
};

export default App;
