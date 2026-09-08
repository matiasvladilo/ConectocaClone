// Primitivas → Canvas2D → PNG. Solo para previsualizar y descargar el PNG.
// El PDF es el entregable de impresión; este renderer existe para que se pueda
// mirar la etiqueta sin abrir un visor de PDF.

import type { Lienzo, Primitiva } from '../etiquetaLayout.ts';

const MM_A_PT = 72 / 25.4;

/**
 * @param dpi Puntos por pulgada del PNG. 300 es calidad de impresión; para
 *            previsualizar en pantalla alcanza bastante menos.
 */
export function renderizarCanvas(lienzo: Lienzo, dpi = 300): HTMLCanvasElement {
  const pxPorMm = dpi / 25.4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(lienzo.anchoMm * pxPorMm);
  canvas.height = Math.round(lienzo.altoMm * pxPorMm);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto 2D');

  // Fondo blanco explícito: un canvas arranca transparente y al exportar a PNG
  // el texto negro sobre transparente se ve bien en pantalla pero sale sobre
  // fondo indefinido al imprimirlo.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Se trabaja en mm: una sola escala y el resto del código no vuelve a pensar
  // en píxeles.
  ctx.scale(pxPorMm, pxPorMm);
  ctx.textBaseline = 'alphabetic';

  for (const p of lienzo.primitivas) dibujar(ctx, p);

  return canvas;
}

function dibujar(ctx: CanvasRenderingContext2D, p: Primitiva) {
  switch (p.tipo) {
    case 'texto': {
      ctx.fillStyle = p.color || '#000';
      // El tamaño va en mm porque el contexto ya está escalado a mm.
      ctx.font = `${p.negrita ? 'bold ' : ''}${p.tamano}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = p.align || 'left';
      ctx.fillText(p.texto, p.x, p.y);
      break;
    }
    case 'linea': {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = p.grosor;
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
      break;
    }
    case 'rect': {
      if (p.relleno) {
        ctx.fillStyle = '#000';
        ctx.fillRect(p.x, p.y, p.w, p.h);
      } else {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = p.grosor || 0.2;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      }
      break;
    }
    case 'poligono': {
      ctx.beginPath();
      p.puntos.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      if (p.relleno) {
        ctx.fillStyle = '#000';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = p.grosor ?? 0.2;
        ctx.stroke();
      }
      break;
    }
    case 'imagen': {
      // Las imágenes se precargan antes de llamar acá (ver precargarImagenes):
      // drawImage con una imagen a medio cargar dibuja un hueco en silencio.
      const img = imagenesCargadas.get(p.dataUrl);
      if (img) ctx.drawImage(img, p.x, p.y, p.w, p.h);
      break;
    }
  }
}

const imagenesCargadas = new Map<string, HTMLImageElement>();

/** Hay que llamarla y esperarla ANTES de renderizar si el lienzo tiene imágenes. */
export async function precargarImagenes(lienzo: Lienzo): Promise<void> {
  const urls = lienzo.primitivas
    .filter((p): p is Extract<Primitiva, { tipo: 'imagen' }> => p.tipo === 'imagen')
    .map((p) => p.dataUrl);

  await Promise.all(
    [...new Set(urls)].map(
      (url) =>
        new Promise<void>((resolve) => {
          if (imagenesCargadas.has(url)) return resolve();
          const img = new Image();
          // Una imagen que no carga no puede tumbar la generación entera: se
          // resuelve igual y el dibujo simplemente omite esa primitiva.
          img.onload = () => {
            imagenesCargadas.set(url, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  );
}

export function canvasAPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export { MM_A_PT };
