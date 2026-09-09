import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "./ui/card";
import { NUTRIENTES } from "../utils/nutricion/tipos";
import { ETIQUETA_NUTRIENTE, formatearParaEtiqueta } from "../utils/nutricion/reglasChile";
import { resumenSellos } from "../utils/nutricion/sellos";
import type { ResultadoEtiqueta } from "../utils/nutricion/armado";

// Nutrientes que en la etiqueta van indentados bajo su nutriente padre, igual que
// en el rótulo de referencia: las fracciones de grasa cuelgan de "Grasa total" y
// los azúcares de "Hidratos de carbono disponibles".
const SANGRADOS = new Set([
  "grasa_saturada_g",
  "grasa_monoinsaturada_g",
  "grasa_poliinsaturada_g",
  "grasas_trans_g",
  "azucares_totales_g",
]);

export function NutritionPreview({ resultado }: { resultado: ResultadoEtiqueta }) {
  const { calculo, sellos, veredicto } = resultado;
  const esBorrador = veredicto.estado === "borrador";

  return (
    <div className="space-y-4">
      {/* Estado */}
      <Card className={`p-4 ${esBorrador ? "bg-yellow-50 border-2 border-yellow-400" : "bg-green-50 border-2 border-green-400"}`}>
        <div className="flex items-start gap-2">
          {esBorrador ? (
            <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-gray-900">
              {esBorrador ? "BORRADOR — INFORMACIÓN INCOMPLETA" : "Lista para impresión"}
            </p>
            {esBorrador && (
              <ul className="mt-2 space-y-1">
                {veredicto.bloqueos.map((b, i) => (
                  <li key={`${b.codigo}-${i}`} className="text-sm text-gray-700">
                    • {b.detalle}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {/* Tabla nutricional */}
      <Card className="p-4 bg-white">
        <h3 className="text-gray-900 mb-2">INFORMACIÓN NUTRICIONAL</h3>
        <p className="text-sm text-gray-700">
          Porción: {resultado.porcionDescripcion}
          {resultado.pesoPorcionG !== null && ` (${formatearPeso(resultado.pesoPorcionG)} g)`}
        </p>
        <p className="text-sm text-gray-700 mb-3">
          Porciones por envase: {resultado.porcionesPorEnvase ?? "—"}
        </p>

        {calculo.por100g ? (
          // overflow-x-auto: la tabla tiene 3 columnas y en móvil no entra;
          // sin esto empujaría el ancho de toda la pantalla.
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-2 text-gray-600"></th>
                  <th className="text-right py-2 text-gray-600">100 g</th>
                  <th className="text-right py-2 text-gray-600">1 porción</th>
                </tr>
              </thead>
              <tbody>
                {NUTRIENTES.map((clave) => {
                  const incompleto = calculo.nutrientesIncompletos.includes(clave);
                  return (
                    <tr key={clave} className="border-b border-gray-200">
                      <td className={`py-2 text-gray-900 ${SANGRADOS.has(clave) ? "pl-4" : ""}`}>
                        {ETIQUETA_NUTRIENTE[clave]}
                        {/* Marcar el nutriente incompleto en la fila misma: un
                            aviso general arriba no dice CUÁL número no es confiable. */}
                        {incompleto && <span className="text-yellow-600"> (incompleto)</span>}
                      </td>
                      <td className="py-2 text-right text-gray-900">
                        {formatearParaEtiqueta(clave, calculo.por100g![clave])}
                      </td>
                      <td className="py-2 text-right text-gray-900">
                        {calculo.porPorcion
                          ? formatearParaEtiqueta(clave, calculo.porPorcion[clave])
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            No se puede calcular la tabla: falta el peso final del producto terminado.
          </p>
        )}
      </Card>

      {/* Sellos */}
      <Card className="p-4 bg-white">
        <h3 className="text-gray-900 mb-2">SELLOS DETECTADOS</h3>
        {sellos === null ? (
          <p className="text-sm text-yellow-700">
            No se pudieron evaluar: falta el cálculo por 100 g.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              {sellos.sellos.map((s) => (
                // Octógono en blanco y negro, como va impreso.
                <span
                  key={s.codigo}
                  className="px-3 py-2 text-xs text-center"
                  // El negro va inline y no como clase: `bg-black` no está en el
                  // CSS precompilado, y además el sello tiene que imprimirse en
                  // negro exacto, no en un gris del tema.
                  style={{
                    clipPath: "polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)",
                    minWidth: "96px",
                    backgroundColor: "#000",
                    color: "#fff",
                  }}
                >
                  {s.texto.split("\n").map((linea) => (
                    <span key={linea} className="block">{linea}</span>
                  ))}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-700">{resumenSellos(sellos.sellos)}</p>
            {sellos.fueraDeRegimen && (
              <p className="text-xs text-gray-500 mt-1">
                Ninguna materia prima declara nutrientes añadidos, así que el producto queda fuera del
                régimen de sellos (art. 120 bis).
              </p>
            )}
            {sellos.sellos.length > 0 && (
              // El pegado frontal es manual: es el paso que se olvida.
              <p className="text-sm text-gray-900 mt-2 p-2 bg-yellow-50 border border-yellow-300 rounded-lg">
                Recordá pegar {sellos.sellos.length === 1 ? "el sello" : `los ${sellos.sellos.length} sellos`} en
                la cara <strong>frontal</strong> del envase. La etiqueta trasera los imprime solo como referencia.
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2">Reglas: {sellos.versionReglas}</p>
          </>
        )}
      </Card>

      {/* Textos */}
      <Card className="p-4 bg-white">
        <h3 className="text-gray-900 mb-2">INGREDIENTES</h3>
        <p className="text-sm text-gray-700">
          {resultado.textoIngredientes || "—"}
        </p>
        {resultado.hayOverrides && (
          <p className="text-xs text-gray-500 mt-1">
            Texto editado manualmente. La receta no fue modificada.
          </p>
        )}

        <h3 className="text-gray-900 mb-2 mt-4">ALÉRGENOS</h3>
        <p className="text-sm text-gray-700">{resultado.textoAlergenos || "—"}</p>
        {resultado.textoTrazas && (
          <p className="text-sm text-gray-700">{resultado.textoTrazas}</p>
        )}
      </Card>
    </div>
  );
}

function formatearPeso(g: number): string {
  return String(Math.round(g * 10) / 10).replace(".", ",");
}
