import type { Category, Product } from './api';
import { nombreCategoriaRaiz } from './categoryTree.ts';

/**
 * Armado de las planillas del export de Analíticas. Funciones puras: reciben
 * pedidos y catálogo ya cargados y devuelven matrices/filas listas para xlsx.
 * No importa nada de componentes a propósito, así se testea sin React.
 */

/** Mismo literal que devuelve nombreCategoriaRaiz: los dos lados tienen que coincidir. */
export const SIN_CATEGORIA = 'Sin categoría';

export interface CategoriaDeProducto {
  /** Categoría raíz: si el producto está en una subcategoría, el nombre del padre. */
  raiz: string;
  /** Nombre de la subcategoría, o '' si el producto está directo en la raíz. */
  sub: string;
  /** Nombre del catálogo. Gana sobre el nombre guardado en el pedido (puede estar renombrado). */
  nombre: string;
}

export type MapaCategorias = Map<string, CategoriaDeProducto>;

/**
 * Forma mínima de pedido que necesitan los reportes. `Order` (src/App.tsx) la
 * satisface estructuralmente; se define acá para que utils no dependa de un
 * componente.
 */
export interface PedidoParaReporte {
  id: string;
  customerName?: string;
  status?: string;
  total?: number;
  createdAt?: string;
  date?: string;
  deadline?: string;
  notes?: string;
  products?: Array<{ productId?: string; name: string; quantity: number; price: number }>;
}

export function indexarCategorias(productos: Product[], categorias: Category[]): MapaCategorias {
  const mapa: MapaCategorias = new Map();

  for (const p of productos) {
    const cat = p.categoryId ? categorias.find(c => c.id === p.categoryId) : undefined;
    // Solo es subcategoría si el padre existe de verdad. Si el padre no está en
    // la lista, nombreCategoriaRaiz devuelve el nombre de la hija como raíz, así
    // que ponerla también en `sub` la mostraría duplicada en la planilla.
    const tienePadreReal = !!cat?.parentId && categorias.some(c => c.id === cat.parentId);

    mapa.set(p.id, {
      raiz: nombreCategoriaRaiz(categorias, p.categoryId),
      sub: tienePadreReal ? cat!.name : '',
      nombre: p.name,
    });
  }

  return mapa;
}
