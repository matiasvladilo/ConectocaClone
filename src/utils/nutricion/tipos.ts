// Tipos compartidos del módulo nutricional.
//
// Estos módulos corren bajo el type-stripping de Node (`node --test *.ts`), así que
// nada de `enum`, `namespace` ni parameter properties: solo sintaxis borrable.

// Los 11 nutrientes del rotulado chileno (RSA art. 115), EN EL ORDEN en que van
// impresos en la etiqueta. El orden importa: la tabla se dibuja recorriendo esta
// lista, así que agregar un nutriente acá lo agrega a la etiqueta.
export const NUTRIENTES = [
  'energia_kcal',
  'proteinas_g',
  'grasa_total_g',
  'grasa_saturada_g',
  'grasa_monoinsaturada_g',
  'grasa_poliinsaturada_g',
  'grasas_trans_g',
  'colesterol_mg',
  'carbohidratos_disp_g',
  'azucares_totales_g',
  'sodio_mg',
] as const;

export type ClaveNutriente = (typeof NUTRIENTES)[number];

/** Todos los nutrientes con valor numérico. Resultado de un cálculo. */
export type Nutrientes = Record<ClaveNutriente, number>;

/**
 * Lo que declara el proveedor. Cada nutriente puede faltar.
 *
 * `undefined`/`null` = "no tengo el dato". `0` = "el proveedor declara cero".
 * La distinción es el corazón del módulo: sin ella el sistema calcularía con
 * ceros inventados y emitiría una etiqueta legal que miente.
 */
export type NutrientesParciales = Partial<Record<ClaveNutriente, number | null>>;

export function nutrientesEnCero(): Nutrientes {
  const out = {} as Nutrientes;
  for (const clave of NUTRIENTES) out[clave] = 0;
  return out;
}

/** Ficha nutricional de una materia prima (fila de ingredient_nutrition). */
export interface FichaNutricional {
  /** Base declarada por el proveedor: normalmente 100. */
  baseCantidad: number;
  /** Unidad de la base: 'g' para sólidos, 'ml' para líquidos. */
  baseUnidad: 'g' | 'ml';
  valores: NutrientesParciales;

  /** Obligatoria para convertir entre masa y volumen. Sin ella el motor bloquea, no estima. */
  densidadGMl?: number | null;
  /** Obligatoria cuando la unidad de la materia prima es de conteo (unidades/bolsas/cajas). */
  pesoPorUnidadG?: number | null;

  /** Declaración literal del fabricante, para ingredientes compuestos. */
  ingredientesDeclarados?: string | null;

  // Art. 120 bis: los sellos solo aplican a nutrientes AÑADIDOS. No es deducible
  // de los números; lo declara el usuario.
  aportaAzucaresAnadidos: boolean;
  aportaSodioAnadido: boolean;
  aportaGrasasSaturadasAnadidas: boolean;
}

/**
 * Una línea de la receta ya resuelta.
 *
 * `cantidad` viene de product_ingredients.quantity y está expresada en `unidad`,
 * que es ingredients.unit — NO en gramos. Hoy en producción eso significa que un
 * "104 g" está guardado como cantidad 0.104 con unidad 'kg'.
 */
export interface LineaReceta {
  ingredienteId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  ficha?: FichaNutricional | null;
}

export type CodigoBloqueo =
  | 'sin_receta'
  | 'sin_ficha'
  | 'nutriente_faltante'
  | 'sin_densidad'
  | 'sin_peso_por_unidad'
  | 'unidad_desconocida'
  | 'cantidad_invalida'
  | 'sin_peso_final'
  | 'sin_porcion'
  | 'sin_denominacion'
  | 'sin_texto_ingredientes'
  | 'sin_elaborador'
  | 'sellos_no_evaluados'
  | 'porciones_inconsistentes'
  | 'peso_final_mayor_que_receta'
  | 'redondeo_no_confirmado';

/**
 * Un motivo por el cual la etiqueta no puede declararse "lista para impresión".
 * Siempre legible en español: se muestra tal cual al usuario.
 */
export interface Bloqueo {
  codigo: CodigoBloqueo;
  detalle: string;
  ingredienteId?: string;
  ingredienteNombre?: string;
  nutriente?: ClaveNutriente;
}

/** Resultado de una operación que puede fallar con un bloqueo explicable. */
export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; bloqueo: Bloqueo };

export function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function falla<T>(bloqueo: Bloqueo): Resultado<T> {
  return { ok: false, bloqueo };
}
