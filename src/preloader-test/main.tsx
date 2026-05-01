import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PreloaderTest from "./PreloaderTest";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreloaderTest />
  </StrictMode>
);
