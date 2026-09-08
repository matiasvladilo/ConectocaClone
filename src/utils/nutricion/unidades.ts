// Conversión de unidades para el motor nutricional.
//
// Regla de oro: NUNCA se asume que 1 ml = 1 g. Si hace falta cruzar masa y
// volumen y no hay densidad configurada, la función devuelve un bloqueo y el
// cálculo se detiene. Estimar sería inventar un dato en una etiqueta legal.
//
// Ojo: este módulo NO reemplaza al `/1000` que hoy hace ProductIngredientConfig
// para mostrar y guardar cantidades. Ese sigue donde está; acá solo se lee.

import { falla, ok } from './tipos.ts';
import type { Bloqueo, FichaNutricional, Resultado } from './tipos.ts';

export type UnidadNormalizada = 'g' | 'kg' | 'ml' | 'l' | 'conteo';

/**
 * Normaliza lo que venga en ingredients.unit.
 *
 * La base de datos hoy tiene 'kg', 'l' y 'g', pero el selector de
 * IngredientManagement ofrece además 'ml', 'unidades', 'bolsas' y 'cajas', y
 * ProductIngredientConfig arrastra los legacy 'kilos' y 'litros'. Se aceptan
 * todos; cualquier otra cosa devuelve null y termina en bloqueo.
 */
export function normalizarUnidad(unidad: string): UnidadNormalizada | null {
  const u = (unidad || '').trim().toLowerCase();

  if (u === 'g' || u === 'gr' || u === 'gramo' || u === 'gramos') return 'g';
  if (u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'kilogramos') return 'kg';
  // 'cc' se acepta al leer aunque el formulario de productos no lo ofrezca como
  // opción: si alguien lo cargó a mano, es mililitros y no hay ambigüedad.
  if (u === 'ml' || u === 'cc' || u === 'mililitro' || u === 'mililitros') return 'ml';
  if (u === 'l' || u === 'lt' || u === 'litro' || u === 'litros') return 'l';
  if (u === 'unidad' || u === 'unidades' || u === 'un' || u === 'u') return 'conteo';
  if (u === 'bolsa' || u === 'bolsas' || u === 'caja' || u === 'cajas') return 'conteo';

  return null;
}

/** true si la unidad expresa volumen y necesita densidad para pasar a masa. */
export function esVolumen(u: UnidadNormalizada): boolean {
  return u === 'ml' || u === 'l';
}

function bloqueoSinDensidad(nombre: string, ingredienteId?: string): Bloqueo {
  return {
    codigo: 'sin_densidad',
    ingredienteId,
    ingredienteNombre: nombre,
    detalle: `"${nombre}" se mide en volumen pero no tiene densidad configurada. Sin densidad no se puede convertir a gramos.`,
  };
}

/**
 * Convierte una cantidad a gramos.
 *
 * `ficha` solo se consulta cuando hace falta (volumen → densidad, conteo → peso
 * por unidad). Para g y kg se ignora, así que un ingrediente en kg sin ficha
 * igual convierte bien.
 */
export function aGramos(
  cantidad: number,
  unidad: string,
  ficha: FichaNutricional | null | undefined,
  nombre: string,
  ingredienteId?: string,
): Resultado<number> {
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return falla({
      codigo: 'cantidad_invalida',
      ingredienteId,
      ingredienteNombre: nombre,
      detalle: `La cantidad de "${nombre}" no es un número válido (${cantidad}).`,
    });
  }

  const u = normalizarUnidad(unidad);
  if (u === null) {
    return falla({
      codigo: 'unidad_desconocida',
      ingredienteId,
      ingredienteNombre: nombre,
      detalle: `No se reconoce la unidad "${unidad}" de "${nombre}".`,
    });
  }

  if (u === 'g') return ok(cantidad);
  if (u === 'kg') return ok(cantidad * 1000);

  if (u === 'ml' || u === 'l') {
    const densidad = ficha?.densidadGMl;
    if (densidad === undefined || densidad === null || !(densidad > 0)) {
      return falla(bloqueoSinDensidad(nombre, ingredienteId));
    }
    const ml = u === 'l' ? cantidad * 1000 : cantidad;
    return ok(ml * densidad);
  }

  // conteo
  const peso = ficha?.pesoPorUnidadG;
  if (peso === undefined || peso === null || !(peso > 0)) {
    return falla({
      codigo: 'sin_peso_por_unidad',
      ingredienteId,
      ingredienteNombre: nombre,
      detalle: `"${nombre}" se mide por unidad pero no tiene peso por unidad configurado. Sin ese dato no se puede convertir a gramos.`,
    });
  }
  return ok(cantidad * peso);
}

/**
 * Pasa la BASE de la ficha del proveedor a gramos.
 *
 * Una ficha "por 100 ml" necesita densidad para poder dividir un aporte medido en
 * gramos. Es el mismo problema que la conversión de la receta, pero del otro lado
 * de la división, y se olvida fácil.
 */
export function baseEnGramos(
  ficha: FichaNutricional,
  nombre: string,
  ingredienteId?: string,
): Resultado<number> {
  if (!(ficha.baseCantidad > 0)) {
    return falla({
      codigo: 'cantidad_invalida',
      ingredienteId,
      ingredienteNombre: nombre,
      detalle: `La base nutricional de "${nombre}" es inválida (${ficha.baseCantidad}).`,
    });
  }

  if (ficha.baseUnidad === 'g') return ok(ficha.baseCantidad);

  const densidad = ficha.densidadGMl;
  if (densidad === undefined || densidad === null || !(densidad > 0)) {
    return falla(bloqueoSinDensidad(nombre, ingredienteId));
  }
  return ok(ficha.baseCantidad * densidad);
}
