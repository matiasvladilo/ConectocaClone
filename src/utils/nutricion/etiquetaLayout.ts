// Layout de la etiqueta como lista de primitivas en MILÍMETROS.
//
// Por qué primitivas y no HTML/CSS:
//   1. El Tailwind del proyecto está precompilado; una clase que no esté en
//      index.css no aplica nada y falla en silencio. Acá no hay clases.
//   2. Es testeable sin navegador.
//   3. El PNG y el PDF se dibujan desde la MISMA descripción, así que no pueden
//      divergir. Si cada uno maquetara por su cuenta, la vista previa dejaría de
//      representar lo que se imprime.
//
// Origen (0,0) arriba a la izquierda. Los tamaños de fuente también van en mm;
// cada renderer los convierte a su unidad.

export type Primitiva =
  | {
      tipo: 'texto';
      x: number;
      y: number;
      texto: string;
      tamano: number;
      negrita?: boolean;
      align?: 'left' | 'center' | 'right';
      color?: string;
    }
  | { tipo: 'linea'; x1: number; y1: number; x2: number; y2: number; grosor: number }
  | { tipo: 'rect'; x: number; y: number; w: number; h: number; relleno?: boolean; grosor?: number }
  | { tipo: 'poligono'; puntos: Array<[number, number]>; relleno?: boolean; grosor?: number }
  | { tipo: 'imagen'; x: number; y: number; w: number; h: number; dataUrl: string };

export interface Lienzo {
  anchoMm: number;
  altoMm: number;
  primitivas: Primitiva[];
  /** Textos que quedaron por debajo del mínimo legible. Vacío = todo bien. */
  avisosLegibilidad: string[];
}

/**
 * Piso práctico de legibilidad en impresión láser, ~4 pt.
 *
 * NO es un mínimo normativo: el tamaño mínimo de letra del rotulado está en el
 * RSA y todavía no se transcribió desde la fuente oficial. Es una salvaguarda
 * para no emitir una etiqueta ilegible, no una garantía de cumplimiento.
 */
export const TAMANO_MIN_MM = 1.4;

// Métricas REALES de Helvetica, en unidades de 1/1000 del tamaño de fuente.
// Son las tablas AFM estándar de Adobe, que es exactamente la fuente que usa
// jsPDF: medir con esto da el mismo ancho que el PDF impreso.
//
// Antes acá había una aproximación (0,55 por carácter, sin distinguir negrita) y
// subestimaba: "PRODUCTO PRUEBA" en negrita se daba por entrado en una columna
// donde no entraba, y se montaba encima de la tabla nutricional.
const W_REGULAR: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584, '·': 278, '—': 1000, '–': 556,
};

const W_BOLD: Record<string, number> = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  '{': 389, '|': 280, '}': 389, '~': 584, '·': 278, '—': 1000, '–': 556,
};

/**
 * Mide un texto en mm.
 *
 * Las vocales acentuadas y la ñ tienen en Helvetica el mismo ancho que su letra
 * base, así que se normalizan y se les saca la tilde antes de buscar. Sin esto,
 * "AZÚCARES" y "MARMOLADO" medirían distinto de lo que ocupan.
 */
export function anchoTexto(texto: string, tamanoMm: number, negrita = false): number {
  const tabla = negrita ? W_BOLD : W_REGULAR;
  const plano = (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let unidades = 0;
  for (const ch of plano) unidades += tabla[ch] ?? 556;
  return (unidades / 1000) * tamanoMm;
}

/**
 * Corta un texto en líneas que entren en `anchoMm`.
 *
 * Una palabra sola más ancha que la columna se emite igual en su propia línea:
 * perderla sería peor que desbordar, y el aviso de legibilidad lo reporta.
 */
export function envolver(texto: string, tamanoMm: number, anchoMm: number, negrita = false): string[] {
  const palabras = (texto || '').split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];

  const lineas: string[] = [];
  let actual = '';

  for (const palabra of palabras) {
    const tentativa = actual ? `${actual} ${palabra}` : palabra;
    if (anchoTexto(tentativa, tamanoMm, negrita) <= anchoMm || !actual) {
      actual = tentativa;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Reduce el tamaño de fuente hasta que el texto entre en `anchoMm` en como mucho
 * `maxLineas` líneas, sin bajar de `minMm`. Devuelve el tamaño y las líneas.
 *
 * Es la red de seguridad para textos que no se pueden cortar más, como un nombre
 * de producto largo en una etiqueta angosta.
 */
export function ajustarAlAncho(
  texto: string,
  tamanoInicialMm: number,
  anchoMm: number,
  maxLineas: number,
  minMm: number,
  negrita = false,
): { tamano: number; lineas: string[] } {
  let tamano = tamanoInicialMm;
  let lineas = envolver(texto, tamano, anchoMm, negrita);

  while (lineas.length > maxLineas && tamano > minMm) {
    tamano = Math.max(minMm, tamano - tamanoInicialMm * 0.05);
    lineas = envolver(texto, tamano, anchoMm, negrita);
  }
  return { tamano, lineas };
}

/** Los 8 vértices de un octógono regular inscrito en el rectángulo dado. */
export function octogono(x: number, y: number, lado: number): Array<[number, number]> {
  const c = lado * 0.3; // recorte de esquina, igual que el sello impreso
  return [
    [x + c, y],
    [x + lado - c, y],
    [x + lado, y + c],
    [x + lado, y + lado - c],
    [x + lado - c, y + lado],
    [x + c, y + lado],
    [x, y + lado - c],
    [x, y + c],
  ];
}
