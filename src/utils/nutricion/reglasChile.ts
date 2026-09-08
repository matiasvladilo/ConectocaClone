// Reglas regulatorias chilenas. AISLADAS del motor matemático a propósito: si
// mañana cambian los umbrales, se toca solo este archivo y las etiquetas ya
// emitidas siguen diciendo con qué versión se calcularon.
//
// FUENTES (verificadas 2026-09-08):
//   - Decreto 13/2015 MINSAL, que modifica el RSA (D.S. 977/96) para la Ley 20.606.
//     https://www.bcn.cl/leychile/Navegar?idNorma=1078836&buscar=20606
//   - Manual de Etiquetado Nutricional, MINSAL.
//     https://www.minsal.cl/ley-de-alimentos-manual-etiquetado-nutricional/
//   - La actualización 2026 del RSA no modificó los umbrales del art. 120 bis.
//
// NO inventar umbrales acá. Si un valor no se puede citar, no va.

import { NUTRIENTES } from './tipos.ts';
import type { ClaveNutriente } from './tipos.ts';

/**
 * Identifica el cuerpo de reglas usado para calcular una etiqueta. Se guarda en
 * label_versions.regulation_version.
 *
 * Cambiar umbrales, redondeos o criterios de sello OBLIGA a subir esta versión:
 * es lo único que permite saber después con qué reglas salió una etiqueta vieja.
 */
export const VERSION_REGLAS = 'CL-RSA-120bis-2019.3';

export type TipoAlimento = 'solido' | 'liquido';

/**
 * Tabla N°1 del art. 120 bis del RSA. Límites generales vigentes (última etapa
 * del calendario gradual). Un alimento supera el límite cuando el valor es
 * ESTRICTAMENTE MAYOR — la norma dice "superen", no "alcancen".
 */
export const LIMITES: Record<TipoAlimento, Record<'energia_kcal' | 'sodio_mg' | 'azucares_totales_g' | 'grasa_saturada_g', number>> = {
  // por 100 g
  solido: {
    energia_kcal: 275,
    sodio_mg: 400,
    azucares_totales_g: 10,
    grasa_saturada_g: 4,
  },
  // por 100 ml
  liquido: {
    energia_kcal: 70,
    sodio_mg: 100,
    azucares_totales_g: 5,
    grasa_saturada_g: 3,
  },
};

/** Rótulos de la tabla nutricional, en el orden en que se imprimen. */
export const ETIQUETA_NUTRIENTE: Record<ClaveNutriente, string> = {
  energia_kcal: 'Energía (kcal)',
  proteinas_g: 'Proteínas (g)',
  grasa_total_g: 'Grasa total (g)',
  grasa_saturada_g: 'Grasa saturada (g)',
  grasa_monoinsaturada_g: 'Grasa monoinsaturada (g)',
  grasa_poliinsaturada_g: 'Grasa poliinsaturada (g)',
  grasas_trans_g: 'Ácidos grasos trans (g)',
  colesterol_mg: 'Colesterol (mg)',
  carbohidratos_disp_g: 'Hidratos de carbono disponibles (g)',
  azucares_totales_g: 'Azúcares totales (g)',
  sodio_mg: 'Sodio (mg)',
};

/** Nutrientes que la etiqueta debe declarar sí o sí. Hoy son los 11. */
export const NUTRIENTES_OBLIGATORIOS: readonly ClaveNutriente[] = NUTRIENTES;

// ---------------------------------------------------------------------------
// Redondeo
// ---------------------------------------------------------------------------

/**
 * ⚠️ PROVISORIO. Las reglas de redondeo y expresión de cifras del rotulado están
 * en el RSA art. 115 y en el Manual de Etiquetado del MINSAL, y todavía no se
 * transcribieron desde la fuente oficial.
 *
 * Mientras esto sea `false`, `validacion.ts` impide marcar cualquier etiqueta
 * como "lista para impresión": se puede generar el borrador y revisar los
 * números, pero no mandar a imprenta.
 *
 * Para cerrarlo: transcribir las reglas del manual, ajustar `DECIMALES` y poner
 * esto en `true` subiendo VERSION_REGLAS.
 */
export const REDONDEO_CONFIRMADO = false;

/**
 * Decimales por nutriente. Copiados de cómo se presentan en las etiquetas
 * chilenas reales (energía y mg en entero, gramos con un decimal). Coincide con
 * la etiqueta de referencia del Bizcocho Marmolado, pero coincidir con un ejemplo
 * NO es lo mismo que estar tomado de la norma. De ahí REDONDEO_CONFIRMADO.
 */
const DECIMALES: Record<ClaveNutriente, number> = {
  energia_kcal: 0,
  proteinas_g: 1,
  grasa_total_g: 1,
  grasa_saturada_g: 1,
  grasa_monoinsaturada_g: 1,
  grasa_poliinsaturada_g: 1,
  grasas_trans_g: 1,
  colesterol_mg: 0,
  carbohidratos_disp_g: 1,
  azucares_totales_g: 1,
  sodio_mg: 0,
};

/**
 * Redondea SOLO para presentar. El motor mantiene precisión completa hasta acá:
 * redondear antes y volver a operar arrastra error entre por-100-g y por-porción.
 */
export function redondearParaEtiqueta(clave: ClaveNutriente, valor: number): number {
  const decimales = DECIMALES[clave];
  const factor = Math.pow(10, decimales);
  // El + Number.EPSILON es defensivo y hoy NO cambia ningún resultado: con 0 y 1
  // decimales no hay valor que redondee distinto con o sin él (verificado sobre
  // 2 millones de casos). Se deja puesto porque a 2 decimales sí importa
  // —Math.round(1.005 * 100) da 100, no 101— y DECIMALES puede cambiar cuando se
  // transcriban las reglas del Manual del MINSAL.
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/** Formatea con coma decimal, que es lo que usa el rotulado en Chile. */
export function formatearParaEtiqueta(clave: ClaveNutriente, valor: number): string {
  const redondeado = redondearParaEtiqueta(clave, valor);
  return redondeado.toFixed(DECIMALES[clave]).replace('.', ',');
}
