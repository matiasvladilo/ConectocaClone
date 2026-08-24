import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componerNombre, partesVacias, UNIDADES_PRESENTACION } from './productName.ts';

const partes = (over: Partial<typeof partesVacias>) => ({ ...partesVacias, ...over });

test('arma marca + presentacion + unidades', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Coca Cola', cantidad: '591', unidad: 'ml', unidades: '6' })),
    'Coca Cola 591ml 6 unidades',
  );
});

// Un "1 unidad" en cada producto suelto es ruido en todas las listas de la app.
test('omite las unidades cuando es 1', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Coca Cola', cantidad: '591', unidad: 'ml', unidades: '1' })),
    'Coca Cola 591ml',
  );
});

test('omite las unidades cuando esta vacio', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Coca Cola', cantidad: '591', unidad: 'ml' })),
    'Coca Cola 591ml',
  );
});

test('sin presentacion queda solo la marca', () => {
  assert.equal(componerNombre(partes({ marca: 'Pan hallulla' })), 'Pan hallulla');
});

// Un numero sin unidad ("Coca Cola 591") es ambiguo: se ignora entero.
test('ignora la cantidad si no hay unidad', () => {
  assert.equal(componerNombre(partes({ marca: 'Coca Cola', cantidad: '591' })), 'Coca Cola');
});

test('unidad "otro" usa el texto libre', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Servilletas', cantidad: '3', unidad: 'otro', unidadOtro: 'pack' })),
    'Servilletas 3pack',
  );
});

test('normaliza espacios de la marca', () => {
  assert.equal(componerNombre(partes({ marca: '  Coca   Cola  ' })), 'Coca Cola');
});

test('sin marca devuelve cadena vacia', () => {
  assert.equal(componerNombre(partesVacias), '');
});

test('kg y decimales funcionan', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Arroz Tucapel', cantidad: '1', unidad: 'kg', unidades: '12' })),
    'Arroz Tucapel 1kg 12 unidades',
  );
});

// No se ofrece 'cc': tener ml y cc como opciones distintas para lo mismo
// reintroduce la inconsistencia que este formulario viene a eliminar.
test('la lista de unidades es cerrada y no incluye cc', () => {
  const valores = UNIDADES_PRESENTACION.map(u => u.value);
  assert.deepEqual(valores, ['ml', 'L', 'g', 'kg', 'un', 'otro']);
});
