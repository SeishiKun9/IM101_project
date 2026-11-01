import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./src/App.jsx";
import { AuthProvider } from "./src/context/AuthContext.jsx";
import { ThemeProvider } from "./src/context/ThemeContext.jsx";
import "./assets/css/styles.css";
import "./assets/css/portal.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
