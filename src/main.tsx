import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Detect if running inside Chrome extension (bundled sidepanel or legacy iframe)
if (window.location.protocol === 'chrome-extension:' || window.self !== window.top) {
  document.documentElement.classList.add("sidepanel");
}

createRoot(document.getElementById("root")!).render(<App />);
