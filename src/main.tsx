
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { PublicComplaintForm } from "./features/complaints/PublicComplaintForm.tsx";
import { isPublicComplaintPath } from "./features/complaints/publicRoute.ts";
import { initNative } from "./utils/initNative.ts";
import { AccionCuenta } from "./components/AccionCuenta.tsx";
import { leerAccionCuenta, type DatosAccionCuenta } from "./utils/accionCuenta.ts";
import {
  accionDeArranqueNativo,
  escucharEnlacesCuenta,
  marcarEnlaceAtendido,
} from "./utils/enlacesCuentaNativos.ts";
import "./styles/globals.css";
import "./index.css";

// Enlaces de los correos de cuenta (verificar correo / nueva contraseña): se
// atienden antes que <App/> para que no restaure sesión ni redirija encima.
// En el navegador llegan en la URL; en la app nativa, por @capacitor/app (ver
// utils/enlacesCuentaNativos.ts), tanto al abrirla como con la app ya abierta.
function Raiz({ inicial }: { inicial: DatosAccionCuenta | null }) {
  const [accion, setAccion] = useState(inicial);

  useEffect(
    () =>
      escucharEnlacesCuenta((datos) => {
        marcarEnlaceAtendido(datos);
        setAccion(datos);
      }),
    [],
  );

  if (accion) return <AccionCuenta key={accion.tokenHash} {...accion} />;
  if (isPublicComplaintPath(window.location.pathname)) return <PublicComplaintForm />;
  return <App />;
}

async function arrancar() {
  const inicial = leerAccionCuenta(window.location.search) ?? (await accionDeArranqueNativo());
  if (inicial) marcarEnlaceAtendido(inicial);

  createRoot(document.getElementById("root")!).render(<Raiz inicial={inicial} />);

  // Arranque del contenedor nativo (splash, barra de estado, teclado, safe areas).
  // En el navegador es un no-op y no carga ningún plugin de Capacitor.
  void initNative();
}

void arrancar();
