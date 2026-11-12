
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { PublicComplaintForm } from "./features/complaints/PublicComplaintForm.tsx";
import { isPublicComplaintPath } from "./features/complaints/publicRoute.ts";
import { initNative } from "./utils/initNative.ts";
import { AccionCuenta, leerAccionCuenta } from "./components/AccionCuenta.tsx";
import "./styles/globals.css";
import "./index.css";

// Enlaces de los correos de cuenta (verificar correo / nueva contraseña): se
// atienden antes que <App/> para que no restaure sesión ni redirija encima.
const accionCuenta = leerAccionCuenta(window.location.search);

createRoot(document.getElementById("root")!).render(
  accionCuenta ? (
    <AccionCuenta {...accionCuenta} />
  ) : isPublicComplaintPath(window.location.pathname) ? (
    <PublicComplaintForm />
  ) : (
    <App />
  ),
);

// Arranque del contenedor nativo (splash, barra de estado, teclado, safe areas).
// En el navegador es un no-op y no carga ningún plugin de Capacitor.
void initNative();
