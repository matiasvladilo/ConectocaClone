// Snapshot de una etiqueta emitida.
//
// La razón de existir: una receta cambia, pero una etiqueta ya impresa no puede
// cambiar con ella. El snapshot guarda TODO lo necesario para volver a dibujar
// esa etiqueta exactamente igual dentro de dos años, sin volver a consultar
// ingredients ni product_ingredients ni las reglas vigentes de ese momento.
//
// Es JSON plano a propósito: se guarda en label_versions.snapshot (jsonb).

import type { ResultadoEtiqueta } from './armado.ts';
import type { DatosElaborador } from './etiquetas.ts';
import type { FichaNutricional } from './tipos.ts';

/**
 * Versión del FORMATO del snapshot, no de la etiqueta.
 *
 * Si algún día cambia la forma de este objeto, esto permite leer los viejos en
 * vez de romperlos. No confundir con `regulationVersion`, que es qué reglas
 * regulatorias se aplicaron, ni con el número de versión de la etiqueta.
 */
export const FORMATO_SNAPSHOT = 1;

/** Copia de la ficha con la que se calculó cada materia prima. */
export interface FichaUsada {
  ingredienteId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  ficha: FichaNutricional | null;
}

export interface SnapshotEtiqueta {
  formato: number;
  resultado: ResultadoEtiqueta;
  elaborador: DatosElaborador;
  /**
   * Las fichas del momento del cálculo. No se usan para redibujar —para eso
   * alcanza `resultado`— pero son la trazabilidad: permiten responder "¿de dónde
   * salió este 442 kcal?" cuando la ficha del proveedor ya cambió.
   */
  fichasUsadas: FichaUsada[];
  anchoMm: number;
  altoMm: number;
  regulationVersion: string;
}

export interface EntradaSnapshot {
  resultado: ResultadoEtiqueta;
  elaborador: DatosElaborador;
  lineas: FichaUsada[];
  anchoMm: number;
  altoMm: number;
  regulationVersion: string;
}

export function construirSnapshot(entrada: EntradaSnapshot): SnapshotEtiqueta {
  return {
    formato: FORMATO_SNAPSHOT,
    resultado: entrada.resultado,
    elaborador: entrada.elaborador,
    fichasUsadas: entrada.lineas,
    anchoMm: entrada.anchoMm,
    altoMm: entrada.altoMm,
    regulationVersion: entrada.regulationVersion,
  };
}

export interface EtiquetaRestaurada {
  resultado: ResultadoEtiqueta;
  elaborador: DatosElaborador;
  anchoMm: number;
  altoMm: number;
}

/**
 * Devuelve lo necesario para redibujar una etiqueta histórica.
 *
 * Devuelve null en vez de romper si el formato es de una versión futura que este
 * código no sabe leer: una etiqueta vieja ilegible es un problema, pero una
 * pantalla que explota es peor.
 */
export function restaurarDeSnapshot(snapshot: unknown): EtiquetaRestaurada | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as Partial<SnapshotEtiqueta>;

  if (typeof s.formato !== 'number' || s.formato > FORMATO_SNAPSHOT) return null;
  if (!s.resultado || typeof s.anchoMm !== 'number' || typeof s.altoMm !== 'number') return null;

  return {
    resultado: s.resultado,
    elaborador: s.elaborador || {},
    anchoMm: s.anchoMm,
    altoMm: s.altoMm,
  };
}

/**
 * ¿Dos snapshots describen la misma etiqueta?
 *
 * Se usa para no crear una versión nueva cada vez que se abre el generador y se
 * aprieta descargar. Sin esto el historial se llena de versiones idénticas y
 * deja de servir para lo único que importa: saber qué cambió y cuándo.
 *
 * El tamaño físico NO entra en la comparación: la misma etiqueta impresa en
 * 90x60 y en 100x75 es la misma información, y versionar por tamaño convertiría
 * el historial en ruido.
 */
export function mismaEtiqueta(a: SnapshotEtiqueta, b: SnapshotEtiqueta): boolean {
  return (
    a.regulationVersion === b.regulationVersion &&
    canonico(a.resultado) === canonico(b.resultado) &&
    canonico(a.elaborador) === canonico(b.elaborador)
  );
}

/**
 * Serializa con las claves ORDENADAS.
 *
 * `JSON.stringify` respeta el orden de inserción, y Postgres `jsonb` NO conserva
 * ese orden: reordena las claves al guardar. Comparar con stringify directo hacía
 * que un snapshot recién armado nunca coincidiera con el mismo snapshot leído de
 * la base, así que la deduplicación no deduplicaba nada y cada descarga creaba
 * una versión nueva idéntica.
 *
 * `undefined` se normaliza a null porque jsonb tampoco distingue "clave ausente"
 * de "clave con undefined": al volver, ambas son null.
 */
function canonico(valor: unknown): string {
  if (valor === undefined || valor === null) return 'null';
  if (typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;

  const obj = valor as Record<string, unknown>;
  const claves = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`).join(',')}}`;
}
