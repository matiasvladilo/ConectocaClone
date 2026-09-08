// Composición de las dos etiquetas del packaging.
//
//   Etiqueta 1 (frontal): sticker de marca. Solo el logo oficial. Universal para
//                         todos los productos y SIN sellos: los sellos son por
//                         producto y esta etiqueta es la misma para todos.
//   Etiqueta 2 (posterior): la información obligatoria del producto.
//
// Todo en milímetros. Ningún tamaño está hardcodeado: se escala con el alto.

import { NUTRIENTES } from './tipos.ts';
import { ETIQUETA_NUTRIENTE, formatearParaEtiqueta } from './reglasChile.ts';
import { TAMANO_MIN_MM, anchoTexto, envolver, octogono } from './etiquetaLayout.ts';
import type { Lienzo, Primitiva } from './etiquetaLayout.ts';
import type { ResultadoEtiqueta } from './armado.ts';

export interface DatosElaborador {
  razonSocial?: string | null;
  rut?: string | null;
  direccion?: string | null;
  plantaElaboradora?: string | null;
}

export interface OpcionesEtiqueta {
  anchoMm: number;
  altoMm: number;
  /** PNG del asset oficial. Nunca se redibuja el logo. */
  logoDataUrl?: string | null;
}

// Sangrados de la tabla, igual que en el rótulo de referencia.
const SANGRADOS = new Set([
  'grasa_saturada_g',
  'grasa_monoinsaturada_g',
  'grasa_poliinsaturada_g',
  'grasas_trans_g',
  'azucares_totales_g',
]);

export function construirEtiquetaFrontal(opts: OpcionesEtiqueta): Lienzo {
  const { anchoMm, altoMm } = opts;
  const primitivas: Primitiva[] = [];
  const avisos: string[] = [];

  // El logo es circular: se usa el lado menor para que no se recorte ni se
  // deforme, y se centra.
  const lado = Math.min(anchoMm, altoMm) * 0.92;
  const x = (anchoMm - lado) / 2;
  const y = (altoMm - lado) / 2;

  if (opts.logoDataUrl) {
    primitivas.push({ tipo: 'imagen', x, y, w: lado, h: lado, dataUrl: opts.logoDataUrl });
  } else {
    // Sin el asset NO se dibuja un logo de reemplazo: se deja el recuadro vacío
    // y se avisa. Inventar el logo es exactamente lo que no hay que hacer.
    primitivas.push({ tipo: 'rect', x, y, w: lado, h: lado, grosor: 0.2 });
    primitivas.push({
      tipo: 'texto',
      x: anchoMm / 2,
      y: altoMm / 2,
      texto: 'FALTA EL LOGO',
      tamano: Math.max(TAMANO_MIN_MM, lado * 0.06),
      align: 'center',
    });
    avisos.push('No se cargó el logo oficial: la etiqueta frontal sale vacía.');
  }

  return { anchoMm, altoMm, primitivas, avisosLegibilidad: avisos };
}

export function construirEtiquetaPosterior(
  resultado: ResultadoEtiqueta,
  elaborador: DatosElaborador,
  opts: OpcionesEtiqueta,
): Lienzo {
  const { anchoMm, altoMm } = opts;
  const primitivas: Primitiva[] = [];
  const avisos: string[] = [];

  const escala = altoMm / 60; // 90x60 mm es el punto de partida
  const margen = 2.5 * escala;

  const T_TITULO = 3.0 * escala;
  const T_SECCION = 1.7 * escala;
  const T_CUERPO = 1.5 * escala;
  const T_TABLA = 1.4 * escala;

  const registrar = (tamano: number, que: string) => {
    if (tamano < TAMANO_MIN_MM) {
      avisos.push(`${que}: ${tamano.toFixed(2)} mm, por debajo del mínimo legible (${TAMANO_MIN_MM} mm).`);
    }
  };
  registrar(T_CUERPO, 'Texto de ingredientes y alérgenos');
  registrar(T_TABLA, 'Tabla nutricional');

  // Dos columnas, como el rótulo de referencia: textos a la izquierda, tabla a
  // la derecha.
  const anchoUtil = anchoMm - margen * 2;
  const colIzqW = anchoUtil * 0.46;
  const colDerX = margen + colIzqW + 2 * escala;
  const colDerW = anchoMm - margen - colDerX;

  // ── Columna izquierda ───────────────────────────────────────────────────
  let y = margen;

  const logoLado = 10 * escala;
  if (opts.logoDataUrl) {
    primitivas.push({ tipo: 'imagen', x: margen, y, w: logoLado, h: logoLado, dataUrl: opts.logoDataUrl });
  }

  // Nombre del producto al lado del logo.
  const nombreX = margen + (opts.logoDataUrl ? logoLado + 1.5 * escala : 0);
  const nombreW = colIzqW - (opts.logoDataUrl ? logoLado + 1.5 * escala : 0);
  let yNombre = y + T_TITULO;
  for (const linea of envolver(resultado.denominacion.toUpperCase(), T_TITULO, nombreW)) {
    primitivas.push({ tipo: 'texto', x: nombreX, y: yNombre, texto: linea, tamano: T_TITULO, negrita: true });
    yNombre += T_TITULO * 1.15;
  }

  y = Math.max(y + logoLado, yNombre) + 1.5 * escala;

  const bloque = (titulo: string, cuerpo: string) => {
    if (!cuerpo) return;
    primitivas.push({ tipo: 'texto', x: margen, y, texto: titulo, tamano: T_SECCION, negrita: true });
    y += T_SECCION * 1.3;
    for (const linea of envolver(cuerpo, T_CUERPO, colIzqW)) {
      primitivas.push({ tipo: 'texto', x: margen, y, texto: linea, tamano: T_CUERPO });
      y += T_CUERPO * 1.25;
    }
    y += 1.2 * escala;
  };

  bloque('INGREDIENTES:', resultado.textoIngredientes);
  bloque(
    'ALÉRGENOS:',
    [resultado.textoAlergenos, resultado.textoTrazas].filter(Boolean).join(' '),
  );

  const datosElaborador = [
    elaborador.razonSocial,
    elaborador.rut,
    elaborador.direccion,
    elaborador.plantaElaboradora,
  ]
    .filter(Boolean)
    .join(' · ');

  // ── Columna derecha: tabla nutricional ──────────────────────────────────
  let yd = margen;

  const altoCabecera = T_SECCION * 1.8;
  primitivas.push({ tipo: 'rect', x: colDerX, y: yd, w: colDerW, h: altoCabecera, relleno: true });
  primitivas.push({
    tipo: 'texto',
    x: colDerX + colDerW / 2,
    y: yd + altoCabecera * 0.68,
    texto: 'INFORMACIÓN NUTRICIONAL',
    tamano: T_SECCION,
    negrita: true,
    align: 'center',
    color: '#fff',
  });
  yd += altoCabecera + 1.2 * escala;

  const porcionTxt = `Porción: ${resultado.porcionDescripcion}${
    resultado.pesoPorcionG !== null ? ` (${formatNum(resultado.pesoPorcionG)} g)` : ''
  }`;
  primitivas.push({ tipo: 'texto', x: colDerX, y: yd, texto: porcionTxt, tamano: T_CUERPO });
  yd += T_CUERPO * 1.3;
  primitivas.push({
    tipo: 'texto',
    x: colDerX,
    y: yd,
    texto: `Porciones por envase: ${resultado.porcionesPorEnvase ?? '—'}`,
    tamano: T_CUERPO,
  });
  yd += T_CUERPO * 1.6;

  const colValor = colDerW * 0.22;
  const xCol100 = colDerX + colDerW - colValor * 2;
  const xColPorcion = colDerX + colDerW - colValor;

  primitivas.push({ tipo: 'texto', x: xCol100 + colValor * 0.9, y: yd, texto: '100 g', tamano: T_TABLA, align: 'right' });
  primitivas.push({ tipo: 'texto', x: xColPorcion + colValor * 0.9, y: yd, texto: '1 porción', tamano: T_TABLA, align: 'right' });
  yd += T_TABLA * 0.5;
  primitivas.push({ tipo: 'linea', x1: colDerX, y1: yd, x2: colDerX + colDerW, y2: yd, grosor: 0.25 });
  yd += T_TABLA * 1.25;

  const por100 = resultado.calculo.por100g;
  const porPorcion = resultado.calculo.porPorcion;

  for (const clave of NUTRIENTES) {
    const sangria = SANGRADOS.has(clave) ? 1.5 * escala : 0;
    primitivas.push({
      tipo: 'texto',
      x: colDerX + sangria,
      y: yd,
      texto: ETIQUETA_NUTRIENTE[clave],
      tamano: T_TABLA,
      negrita: sangria === 0,
    });
    primitivas.push({
      tipo: 'texto',
      x: xCol100 + colValor * 0.9,
      y: yd,
      texto: por100 ? formatearParaEtiqueta(clave, por100[clave]) : '—',
      tamano: T_TABLA,
      align: 'right',
    });
    primitivas.push({
      tipo: 'texto',
      x: xColPorcion + colValor * 0.9,
      y: yd,
      texto: porPorcion ? formatearParaEtiqueta(clave, porPorcion[clave]) : '—',
      tamano: T_TABLA,
      align: 'right',
    });
    yd += T_TABLA * 0.45;
    primitivas.push({ tipo: 'linea', x1: colDerX, y1: yd, x2: colDerX + colDerW, y2: yd, grosor: 0.1 });
    yd += T_TABLA * 1.15;
  }

  // ── Sellos ──────────────────────────────────────────────────────────────
  const sellos = resultado.sellos?.sellos || [];
  if (sellos.length > 0) {
    const disponible = colDerW;
    const ladoSello = Math.min(13 * escala, (disponible - (sellos.length - 1) * escala) / sellos.length);
    let xs = colDerX;
    yd += 1 * escala;

    for (const sello of sellos) {
      primitivas.push({ tipo: 'poligono', puntos: octogono(xs, yd, ladoSello), relleno: true });
      const lineas = sello.texto.split('\n');
      const tSello = Math.min(ladoSello * 0.145, T_TABLA);
      registrar(tSello, `Texto del sello ${sello.codigo}`);
      let ys = yd + ladoSello / 2 - ((lineas.length - 1) * tSello * 1.2) / 2 + tSello * 0.35;
      for (const linea of lineas) {
        primitivas.push({
          tipo: 'texto',
          x: xs + ladoSello / 2,
          y: ys,
          texto: linea,
          tamano: tSello,
          negrita: true,
          align: 'center',
          color: '#fff',
        });
        ys += tSello * 1.2;
      }
      xs += ladoSello + escala;
    }
    yd += ladoSello + 1 * escala;
  }

  // ── Pie: contenido neto, conservación y elaborador ──────────────────────
  let yPie = Math.max(y, yd) + 0.5 * escala;

  if (resultado.pesoFinalG !== null) {
    primitivas.push({
      tipo: 'texto',
      x: margen,
      y: yPie,
      texto: `CONT. NETO: ${formatNum(resultado.pesoFinalG)} g`,
      tamano: T_SECCION,
      negrita: true,
    });
    yPie += T_SECCION * 1.35;
  }

  if (datosElaborador) {
    for (const linea of envolver(`Elaborado por ${datosElaborador}`, T_CUERPO, anchoUtil)) {
      primitivas.push({ tipo: 'texto', x: margen, y: yPie, texto: linea, tamano: T_CUERPO });
      yPie += T_CUERPO * 1.25;
    }
  }

  // ── Marca de agua de borrador ───────────────────────────────────────────
  //
  // Va con unshift, no con push: las primitivas se dibujan en orden, así que
  // insertarla PRIMERO la deja por detrás del texto. Encima tapaba los alérgenos
  // y la fila de colesterol, y una marca de borrador que oculta información legal
  // es peor que no tenerla.
  if (resultado.veredicto.estado === 'borrador') {
    primitivas.unshift({
      tipo: 'texto',
      x: anchoMm / 2,
      y: altoMm / 2,
      texto: 'BORRADOR',
      tamano: 8 * escala,
      negrita: true,
      align: 'center',
      color: '#e0e0e0',
    });
  }

  // El contenido que se pasa del alto es contenido que no se imprime.
  if (yPie > altoMm - margen) {
    avisos.push(
      `El contenido no entra: necesita ${Math.ceil(yPie + margen)} mm de alto y la etiqueta tiene ${altoMm} mm.`,
    );
  }

  return { anchoMm, altoMm, primitivas, avisosLegibilidad: avisos };
}

function formatNum(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

export { anchoTexto };
