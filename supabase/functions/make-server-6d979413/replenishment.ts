/**
 * «Para comprar»: cuánto rota cada producto de la Distribuidora y cuánto reponer.
 * Módulo PURO (sin Supabase ni Hono), como authz.ts: se prueba con `node --test`.
 * Ver docs/superpowers/specs/2026-11-15-para-comprar-reposicion-design.md
 */

export const VENTANA_DIAS = 28;
export const VENTANA_CORTA_DIAS = 7;
const DIA_MS = 86_400_000;

export interface AjustesReposicion {
  /** Para cuántos días de venta debe alcanzar la compra. */
  coverageDays: number;
  /** Aparece en la lista cuando el stock alcanza para menos de estos días. */
  alertDays: number;
}

export const AJUSTES_POR_DEFECTO: AjustesReposicion = { coverageDays: 7, alertDays: 3 };

export interface ProductoStock {
  id: string;
  name: string;
  categoryId: string | null;
  stock: number;
  /** Solo el min_stock cargado; el 10 por defecto del panel NO se usa aquí. */
  minStock: number | null;
  unlimitedStock: boolean | null;
  trackStock: boolean | null;
  createdAt: string;
}

export interface SalidasProducto {
  despachos: number;
  devoluciones: number;
  /** Solo los últimos 7 días (si se calculó con fecha). */
  despachos7?: number;
  devoluciones7?: number;
}

export type MotivoReposicion = 'agotado' | 'pocos_dias' | 'bajo_minimo' | 'sin_ventas_recientes';

export interface FilaReposicion {
  productId: string;
  name: string;
  categoryId: string | null;
  stock: number;
  minStock: number | null;
  rotacionDiaria: number;
  /** Ritmo de los últimos 7 días y de los últimos 28 (rotacionDiaria es el mayor). */
  rotacion7: number;
  rotacion28: number;
  diasQueAlcanza: number | null;
  comprar: number;
  motivo: MotivoReposicion;
}

/**
 * Suma por producto los despachos y devoluciones (las demás salidas no son demanda).
 * Con `ahora`, además separa los de los últimos 7 días (eventos con `created_at`).
 */
export function sumarSalidas(
  eventos: { product_id: string; type: string; quantity: number | string; created_at?: string }[],
  ahora?: Date,
): Map<string, SalidasProducto> {
  const desde7 = ahora ? ahora.getTime() - VENTANA_CORTA_DIAS * DIA_MS : null;
  const out = new Map<string, SalidasProducto>();
  for (const e of eventos) {
    if (e.type !== 'despacho' && e.type !== 'devolucion') continue;
    const s = out.get(e.product_id) ?? (desde7 === null
      ? { despachos: 0, devoluciones: 0 }
      : { despachos: 0, devoluciones: 0, despachos7: 0, devoluciones7: 0 });
    const q = Number(e.quantity);
    const reciente = desde7 !== null && !!e.created_at && new Date(e.created_at).getTime() >= desde7;
    if (e.type === 'despacho') {
      s.despachos += q;
      if (reciente) s.despachos7! += q;
    } else {
      s.devoluciones += q;
      if (reciente) s.devoluciones7! += q;
    }
    out.set(e.product_id, s);
  }
  return out;
}

export function calcularReposicion(
  productos: ProductoStock[],
  salidas: Map<string, SalidasProducto>,
  ajustes: AjustesReposicion,
  ahora: Date,
): FilaReposicion[] {
  const filas: FilaReposicion[] = [];
  for (const p of productos) {
    if (p.unlimitedStock === true || p.stock === -1 || p.trackStock === false) continue;

    const s = salidas.get(p.id);
    const netas = Math.max(0, (s?.despachos ?? 0) - (s?.devoluciones ?? 0));
    const netas7 = Math.max(0, (s?.despachos7 ?? 0) - (s?.devoluciones7 ?? 0));
    const diasDeVida = (ahora.getTime() - new Date(p.createdAt).getTime()) / DIA_MS;
    const vida = Number.isFinite(diasDeVida) ? diasDeVida : VENTANA_DIAS;
    const ventana28 = Math.min(VENTANA_DIAS, Math.max(1, vida));
    const ventana7 = Math.min(VENTANA_CORTA_DIAS, Math.max(1, vida));
    const rotacion28 = netas / ventana28;
    const rotacion7 = netas7 / ventana7;
    // Si la demanda sube, manda la última semana (avisa antes); si baja, el promedio del mes.
    const rotacion = Math.max(rotacion7, rotacion28);
    const stock = Math.max(0, p.stock);
    const dias = rotacion > 0 ? stock / rotacion : null;
    const minimo = p.minStock;

    const porDias = dias !== null && dias < ajustes.alertDays;
    const porMinimo = minimo !== null && stock <= minimo;
    if (!porDias && !porMinimo) continue;

    const porRotacion = rotacion * ajustes.coverageDays - stock;
    const faltaMinimo = minimo !== null ? minimo - stock : 0;
    // −1e-9: que 3,0000000001 por error de coma flotante no se vuelva 4
    const comprar = Math.max(1, Math.ceil(Math.max(porRotacion, faltaMinimo) - 1e-9));

    const motivo: MotivoReposicion =
      rotacion === 0 ? 'sin_ventas_recientes' : stock <= 0 ? 'agotado' : porDias ? 'pocos_dias' : 'bajo_minimo';

    filas.push({
      productId: p.id,
      name: p.name,
      categoryId: p.categoryId,
      stock,
      minStock: minimo,
      rotacionDiaria: redondear(rotacion),
      rotacion7: redondear(rotacion7),
      rotacion28: redondear(rotacion28),
      diasQueAlcanza: dias === null ? null : redondear(dias),
      comprar,
      motivo,
    });
  }

  const grupo = (f: FilaReposicion) => (f.motivo === 'agotado' ? 0 : f.motivo === 'sin_ventas_recientes' ? 2 : 1);
  return filas.sort((a, b) =>
    grupo(a) - grupo(b) ||
    (a.diasQueAlcanza ?? 0) - (b.diasQueAlcanza ?? 0) ||
    a.stock - b.stock ||
    a.name.localeCompare(b.name, 'es'),
  );
}

export function validarAjustes(body: unknown): { ok: true; ajustes: AjustesReposicion } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const { coverageDays, alertDays } = b;
  if (!Number.isInteger(coverageDays) || (coverageDays as number) < 1 || (coverageDays as number) > 60) {
    return { ok: false, error: 'Los días de cobertura deben ser un número entero entre 1 y 60' };
  }
  if (!Number.isInteger(alertDays) || (alertDays as number) < 1 || (alertDays as number) > 30) {
    return { ok: false, error: 'El aviso debe ser un número entero de días entre 1 y 30' };
  }
  if ((alertDays as number) > (coverageDays as number)) {
    return { ok: false, error: 'El aviso no puede ser mayor que los días de cobertura' };
  }
  return { ok: true, ajustes: { coverageDays: coverageDays as number, alertDays: alertDays as number } };
}

const redondear = (n: number) => Math.round(n * 100) / 100;
