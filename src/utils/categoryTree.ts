import type { Category } from './api';

/**
 * Jerarquía de categorías de UN SOLO NIVEL: una categoría raíz puede tener
 * subcategorías, pero una subcategoría no. La regla la impone el backend; acá
 * solo se lee el árbol que ya viene armado en la lista plana de GET /categories.
 */

export interface CategoriaConHijas {
  categoria: Category;
  hijas: Category[];
}

export function esRaiz(c: Category): boolean {
  return !c.parentId;
}

export function raicesDe(categories: Category[]): Category[] {
  return categories.filter(esRaiz);
}

export function hijasDe(categories: Category[], parentId: string): Category[] {
  return categories.filter(c => c.parentId === parentId);
}

export function tieneHijas(categories: Category[], id: string): boolean {
  return categories.some(c => c.parentId === id);
}

/**
 * Encuentra la categoría Distribuidora entre la lista, buscando por nombre
 * (reutiliza la misma estrategia que DistributionPanel). Devuelve su id, o
 * 'all' si no existe.
 */
export function elegirCategoriaInicial(categories: Category[]): string {
  const distri = categories.find(c => c.name.trim().toLowerCase().includes('distribuidora'));
  return distri ? distri.id : 'all';
}

/**
 * Los ids que cuentan como "pertenece a esta categoría": la categoría misma más
 * sus subcategorías. Sin esto, filtrar por "Distribuidora" con una comparación
 * exacta esconde todo lo que se etiquetó como "Bebidas", y el listado se ve
 * completo sin estarlo.
 */
export function idsDeCategoriaConHijas(categories: Category[], categoriaId: string): Set<string> {
  const ids = new Set<string>([categoriaId]);
  for (const c of categories) {
    if (c.parentId === categoriaId) ids.add(c.id);
  }
  return ids;
}

/** Candidatas a padre: solo raíces, y nunca la categoría que se está editando. */
export function posiblesPadres(categories: Category[], editandoId?: string): Category[] {
  return categories.filter(c => esRaiz(c) && c.id !== editandoId);
}

/**
 * Una categoría que ya tiene hijas no puede volverse subcategoría: eso crearía
 * un segundo nivel por la puerta de atrás. El backend lo rechaza igual; acá se
 * usa para no ofrecer en la UI algo que va a fallar.
 */
export function puedeTenerPadre(categories: Category[], editandoId?: string): boolean {
  if (!editandoId) return true;
  return !tieneHijas(categories, editandoId);
}

/**
 * Nombre de la categoría RAÍZ de `categoryId`: si es una subcategoría, el
 * nombre de su padre; si ya es raíz (o no tiene padre en la lista, ej. un
 * padre borrado), su propio nombre. `undefined`/producto sin categoría o
 * categoría no encontrada (ej. se borró) caen en 'Sin categoría'.
 *
 * Pensada para agregaciones por categoría (desglose de totales, etiquetas de
 * pedido) donde mezclar subcategorías con su padre en la misma lista
 * ensuciaría el resultado.
 */
export function nombreCategoriaRaiz(categories: Category[], categoryId: string | undefined): string {
  if (!categoryId) return 'Sin categoría';
  const cat = categories.find(c => c.id === categoryId);
  if (!cat) return 'Sin categoría';
  if (cat.parentId) {
    const padre = categories.find(c => c.id === cat.parentId);
    return padre?.name || cat.name;
  }
  return cat.name;
}

export function agruparPorPadre(categories: Category[]): CategoriaConHijas[] {
  const ids = new Set(categories.map(c => c.id));
  // Una hija cuyo padre no está en la lista se trata como raíz. No debería
  // pasar (la FK es ON DELETE RESTRICT), pero si pasa, el costo de mostrarla
  // fuera de lugar es mucho menor que el de hacerla desaparecer de la pantalla.
  const esRaizEfectiva = (c: Category) => !c.parentId || !ids.has(c.parentId);

  return categories
    .filter(esRaizEfectiva)
    .map(categoria => ({ categoria, hijas: hijasDe(categories, categoria.id) }));
}

/**
 * Categorías que puede pedir un miembro restringido (tabla
 * categorias_permitidas). `permitidas` null o vacía = sin restricción.
 * Una categoría permitida trae también sus subcategorías, igual que el trigger
 * de la base (validar_categoria_permitida), que es quien la hace cumplir.
 */
export function idsPermitidos(categories: Category[], permitidas: string[] | null): Set<string> | null {
  if (!permitidas || permitidas.length === 0) return null;
  const ids = new Set<string>();
  for (const id of permitidas) {
    for (const h of idsDeCategoriaConHijas(categories, id)) ids.add(h);
  }
  return ids;
}

/** Recorta el catálogo a lo permitido: productos y las categorías que los contienen. */
export function recortarCatalogo<P extends { categoryId?: string | null }>(
  products: P[],
  categories: Category[],
  permitidas: string[] | null,
): { products: P[]; categories: Category[] } {
  const ids = idsPermitidos(categories, permitidas);
  if (!ids) return { products, categories };
  // Una subcategoría permitida suelta mantiene visible a su padre (el chip de
  // la fila de arriba), pero solo con ella dentro.
  const padres = new Set(categories.filter(c => ids.has(c.id) && c.parentId).map(c => c.parentId as string));
  return {
    products: products.filter(p => !!p.categoryId && ids.has(p.categoryId)),
    categories: categories.filter(c => ids.has(c.id) || padres.has(c.id)),
  };
}
