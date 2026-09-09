// Motor matemático nutricional. Función pura: no toca React, ni Supabase, ni el
// reloj. Las reglas regulatorias viven en reglasChile.ts; acá solo hay aritmética.
//
//   aporte_nutriente = gramos_usados x valor_del_proveedor / base_del_proveedor_en_gramos
//
// Precisión completa de punta a punta. El redondeo ocurre UNA sola vez, al
// presentar (reglasChile.redondearParaEtiqueta). Redondear antes y seguir
// operando desalinea el "por 100 g" del "por porción".

import { NUTRIENTES, nutrientesEnCero } from './tipos.ts';
import type {
  Bloqueo,
  ClaveNutriente,
  LineaReceta,
  Nutrientes,
  NutrientesParciales,
} from './tipos.ts';
import { aGramos, baseEnGramos } from './unidades.ts';

export interface AporteIngrediente {
  ingredienteId: string;
  nombre: string;
  cantidadOriginal: number;
  unidadOriginal: string;
  /** Gramos que este ingrediente aporta a UNA unidad de producto. */
  gramos: number;
  /** Lo que aportó de cada nutriente. `null` = el dato faltaba. */
  aportes: NutrientesParciales;
}

export interface EntradaCalculo {
  /** Receta por UNA unidad de producto, como la guarda product_ingredients. */
  lineas: LineaReceta[];
  /** Peso real de una unidad terminada. Dato de balanza; no se deduce. */
  pesoFinalG?: number | null;
  pesoPorcionG?: number | null;
  porcionesPorEnvase?: number | null;
}

export interface Anadidos {
  azucares: boolean;
  sodio: boolean;
  grasasSaturadas: boolean;
}

export interface ResultadoCalculo {
  /** Suma de los ingredientes ANTES de hornear. No es el peso del producto. */
  gramosReceta: number;
  aportes: AporteIngrediente[];
  /** Nutrientes de UNA unidad de producto. Suma de lo que sí se pudo calcular. */
  totales: Nutrientes;
  /**
   * Nutrientes a los que les faltó al menos un aporte. Sus totales están
   * SUBESTIMADOS y no se pueden declarar como definitivos.
   */
  nutrientesIncompletos: ClaveNutriente[];
  por100g: Nutrientes | null;
  porPorcion: Nutrientes | null;
  porEnvase: Nutrientes | null;
  anadidos: Anadidos;
  bloqueos: Bloqueo[];
}

function escalar(base: Nutrientes, factor: number): Nutrientes {
  const out = nutrientesEnCero();
  for (const clave of NUTRIENTES) out[clave] = base[clave] * factor;
  return out;
}

export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  const bloqueos: Bloqueo[] = [];
  const aportes: AporteIngrediente[] = [];
  const totales = nutrientesEnCero();
  const incompletos = new Set<ClaveNutriente>();

  const anadidos: Anadidos = { azucares: false, sodio: false, grasasSaturadas: false };

  const lineas = entrada.lineas || [];

  if (lineas.length === 0) {
    bloqueos.push({
      codigo: 'sin_receta',
      detalle: 'El producto no tiene ingredientes configurados.',
    });
    for (const clave of NUTRIENTES) incompletos.add(clave);
  }

  let gramosReceta = 0;

  for (const linea of lineas) {
    const ficha = linea.ficha ?? null;

    if (ficha) {
      if (ficha.aportaAzucaresAnadidos) anadidos.azucares = true;
      if (ficha.aportaSodioAnadido) anadidos.sodio = true;
      if (ficha.aportaGrasasSaturadasAnadidas) anadidos.grasasSaturadas = true;
    }

    const conv = aGramos(linea.cantidad, linea.unidad, ficha, linea.nombre, linea.ingredienteId);

    if (!conv.ok) {
      bloqueos.push(conv.bloqueo);
      for (const clave of NUTRIENTES) incompletos.add(clave);
      aportes.push({
        ingredienteId: linea.ingredienteId,
        nombre: linea.nombre,
        cantidadOriginal: linea.cantidad,
        unidadOriginal: linea.unidad,
        gramos: 0,
        aportes: {},
      });
      continue;
    }

    const gramos = conv.valor;
    gramosReceta += gramos;

    // Sin ficha se conocen los gramos (sirven para ordenar la lista de
    // ingredientes) pero ningún nutriente.
    if (!ficha) {
      bloqueos.push({
        codigo: 'sin_ficha',
        ingredienteId: linea.ingredienteId,
        ingredienteNombre: linea.nombre,
        detalle: `"${linea.nombre}" no tiene información nutricional cargada.`,
      });
      for (const clave of NUTRIENTES) incompletos.add(clave);
      aportes.push({
        ingredienteId: linea.ingredienteId,
        nombre: linea.nombre,
        cantidadOriginal: linea.cantidad,
        unidadOriginal: linea.unidad,
        gramos,
        aportes: {},
      });
      continue;
    }

    const base = baseEnGramos(ficha, linea.nombre, linea.ingredienteId);
    if (!base.ok) {
      bloqueos.push(base.bloqueo);
      for (const clave of NUTRIENTES) incompletos.add(clave);
      aportes.push({
        ingredienteId: linea.ingredienteId,
        nombre: linea.nombre,
        cantidadOriginal: linea.cantidad,
        unidadOriginal: linea.unidad,
        gramos,
        aportes: {},
      });
      continue;
    }

    const baseG = base.valor;
    const aportesLinea: NutrientesParciales = {};
    const faltantes: ClaveNutriente[] = [];

    for (const clave of NUTRIENTES) {
      const valor = ficha.valores[clave];
      if (valor === undefined || valor === null || !Number.isFinite(valor)) {
        aportesLinea[clave] = null;
        incompletos.add(clave);
        faltantes.push(clave);
        continue;
      }
      const aporte = (gramos * valor) / baseG;
      aportesLinea[clave] = aporte;
      totales[clave] += aporte;
    }

    // Un bloqueo por ingrediente, no uno por nutriente: 11 bloqueos por materia
    // prima harían la lista ilegible justo cuando más se necesita leerla.
    if (faltantes.length > 0) {
      bloqueos.push({
        codigo: 'nutriente_faltante',
        ingredienteId: linea.ingredienteId,
        ingredienteNombre: linea.nombre,
        detalle: `A "${linea.nombre}" le faltan ${faltantes.length} de ${NUTRIENTES.length} nutrientes.`,
      });
    }

    aportes.push({
      ingredienteId: linea.ingredienteId,
      nombre: linea.nombre,
      cantidadOriginal: linea.cantidad,
      unidadOriginal: linea.unidad,
      gramos,
      aportes: aportesLinea,
    });
  }

  // -------------------------------------------------------------------------
  // Pesos del producto terminado
  // -------------------------------------------------------------------------

  const pesoFinal = entrada.pesoFinalG;
  const pesoFinalValido = typeof pesoFinal === 'number' && Number.isFinite(pesoFinal) && pesoFinal > 0;

  let por100g: Nutrientes | null = null;
  let porPorcion: Nutrientes | null = null;
  let porEnvase: Nutrientes | null = null;

  if (!pesoFinalValido) {
    bloqueos.push({
      codigo: 'sin_peso_final',
      detalle: 'Falta el peso final promedio del producto terminado. Sin ese dato no se puede calcular por 100 g.',
    });
  } else {
    // La cocción pierde agua: 196 g de mezcla salen 160 g horneados. Que el
    // producto terminado pese MÁS que la suma de su receta significa que falta un
    // ingrediente en la formulación o que el peso está mal medido. Las dos cosas
    // producen una etiqueta equivocada, así que se bloquea en vez de avisar.
    if (gramosReceta > 0 && pesoFinal > gramosReceta) {
      bloqueos.push({
        codigo: 'peso_final_mayor_que_receta',
        detalle:
          `El peso final (${pesoFinal} g) es mayor que la suma de la receta (${gramosReceta.toFixed(1)} g). ` +
          'Falta algún ingrediente en la formulación o el peso está mal medido.',
      });
    }

    por100g = escalar(totales, 100 / pesoFinal);

    const pesoPorcion = entrada.pesoPorcionG;
    if (typeof pesoPorcion === 'number' && Number.isFinite(pesoPorcion) && pesoPorcion > 0) {
      porPorcion = escalar(totales, pesoPorcion / pesoFinal);

      const porciones = entrada.porcionesPorEnvase;
      if (typeof porciones === 'number' && Number.isFinite(porciones) && porciones > 0) {
        porEnvase = escalar(porPorcion, porciones);

        // porción x porciones debería dar el peso del envase. Una diferencia
        // grande casi siempre es un dato mal cargado.
        const declarado = pesoPorcion * porciones;
        const desvio = Math.abs(declarado - pesoFinal) / pesoFinal;
        if (desvio > 0.02) {
          bloqueos.push({
            codigo: 'porciones_inconsistentes',
            detalle:
              `La porción (${pesoPorcion} g) por ${porciones} porciones da ${declarado.toFixed(1)} g, ` +
              `pero el peso final declarado es ${pesoFinal} g.`,
          });
        }
      }
    } else {
      bloqueos.push({
        codigo: 'sin_porcion',
        detalle: 'Falta el tamaño de porción. Sin ese dato no se puede calcular la columna "1 porción".',
      });
    }
  }

  const nutrientesIncompletos = NUTRIENTES.filter((c) => incompletos.has(c));

  return {
    gramosReceta,
    aportes,
    totales,
    nutrientesIncompletos,
    por100g,
    porPorcion,
    porEnvase,
    anadidos,
    bloqueos,
  };
}
