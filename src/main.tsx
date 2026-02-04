import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Detect if running inside Chrome side panel iframe
if (window.self !== window.top) {
  document.documentElement.classList.add("sidepanel");
}

createRoot(document.getElementById("root")!).render(<App />);
