
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { PublicComplaintForm } from "./features/complaints/PublicComplaintForm.tsx";
import { isPublicComplaintPath } from "./features/complaints/publicRoute.ts";
import "./styles/globals.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  isPublicComplaintPath(window.location.pathname) ? <PublicComplaintForm /> : <App />,
);
