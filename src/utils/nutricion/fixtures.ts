// Datos de prueba. NO son valores nutricionales reales de ningún proveedor:
// están inventados para que la aritmética se pueda verificar a mano. Los valores
// reales los carga el usuario desde la ficha técnica de cada proveedor.
//
// Modela el Bizcocho Marmolado tal como está hoy en la base: las cantidades van
// en la unidad de la materia prima (kg, l), no en gramos.
//
//   Mix Queque Neutro  0.104 kg  = 104 g
//   Cacao Amargo       0.058 kg  =  58 g
//   Aceite Vegetal     0.009 l   =   9 ml -> 8.28 g con densidad 0.92
//   Huevos             0.025 kg  =  25 g
//                                 ---------
//   Suma de la receta             196.28 g
//   Peso final horneado           160 g      (pierde agua en el horno)

import type { FichaNutricional, LineaReceta } from './tipos.ts';

function ficha(
  valores: FichaNutricional['valores'],
  extra: Partial<FichaNutricional> = {},
): FichaNutricional {
  return {
    baseCantidad: 100,
    baseUnidad: 'g',
    valores,
    aportaAzucaresAnadidos: false,
    aportaSodioAnadido: false,
    aportaGrasasSaturadasAnadidas: false,
    ...extra,
  };
}

export const FICHA_MIX = ficha(
  {
    energia_kcal: 400,
    proteinas_g: 8,
    grasa_total_g: 5,
    grasa_saturada_g: 2,
    grasa_monoinsaturada_g: 2,
    grasa_poliinsaturada_g: 1,
    grasas_trans_g: 0,
    colesterol_mg: 0,
    carbohidratos_disp_g: 80,
    azucares_totales_g: 25,
    sodio_mg: 500,
  },
  {
    ingredientesDeclarados:
      'harina de trigo enriquecida, azúcar, suero de leche en polvo, polvos de hornear, sal',
    aportaAzucaresAnadidos: true,
    aportaSodioAnadido: true,
  },
);

export const FICHA_CACAO = ficha({
  energia_kcal: 300,
  proteinas_g: 20,
  grasa_total_g: 12,
  grasa_saturada_g: 7,
  grasa_monoinsaturada_g: 4,
  grasa_poliinsaturada_g: 1,
  grasas_trans_g: 0,
  colesterol_mg: 0,
  carbohidratos_disp_g: 50,
  azucares_totales_g: 2,
  sodio_mg: 20,
});

// Base en ml: obliga a convertir la base con densidad, además de la cantidad.
export const FICHA_ACEITE = ficha(
  {
    energia_kcal: 900,
    proteinas_g: 0,
    grasa_total_g: 100,
    grasa_saturada_g: 15,
    grasa_monoinsaturada_g: 60,
    grasa_poliinsaturada_g: 25,
    grasas_trans_g: 0,
    colesterol_mg: 0,
    carbohidratos_disp_g: 0,
    azucares_totales_g: 0,
    sodio_mg: 0,
  },
  {
    baseUnidad: 'ml',
    densidadGMl: 0.92,
    aportaGrasasSaturadasAnadidas: true,
  },
);

export const FICHA_HUEVO = ficha({
  energia_kcal: 143,
  proteinas_g: 13,
  grasa_total_g: 10,
  grasa_saturada_g: 3,
  grasa_monoinsaturada_g: 4,
  grasa_poliinsaturada_g: 2,
  grasas_trans_g: 0,
  colesterol_mg: 372,
  carbohidratos_disp_g: 1,
  azucares_totales_g: 0,
  sodio_mg: 142,
});

export function recetaMarmolado(): LineaReceta[] {
  return [
    { ingredienteId: 'mix', nombre: 'Mix Queque Neutro', cantidad: 0.104, unidad: 'kg', ficha: FICHA_MIX },
    { ingredienteId: 'cacao', nombre: 'Cacao Amargo', cantidad: 0.058, unidad: 'kg', ficha: FICHA_CACAO },
    { ingredienteId: 'aceite', nombre: 'Aceite Vegetal', cantidad: 0.009, unidad: 'l', ficha: FICHA_ACEITE },
    { ingredienteId: 'huevo', nombre: 'Huevos', cantidad: 0.025, unidad: 'kg', ficha: FICHA_HUEVO },
  ];
}

export const PESO_FINAL_G = 160;
