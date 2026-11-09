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

const LOCAL_SIN_NOMBRE = 'Desconocido';

/** Clave de agrupación de un ítem: el productId, o el nombre si el pedido es viejo y no lo tiene. */
function claveProducto(item: { productId?: string; name: string }): string {
  return item.productId || `nombre:${item.name}`;
}

/**
 * Categoría de un ítem. Un producto que ya no está en el catálogo (borrado) o un
 * ítem sin productId caen en Sin categoría: se muestran igual, porque omitirlos
 * haría que los subtotales no sumen el total y la planilla mentiría.
 */
function datosDeProducto(mapa: MapaCategorias, item: { productId?: string; name: string }): CategoriaDeProducto {
  const encontrado = item.productId ? mapa.get(item.productId) : undefined;
  return encontrado ?? { raiz: SIN_CATEGORIA, sub: '', nombre: item.name };
}

/** Categorías raíz alfabéticas, con Sin categoría siempre al final. */
function compararCategorias(a: string, b: string): number {
  if (a === b) return 0;
  if (a === SIN_CATEGORIA) return 1;
  if (b === SIN_CATEGORIA) return -1;
  return a.localeCompare(b, 'es');
}

interface FilaProducto {
  raiz: string;
  sub: string;
  nombre: string;
  unidades: Map<string, number>;
  monto: Map<string, number>;
}

export function construirMatrizPorLocal(orders: PedidoParaReporte[], mapa: MapaCategorias): unknown[][] {
  const locales = Array.from(
    new Set(orders.map(o => o.customerName || LOCAL_SIN_NOMBRE))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const filas = new Map<string, FilaProducto>();

  for (const order of orders) {
    const local = order.customerName || LOCAL_SIN_NOMBRE;
    for (const item of order.products ?? []) {
      const clave = claveProducto(item);
      let fila = filas.get(clave);
      if (!fila) {
        const datos = datosDeProducto(mapa, item);
        fila = { ...datos, unidades: new Map(), monto: new Map() };
        filas.set(clave, fila);
      }
      fila.unidades.set(local, (fila.unidades.get(local) || 0) + item.quantity);
      fila.monto.set(local, (fila.monto.get(local) || 0) + item.price * item.quantity);
    }
  }

  // Orden: categoría raíz, después subcategoría ('' primero) y después producto.
  const ordenadas = Array.from(filas.values()).sort((a, b) => {
    const porRaiz = compararCategorias(a.raiz, b.raiz);
    if (porRaiz !== 0) return porRaiz;
    if (a.sub !== b.sub) return a.sub.localeCompare(b.sub, 'es');
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  // Map conserva el orden de inserción, así que los bloques salen ya ordenados.
  const porCategoria = new Map<string, FilaProducto[]>();
  for (const f of ordenadas) {
    const lista = porCategoria.get(f.raiz) ?? [];
    lista.push(f);
    porCategoria.set(f.raiz, lista);
  }

  const matriz: unknown[][] = [['Categoría', 'Subcategoría', 'Producto', ...locales, 'Total Unidades']];

  const totalUnidadesPorLocal = new Map<string, number>();
  const totalItemsPorLocal = new Map<string, number>();

  for (const [raiz, filasCat] of porCategoria) {
    for (const f of filasCat) {
      const row: unknown[] = [raiz, f.sub, f.nombre];
      let totalFila = 0;
      for (const local of locales) {
        const qty = f.unidades.get(local) || 0;
        // Celda vacía y no 0: un 0 sugiere "se pidió y salió cero".
        row.push(qty > 0 ? qty : '');
        totalFila += qty;
      }
      row.push(totalFila);
      matriz.push(row);
    }

    const filaUnidades: unknown[] = [`>> ${raiz} — unidades`, '', ''];
    const filaMonto: unknown[] = [`>> ${raiz} — monto $`, '', ''];
    let totalUnidadesCat = 0;
    let totalMontoCat = 0;

    for (const local of locales) {
      const unidades = filasCat.reduce((s, f) => s + (f.unidades.get(local) || 0), 0);
      const monto = filasCat.reduce((s, f) => s + (f.monto.get(local) || 0), 0);
      filaUnidades.push(unidades);
      filaMonto.push(monto);
      totalUnidadesCat += unidades;
      totalMontoCat += monto;
      totalUnidadesPorLocal.set(local, (totalUnidadesPorLocal.get(local) || 0) + unidades);
      totalItemsPorLocal.set(local, (totalItemsPorLocal.get(local) || 0) + monto);
    }

    filaUnidades.push(totalUnidadesCat);
    filaMonto.push(totalMontoCat);
    matriz.push(filaUnidades, filaMonto, []);
  }

  const totalUnidades: unknown[] = ['Total Unidades', '', ''];
  const ventaItems: unknown[] = ['Venta Total (ítems)', '', ''];
  const ventaPedido: unknown[] = ['Venta Total (del pedido)', '', ''];
  let globalUnidades = 0;
  let globalItems = 0;
  let globalPedido = 0;

  for (const local of locales) {
    const unidades = totalUnidadesPorLocal.get(local) || 0;
    const items = totalItemsPorLocal.get(local) || 0;
    const pedido = orders
      .filter(o => (o.customerName || LOCAL_SIN_NOMBRE) === local)
      .reduce((s, o) => s + (o.total || 0), 0);

    totalUnidades.push(unidades);
    ventaItems.push(items);
    ventaPedido.push(pedido);
    globalUnidades += unidades;
    globalItems += items;
    globalPedido += pedido;
  }

  totalUnidades.push(globalUnidades);
  ventaItems.push(globalItems);
  ventaPedido.push(globalPedido);
  matriz.push(totalUnidades, ventaItems, ventaPedido);

  return matriz;
}

/** Etiquetas de estado tal como las muestra hoy la planilla. */
function etiquetaEstado(status: string | undefined): string {
  if (status === 'pending') return 'Pendiente';
  if (status === 'in_progress') return 'En Preparación';
  if (status === 'completed') return 'Completado';
  return 'Despachado';
}

/** Todas las categorías que aparecen en el período, para que todas las filas tengan las mismas columnas. */
function categoriasPresentes(orders: PedidoParaReporte[], mapa: MapaCategorias): string[] {
  const vistas = new Set<string>();
  for (const order of orders) {
    for (const item of order.products ?? []) {
      vistas.add(datosDeProducto(mapa, item).raiz);
    }
  }
  return Array.from(vistas).sort(compararCategorias);
}

export function construirDetalleVentas(
  orders: PedidoParaReporte[],
  mapa: MapaCategorias
): Record<string, unknown>[] {
  const categorias = categoriasPresentes(orders, mapa);

  return orders.map(order => {
    const createDate = new Date(order.createdAt || order.date || order.deadline || new Date());
    const deadlineDate = order.deadline ? new Date(`${order.deadline}T12:00:00`) : createDate;

    const montoPorCategoria = new Map<string, number>();
    let totalItems = 0;
    for (const item of order.products ?? []) {
      const { raiz } = datosDeProducto(mapa, item);
      const monto = item.price * item.quantity;
      montoPorCategoria.set(raiz, (montoPorCategoria.get(raiz) || 0) + monto);
      totalItems += monto;
    }

    const fila: Record<string, unknown> = {
      'Fecha Creación': createDate.toLocaleDateString('es-CL'),
      'Hora Creación': createDate.toLocaleTimeString('es-CL'),
      'Fecha Entrega (Deadline)': deadlineDate.toLocaleDateString('es-CL'),
      'ID Pedido': order.id.slice(0, 8),
      'Cliente/Local': order.customerName || 'N/A',
      'Estado': etiquetaEstado(order.status),
      'Total ($)': order.total || 0,
      'Productos': order.products?.map(p => `${p.name} (x${p.quantity})`).join('; ') || '',
      'Notas': order.notes || '',
    };

    // Todas las filas llevan todas las categorías, con 0 donde no aplica: si una
    // fila omitiera una clave, json_to_sheet desalinearía las columnas y la
    // planilla quedaría corrida sin ningún aviso.
    for (const cat of categorias) {
      // Una categoría que se llame igual que una columna fija (p. ej. "Notas")
      // la sobreescribiría. Se renombra la columna de categoría, no la original.
      const clave = cat in fila ? `${cat} (categoría)` : cat;
      fila[clave] = montoPorCategoria.get(cat) || 0;
    }

    fila['Total Ítems ($)'] = totalItems;
    fila['Diferencia ($)'] = (order.total || 0) - totalItems;

    return fila;
  });
}
