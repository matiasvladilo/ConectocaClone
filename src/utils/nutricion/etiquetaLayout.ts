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
  | { tipo: 'poligono'; puntos: Array<[number, number]>; relleno?: boolean }
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

// Anchos relativos de Helvetica por carácter (fracción del tamaño de fuente).
// Aproximación suficiente para decidir dónde cortar una línea, y determinista:
// el mismo texto se corta igual en el PNG y en el PDF.
const ANCHO_ANGOSTO = 0.28; // i l j t f r I . , ; : ' | espacio fino
const ANCHO_ANCHO = 0.78; // m w M W
const ANCHO_MEDIO = 0.55;

export function anchoTexto(texto: string, tamanoMm: number): number {
  let unidades = 0;
  for (const ch of texto) {
    if ('iljtfrI.,;:\'|!()[]'.includes(ch)) unidades += ANCHO_ANGOSTO;
    else if ('mwMW@%'.includes(ch)) unidades += ANCHO_ANCHO;
    else if (ch === ' ') unidades += 0.28;
    else unidades += ANCHO_MEDIO;
  }
  return unidades * tamanoMm;
}

/** Corta un texto en líneas que entren en `anchoMm`. */
export function envolver(texto: string, tamanoMm: number, anchoMm: number): string[] {
  const palabras = (texto || '').split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];

  const lineas: string[] = [];
  let actual = '';

  for (const palabra of palabras) {
    const tentativa = actual ? `${actual} ${palabra}` : palabra;
    if (anchoTexto(tentativa, tamanoMm) <= anchoMm || !actual) {
      actual = tentativa;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
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
