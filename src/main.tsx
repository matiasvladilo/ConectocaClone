
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { PublicComplaintForm } from "./features/complaints/PublicComplaintForm.tsx";
import { isPublicComplaintPath } from "./features/complaints/publicRoute.ts";
import { initNative } from "./utils/initNative.ts";
import "./styles/globals.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  isPublicComplaintPath(window.location.pathname) ? <PublicComplaintForm /> : <App />,
);

// Arranque del contenedor nativo (splash, barra de estado, teclado, safe areas).
// En el navegador es un no-op y no carga ningún plugin de Capacitor.
void initNative();
