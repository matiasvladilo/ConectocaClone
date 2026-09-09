// Orquesta el módulo completo: cálculo → sellos → textos → validación.
//
// Es la única pieza que conoce a todas las demás, y existe para que el componente
// de React no tenga que coordinarlas. Función pura: mismas entradas, mismas
// salidas, sin fechas ni red. Eso es lo que hace que el snapshot que se guarda en
// label_versions sea reproducible.

import { calcular } from './calculadora.ts';
import type { ResultadoCalculo } from './calculadora.ts';
import { consolidarAlergenos } from './alergenos.ts';
import type { AlergenoCatalogo, AlergenosConsolidados } from './alergenos.ts';
import { generarTextoIngredientes } from './ingredientesTexto.ts';
import { evaluarSellos } from './sellos.ts';
import type { EvaluacionSellos } from './sellos.ts';
import type { TipoAlimento } from './reglasChile.ts';
import { validarEtiqueta } from './validacion.ts';
import type { Veredicto } from './validacion.ts';
import type { LineaReceta } from './tipos.ts';

export interface LineaConAlergenos extends LineaReceta {
  contiene?: AlergenoCatalogo[];
  trazas?: AlergenoCatalogo[];
}

export interface PerfilEtiqueta {
  pesoFinalPromedioG?: number | null;
  pesoPorcionG?: number | null;
  porcionesPorEnvase?: number | null;
  porcionDescripcion?: string | null;
  denominacionLegal?: string | null;
  ingredientesTextoOverride?: string | null;
  alergenosTextoOverride?: string | null;
  trazasTextoOverride?: string | null;
}

export interface EntradaArmado {
  productName: string;
  lineas: LineaConAlergenos[];
  perfil?: PerfilEtiqueta | null;
  /** Razón social del negocio. Obligatorio para declarar la etiqueta lista. */
  elaborador?: string | null;
  tipoAlimento?: TipoAlimento;
}

export interface ResultadoEtiqueta {
  denominacion: string;
  porcionDescripcion: string;
  /** Se devuelven tal cual para que la vista no tenga que deducirlos del cálculo. */
  pesoFinalG: number | null;
  pesoPorcionG: number | null;
  porcionesPorEnvase: number | null;
  calculo: ResultadoCalculo;
  /** null cuando no se pudo calcular por 100 g y por lo tanto no hay con qué comparar. */
  sellos: EvaluacionSellos | null;
  textoIngredientes: string;
  alergenos: AlergenosConsolidados;
  textoAlergenos: string;
  textoTrazas: string;
  /** true si algún texto viene de una edición manual y no de la receta. */
  hayOverrides: boolean;
  veredicto: Veredicto;
}

function limpio(v: string | null | undefined): string {
  return (v || '').trim();
}

export function armarEtiqueta(entrada: EntradaArmado): ResultadoEtiqueta {
  const perfil = entrada.perfil || {};

  const calculo = calcular({
    lineas: entrada.lineas,
    pesoFinalG: perfil.pesoFinalPromedioG ?? null,
    pesoPorcionG: perfil.pesoPorcionG ?? null,
    porcionesPorEnvase: perfil.porcionesPorEnvase ?? null,
  });

  // Los gramos salen del cálculo, no de la cantidad cruda: es lo que hace que
  // 9 ml de aceite queden últimos en la lista y no en el medio.
  const gramosPorIngrediente = new Map(calculo.aportes.map((a) => [a.ingredienteId, a.gramos]));

  const textoAuto = generarTextoIngredientes(
    entrada.lineas.map((l) => ({
      nombre: l.nombre,
      gramos: gramosPorIngrediente.get(l.ingredienteId) ?? 0,
      ingredientesDeclarados: l.ficha?.ingredientesDeclarados ?? null,
    })),
  );

  const alergenos = consolidarAlergenos(
    entrada.lineas.map((l) => ({
      ingredienteId: l.ingredienteId,
      contiene: l.contiene || [],
      trazas: l.trazas || [],
    })),
  );

  // Los overrides PISAN el texto autogenerado pero no tocan la receta: se editan
  // en product_label_profile y product_ingredients queda intacto, así que costos,
  // stock y "puede producir" no se enteran.
  const overrideIngredientes = limpio(perfil.ingredientesTextoOverride);
  const overrideAlergenos = limpio(perfil.alergenosTextoOverride);
  const overrideTrazas = limpio(perfil.trazasTextoOverride);

  const textoIngredientes = overrideIngredientes || textoAuto;
  const textoAlergenos = overrideAlergenos || alergenos.textoContiene;
  const textoTrazas = overrideTrazas || alergenos.textoTrazas;

  // Sin columna por 100 g no hay contra qué comparar los umbrales. Devolver
  // "cero sellos" sería mentir: la respuesta correcta es "no se pudo evaluar".
  const sellos = calculo.por100g
    ? evaluarSellos(calculo.por100g, calculo.anadidos, entrada.tipoAlimento || 'solido')
    : null;

  const denominacion = limpio(perfil.denominacionLegal) || limpio(entrada.productName);

  const veredicto = validarEtiqueta(calculo, {
    denominacion,
    textoIngredientes,
    elaborador: entrada.elaborador,
  });

  // Que las reglas no se hayan podido evaluar es motivo de borrador por sí solo.
  if (!sellos) {
    veredicto.bloqueos.push({
      codigo: 'sellos_no_evaluados',
      detalle: 'No se pudieron evaluar los sellos "ALTO EN" porque falta el cálculo por 100 g.',
    });
    veredicto.estado = 'borrador';
  }

  return {
    denominacion,
    porcionDescripcion: limpio(perfil.porcionDescripcion) || '1 unidad',
    pesoFinalG: perfil.pesoFinalPromedioG ?? null,
    pesoPorcionG: perfil.pesoPorcionG ?? null,
    porcionesPorEnvase: perfil.porcionesPorEnvase ?? null,
    calculo,
    sellos,
    textoIngredientes,
    alergenos,
    textoAlergenos,
    textoTrazas,
    hayOverrides: !!(overrideIngredientes || overrideAlergenos || overrideTrazas),
    veredicto,
  };
}
