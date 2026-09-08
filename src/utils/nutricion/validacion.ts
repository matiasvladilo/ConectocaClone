// Decide si una etiqueta puede marcarse "LISTA PARA IMPRESIÓN" o queda en
// "BORRADOR — INFORMACIÓN INCOMPLETA".
//
// El criterio es deliberadamente estricto: ante cualquier duda, borrador. Una
// etiqueta nutricional equivocada es un problema sanitario y legal, no un bug
// visual.

import { ETIQUETA_NUTRIENTE, REDONDEO_CONFIRMADO } from './reglasChile.ts';
import type { Bloqueo } from './tipos.ts';
import type { ResultadoCalculo } from './calculadora.ts';

export interface DatosObligatorios {
  /** Nombre con el que se declara el producto. */
  denominacion?: string | null;
  /** Lista de ingredientes ya generada o editada. */
  textoIngredientes?: string | null;
  /** Razón social / identificación del elaborador. */
  elaborador?: string | null;
}

export interface Veredicto {
  estado: 'borrador' | 'lista';
  bloqueos: Bloqueo[];
}

export function validarEtiqueta(
  resultado: ResultadoCalculo,
  datos: DatosObligatorios = {},
): Veredicto {
  // Se parte de los bloqueos que ya detectó el cálculo (unidades, fichas
  // faltantes, pesos) y se agregan los de la etiqueta como documento.
  const bloqueos: Bloqueo[] = [...resultado.bloqueos];

  if (resultado.nutrientesIncompletos.length > 0) {
    const nombres = resultado.nutrientesIncompletos.map((c) => ETIQUETA_NUTRIENTE[c]).join(', ');
    bloqueos.push({
      codigo: 'nutriente_faltante',
      detalle: `Hay nutrientes con datos incompletos, sus totales están subestimados: ${nombres}.`,
    });
  }

  if (resultado.por100g === null) {
    bloqueos.push({
      codigo: 'sin_peso_final',
      detalle: 'No se pudo calcular la columna "100 g".',
    });
  }

  if (resultado.porPorcion === null) {
    bloqueos.push({
      codigo: 'sin_porcion',
      detalle: 'No se pudo calcular la columna "1 porción".',
    });
  }

  const denominacion = (datos.denominacion || '').trim();
  if (!denominacion) {
    bloqueos.push({
      codigo: 'sin_denominacion',
      detalle: 'Falta la denominación del producto para la etiqueta.',
    });
  }

  const textoIngredientes = (datos.textoIngredientes || '').trim();
  if (!textoIngredientes) {
    bloqueos.push({
      codigo: 'sin_texto_ingredientes',
      detalle: 'Falta la lista de ingredientes de la etiqueta.',
    });
  }

  const elaborador = (datos.elaborador || '').trim();
  if (!elaborador) {
    bloqueos.push({
      codigo: 'sin_elaborador',
      detalle: 'Faltan los datos del elaborador (razón social).',
    });
  }

  // Portón de salida mientras las reglas de redondeo no estén transcritas desde
  // el Manual del MINSAL. Se puede revisar todo y generar el borrador, pero
  // ninguna etiqueta sale marcada como lista hasta cerrar ese punto.
  if (!REDONDEO_CONFIRMADO) {
    bloqueos.push({
      codigo: 'redondeo_no_confirmado',
      detalle:
        'Las reglas de redondeo del rotulado todavía no están confirmadas contra el Manual de ' +
        'Etiquetado Nutricional del MINSAL. Hasta entonces solo se pueden emitir borradores.',
    });
  }

  return {
    estado: bloqueos.length === 0 ? 'lista' : 'borrador',
    bloqueos,
  };
}
