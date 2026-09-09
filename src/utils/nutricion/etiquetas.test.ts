import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirEtiquetaFrontal, construirEtiquetaPosterior } from './etiquetas.ts';
import { TAMANO_MIN_MM, ajustarAlAncho, anchoTexto, envolver, octogono } from './etiquetaLayout.ts';
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

test('usa las métricas reales de Helvetica, no un promedio', () => {
  // Anchos AFM: M=833, i=222 sobre 1000 unidades. A 10 mm de cuerpo son 8,33 y
  // 2,22 mm. Con el promedio de 0,55 que había antes ambos daban 5,5.
  assert.ok(Math.abs(anchoTexto('M', 10) - 8.33) < 0.001);
  assert.ok(Math.abs(anchoTexto('i', 10) - 2.22) < 0.001);
});

test('la negrita mide más que la regular', () => {
  // Es lo que hacía que "PRODUCTO PRUEBA" se montara sobre la tabla: se medía
  // como si fuera regular.
  assert.ok(anchoTexto('PRODUCTO PRUEBA', 4, true) > anchoTexto('PRODUCTO PRUEBA', 4, false));
});

test('las tildes no cambian el ancho: en Helvetica miden igual que la letra base', () => {
  assert.equal(anchoTexto('AZUCARES', 4, true), anchoTexto('AZÚCARES', 4, true));
  assert.equal(anchoTexto('nino', 3), anchoTexto('niño', 3));
});

test('ajustarAlAncho no toca el cuerpo si el texto ya entra', () => {
  const holgado = ajustarAlAncho('PRODUCTO PRUEBA', 4, 60, 2, 1.5, true);
  assert.equal(holgado.tamano, 4);
  assert.deepEqual(holgado.lineas, ['PRODUCTO PRUEBA']);
});

test('ajustarAlAncho corta en varias líneas antes que achicar', () => {
  // Con dos palabras y 2 líneas permitidas alcanza con envolver: el cuerpo
  // queda intacto.
  const r = ajustarAlAncho('PRODUCTO PRUEBA', 4, 12, 2, 1.5, true);
  assert.equal(r.tamano, 4);
  assert.deepEqual(r.lineas, ['PRODUCTO', 'PRUEBA']);
});

test('ajustarAlAncho achica cuando no puede cortar más', () => {
  // Cuatro palabras en 2 líneas: envolver solo no alcanza, tiene que bajar cuerpo.
  const r = ajustarAlAncho('TORTA DE MIL HOJAS ARTESANAL', 4, 20, 2, 1.5, true);
  assert.ok(r.tamano < 4, `esperaba achicar, quedó en ${r.tamano}`);
  assert.ok(r.lineas.length <= 2, `quedaron ${r.lineas.length} líneas`);
});

test('ajustarAlAncho nunca baja del mínimo aunque no entre', () => {
  const r = ajustarAlAncho('SUPERCALIFRAGILISTICOEXPIALIDOSO', 4, 3, 1, 1.5, true);
  assert.ok(r.tamano >= 1.5);
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

test('cada sello son dos octógonos: contorno exterior y relleno', () => {
  const r = resultado();
  const l = construirEtiquetaPosterior(r, elaborador, { anchoMm: 100, altoMm: 80 });
  const poligonos = l.primitivas.filter((p) => p.tipo === 'poligono');

  assert.equal(r.sellos!.sellos.length, 3);
  assert.equal(poligonos.length, 6); // 2 por sello

  const contornos = poligonos.filter((p) => p.tipo === 'poligono' && !p.relleno);
  const rellenos = poligonos.filter((p) => p.tipo === 'poligono' && p.relleno);
  assert.equal(contornos.length, 3);
  assert.equal(rellenos.length, 3);
});

test('el relleno del sello queda por dentro del contorno', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 100, altoMm: 80 });
  const poligonos = l.primitivas.filter((p) => p.tipo === 'poligono');
  const contorno = poligonos[0];
  const relleno = poligonos[1];
  if (contorno.tipo !== 'poligono' || relleno.tipo !== 'poligono') throw new Error('tipo inesperado');

  const xs = (p: typeof contorno) => p.puntos.map(([x]) => x);
  assert.ok(Math.min(...xs(relleno)) > Math.min(...xs(contorno)));
  assert.ok(Math.max(...xs(relleno)) < Math.max(...xs(contorno)));
});

test('el sello lleva "Ministerio de Salud", como el arte oficial', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 100, altoMm: 80 });
  const textos = l.primitivas.filter((p) => p.tipo === 'texto').map((p) => (p.tipo === 'texto' ? p.texto : ''));
  assert.equal(textos.filter((t) => t === 'Ministerio').length, 3);
  assert.equal(textos.filter((t) => t === 'de Salud').length, 3);
});

test('el texto del sello va en blanco sobre el octógono negro', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 100, altoMm: 80 });
  const alto = l.primitivas.find((p) => p.tipo === 'texto' && p.texto === 'ALTO EN');
  assert.ok(alto && alto.tipo === 'texto');
  if (alto.tipo === 'texto') {
    assert.equal(alto.color, '#fff');
    assert.equal(alto.negrita, true);
    assert.equal(alto.align, 'center');
  }
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
  // El tamaño de fuente escala con el alto, así que achicar la etiqueta sola no
  // desborda: la etiqueta es autosemejante. Lo que sí desborda es un texto largo,
  // que es el caso real —un producto con muchos ingredientes—.
  const listaLarga = Array.from({ length: 40 }, (_, i) => `ingrediente numero ${i}`).join(', ');
  const r = armarEtiqueta({
    productName: 'Bizcocho Marmolado',
    lineas: recetaMarmolado(),
    perfil: {
      pesoFinalPromedioG: PESO_FINAL_G, pesoPorcionG: 160, porcionesPorEnvase: 1,
      porcionDescripcion: '1 unidad', ingredientesTextoOverride: listaLarga,
    },
    elaborador: 'La Oca SpA',
  });

  const l = construirEtiquetaPosterior(r, elaborador, { anchoMm: 90, altoMm: 60 });
  assert.ok(l.avisosLegibilidad.some((a) => /no entra/i.test(a)), 'esperaba aviso de desborde');
});

test('el texto no se pega al logo ni se le monta encima', () => {
  // El logo se posiciona por su borde SUPERIOR y el texto por su LÍNEA BASE.
  // Sumar un hueco y dibujar texto ahí hacía que el texto subiera por encima del
  // hueco: "INGREDIENTES:" quedaba pegado al logo.
  const l = construirEtiquetaPosterior(resultado(), elaborador, {
    anchoMm: 90, altoMm: 60, logoDataUrl: LOGO,
  });

  const logo = l.primitivas.find((p) => p.tipo === 'imagen');
  const titulo = l.primitivas.find((p) => p.tipo === 'texto' && p.texto === 'INGREDIENTES:');
  if (logo?.tipo !== 'imagen' || titulo?.tipo !== 'texto') throw new Error('falta logo o título');

  const fondoLogo = logo.y + logo.h;
  const topeTexto = titulo.y - titulo.tamano; // la base menos el alto = borde superior

  assert.ok(topeTexto > fondoLogo, `el texto arranca en ${topeTexto} y el logo termina en ${fondoLogo}`);
  assert.ok(topeTexto - fondoLogo >= 1.5, `solo ${(topeTexto - fondoLogo).toFixed(2)} mm de aire`);
});

test('hay aire entre el bloque de ingredientes y el de alérgenos', () => {
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 90, altoMm: 60, logoDataUrl: LOGO });
  const textos = l.primitivas.filter((p) => p.tipo === 'texto');

  const alergenos = textos.find((p) => p.tipo === 'texto' && p.texto === 'ALÉRGENOS:');
  if (alergenos?.tipo !== 'texto') throw new Error('falta ALÉRGENOS');

  // La última línea de cuerpo antes del título de alérgenos.
  const previas = textos.filter(
    (p) => p.tipo === 'texto' && p.y < alergenos.y && p.x === alergenos.x,
  );
  const ultima = previas[previas.length - 1];
  if (ultima?.tipo !== 'texto') throw new Error('no hay texto previo');

  const aire = (alergenos.y - alergenos.tamano) - ultima.y;
  assert.ok(aire >= 1, `solo ${aire.toFixed(2)} mm entre bloques`);
});

test('la etiqueta de referencia entra en 90x60 sin avisos', () => {
  // Es la regresión del pie: cuando esperaba a las DOS columnas se iba 2 mm
  // abajo mientras la izquierda tenía un hueco vacío.
  const l = construirEtiquetaPosterior(resultado(), elaborador, { anchoMm: 90, altoMm: 60 });
  assert.deepEqual(l.avisosLegibilidad, []);
});

test('el nombre largo se parte en líneas y no invade la columna de la tabla', () => {
  // CON logo: es el caso que fallaba. El logo le come 11,5 mm a la columna
  // izquierda y "PRODUCTO PRUEBA" ya no entra en una línea. Sin logo entra
  // holgado, así que un test sin logo no probaría nada.
  const r = resultado();
  r.denominacion = 'PRODUCTO PRUEBA';
  const l = construirEtiquetaPosterior(r, elaborador, { anchoMm: 90, altoMm: 60, logoDataUrl: LOGO });

  const lineasNombre = l.primitivas.filter(
    (p) => p.tipo === 'texto' && /^(PRODUCTO|PRUEBA)$/.test(p.texto),
  );
  assert.equal(lineasNombre.length, 2, 'el nombre deberia partirse en dos lineas');

  // Ninguna línea del nombre puede pisar el inicio de la columna derecha.
  const cabecera = l.primitivas.find((p) => p.tipo === 'texto' && p.texto === 'INFORMACIÓN NUTRICIONAL');
  if (cabecera?.tipo !== 'texto') throw new Error('falta la cabecera');
  for (const linea of lineasNombre) {
    if (linea.tipo !== 'texto') continue;
    const derecha = linea.x + anchoTexto(linea.texto, linea.tamano, true);
    assert.ok(derecha < cabecera.x, `"${linea.texto}" llega a ${derecha} y la tabla arranca antes`);
  }
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
