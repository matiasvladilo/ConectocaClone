import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, AlertTriangle, History } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { construirEtiquetaFrontal, construirEtiquetaPosterior } from "../utils/nutricion/etiquetas";
import type { DatosElaborador } from "../utils/nutricion/etiquetas";
import type { Lienzo } from "../utils/nutricion/etiquetaLayout";
import { canvasAPng, precargarImagenes, renderizarCanvas } from "../utils/nutricion/render/renderCanvas";
import { descargarPdf, nombreArchivo, renderizarPdf } from "../utils/nutricion/render/renderPdf";
import type { ResultadoEtiqueta } from "../utils/nutricion/armado";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  resultado: ResultadoEtiqueta;
  elaborador: DatosElaborador;
  anchoInicial: number;
  altoInicial: number;
  /**
   * Se llama antes de descargar para registrar la versión. Devuelve el número
   * asignado, o null si no correspondía guardar (ya existía una igual).
   *
   * La persistencia vive en el componente padre a propósito: acá solo se dibuja
   * y se descarga.
   */
  alDescargar?: (anchoMm: number, altoMm: number) => Promise<number | null>;
  /** Cuando se está mirando una etiqueta ya emitida, en vez de una recién calculada. */
  versionHistorica?: { version: number; fecha: string } | null;
}

type Cara = "posterior" | "frontal";

/**
 * El logo se sirve desde public/, no se importa desde src/assets.
 *
 * Un `import logo from '../assets/x.png'` da una URL bajo /src/, y en desarrollo
 * Vite responde esa ruta con el módulo JS que envuelve al asset, no con el PNG:
 * el fetch devuelve `text/javascript` y el logo sale en blanco. En el build
 * funcionaría, así que el bug solo aparecería al desarrollar. Los archivos de
 * public/ se sirven tal cual en los dos casos.
 */
const LOGO_POR_DEFECTO = "/logo-la-oca-bn.png";

/**
 * El logo se necesita como data URL: jsPDF no sale a buscar una URL, y el canvas
 * tampoco puede exportar a PNG si dibujó una imagen de otro origen (mancha el
 * canvas). Convertirlo una vez resuelve las dos cosas.
 */
async function comoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function LabelGenerator({
  open, onClose, resultado, elaborador, anchoInicial, altoInicial, alDescargar, versionHistorica,
}: Props) {
  const [cara, setCara] = useState<Cara>("posterior");
  const [ancho, setAncho] = useState(String(anchoInicial));
  const [alto, setAlto] = useState(String(altoInicial));
  const [logo, setLogo] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setAncho(String(anchoInicial));
    setAlto(String(altoInicial));
    comoDataUrl(LOGO_POR_DEFECTO).then((d) => {
      setLogo(d);
      if (!d) toast.error("No se pudo cargar el logo: la etiqueta saldrá sin él");
    });
  }, [open, anchoInicial, altoInicial]);

  const num = (s: string, fallback: number) => {
    const n = parseFloat(s.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const anchoMm = num(ancho, anchoInicial);
  const altoMm = num(alto, altoInicial);

  const construir = (): Lienzo => {
    const opts = { anchoMm, altoMm, logoDataUrl: logo };
    if (cara === "frontal") return construirEtiquetaFrontal(opts);
    return construirEtiquetaPosterior(resultado, elaborador, opts);
  };

  const lienzo = construir();
  const esBorrador = resultado.veredicto.estado === "borrador";

  useEffect(() => {
    if (!open || !contenedor.current) return;
    let vigente = true;

    (async () => {
      await precargarImagenes(lienzo);
      if (!vigente || !contenedor.current) return;

      // La previsualización se dibuja a 300 dpi y se muestra escalada por CSS.
      // A 150 se veía borrosa: el canvas se mostraba más grande que su resolución
      // real, y en pantallas retina el navegador lo escalaba el doble otra vez.
      const canvas = renderizarCanvas(lienzo, 300);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.border = "1px solid #d1d5db";
      contenedor.current.innerHTML = "";
      contenedor.current.appendChild(canvas);
    })();

    return () => { vigente = false; };
  }, [open, cara, anchoMm, altoMm, logo, resultado]);

  const sufijo = cara === "frontal" ? "frontal" : "etiqueta";

  // Registrar la versión ANTES de entregar el archivo: si el guardado falla, es
  // mejor no descargar que dejar circulando un PDF del que no queda registro.
  const registrar = async (): Promise<boolean> => {
    if (!alDescargar || versionHistorica) return true;
    try {
      const v = await alDescargar(anchoMm, altoMm);
      if (v !== null) toast.success(`Guardada como etiqueta v${v}`);
      return true;
    } catch (e: any) {
      console.error("Error guardando la version:", e);
      toast.error(e.message || "No se pudo guardar la version de la etiqueta");
      return false;
    }
  };

  const descargarPDF = async () => {
    if (generando) return;
    try {
      setGenerando(true);
      if (!(await registrar())) return;
      await precargarImagenes(lienzo);
      const doc = renderizarPdf(lienzo);
      descargarPdf(doc, nombreArchivo(resultado.denominacion, sufijo, "pdf"));
    } catch (e: any) {
      console.error("Error generando PDF:", e);
      toast.error(e.message || "Error al generar el PDF");
    } finally {
      setGenerando(false);
    }
  };

  const descargarPNG = async () => {
    if (generando) return;
    try {
      setGenerando(true);
      if (!(await registrar())) return;
      await precargarImagenes(lienzo);
      // 600 dpi: es un raster que puede terminar en una imprenta, y a 300 el
      // texto chico de los sellos se empasta.
      const canvas = renderizarCanvas(lienzo, 600);
      const a = document.createElement("a");
      a.href = canvasAPng(canvas);
      a.download = nombreArchivo(resultado.denominacion, sufijo, "png");
      a.click();
    } catch (e: any) {
      console.error("Error generando PNG:", e);
      toast.error(e.message || "Error al generar el PNG");
    } finally {
      setGenerando(false);
    }
  };

  const inputClass =
    "w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white" style={{ maxWidth: "52rem" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            {versionHistorica
              ? `Etiqueta v${versionHistorica.version} — ${resultado.denominacion}`
              : `Generar etiqueta — ${resultado.denominacion}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {versionHistorica && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-300">
              <p className="flex items-center gap-2 text-sm text-gray-900">
                <History className="w-4 h-4 text-blue-600 shrink-0" />
                Etiqueta ya emitida el {versionHistorica.fecha}.
              </p>
              <p className="text-xs text-gray-700 mt-1">
                Se dibuja con los datos congelados en ese momento, no con la receta actual.
                Descargarla no crea una versión nueva.
              </p>
            </div>
          )}

          {esBorrador && (
            <div className="p-3 rounded-lg bg-yellow-50 border-2 border-yellow-400">
              <p className="flex items-center gap-2 text-gray-900">
                <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
                BORRADOR — INFORMACIÓN INCOMPLETA
              </p>
              <p className="text-xs text-gray-700 mt-1">
                Se puede descargar para revisar, pero sale marcado como borrador y no debe ir a imprenta.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant={cara === "posterior" ? "default" : "outline"}
              onClick={() => setCara("posterior")}
              className={cara === "posterior" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
            >
              Etiqueta 2 — posterior
            </Button>
            <Button
              variant={cara === "frontal" ? "default" : "outline"}
              onClick={() => setCara("frontal")}
              className={cara === "frontal" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
            >
              Etiqueta 1 — frontal
            </Button>
          </div>

          <p className="text-xs text-gray-500">
            {cara === "frontal"
              ? "Sticker de marca, igual para todos los productos. No lleva sellos: los sellos son por producto."
              : "Información obligatoria del producto. Los sellos van acá como referencia; el pegado en la cara frontal es manual."}
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Ancho (mm)</label>
              <input type="text" inputMode="decimal" value={ancho}
                onChange={(e) => setAncho(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Alto (mm)</label>
              <input type="text" inputMode="decimal" value={alto}
                onChange={(e) => setAlto(e.target.value)} className={inputClass} />
            </div>
            <p className="text-xs text-gray-500">
              Tamaño físico real del sticker. El PDF sale con estas medidas exactas.
            </p>
          </div>

          {lienzo.avisosLegibilidad.length > 0 && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300">
              <p className="text-sm text-gray-900">A este tamaño la etiqueta tiene problemas:</p>
              <ul className="mt-1">
                {lienzo.avisosLegibilidad.map((a) => (
                  <li key={a} className="text-sm text-gray-700">• {a}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-600 mb-1">
              Previsualización ({anchoMm} × {altoMm} mm)
            </p>
            <div ref={contenedor} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={descargarPDF} disabled={generando}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              {generando ? "Generando..." : "Descargar PDF"}
            </Button>
            <Button onClick={descargarPNG} disabled={generando} variant="outline">
              <ImageIcon className="w-4 h-4 mr-2" />
              Descargar PNG
            </Button>
            <Button onClick={onClose} variant="outline">Cerrar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
