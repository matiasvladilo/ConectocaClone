// Helper estándar de react-easy-crop para convertir la selección de recorte
// (posición + zoom + rotación) en un archivo final. La rotación se aplica
// dibujando sobre un canvas rotado antes de extraer el recorte, por eso el
// canvas intermedio usa el tamaño del "bounding box" rotado y no el tamaño
// original de la imagen.

export interface CroppedAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_OUTPUT_DIMENSION = 1600; // evita subir fotos de celular a resolución completa (4000px+)
const OUTPUT_QUALITY = 0.85;

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (err) => reject(err));
    image.src = url;
  });
}

function getRadianAngle(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function rotatedBoundingBox(width: number, height: number, rotationDeg: number) {
  const rotRad = getRadianAngle(rotationDeg);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: CroppedAreaPixels,
  rotationDeg: number,
  fileName: string
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto de canvas');

  const rotRad = getRadianAngle(rotationDeg);
  const { width: boxW, height: boxH } = rotatedBoundingBox(image.width, image.height, rotationDeg);

  // Paso 1: dibujar la imagen completa, rotada, en un canvas del tamaño de su
  // bounding box rotado (para que nada quede cortado por la rotación).
  canvas.width = boxW;
  canvas.height = boxH;
  ctx.translate(boxW / 2, boxH / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  // Paso 2: extraer solo el rectángulo que el usuario recortó (coordenadas
  // relativas a ese bounding box rotado, que es lo que devuelve la librería).
  const cropped = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.putImageData(cropped, 0, 0);

  // Paso 3: si el recorte final supera el máximo, reescalar hacia abajo
  // manteniendo proporción — evita subir fotos de celular a resolución completa.
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(pixelCrop.width, pixelCrop.height));
  let finalCanvas = canvas;
  if (scale < 1) {
    finalCanvas = document.createElement('canvas');
    finalCanvas.width = Math.round(pixelCrop.width * scale);
    finalCanvas.height = Math.round(pixelCrop.height * scale);
    const finalCtx = finalCanvas.getContext('2d');
    if (!finalCtx) throw new Error('No se pudo crear el contexto de canvas');
    finalCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    finalCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('El canvas quedó vacío'))),
      'image/jpeg',
      OUTPUT_QUALITY
    );
  });

  return new File([blob], fileName.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}
