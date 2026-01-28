// src/App.jsx
import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import MainLayout from "./components/layout/MainLayout";
import PasswordGate from "./components/PasswordGate";
import { Analytics } from "@vercel/analytics/react";

const App = () => {
  return (
    <PasswordGate>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>

      <Analytics />
    </PasswordGate>
  );
};

export default App;
