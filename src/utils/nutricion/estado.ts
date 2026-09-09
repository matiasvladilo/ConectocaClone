// Diagnóstico de la ficha nutricional de una materia prima.
//
// Existe para que el semáforo de la pantalla de materias primas prediga
// exactamente lo que el motor va a bloquear después. Si acá sale verde y el
// cálculo igual falla, el semáforo miente y no sirve para nada: por eso las
// condiciones son las mismas que revisa unidades.ts.

import { NUTRIENTES } from './tipos.ts';
import type { ClaveNutriente, FichaNutricional } from './tipos.ts';
import { esVolumen, normalizarUnidad } from './unidades.ts';

export type EstadoFicha = 'completa' | 'parcial' | 'sin_datos';

export interface DiagnosticoFicha {
  estado: EstadoFicha;
  nutrientesCargados: number;
  nutrientesTotales: number;
  faltantes: ClaveNutriente[];
  necesitaDensidad: boolean;
  necesitaPesoPorUnidad: boolean;
  /** Motivos legibles de por qué no está completa. Se muestran tal cual. */
  pendientes: string[];
}

/**
 * @param unidad  ingredients.unit — define qué conversiones harán falta.
 * @param ficha   null si la materia prima todavía no tiene ficha.
 */
export function diagnosticarFicha(
  unidad: string,
  ficha: FichaNutricional | null | undefined,
): DiagnosticoFicha {
  const totales = NUTRIENTES.length;

  if (!ficha) {
    return {
      estado: 'sin_datos',
      nutrientesCargados: 0,
      nutrientesTotales: totales,
      faltantes: [...NUTRIENTES],
      necesitaDensidad: false,
      necesitaPesoPorUnidad: false,
      pendientes: ['Sin información nutricional cargada.'],
    };
  }

  const faltantes: ClaveNutriente[] = [];
  for (const clave of NUTRIENTES) {
    const v = ficha.valores?.[clave];
    // Igual que en la calculadora: 0 es un dato, null/undefined no lo es.
    if (v === undefined || v === null || !Number.isFinite(v)) faltantes.push(clave);
  }
  const cargados = totales - faltantes.length;

  const u = normalizarUnidad(unidad);
  const tieneDensidad = typeof ficha.densidadGMl === 'number' && ficha.densidadGMl > 0;

  // Hacen falta dos conversiones distintas y las dos usan densidad:
  //   1. la cantidad de la receta, cuando la materia prima se mide en volumen;
  //   2. la base de la ficha, cuando el proveedor declara "por 100 ml".
  // Cualquiera de las dos alcanza para exigirla.
  const necesitaDensidad =
    !tieneDensidad && ((u !== null && esVolumen(u)) || ficha.baseUnidad === 'ml');

  const necesitaPesoPorUnidad =
    u === 'conteo' && !(typeof ficha.pesoPorUnidadG === 'number' && ficha.pesoPorUnidadG > 0);

  const pendientes: string[] = [];
  if (faltantes.length > 0) {
    pendientes.push(`Faltan ${faltantes.length} de ${totales} nutrientes.`);
  }
  if (necesitaDensidad) {
    pendientes.push('Falta la densidad (g/ml), necesaria para convertir volumen a gramos.');
  }
  if (necesitaPesoPorUnidad) {
    pendientes.push('Falta el peso por unidad, necesario para convertir a gramos.');
  }

  // "Sin datos" no es solo "sin fila": una ficha creada y vacía es igual de
  // inservible, y mostrarla en amarillo haría creer que hay algo cargado.
  if (cargados === 0 && !tieneDensidad) {
    return {
      estado: 'sin_datos',
      nutrientesCargados: 0,
      nutrientesTotales: totales,
      faltantes,
      necesitaDensidad,
      necesitaPesoPorUnidad,
      pendientes,
    };
  }

  return {
    estado: pendientes.length === 0 ? 'completa' : 'parcial',
    nutrientesCargados: cargados,
    nutrientesTotales: totales,
    faltantes,
    necesitaDensidad,
    necesitaPesoPorUnidad,
    pendientes,
  };
}

export const ETIQUETA_ESTADO: Record<EstadoFicha, string> = {
  completa: 'Información completa',
  parcial: 'Información parcial',
  sin_datos: 'Sin información nutricional',
};
