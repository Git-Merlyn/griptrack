// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import UserProvider from "./context/UserProvider";
import { TeamProvider } from "./context/TeamProvider";
import { EquipmentProvider } from "./context/EquipmentContext";
import App from "./App";
import "./index.css";

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
          </EquipmentProvider>
        </TeamProvider>
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
