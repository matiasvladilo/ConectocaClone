// Evaluación de los sellos "ALTO EN" del art. 120 bis del RSA.
//
// Separado del motor matemático y de la UI: acá solo se cruza el resultado por
// 100 g contra los límites de reglasChile.ts.

import { LIMITES, VERSION_REGLAS } from './reglasChile.ts';
import type { TipoAlimento } from './reglasChile.ts';
import type { Anadidos } from './calculadora.ts';
import type { ClaveNutriente, Nutrientes } from './tipos.ts';

export type CodigoSello =
  | 'alto_calorias'
  | 'alto_azucares'
  | 'alto_grasas_saturadas'
  | 'alto_sodio';

export interface Sello {
  codigo: CodigoSello;
  /** Texto impreso dentro del octógono, en dos o tres líneas. */
  texto: string;
  nutriente: ClaveNutriente;
  valorPor100: number;
  limite: number;
}

export interface EvaluacionSellos {
  sellos: Sello[];
  /** Qué versión de reglas se usó. Va al snapshot de label_versions. */
  versionReglas: string;
  /**
   * true cuando el alimento no tiene NINGÚN nutriente añadido y por lo tanto
   * queda fuera del régimen de sellos, sin importar cuánto mida.
   */
  fueraDeRegimen: boolean;
}

const TEXTO: Record<CodigoSello, string> = {
  alto_calorias: 'ALTO EN\nCALORÍAS',
  alto_azucares: 'ALTO EN\nAZÚCARES',
  alto_grasas_saturadas: 'ALTO EN\nGRASAS\nSATURADAS',
  alto_sodio: 'ALTO EN\nSODIO',
};

/**
 * Decide qué sellos corresponden.
 *
 * Dos condiciones, ambas necesarias:
 *
 *  1. El nutriente tiene que estar AÑADIDO. El art. 120 bis aplica los sellos
 *     solo a los alimentos a los que se les adicionó sodio, azúcares o grasas
 *     saturadas; los que los traen naturalmente quedan excluidos aunque superen
 *     la tabla. Esto no se deduce de los números: viene de los flags que el
 *     usuario declara materia prima por materia prima.
 *
 *  2. El valor por 100 g (o 100 ml) tiene que SUPERAR el límite. La norma dice
 *     "superen", así que la comparación es estricta: 275,0 kcal exactas no
 *     llevan sello; 275,1 sí.
 *
 * ⚠️ El sello de energía es el único que no tiene un "añadido" propio. Acá se
 * interpreta que aplica cuando el alimento está dentro del régimen de sellos
 * —es decir, tiene alguno de los tres nutrientes añadidos— y además supera el
 * límite de energía. Confirmar contra el Manual del MINSAL antes de imprimir.
 */
export function evaluarSellos(
  por100: Nutrientes,
  anadidos: Anadidos,
  tipo: TipoAlimento = 'solido',
): EvaluacionSellos {
  const limites = LIMITES[tipo];
  const sellos: Sello[] = [];

  const dentroDelRegimen = anadidos.azucares || anadidos.sodio || anadidos.grasasSaturadas;

  const agregar = (
    codigo: CodigoSello,
    nutriente: ClaveNutriente,
    aplica: boolean,
    limite: number,
  ) => {
    const valor = por100[nutriente];
    if (aplica && valor > limite) {
      sellos.push({ codigo, texto: TEXTO[codigo], nutriente, valorPor100: valor, limite });
    }
  };

  // El orden es el de la etiqueta de referencia: azúcares, grasas, calorías, sodio.
  agregar('alto_azucares', 'azucares_totales_g', anadidos.azucares, limites.azucares_totales_g);
  agregar('alto_grasas_saturadas', 'grasa_saturada_g', anadidos.grasasSaturadas, limites.grasa_saturada_g);
  agregar('alto_calorias', 'energia_kcal', dentroDelRegimen, limites.energia_kcal);
  agregar('alto_sodio', 'sodio_mg', anadidos.sodio, limites.sodio_mg);

  return {
    sellos,
    versionReglas: VERSION_REGLAS,
    fueraDeRegimen: !dentroDelRegimen,
  };
}

/**
 * Frase accionable para el operario que pega los sellos físicos en la cara
 * frontal. La etiqueta 2 los imprime como referencia, pero el pegado es manual y
 * es el paso que se olvida.
 */
export function resumenSellos(sellos: Sello[]): string {
  if (sellos.length === 0) return 'Este producto no lleva sellos.';
  const nombres = sellos.map((s) => s.texto.replace(/\n/g, ' '));
  const plural = sellos.length === 1 ? 'sello' : 'sellos';
  return `Este producto lleva ${sellos.length} ${plural}: ${nombres.join(', ')}.`;
}
