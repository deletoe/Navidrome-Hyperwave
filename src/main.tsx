import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/personalities.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The application root element is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
