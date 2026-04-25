// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import UserProvider from "./context/UserProvider";
import { TeamProvider } from "./context/TeamProvider";
import { EquipmentProvider } from "./context/EquipmentContext";
import App from "./App";
import "./index.css";

// Dev-only: permission testing panel.
// import.meta.env.DEV is replaced with `false` at build time so Vite's
// tree-shaker removes this import and the component entirely from production.
import DevPanel from "./components/DevPanel.jsx";

// Provider order matters:
//   UserProvider     — auth, org, role, assigned teamId
//   TeamProvider     — active team selection (reads UserContext)
//   EquipmentProvider — equipment queries scoped by active team (reads both)
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <UserProvider>
        <TeamProvider>
          <EquipmentProvider>
            <App />
            {import.meta.env.DEV && <DevPanel />}
          </EquipmentProvider>
        </TeamProvider>
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
