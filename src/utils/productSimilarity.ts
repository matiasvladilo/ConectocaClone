import type { Product } from './api';

/**
 * Detección de productos parecidos a uno que se está por crear.
 *
 * Los campos fijos de productName.ts ordenan el FORMATO, pero no impiden un
 * duplicado: nada evita cargar "Coca Cola 591ml" cuando ya existe
 * "Coca-Cola 591 ml". Esto es lo que ataca esa parte del problema.
 *
 * Compara contra los productos que la pantalla ya tiene en memoria: no agrega
 * ningún endpoint ni request.
 */

export const LARGO_MINIMO_BUSQUEDA = 3;

/** Deja solo letras y números en minúscula, sin tildes ni puntuación. */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Levenshtein clásico, con una sola fila viva para no armar la matriz entera. */
export function distanciaEdicion(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const siguiente = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      siguiente[j] = Math.min(
        fila[j] + 1,           // borrado
        siguiente[j - 1] + 1,  // inserción
        fila[j - 1] + costo,   // sustitución
      );
    }
    fila = siguiente;
  }

  return fila[b.length];
}

/**
 * La tolerancia a tipeos tiene que escalar con el largo. Permitir 2 ediciones
 * sobre 3 caracteres haría que "pan" se parezca a casi todo el catálogo.
 */
export function distanciaMaximaPara(largo: number): number {
  if (largo >= 8) return 2;
  if (largo >= 5) return 1;
  return 0;
}

export function buscarSimilares(marca: string, productos: Product[], limite = 5): Product[] {
  const q = normalizarNombre(marca);
  if (q.length < LARGO_MINIMO_BUSQUEDA) return [];

  const maxDistancia = distanciaMaximaPara(q.length);

  return productos
    .filter(p => {
      const n = normalizarNombre(p.name || '');
      if (!n) return false;
      // (a) mismo comienzo o contenido: "cocacolalata350cc" contiene "cocacola".
      if (n.includes(q)) return true;
      // (b) tipeo: se compara contra el prefijo del mismo largo, porque el resto
      // del nombre existente es la presentación y no debería contar como error.
      if (maxDistancia === 0) return false;
      return distanciaEdicion(q, n.slice(0, q.length)) <= maxDistancia;
    })
    .slice(0, limite);
}
