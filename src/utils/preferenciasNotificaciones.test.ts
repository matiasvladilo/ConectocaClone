import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoriaDeNotificacion, categoriaDeEstado, estaSilenciada, seccionesParaRol } from './preferenciasNotificaciones.ts';

// Títulos reales tal como están guardados (App.tsx → statusTitles).
test('clasifica los avisos de estado por el título', () => {
  assert.equal(categoriaDeNotificacion({ type: 'order_updated', title: '🚚 Pedido Despachado' }), 'estado_despachado');
  assert.equal(categoriaDeNotificacion({ type: 'order_updated', title: '📦 Pedido Recibido' }), 'estado_recibido');
  assert.equal(categoriaDeNotificacion({ type: 'order_updated', title: '🏭 En Preparación' }), 'estado_preparacion');
  assert.equal(categoriaDeNotificacion({ type: 'order_updated', title: '⏳ Pedido Pendiente' }), 'estado_preparacion');
  assert.equal(categoriaDeNotificacion({ type: 'order_completed', title: '✅ Pedido Listo' }), 'estado_listo');
  assert.equal(categoriaDeNotificacion({ type: 'order_cancelled', title: '❌ Pedido Cancelado' }), 'estado_cancelado');
});

test('clasifica catálogo, pedidos nuevos y stock; info no tiene categoría', () => {
  assert.equal(categoriaDeNotificacion({ type: 'product_updated', title: 'Cambio de Precio' }), 'precio');
  assert.equal(categoriaDeNotificacion({ type: 'product_created', title: 'Nuevo Producto' }), 'producto_nuevo');
  assert.equal(categoriaDeNotificacion({ type: 'order_created', title: '🎉 Nuevo Pedido' }), 'pedido_nuevo');
  assert.equal(categoriaDeNotificacion({ type: 'warning', title: 'Stock Bajo de Materia Prima' }), 'stock');
  assert.equal(categoriaDeNotificacion({ type: 'info', title: 'Hola' }), null);
});

test('"solo despachado": silenciar el resto deja pasar únicamente el despacho', () => {
  const silenciadas = ['estado_preparacion', 'estado_listo', 'estado_recibido', 'estado_cancelado', 'precio', 'producto_nuevo'];
  assert.equal(estaSilenciada({ type: 'order_updated', title: '🚚 Pedido Despachado' }, silenciadas), false);
  assert.equal(estaSilenciada({ type: 'order_updated', title: '📦 Pedido Recibido' }, silenciadas), true);
  assert.equal(estaSilenciada({ type: 'order_completed', title: '✅ Pedido Listo' }, silenciadas), true);
  assert.equal(estaSilenciada({ type: 'info', title: 'Aviso' }, silenciadas), false);
});

test('el estado del pedido mapea a la misma categoría que su aviso', () => {
  assert.equal(categoriaDeEstado('dispatched'), 'estado_despachado');
  assert.equal(categoriaDeEstado('completed'), 'estado_listo');
  assert.equal(categoriaDeEstado('in_progress'), 'estado_preparacion');
});

test('cada rol ve solo lo que le puede llegar', () => {
  const claves = (rol: string) => seccionesParaRol(rol).flatMap((s) => s.opciones.map((o) => o.clave));
  assert.ok(claves('local').includes('estado_despachado'));
  assert.ok(claves('local').includes('precio'));
  assert.ok(claves('dispatch').includes('pedido_nuevo'));
  // El catálogo se puede activar en cualquier rol.
  for (const rol of ['local', 'admin', 'dispatch', 'production', 'pastry']) {
    assert.ok(claves(rol).includes('precio'), rol);
    assert.ok(claves(rol).includes('producto_nuevo'), rol);
  }
});
