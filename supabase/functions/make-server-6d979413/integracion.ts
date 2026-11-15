/**
 * Integración con Oca Pricing: verificación de la clave, validación de los precios que envía
 * y cálculo de la compra sugerida. Módulo PURO (como authz.ts), probado con `node --test`.
 * Spec: docs/superpowers/specs/2026-11-15-conexion-oca-pricing-design.md
 */

export const MAX_PRECIOS = 2000;
export const DIAS_PRECIO_ANTIGUO = 7;
const DIA_MS = 86_400_000;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Clave compartida (`OCA_PRICING_CLAVE`) y negocio fijo (`OCA_PRICING_BUSINESS_ID`), nunca desde la petición. */
export function verificarIntegracion(
  recibida: string | null | undefined,
  clave: string | undefined,
  businessId: string | undefined,
): { ok: true; businessId: string } | { ok: false; status: 401 | 503; error: string } {
  if (!clave || clave.length < 32 || !businessId) return { ok: false, status: 503, error: 'Integración con Oca Pricing apagada' };
  if (!recibida || !igualesEnTiempoConstante(recibida, clave)) return { ok: false, status: 401, error: 'No autorizado' };
  return { ok: true, businessId };
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const largo = Math.max(a.length, b.length);
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < largo; i++) diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diferencia === 0;
}

export interface PrecioCompra {
  productId: string;
  proveedor: string;
  proveedorNombre: string;
  /** Por unidad de Conectoca (Oca Pricing ya convirtió packs), CLP. */
  precioUnidad: number;
  /** Unidades de Conectoca por formato de compra, o null si no se puede convertir. */
  formatoUnidades: number | null;
  formato: string;
  observadoEn: string;
  url: string;
}

export function validarPrecios(body: unknown, idsDelNegocio: Set<string>, ahora: Date = new Date()): { ok: true; precios: PrecioCompra[] } | { ok: false; error: string } {
  const lista = (body as { precios?: unknown } | null)?.precios;
  if (!Array.isArray(lista)) return { ok: false, error: 'Falta la lista de precios' };
  // Una lista vacía borraría todos los precios: solo con confirmación explícita.
  if (lista.length === 0 && (body as { vaciar?: unknown }).vaciar !== true) return { ok: false, error: 'Lista vacía: envía vaciar: true para borrar todos los precios' };
  if (lista.length > MAX_PRECIOS) return { ok: false, error: `Máximo ${MAX_PRECIOS} precios por envío` };
  const vistos = new Set<string>();
  const precios: PrecioCompra[] = [];
  for (const [i, x] of lista.entries()) {
    const p = (x ?? {}) as Record<string, unknown>;
    const malo = (motivo: string) => ({ ok: false as const, error: `Precio ${i + 1}: ${motivo}` });
    if (typeof p.productId !== 'string' || !idsDelNegocio.has(p.productId)) return malo('producto desconocido');
    if (vistos.has(p.productId)) return malo('producto repetido');
    if (!texto(p.proveedor, 64) || !texto(p.proveedorNombre, 100)) return malo('proveedor inválido');
    if (typeof p.precioUnidad !== 'number' || !Number.isFinite(p.precioUnidad) || p.precioUnidad <= 0 || p.precioUnidad >= 10_000_000) return malo('precio inválido');
    if (p.formatoUnidades !== null && (!Number.isInteger(p.formatoUnidades) || (p.formatoUnidades as number) < 1 || (p.formatoUnidades as number) > 10_000)) return malo('formato inválido');
    if (typeof p.formato !== 'string' || p.formato.length > 100) return malo('formato inválido');
    if (typeof p.observadoEn !== 'string' || !FECHA_ISO.test(p.observadoEn) || !Number.isFinite(Date.parse(p.observadoEn)) || Date.parse(p.observadoEn) > ahora.getTime() + DIA_MS) return malo('fecha inválida');
    if (typeof p.url !== 'string' || p.url.length > 500 || (p.url !== '' && !/^https?:\/\//.test(p.url))) return malo('enlace inválido');
    vistos.add(p.productId);
    precios.push({
      productId: p.productId, proveedor: p.proveedor as string, proveedorNombre: p.proveedorNombre as string,
      precioUnidad: p.precioUnidad, formatoUnidades: p.formatoUnidades as number | null, formato: p.formato,
      observadoEn: p.observadoEn, url: p.url,
    });
  }
  return { ok: true, precios };
}

const texto = (v: unknown, max: number) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

export interface CompraSugerida extends Omit<PrecioCompra, 'productId'> {
  comprarRedondeado: number;
  costoEstimado: number;
  antiguo: boolean;
}

export function agregarCompra<T extends { productId: string; comprar: number }>(
  filas: T[],
  precios: Map<string, PrecioCompra>,
  ahora: Date,
): (T & { compra: CompraSugerida | null })[] {
  return filas.map((f) => {
    const p = precios.get(f.productId);
    if (!p) return { ...f, compra: null };
    const { productId: _, ...resto } = p;
    const comprarRedondeado = p.formatoUnidades ? Math.ceil(f.comprar / p.formatoUnidades - 1e-9) * p.formatoUnidades : f.comprar;
    return {
      ...f,
      compra: {
        ...resto,
        comprarRedondeado,
        costoEstimado: Math.round(comprarRedondeado * p.precioUnidad),
        antiguo: ahora.getTime() - new Date(p.observadoEn).getTime() > DIAS_PRECIO_ANTIGUO * DIA_MS,
      },
    };
  });
}

/** Categorías cuyo nombre contiene «distribuidora» y todas sus subcategorías. */
export function idsDistribuidora(categorias: { id: string; name: string; parent_id: string | null }[]): Set<string> {
  const ids = new Set(categorias.filter((c) => c.name.toLowerCase().includes('distribuidora')).map((c) => c.id));
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const c of categorias) {
      if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        cambio = true;
      }
    }
  }
  return ids;
}
