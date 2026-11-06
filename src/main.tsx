import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { ContractApp } from "@/components/contract-app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContractApp />
  </StrictMode>,
);
