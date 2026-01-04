import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Register DevTools for timing benchmarks (dev mode only)
if (import.meta.env.DEV) {
  import('./lib/timing/devtools').then(({ registerDevTools }) => {
    registerDevTools();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
