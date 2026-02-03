// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import UserProvider from "./context/UserProvider";
import { EquipmentProvider } from "./context/EquipmentContext";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <UserProvider>
        <EquipmentProvider>
          <App />
        </EquipmentProvider>
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
