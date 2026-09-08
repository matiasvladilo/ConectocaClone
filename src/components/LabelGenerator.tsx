import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { construirEtiquetaFrontal, construirEtiquetaPosterior } from "../utils/nutricion/etiquetas";
import type { DatosElaborador } from "../utils/nutricion/etiquetas";
import type { Lienzo } from "../utils/nutricion/etiquetaLayout";
import { canvasAPng, precargarImagenes, renderizarCanvas } from "../utils/nutricion/render/renderCanvas";
import { descargarPdf, nombreArchivo, renderizarPdf } from "../utils/nutricion/render/renderPdf";
import type { ResultadoEtiqueta } from "../utils/nutricion/armado";
import type { LabelSettings } from "../utils/api";
import { toast } from "sonner";

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

interface Props {
  open: boolean;
  onClose: () => void;
  resultado: ResultadoEtiqueta;
  settings: LabelSettings | null;
}

type Cara = "posterior" | "frontal";

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

export function LabelGenerator({ open, onClose, resultado, settings }: Props) {
  const [cara, setCara] = useState<Cara>("posterior");
  const [ancho, setAncho] = useState("90");
  const [alto, setAlto] = useState("60");
  const [logo, setLogo] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // El default sale de la config del negocio, no de una constante en el código.
    setAncho(String(settings?.anchoMmDefault ?? 90));
    setAlto(String(settings?.altoMmDefault ?? 60));
    // Si el negocio subió su propio logo se usa ese; si no, el asset del repo.
    comoDataUrl(settings?.logoFrontalUrl || LOGO_POR_DEFECTO).then((d) => {
      setLogo(d);
      if (!d) toast.error("No se pudo cargar el logo: la etiqueta frontal saldrá vacía");
    });
  }, [open, settings]);

  const num = (s: string, fallback: number) => {
    const n = parseFloat(s.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const anchoMm = num(ancho, 90);
  const altoMm = num(alto, 60);

  const construir = (): Lienzo => {
    const opts = { anchoMm, altoMm, logoDataUrl: logo };
    if (cara === "frontal") return construirEtiquetaFrontal(opts);
    const elaborador: DatosElaborador = {
      razonSocial: settings?.razonSocial,
      rut: settings?.rut,
      direccion: settings?.direccion,
      plantaElaboradora: settings?.plantaElaboradora,
    };
    return construirEtiquetaPosterior(resultado, elaborador, opts);
  };

  const lienzo = construir();
  const esBorrador = resultado.veredicto.estado === "borrador";

  // Previsualización. Se redibuja en cada cambio de tamaño o de cara.
  useEffect(() => {
    if (!open || !contenedor.current) return;
    let vigente = true;

    (async () => {
      await precargarImagenes(lienzo);
      if (!vigente || !contenedor.current) return;
      // 150 dpi alcanza para mirar en pantalla; el PDF y el PNG descargable
      // salen a 300.
      const canvas = renderizarCanvas(lienzo, 150);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.border = "1px solid #d1d5db";
      contenedor.current.innerHTML = "";
      contenedor.current.appendChild(canvas);
    })();

    return () => { vigente = false; };
  }, [open, cara, anchoMm, altoMm, logo, resultado]);

  const sufijo = cara === "frontal" ? "frontal" : "etiqueta";

  const descargarPDF = async () => {
    if (generando) return;
    try {
      setGenerando(true);
      await precargarImagenes(lienzo);
      const doc = renderizarPdf(lienzo);
      descargarPdf(doc, nombreArchivo(resultado.denominacion, sufijo, "pdf"));
      toast.success("PDF generado");
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
      await precargarImagenes(lienzo);
      const canvas = renderizarCanvas(lienzo, 300);
      const a = document.createElement("a");
      a.href = canvasAPng(canvas);
      a.download = nombreArchivo(resultado.denominacion, sufijo, "png");
      a.click();
      toast.success("PNG generado");
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
            Generar etiqueta — {resultado.denominacion}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          {/* Cara */}
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

          {/* Tamaño físico */}
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

          {/* Avisos del layout */}
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

          {/* Previsualización */}
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
