// Primitivas → jsPDF. Este es el entregable de impresión.
//
// jsPDF dibuja en mm nativamente, así que las primitivas se pasan casi tal cual.
// El texto sale VECTORIAL: se puede escalar y sigue nítido, a diferencia de una
// captura de pantalla.

import { jsPDF } from 'jspdf';
import type { Lienzo, Primitiva } from '../etiquetaLayout.ts';

// jsPDF mide las fuentes en puntos; el layout está en milímetros.
const MM_A_PT = 72 / 25.4;

export function renderizarPdf(lienzo: Lienzo): jsPDF {
  // El formato se declara en mm reales: el PDF sale con el tamaño físico exacto,
  // no "una hoja A4 con la etiqueta en una esquina".
  const doc = new jsPDF({
    orientation: lienzo.anchoMm >= lienzo.altoMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [lienzo.anchoMm, lienzo.altoMm],
    compress: true,
  });

  doc.setFont('helvetica', 'normal');

  for (const p of lienzo.primitivas) dibujar(doc, p);

  return doc;
}

function dibujar(doc: jsPDF, p: Primitiva) {
  switch (p.tipo) {
    case 'texto': {
      doc.setFont('helvetica', p.negrita ? 'bold' : 'normal');
      doc.setFontSize(p.tamano * MM_A_PT);
      doc.setTextColor(p.color || '#000000');
      doc.text(p.texto, p.x, p.y, { align: p.align || 'left' });
      break;
    }
    case 'linea': {
      doc.setDrawColor(0);
      doc.setLineWidth(p.grosor);
      doc.line(p.x1, p.y1, p.x2, p.y2);
      break;
    }
    case 'rect': {
      if (p.relleno) {
        doc.setFillColor(0);
        doc.rect(p.x, p.y, p.w, p.h, 'F');
      } else {
        doc.setDrawColor(0);
        doc.setLineWidth(p.grosor || 0.2);
        doc.rect(p.x, p.y, p.w, p.h, 'S');
      }
      break;
    }
    case 'poligono': {
      // jsPDF no tiene un "polygon" absoluto: `lines` toma un punto de partida y
      // después DELTAS entre vértices, no coordenadas absolutas.
      const [inicio, ...resto] = p.puntos;
      const deltas: Array<[number, number]> = [];
      let [px, py] = inicio;
      for (const [x, y] of resto) {
        deltas.push([x - px, y - py]);
        px = x;
        py = y;
      }
      deltas.push([inicio[0] - px, inicio[1] - py]); // cierre
      if (p.relleno) doc.setFillColor(0);
      doc.setDrawColor(0);
      doc.setLineWidth(p.grosor ?? 0.2);
      doc.lines(deltas, inicio[0], inicio[1], [1, 1], p.relleno ? 'F' : 'S', true);
      break;
    }
    case 'imagen': {
      // El data URL ya está en memoria: addImage no necesita esperar red.
      doc.addImage(p.dataUrl, 'PNG', p.x, p.y, p.w, p.h);
      break;
    }
  }
}

export function descargarPdf(doc: jsPDF, nombreArchivo: string) {
  doc.save(nombreArchivo);
}

/** "Bizcocho Marmolado" → "bizcocho-marmolado-etiqueta.pdf" */
export function nombreArchivo(denominacion: string, sufijo: string, extension: string): string {
  const base = denominacion
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // saca las tildes que NFD dejó sueltas
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'etiqueta'}-${sufijo}.${extension}`;
}
