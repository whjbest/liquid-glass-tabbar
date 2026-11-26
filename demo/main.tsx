import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "liquid-glass-tabbar/styles.css";
import "./demo.css";
import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
