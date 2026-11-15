import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarCompra, idsDistribuidora, MAX_PRECIOS, validarPrecios, verificarIntegracion, type PrecioCompra } from './integracion.ts';

const CLAVE = 'k'.repeat(40);
const NEGOCIO = 'aaaaaaaa-0000-0000-0000-000000000000';

test('verificarIntegracion: clave correcta devuelve el negocio configurado', () => {
  assert.deepEqual(verificarIntegracion(CLAVE, CLAVE, NEGOCIO), { ok: true, businessId: NEGOCIO });
});

test('verificarIntegracion: clave incorrecta o ausente → 401', () => {
  for (const r of ['x'.repeat(40), CLAVE.slice(1), '', null, undefined]) {
    const v = verificarIntegracion(r, CLAVE, NEGOCIO);
    assert.equal(v.ok, false);
    assert.equal(!v.ok && v.status, 401);
  }
});

test('verificarIntegracion: sin configurar o clave corta → 503 (apagada)', () => {
  assert.equal((verificarIntegracion(CLAVE, undefined, NEGOCIO) as any).status, 503);
  assert.equal((verificarIntegracion(CLAVE, CLAVE, undefined) as any).status, 503);
  assert.equal((verificarIntegracion('corta', 'corta', NEGOCIO) as any).status, 503);
});

const precio = (productId: string, extra: Partial<PrecioCompra> = {}): PrecioCompra => ({
  productId, proveedor: 'alvi', proveedorNombre: 'Alvi', precioUnidad: 870, formatoUnidades: 12,
  formato: 'Caja 12 un.', observadoEn: '2026-11-15T07:00:00Z', url: 'https://www.alvi.cl/x', ...extra,
});

test('validarPrecios acepta un envío correcto', () => {
  const r = validarPrecios({ generadoEn: '2026-11-15T07:10:00Z', precios: [precio('p1'), precio('p2', { formatoUnidades: null, url: '' })] }, new Set(['p1', 'p2']));
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.precios.length, 2);
});

test('validarPrecios rechaza productos de otro negocio, duplicados y datos inválidos', () => {
  const ids = new Set(['p1']);
  for (const malo of [
    null, {}, { precios: 'x' },
    { precios: [precio('otro')] },
    { precios: [precio('p1'), precio('p1')] },
    { precios: [precio('p1', { precioUnidad: 0 })] },
    { precios: [precio('p1', { precioUnidad: Number.NaN })] },
    { precios: [precio('p1', { formatoUnidades: 0 })] },
    { precios: [precio('p1', { formatoUnidades: 1.5 })] },
    { precios: [precio('p1', { proveedor: '' })] },
    { precios: [precio('p1', { observadoEn: 'ayer' })] },
    { precios: [precio('p1', { url: 'javascript:alert(1)' })] },
  ]) {
    assert.equal(validarPrecios(malo, ids).ok, false, JSON.stringify(malo));
  }
});

test('validarPrecios rechaza más de MAX_PRECIOS filas', () => {
  const ids = new Set(Array.from({ length: MAX_PRECIOS + 1 }, (_, i) => `p${i}`));
  assert.equal(validarPrecios({ precios: [...ids].map(id => precio(id)) }, ids).ok, false);
});

test('agregarCompra redondea al formato y calcula el costo', () => {
  const ahora = new Date('2026-11-15T12:00:00Z');
  const filas = agregarCompra([{ productId: 'p1', comprar: 30 }, { productId: 'p2', comprar: 5 }, { productId: 'p3', comprar: 4 }],
    new Map([['p1', precio('p1')], ['p2', precio('p2', { formatoUnidades: null, precioUnidad: 1000 })]]), ahora);
  assert.equal(filas[0].compra?.comprarRedondeado, 36); // 3 cajas de 12
  assert.equal(filas[0].compra?.costoEstimado, 31320); // 36 × 870
  assert.equal(filas[0].compra?.antiguo, false);
  assert.equal(filas[1].compra?.comprarRedondeado, 5); // sin formato: no se redondea
  assert.equal(filas[1].compra?.costoEstimado, 5000);
  assert.equal(filas[2].compra, null);
});

test('agregarCompra marca como antiguo un precio de más de 7 días', () => {
  const [f] = agregarCompra([{ productId: 'p1', comprar: 12 }], new Map([['p1', precio('p1', { observadoEn: '2026-11-01T00:00:00Z' })]]), new Date('2026-11-15T12:00:00Z'));
  assert.equal(f.compra?.antiguo, true);
  assert.equal(f.compra?.comprarRedondeado, 12); // múltiplo exacto: no sube
});

test('idsDistribuidora incluye subcategorías a cualquier profundidad', () => {
  const ids = idsDistribuidora([
    { id: 'd', name: 'Distribuidora', parent_id: null },
    { id: 'b', name: 'Bebidas', parent_id: 'd' },
    { id: 'g', name: 'Gaseosas', parent_id: 'b' },
    { id: 'p', name: 'Panadería', parent_id: null },
  ]);
  assert.deepEqual([...ids].sort(), ['b', 'd', 'g']);
});
