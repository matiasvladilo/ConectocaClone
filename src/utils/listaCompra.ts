import type { FilaReposicion } from './api.tsx';

const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Mismo ámbito que el resto del panel: categoría elegida (con subcategorías) y búsqueda por nombre. */
export function filtrarReposicion(filas: FilaReposicion[], idsCategoria: Set<string> | null, busqueda: string): FilaReposicion[] {
  const q = busqueda.trim().toLowerCase();
  return filas
    .filter(f => idsCategoria === null || (!!f.categoryId && idsCategoria.has(f.categoryId)))
    .filter(f => !q || f.name.toLowerCase().includes(q));
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Texto plano para mandar por WhatsApp o copiar. Con precio: cantidad redondeada al formato y proveedor. */
export function textoListaCompra(filas: FilaReposicion[], fecha: Date): string {
  const dia = `${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${fecha.getFullYear()}`;
  return [
    `Para comprar — ${dia}`,
    ...filas.map(f => f.compra
      ? `• ${f.name}: ${fmt(f.compra.comprarRedondeado)} — ${f.compra.proveedorNombre} ${clp(f.compra.precioUnidad)} c/u`
      : `• ${f.name}: ${fmt(f.comprar)}`),
  ].join('\n');
}

/** La última semana sale más de un 20 % más rápido que el promedio del mes. */
export function subeDemanda(f: FilaReposicion): boolean {
  return f.rotacion7 > 0 && f.rotacion7 > f.rotacion28 * 1.2;
}

export function resumenCosto(filas: FilaReposicion[]): { total: number; conPrecio: number } {
  const conCompra = filas.filter(f => f.compra);
  return { total: conCompra.reduce((s, f) => s + f.compra!.costoEstimado, 0), conPrecio: conCompra.length };
}

export function etiquetaMotivo(f: FilaReposicion): string {
  switch (f.motivo) {
    case 'agotado':
      return 'Agotado';
    case 'pocos_dias':
      return `Alcanza ${fmt(f.diasQueAlcanza ?? 0)} ${f.diasQueAlcanza === 1 ? 'día' : 'días'}`;
    case 'bajo_minimo':
      return `Bajo el mínimo (${fmt(f.minStock ?? 0)})`;
    case 'sin_ventas_recientes':
      return `Sin ventas recientes · mín. ${fmt(f.minStock ?? 0)}`;
  }
}
