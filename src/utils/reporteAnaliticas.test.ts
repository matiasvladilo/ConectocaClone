import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexarCategorias, SIN_CATEGORIA } from './reporteAnaliticas.ts';
import type { Product, Category } from './api';

const categorias: Category[] = [
  { id: 'distri', name: 'Distribuidora', createdAt: '' },
  { id: 'bebidas', name: 'Bebidas', parentId: 'distri', createdAt: '' },
  { id: 'pan', name: 'Panadería', createdAt: '' },
  { id: 'huerfana', name: 'Huérfana', parentId: 'no-existe', createdAt: '' },
];

function producto(overrides: Partial<Product>): Product {
  return { id: 'p1', name: 'Test', description: '', price: 100, stock: 1, ...overrides } as Product;
}

test('un producto en una categoría raíz queda con esa raíz y sin subcategoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p1', name: 'Fideos', categoryId: 'distri' })], categorias);
  assert.deepEqual(mapa.get('p1'), { raiz: 'Distribuidora', sub: '', nombre: 'Fideos' });
});

test('un producto en una subcategoría queda con la raíz del padre y el nombre de la subcategoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p2', name: 'Coca 500ml', categoryId: 'bebidas' })], categorias);
  assert.deepEqual(mapa.get('p2'), { raiz: 'Distribuidora', sub: 'Bebidas', nombre: 'Coca 500ml' });
});

test('un producto sin categoryId cae en Sin categoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p3', name: 'Suelto' })], categorias);
  assert.deepEqual(mapa.get('p3'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Suelto' });
});

test('un producto con una categoría que ya no existe cae en Sin categoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p4', name: 'Borrada', categoryId: 'se-borro' })], categorias);
  assert.deepEqual(mapa.get('p4'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Borrada' });
});

test('una subcategoría cuyo padre no está en la lista se trata como raíz, sin duplicar el nombre', () => {
  const mapa = indexarCategorias([producto({ id: 'p5', name: 'Rara', categoryId: 'huerfana' })], categorias);
  assert.deepEqual(mapa.get('p5'), { raiz: 'Huérfana', sub: '', nombre: 'Rara' });
});

test('sin categorías cargadas, todo cae en Sin categoría pero el nombre se conserva', () => {
  const mapa = indexarCategorias([producto({ id: 'p6', name: 'Pan', categoryId: 'pan' })], []);
  assert.deepEqual(mapa.get('p6'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Pan' });
});

import { construirMatrizPorLocal, type MapaCategorias, type PedidoParaReporte } from './reporteAnaliticas.ts';

const mapa: MapaCategorias = new Map([
  ['fideos', { raiz: 'Distribuidora', sub: '', nombre: 'Fideos 500g' }],
  ['coca', { raiz: 'Distribuidora', sub: 'Bebidas', nombre: 'Coca 500ml' }],
  ['pan', { raiz: 'Panadería', sub: '', nombre: 'Pan francés' }],
]);

// LA OCA PV: 5 fideos ($500) + 24 cocas ($24.000) + 100 panes ($50.000).
// El total del pedido (75.200) es 700 más que la suma de ítems (74.500): lotes FIFO.
// Pedro Torres: 50 panes ($25.000), total del pedido coincide.
const pedidos: PedidoParaReporte[] = [
  {
    id: 'a1b2c3d4ef', customerName: 'LA OCA PV', total: 75200,
    products: [
      { productId: 'fideos', name: 'Fideos 500g', quantity: 5, price: 100 },
      { productId: 'coca', name: 'Coca 500ml', quantity: 24, price: 1000 },
      { productId: 'pan', name: 'Pan francés', quantity: 100, price: 500 },
    ],
  },
  {
    id: 'e5f6g7h8ij', customerName: 'Pedro Torres', total: 25000,
    products: [{ productId: 'pan', name: 'Pan francés', quantity: 50, price: 500 }],
  },
];

/** Busca la fila cuya primera celda es `etiqueta`. Falla el test si no existe. */
function fila(matriz: unknown[][], etiqueta: string): unknown[] {
  const encontrada = matriz.find(f => f[0] === etiqueta);
  assert.ok(encontrada, `no se encontró la fila "${etiqueta}"`);
  return encontrada;
}

test('el encabezado trae Categoría, Subcategoría, Producto, los locales y el total', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  assert.deepEqual(matriz[0], [
    'Categoría', 'Subcategoría', 'Producto', 'LA OCA PV', 'Pedro Torres', 'Total Unidades',
  ]);
});

test('una subcategoría muestra su nombre y suma al subtotal de su categoría padre', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  assert.deepEqual(fila(matriz, 'Distribuidora').slice(0, 3), ['Distribuidora', '', 'Fideos 500g']);
  const coca = matriz.find(f => f[2] === 'Coca 500ml')!;
  assert.deepEqual(coca.slice(0, 3), ['Distribuidora', 'Bebidas', 'Coca 500ml']);
  // Distribuidora = 5 fideos + 24 cocas = 29 unidades en LA OCA PV.
  assert.deepEqual(fila(matriz, '>> Distribuidora — unidades'), [
    '>> Distribuidora — unidades', '', '', 29, 0, 29,
  ]);
});

test('los productos sin subcategoría van antes que los que tienen', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  const indiceFideos = matriz.findIndex(f => f[2] === 'Fideos 500g');
  const indiceCoca = matriz.findIndex(f => f[2] === 'Coca 500ml');
  assert.ok(indiceFideos < indiceCoca);
});

test('el subtotal de monto por categoría suma precio por cantidad', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  // Distribuidora en LA OCA PV: 5*100 + 24*1000 = 24.500. En Pedro Torres: 0.
  assert.deepEqual(fila(matriz, '>> Distribuidora — monto $'), [
    '>> Distribuidora — monto $', '', '', 24500, 0, 24500,
  ]);
  // Panadería: 100*500 = 50.000 y 50*500 = 25.000.
  assert.deepEqual(fila(matriz, '>> Panadería — monto $'), [
    '>> Panadería — monto $', '', '', 50000, 25000, 75000,
  ]);
});

test('un local que no compró un producto deja la celda vacía, no 0', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  const fideos = matriz.find(f => f[2] === 'Fideos 500g')!;
  assert.equal(fideos[3], 5);
  assert.equal(fideos[4], '');
});

test('Venta Total (del pedido) usa order.total y difiere de la suma de ítems cuando hubo lotes', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  assert.deepEqual(fila(matriz, 'Total Unidades'), ['Total Unidades', '', '', 129, 50, 179]);
  assert.deepEqual(fila(matriz, 'Venta Total (ítems)'), ['Venta Total (ítems)', '', '', 74500, 25000, 99500]);
  assert.deepEqual(fila(matriz, 'Venta Total (del pedido)'), ['Venta Total (del pedido)', '', '', 75200, 25000, 100200]);
});

test('un producto fuera del catálogo cae en Sin categoría y su bloque va al final', () => {
  const conFantasma: PedidoParaReporte[] = [{
    id: 'x1', customerName: 'LA OCA PV', total: 1000,
    products: [
      { productId: 'pan', name: 'Pan francés', quantity: 1, price: 500 },
      { productId: 'borrado', name: 'Producto borrado', quantity: 1, price: 500 },
    ],
  }];
  const matriz = construirMatrizPorLocal(conFantasma, mapa);
  const fantasma = matriz.find(f => f[2] === 'Producto borrado')!;
  assert.equal(fantasma[0], SIN_CATEGORIA);
  const indiceSinCategoria = matriz.findIndex(f => f[0] === `>> ${SIN_CATEGORIA} — unidades`);
  const indicePanaderia = matriz.findIndex(f => f[0] === '>> Panadería — unidades');
  assert.ok(indicePanaderia < indiceSinCategoria, 'Sin categoría tiene que ir al final');
});

test('un ítem sin productId no rompe: entra como Sin categoría con el nombre del pedido', () => {
  const sinId: PedidoParaReporte[] = [{
    id: 'x2', customerName: 'LA OCA PV', total: 300,
    products: [{ name: 'Viejo sin id', quantity: 3, price: 100 }],
  }];
  const matriz = construirMatrizPorLocal(sinId, mapa);
  const viejo = matriz.find(f => f[2] === 'Viejo sin id')!;
  assert.deepEqual(viejo.slice(0, 3), [SIN_CATEGORIA, '', 'Viejo sin id']);
});

test('un pedido sin ítems no aporta filas de producto pero sí su total', () => {
  const vacio: PedidoParaReporte[] = [{ id: 'x3', customerName: 'LA OCA PV', total: 9999, products: [] }];
  const matriz = construirMatrizPorLocal(vacio, mapa);
  assert.deepEqual(fila(matriz, 'Total Unidades'), ['Total Unidades', '', '', 0, 0]);
  assert.deepEqual(fila(matriz, 'Venta Total (del pedido)'), ['Venta Total (del pedido)', '', '', 9999, 9999]);
});

test('un pedido sin customerName se agrupa bajo Desconocido', () => {
  const anonimo: PedidoParaReporte[] = [{
    id: 'x4', total: 500,
    products: [{ productId: 'pan', name: 'Pan francés', quantity: 1, price: 500 }],
  }];
  const matriz = construirMatrizPorLocal(anonimo, mapa);
  assert.deepEqual(matriz[0], ['Categoría', 'Subcategoría', 'Producto', 'Desconocido', 'Total Unidades']);
});

test('toda fila no vacía de la matriz tiene el mismo largo que el encabezado (aoa_to_sheet es posicional)', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  const largoEncabezado = matriz[0].length;
  // Las filas espaciadoras ([]) son intencionales y quedan afuera del chequeo.
  for (const f of matriz) {
    if (f.length === 0) continue;
    assert.equal(f.length, largoEncabezado, `fila "${f[0]}" tiene ${f.length} columnas, se esperaban ${largoEncabezado}`);
  }
});

test('invariante: la suma de los subtotales de unidades por categoría coincide con Total Unidades por local', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  const header = matriz[0] as unknown[];
  const filaTotalUnidades = fila(matriz, 'Total Unidades');
  const filasSubtotal = matriz.filter(f => typeof f[0] === 'string' && (f[0] as string).endsWith('— unidades'));
  // Columnas de local: después de Categoría/Subcategoría/Producto y antes de Total Unidades.
  for (let col = 3; col < header.length - 1; col++) {
    const sumaSubtotales = filasSubtotal.reduce((s, f) => s + (Number(f[col]) || 0), 0);
    assert.equal(sumaSubtotales, filaTotalUnidades[col], `columna ${col} (${header[col]})`);
  }
});

test('invariante: la suma de los subtotales de monto por categoría coincide con Venta Total (ítems) por local', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  const header = matriz[0] as unknown[];
  const filaVentaItems = fila(matriz, 'Venta Total (ítems)');
  const filasSubtotal = matriz.filter(f => typeof f[0] === 'string' && (f[0] as string).endsWith('— monto $'));
  for (let col = 3; col < header.length - 1; col++) {
    const sumaSubtotales = filasSubtotal.reduce((s, f) => s + (Number(f[col]) || 0), 0);
    assert.equal(sumaSubtotales, filaVentaItems[col], `columna ${col} (${header[col]})`);
  }
});

import { construirDetalleVentas } from './reporteAnaliticas.ts';

test('conserva las columnas actuales, en el mismo orden, y agrega las nuevas al final', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  assert.deepEqual(Object.keys(filas[0]), [
    'Fecha Creación', 'Hora Creación', 'Fecha Entrega (Deadline)', 'ID Pedido',
    'Cliente/Local', 'Estado', 'Total ($)', 'Productos', 'Notas',
    'Distribuidora', 'Panadería', 'Total Ítems ($)', 'Diferencia ($)',
  ]);
});

test('reparte el monto del pedido entre las columnas de categoría', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  assert.equal(filas[0]['Distribuidora'], 24500);
  assert.equal(filas[0]['Panadería'], 50000);
  assert.equal(filas[0]['Total Ítems ($)'], 74500);
});

test('las columnas de categoría de una fila suman su Total Ítems', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  for (const f of filas) {
    const suma = (f['Distribuidora'] as number) + (f['Panadería'] as number);
    assert.equal(suma, f['Total Ítems ($)']);
  }
});

test('Diferencia es el total del pedido menos la suma de ítems, y 0 cuando coinciden', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  assert.equal(filas[0]['Total ($)'], 75200);
  assert.equal(filas[0]['Diferencia ($)'], 700);
  assert.equal(filas[1]['Diferencia ($)'], 0);
});

test('toda fila trae todas las columnas de categoría, con 0 donde no aplica', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  // El segundo pedido solo tiene panadería: Distribuidora tiene que existir en 0.
  assert.equal(filas[1]['Distribuidora'], 0);
  assert.deepEqual(Object.keys(filas[0]), Object.keys(filas[1]));
});

test('un pedido sin ítems deja las categorías en 0 y Diferencia igual al total del pedido', () => {
  const vacio: PedidoParaReporte[] = [{ id: 'x3', customerName: 'LA OCA PV', total: 9999 }];
  const filas = construirDetalleVentas(vacio, mapa);
  assert.equal(filas[0]['Total Ítems ($)'], 0);
  assert.equal(filas[0]['Diferencia ($)'], 9999);
  assert.equal(filas[0]['Productos'], '');
});

test('una categoría que choca con una columna existente se renombra en vez de sobreescribirla', () => {
  const mapaChocado: MapaCategorias = new Map([
    ['raro', { raiz: 'Notas', sub: '', nombre: 'Producto raro' }],
  ]);
  const unPedido: PedidoParaReporte[] = [{
    id: 'x5', customerName: 'LA OCA PV', total: 100, notes: 'la nota original',
    products: [{ productId: 'raro', name: 'Producto raro', quantity: 1, price: 100 }],
  }];
  const filas = construirDetalleVentas(unPedido, mapaChocado);
  assert.equal(filas[0]['Notas'], 'la nota original');
  assert.equal(filas[0]['Notas (categoría)'], 100);
});

test('el ID del pedido se corta a 8 caracteres, como hoy', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  assert.equal(filas[0]['ID Pedido'], 'a1b2c3d4');
});

test('una categoría llamada igual que una columna de resumen se renombra, no la sobreescribe', () => {
  const mapaChocado: MapaCategorias = new Map([
    ['raro', { raiz: 'Diferencia ($)', sub: '', nombre: 'Producto raro' }],
  ]);
  const unPedido: PedidoParaReporte[] = [{
    id: 'x6', customerName: 'LA OCA PV', total: 150,
    products: [{ productId: 'raro', name: 'Producto raro', quantity: 1, price: 100 }],
  }];
  const filas = construirDetalleVentas(unPedido, mapaChocado);
  // La columna de categoría se renombra...
  assert.equal(filas[0]['Diferencia ($) (categoría)'], 100);
  // ...y 'Diferencia ($)' sigue siendo la diferencia real: 150 - 100 = 50.
  assert.equal(filas[0]['Diferencia ($)'], 50);
});

test('Diferencia se redondea a centavos y no deja basura de floats', () => {
  // 0.1 + 0.2 = 0.30000000000000004 en floats. Precio y cantidad elegidos para
  // que el producto no sea exactamente representable.
  const unPedido: PedidoParaReporte[] = [{
    id: 'x7', customerName: 'LA OCA PV', total: 0.3,
    products: [
      { productId: 'fideos', name: 'Fideos 500g', quantity: 1, price: 0.1 },
      { productId: 'coca', name: 'Coca 500ml', quantity: 1, price: 0.2 },
    ],
  }];
  const filas = construirDetalleVentas(unPedido, mapa);
  assert.equal(filas[0]['Diferencia ($)'], 0);
});

test('cada estado tiene su etiqueta: un pedido anulado no dice Despachado', () => {
  const estados: PedidoParaReporte[] = [
    { id: 'p', status: 'pending', total: 0 },
    { id: 'i', status: 'in_progress', total: 0 },
    { id: 'c', status: 'completed', total: 0 },
    { id: 'd', status: 'dispatched', total: 0 },
    { id: 'e', status: 'delivered', total: 0 },
    { id: 'x', status: 'cancelled', total: 0 },
    { id: 'z', total: 0 },
  ];
  const filas = construirDetalleVentas(estados, mapa);
  assert.deepEqual(filas.map(f => f['Estado']), [
    'Pendiente', 'En Preparación', 'Completado', 'Despachado', 'Entregado', 'Anulado', 'Sin estado',
  ]);
});

// --- Pedidos anulados: fuera de los totales, visibles en una fila aparte ---

// Mismos dos pedidos vigentes de arriba, más uno anulado de LA OCA PV
// (10 panes = $5.000) y un local que SOLO tiene un pedido anulado.
const conAnulados: PedidoParaReporte[] = [
  ...pedidos,
  {
    id: 'anul1', customerName: 'LA OCA PV', total: 5000, status: 'cancelled',
    products: [{ productId: 'pan', name: 'Pan francés', quantity: 10, price: 500 }],
  },
  {
    id: 'anul2', customerName: 'Solo Anulados', total: 2000, status: 'cancelled',
    products: [{ productId: 'fideos', name: 'Fideos 500g', quantity: 20, price: 100 }],
  },
];

test('un pedido anulado no aporta unidades ni monto a los subtotales por categoría', () => {
  const matriz = construirMatrizPorLocal(conAnulados, mapa);
  // Panadería en LA OCA PV sigue en 100 unidades / $50.000: los 10 panes
  // anulados no entran. Las columnas ahora son LA OCA PV, Pedro Torres, Solo Anulados.
  assert.deepEqual(fila(matriz, '>> Panadería — unidades'), [
    '>> Panadería — unidades', '', '', 100, 50, 0, 150,
  ]);
  assert.deepEqual(fila(matriz, '>> Panadería — monto $'), [
    '>> Panadería — monto $', '', '', 50000, 25000, 0, 75000,
  ]);
});

test('un pedido anulado no entra en ninguno de los totales globales', () => {
  const matriz = construirMatrizPorLocal(conAnulados, mapa);
  assert.deepEqual(fila(matriz, 'Total Unidades'), ['Total Unidades', '', '', 129, 50, 0, 179]);
  assert.deepEqual(fila(matriz, 'Venta Total (ítems)'), ['Venta Total (ítems)', '', '', 74500, 25000, 0, 99500]);
  assert.deepEqual(fila(matriz, 'Venta Total (del pedido)'), ['Venta Total (del pedido)', '', '', 75200, 25000, 0, 100200]);
});

test('la fila de anulados muestra por local lo que se excluyó', () => {
  const matriz = construirMatrizPorLocal(conAnulados, mapa);
  // LA OCA PV: 10 panes = $5.000. Solo Anulados: 20 fideos = $2.000.
  assert.deepEqual(fila(matriz, 'Anulados (excluidos) $'), [
    'Anulados (excluidos) $', '', '', 5000, 0, 2000, 7000,
  ]);
});

test('un local con solo pedidos anulados igual aparece como columna', () => {
  const matriz = construirMatrizPorLocal(conAnulados, mapa);
  assert.deepEqual(matriz[0], [
    'Categoría', 'Subcategoría', 'Producto', 'LA OCA PV', 'Pedro Torres', 'Solo Anulados', 'Total Unidades',
  ]);
});

test('sin pedidos anulados la fila de excluidos sigue estando, en cero', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  assert.deepEqual(fila(matriz, 'Anulados (excluidos) $'), [
    'Anulados (excluidos) $', '', '', 0, 0, 0,
  ]);
});

test('Detalle Ventas conserva la fila del pedido anulado, etiquetada Anulado', () => {
  const filas = construirDetalleVentas(conAnulados, mapa);
  assert.equal(filas.length, 4);
  const anulado = filas.find(f => f['ID Pedido'] === 'anul1');
  assert.ok(anulado, 'el pedido anulado tiene que seguir en Detalle Ventas');
  assert.equal(anulado['Estado'], 'Anulado');
  assert.equal(anulado['Panadería'], 5000);
});

test('las dos hojas reconcilian: Detalle menos los excluidos da Venta Total (ítems)', () => {
  const matriz = construirMatrizPorLocal(conAnulados, mapa);
  const detalle = construirDetalleVentas(conAnulados, mapa);

  const totalDetalle = detalle.reduce((s, f) => s + (f['Total Ítems ($)'] as number), 0);
  const filaExcluidos = fila(matriz, 'Anulados (excluidos) $');
  const filaVentaItems = fila(matriz, 'Venta Total (ítems)');
  const excluidos = filaExcluidos[filaExcluidos.length - 1] as number;
  const ventaItems = filaVentaItems[filaVentaItems.length - 1] as number;

  assert.equal(totalDetalle - excluidos, ventaItems);
});
