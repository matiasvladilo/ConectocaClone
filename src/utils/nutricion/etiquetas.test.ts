import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirEtiquetaFrontal, construirEtiquetaPosterior } from './etiquetas.ts';
import { TAMANO_MIN_MM, anchoTexto, envolver, octogono } from './etiquetaLayout.ts';
import { armarEtiqueta } from './armado.ts';
import { PESO_FINAL_G, recetaMarmolado } from './fixtures.ts';
import { nombreArchivo } from './render/renderPdf.ts';

const LOGO = 'data:image/png;base64,AAAA';

const GLUTEN = { id: '1', codigo: 'gluten_trigo', nombre: 'Trigo (gluten)', nombreEtiqueta: 'trigo (gluten)', orden: 10 };
const SOYA = { id: '4', codigo: 'soya', nombre: 'Soya', nombreEtiqueta: 'soya', orden: 40 };

const resultado = () =>
  armarEtiqueta({
    productName: 'Bizcocho Marmolado',
    lineas: recetaMarmolado().map((l, i) =>
      i === 0 ? { ...l, contiene: [GLUTEN], trazas: [SOYA] } : l,
    ),
    perfil: {
      pesoFinalPromedioG: PESO_FINAL_G,
      pesoPorcionG: 160,
      porcionesPorEnvase: 1,
      porcionDescripcion: '1 unidad',
    },
    elaborador: 'La Oca SpA',
  });

const elaborador = { razonSocial: 'La Oca SpA', rut: '76.123.456-7', direccion: 'Santiago' };

// ── Utilidades de layout ──────────────────────────────────────────────────

test('el ancho de texto crece con el tamaño de fuente', () => {
  assert.ok(anchoTexto('hola', 4) > anchoTexto('hola', 2));
  assert.equal(anchoTexto('', 3), 0);
});

test('las letras angostas miden menos que las anchas', () => {
  assert.ok(anchoTexto('iii', 3) < anchoTexto('mmm', 3));
});

test('envolver corta en palabras y no parte palabras al medio', () => {
  const lineas = envolver('uno dos tres cuatro cinco seis', 2, 12);
  assert.ok(lineas.length > 1);
  assert.equal(lineas.join(' '), 'uno dos tres cuatro cinco seis');
});

test('una palabra más ancha que la línea igual se emite, no se pierde', () => {
  const lineas = envolver('supercalifragilisticoexpialidoso', 3, 5);
  assert.deepEqual(lineas, ['supercalifragilisticoexpialidoso']);
});

test('envolver con texto vacío no devuelve una línea vacía', () => {
  assert.deepEqual(envolver('', 2, 50), []);
  assert.deepEqual(envolver('   ', 2, 50), []);
});

test('el octógono tiene 8 vértices dentro del cuadrado', () => {
  const pts = octogono(10, 20, 8);
  assert.equal(pts.length, 8);
  for (const [x, y] of pts) {
    assert.ok(x >= 10 && x <= 18, `x fuera: ${x}`);
    assert.ok(y >= 20 && y <= 28, `y fuera: ${y}`);
  }
});

// ── Etiqueta frontal ──────────────────────────────────────────────────────

test('la etiqueta frontal es solo el logo, centrado y sin deformar', () => {
  const l = construirEtiquetaFrontal({ anchoMm: 50, altoMm: 50, logoDataUrl: LOGO });
  const img = l.primitivas.find((p) => p.tipo === 'imagen');
  assert.ok(img && img.tipo === 'imagen');
  if (img.tipo === 'imagen') assert.equal(img.w, img.h); // circular: no se estira
  assert.deepEqual(l.avisosLegibilidad, []);
});

test('en una etiqueta rectangular el logo usa el lado menor', () => {
  const l = construirEtiquetaFrontal({ anchoMm: 90, altoMm: 40, logoDataUrl: LOGO });
  const img = l.primitivas.find((p) => p.tipo === 'imagen');
  if (img?.tipo === 'imagen') {
    assert.ok(img.w <= 40);
    assert.equal(img.w, img.h);
  }
});

test('sin logo NO se dibuja un reemplazo: se avisa', () => {
  const l = construirEtiquetaFrontal({ anchoMm: 50, altoMm: 50, logoDataUrl: null });
  assert.equal(l.primitivas.some((p) => p.tipo === 'imagen'), false);
  assert.ok(l.avisosLegibilidad.some((a) => /logo/i.test(a)));
});

test('la etiqueta frontal no lleva sellos: es universal para todos los productos', () => {
  const l = construirEtiquetaFrontal({ anchoMm: 50, altoMm: 50, logoDataUrl: LOGO });
  assert.equal(l.primitivas.some((p) => p.tipo === 'poligono'), false);
});

// ── Etiqueta posterior ────────────────────────────────────────────────────

test('respeta las dimensiones físicas pedidas', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 90, altoMm: 60 });
  assert.equal(l.anchoMm, 90);
  assert.equal(l.altoMm, 60);
});

test('imprime los 11 nutrientes con sus dos columnas', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 100, altoMm: 80 });
  const textos = l.primitivas.filter((p) => p.tipo === 'texto').map((p) => (p.tipo === 'texto' ? p.texto : ''));
  for (const rotulo of ['Energía (kcal)', 'Sodio (mg)', 'Colesterol (mg)', 'Azúcares totales (g)']) {
    assert.ok(textos.includes(rotulo), `falta ${rotulo}`);
  }
  assert.ok(textos.includes('100 g'));
  assert.ok(textos.includes('1 porción'));
});

test('dibuja un octógono por cada sello que corresponde', () => {
  const r = resultado();
  const l = construirEtiquetaPosterior(r, elaborador, { anchoMm: 100, altoMm: 80 });
  const poligonos = l.primitivas.filter((p) => p.tipo === 'poligono');
  assert.equal(poligonos.length, r.sellos!.sellos.length);
  assert.equal(poligonos.length, 3);
});

test('sin sellos no dibuja octógonos', () => {
  const r = resultado();
  r.sellos!.sellos = [];
  const l = construirEtiquetaPosterior(r, elaborador, { anchoMm: 100, altoMm: 80 });
  assert.equal(l.primitivas.filter((p) => p.tipo === 'poligono').length, 0);
});

test('incluye ingredientes, alérgenos, contenido neto y elaborador', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 100, altoMm: 110 });
  const todo = l.primitivas.filter((p) => p.tipo === 'texto').map((p) => (p.tipo === 'texto' ? p.texto : '')).join(' ');
  assert.match(todo, /INGREDIENTES:/);
  assert.match(todo, /ALÉRGENOS:/);
  assert.match(todo, /CONT\. NETO: 160 g/);
  assert.match(todo, /La Oca SpA/);
});

test('un borrador sale marcado en la etiqueta', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 90, altoMm: 60 });
  const todo = l.primitivas.filter((p) => p.tipo === 'texto').map((p) => (p.tipo === 'texto' ? p.texto : '')).join(' ');
  // Con REDONDEO_CONFIRMADO en false, todo es borrador y tiene que verse.
  assert.match(todo, /BORRADOR/);
});

test('avisa cuando el contenido no entra en el alto pedido', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 90, altoMm: 25 });
  assert.ok(l.avisosLegibilidad.some((a) => /no entra/i.test(a)));
});

test('avisa cuando el texto queda por debajo del mínimo legible', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 40, altoMm: 25 });
  assert.ok(l.avisosLegibilidad.some((a) => new RegExp(String(TAMANO_MIN_MM)).test(a)));
});

test('en un tamaño holgado no hay avisos', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 120, altoMm: 120 });
  assert.deepEqual(l.avisosLegibilidad, []);
});

test('el tamaño no está hardcodeado: todo escala con el alto', () => {
  const chica = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 90, altoMm: 60 });
  const grande = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 180, altoMm: 120 });

  const t = (l: typeof chica) => {
    const p = l.primitivas.find((x) => x.tipo === 'texto' && x.texto === 'Energía (kcal)');
    return p && p.tipo === 'texto' ? p.tamano : 0;
  };
  assert.ok(t(grande) > t(chica));
  assert.ok(Math.abs(t(grande) / t(chica) - 2) < 0.01); // el doble de alto, el doble de fuente
});

test('ninguna primitiva se sale del ancho de la etiqueta', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 100, altoMm: 90 });
  for (const p of l.primitivas) {
    if (p.tipo === 'rect') assert.ok(p.x + p.w <= 100.01, `rect se pasa: ${p.x + p.w}`);
    if (p.tipo === 'linea') assert.ok(p.x2 <= 100.01, `línea se pasa: ${p.x2}`);
    if (p.tipo === 'poligono') for (const [x] of p.puntos) assert.ok(x <= 100.01, `sello se pasa: ${x}`);
  }
});

// ── Nombre de archivo ─────────────────────────────────────────────────────

test('el nombre de archivo sale limpio de tildes y espacios', () => {
  assert.equal(nombreArchivo('Bizcocho Marmolado', 'etiqueta', 'pdf'), 'bizcocho-marmolado-etiqueta.pdf');
  assert.equal(nombreArchivo('Empanada Camarón Queso', 'etiqueta', 'png'), 'empanada-camaron-queso-etiqueta.png');
});

test('una denominación vacía no produce un nombre roto', () => {
  assert.equal(nombreArchivo('', 'etiqueta', 'pdf'), 'etiqueta-etiqueta.pdf');
  assert.equal(nombreArchivo('!!!', 'frontal', 'pdf'), 'etiqueta-frontal.pdf');
});
