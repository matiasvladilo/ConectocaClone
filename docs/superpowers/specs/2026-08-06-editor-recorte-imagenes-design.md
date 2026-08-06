# Editor de Recorte de Imágenes al Subir Foto — Diseño

**Fecha:** 2026-08-06

## Problema

Las fotos de producto se suben tal cual salen de la cámara del celular, sin que el usuario pueda elegir qué parte se ve ni corregir la orientación. Esto produce dos síntomas distintos, confirmados con casos reales del catálogo:

1. **Recorte forzado y feo:** dos lugares de la app meten la foto en una caja de proporción fija con `object-cover`, que recorta el centro sin preguntar. En el modal de "Editar producto" desde Nuevo Pedido (`w-full h-40`, una caja panorámica) esto es especialmente grave: una foto vertical queda reducida a una tira horizontal angosta y agrandada. *(Este síntoma puntual ya se corrigió aparte, cambiando a `object-contain` con altura intrínseca en [`ImageUpload.tsx`](../../../src/components/ImageUpload.tsx) y [`NewOrderForm.tsx`](../../../src/components/NewOrderForm.tsx) — sigue documentado acá porque es parte del mismo problema de fondo y el editor de recorte lo vuelve a tocar.)*
2. **Orientación que depende de quién la mire:** los celulares no siempre graban los píxeles "derechos" — guardan una etiqueta EXIF que le dice al visor cómo rotar. Caso real confirmado: la foto de "Trencito" (chocolate horizontal) fue tomada con el celular girado a propósito para encuadrar el producto, pero la etiqueta EXIF quedó marcando "rotar 90°". Un visor que respeta esa etiqueta ciegamente rota una foto que ya estaba bien encuadrada, y el resultado se ve de costado. No es un error al subir — es que la corrección automática de orientación adivina mal para fotos intencionalmente horizontales.

El común denominador: el sistema decide por el usuario en vez de dejarlo elegir. La solución no es "adivinar mejor" — es darle al usuario una vista previa del marco donde va a aparecer la foto y dejarlo mover/hacer zoom/rotar hasta que quede como él quiere, antes de guardar.

### Alcance

- **En alcance:** un editor de recorte que se abre apenas se elige o se saca una foto nueva, en los dos lugares donde hoy se sube/cambia la imagen de un producto: el formulario de Gestión de Productos ([`ImageUpload.tsx`](../../../src/components/ImageUpload.tsx)) y el modal de editar producto desde Nuevo Pedido ([`NewOrderForm.tsx`](../../../src/components/NewOrderForm.tsx)).
- **Fuera de alcance:** volver a recortar una foto que ya está guardada sin elegir una nueva (no hay botón "re-encuadrar" sobre una imagen existente). Corregir a mano las fotos que ya quedaron mal en el catálogo (como Trencito) — hay que volver a subirlas con el editor nuevo.
- **Fuera de alcance:** proporción fija o preseteada. Cada foto puede terminar con la forma que el usuario elija — no hay un cuadrado o rectángulo único para todo el catálogo.

## Enfoque elegido

**Un cuadro de diálogo reutilizable con un marco de tamaño fijo (la forma de la foto elegida) sobre el que el usuario arrastra y hace zoom a la imagen por debajo — el mismo patrón que Instagram o WhatsApp usan para recortar una foto — más un botón para rotar 90° cuando la orientación viene mal.**

Enfoques descartados:

- **Corregir la orientación EXIF automáticamente al subir (sin editor):** era la primera idea, pero el caso de Trencito la invalida — la corrección automática asume que "derecho" siempre significa portrait, y para fotos intencionalmente horizontales eso rota mal. Cualquier corrección automática ciega tiene el mismo problema. Se descarta a favor de que decida el usuario.
- **Rectángulo de recorte redimensionable a mano (arrastrar las esquinas, estilo editor de fotos de escritorio):** dan más control teórico, pero son más incómodos con el dedo en un celular chico, y el usuario pidió explícitamente el patrón de "marco fijo, mover y hacer zoom la imagen adentro" (confirmado en la conversación de diseño). Se descarta por UX en mobile.
- **`react-cropper` (wrapper de Cropper.js):** sin publicar desde abril de 2023 (~3 años). Mismo motivo de descarte que `html5-qrcode` en la feature de SKU: no está mantenida.

Se usa **`react-easy-crop`** (publicada el mes pasado, mantenimiento activo, 281KB sin comprimir, una sola dependencia chica). Implementa exactamente el patrón de marco fijo + pan + zoom, con rotación controlada de forma nativa (prop `rotation`), así que el botón de rotar no requiere matemática aparte — la librería ya sabe rotar tanto la vista previa como el recorte final.

**Sobre la forma del marco:** en vez de una proporción fija global, el marco arranca con la proporción natural de la foto elegida (ancho/alto reales, tomados de `onMediaLoaded`). Así una bolsa vertical arranca con marco vertical, un chocolate horizontal arranca con marco horizontal — sin que el usuario tenga que elegir un formato de una lista. El usuario puede rotar 90° si la foto vino con la orientación adivinada mal (caso Trencito), lo que intercambia ancho y alto del marco.

## Diseño

### Componente 1 — `ImageCropDialog` (componente nuevo)

Archivo nuevo: `src/components/ImageCropDialog.tsx`

Una sola responsabilidad: **mostrar el editor de recorte sobre una foto y devolver el resultado final ya recortado.** No sabe nada de productos ni de subida a Supabase — eso lo maneja quien lo usa.

```ts
interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;               // la foto recién elegida/sacada, sin subir todavía
  onCropComplete: (result: File) => void;  // se llama una vez, con la imagen final recortada
  title?: string;                   // default: 'Encuadrar foto del producto'
}
```

Comportamiento:

- Al abrirse con un `file` nuevo, genera un `URL.createObjectURL(file)` y lo pasa al `<Cropper>` de `react-easy-crop`. Libera ese object URL (`URL.revokeObjectURL`) al cerrarse o cambiar de archivo, para no dejar memoria colgada.
- Estado controlado: `crop` (posición), `zoom`, `rotation` (0/90/180/270), `aspect` (arranca en `1` y se recalcula a `naturalWidth/naturalHeight` — o `naturalHeight/naturalWidth` si `rotation` es 90/270 — apenas `onMediaLoaded` informa el tamaño real de la imagen).
- Controles visibles: el área de recorte de la librería (ocupa la mayor parte del diálogo), un control de zoom (slider, más el gesto de pellizcar en touch, que la librería ya maneja sola), y dos botones "Rotar" (90° a la izquierda / a la derecha).
- Botón "Usar esta foto": ejecuta `getCroppedImg` (helper propio, ver abajo) con la posición/zoom/rotación actuales, arma un `File` a partir del `Blob` resultante, llama a `onCropComplete(file)` y cierra el diálogo.
- Botón "Cancelar": cierra sin llamar a `onCropComplete`.

Helper de recorte (`src/utils/cropImage.ts`, archivo nuevo — es lógica de canvas pura, sin JSX, así que va aparte del componente):

```ts
// src/utils/cropImage.ts
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
```

Notas sobre la API usada (verificada contra los tipos de `react-easy-crop@6.2.3`):

- El componente se importa como **default export**: `import Cropper from 'react-easy-crop'`.
- `onCropComplete?: (croppedArea: Area, croppedAreaPixels: Area) => void` — el segundo argumento (`croppedAreaPixels`) es el que hay que guardar en estado; es el que se le pasa a `getCroppedImageFile`.
- `rotation: number` y `onRotationChange` son props nativas de la librería — el pan/zoom/rotación de la vista previa ya los maneja ella sola, incluyendo el gesto de pellizcar en touch.
- Siempre se sube **JPEG** (`image/jpeg`) independientemente del formato original (PNG, HEIC convertido por el navegador, etc.) — simplifica el pipeline y da compresión consistente. Aceptable porque son fotos de producto, no imágenes que necesiten transparencia.

### Componente 2 — Integración en `ImageUpload.tsx`

- Nuevo estado: `pendingFile: File | null` y `cropDialogOpen: boolean`.
- `handleFileSelect` (tanto el input de "Tomar Foto" como el de "Cargar Imagen", que ya comparten el mismo handler) deja de llamar a `uploadImage(file)` directo. En su lugar: valida tipo/tamaño igual que ahora, guarda el archivo en `pendingFile` y abre el diálogo (`setCropDialogOpen(true)`).
- `<ImageCropDialog>` se monta condicionalmente (`{cropDialogOpen && <Suspense>...}`, mismo patrón de carga diferida que `BarcodeScannerDialog` — la librería de recorte tampoco hace falta en la carga inicial de la pantalla). Su `onCropComplete` recibe el `File` ya recortado y ahí sí llama a `uploadImage(croppedFile)` (la función existente, sin cambios — sigue subiendo a Supabase Storage y devolviendo la URL firmada).
- Los inputs ocultos (`fileInputRef`, `cameraInputRef`) resetean su `value` al elegir un archivo (ya lo hacen), así que volver a elegir el mismo archivo dos veces sigue disparando `onChange`.

### Componente 3 — Integración en `NewOrderForm.tsx`

Este modal de edición **no usa el mismo pipeline que `ImageUpload.tsx` hoy**: `handleImageFileChange` (línea ~360) lee el archivo con `FileReader.readAsDataURL` y guarda el resultado como texto base64 directo en `editForm.image`, sin pasar por el endpoint de subida — es un camino distinto y más viejo, que termina guardando el base64 completo en la columna `image_url` de la base.

**Decisión de diseño:** al integrar el editor de recorte acá, se unifica este camino con el de `ImageUpload.tsx` — el resultado recortado se sube al mismo endpoint (`POST /upload-product-image`) y se guarda la URL firmada, en vez de un base64 gigante. Es un cambio de comportamiento además del recorte, pero corrige una inconsistencia real (dos formas distintas de guardar la imagen de un producto según por dónde se edite) y es necesario de todas formas: el helper de recorte ya produce un `File` mediante `canvas.toBlob`, así que subirlo por el endpoint existente es más simple que volver a codificarlo a base64.

- Mismo patrón: `handleImageFileChange` guarda el archivo elegido y abre `ImageCropDialog` en vez de leerlo directo.
- `onCropComplete` recibe el `File` recortado y lo sube al mismo endpoint que usa `ImageUpload` (`POST /upload-product-image`, vía `fetch` directo, igual que hace `ImageUpload.tsx` hoy). `NewOrderForm` ya recibe `accessToken` como prop (línea 51), así que no hace falta agregar nada a su firma. Recién con la URL que devuelve el servidor se actualiza `imagePreview` y `editForm.image`.
- El estado `imageFile` (que hoy se guarda pero no parece usarse para nada más que marcar "hay un archivo nuevo") se puede simplificar u omitir si el nuevo flujo ya no lo necesita — se revisa en la implementación.

## Testing

Sin framework de tests en el proyecto — verificación manual en navegador, con evidencia:

1. Elegir "Tomar Foto" o "Cargar Imagen" con una foto vertical → se abre el editor con marco vertical, se puede mover y hacer zoom, "Usar esta foto" sube el resultado recortado.
2. Repetir con una foto horizontal (como Trencito) → marco horizontal por defecto.
3. Botón rotar 90° → el marco intercambia ancho/alto, la imagen rota, se puede seguir moviendo/haciendo zoom después de rotar.
4. Cancelar el editor → no se sube nada, no queda ningún estado a medias.
5. El archivo final resulta más liviano que el original (confirmar tamaño antes/después) y no supera ~1600px en su lado más largo.
6. Repetir los 5 pasos anteriores en el modal de "Editar producto" desde Nuevo Pedido.
7. Verificar que el resultado se guarda como URL de Supabase Storage (no como base64) en ambos lugares.
8. Probar en un celular real: pellizcar para zoom, arrastrar con el dedo, que no haya lag perceptible con una foto de cámara a resolución completa.

## Riesgos / notas

- **`ctx.getImageData`/`putImageData` requiere que el canvas no esté "contaminado".** Como la imagen siempre se carga desde un `URL.createObjectURL` de un archivo local (nunca desde una URL remota de otro origen), no hay problema de CORS acá — pero si en el futuro se quisiera permitir "re-encuadrar una foto ya subida" (fuera de alcance de esta vuelta), habría que revisar los headers CORS del bucket de Supabase Storage antes.
- **`react-easy-crop` no se carga en la pantalla principal** — se importa con `React.lazy` igual que `BarcodeScannerDialog`, así que no pesa en la carga inicial de Gestión de Productos ni de Nuevo Pedido.
- **Las fotos que ya están mal orientadas en el catálogo (Trencito, etc.) no se corrigen solas.** Quedan como están hasta que alguien las vuelva a subir con el editor nuevo.
- **Siempre se convierte a JPEG.** Si en algún momento se necesitara transparencia (por ejemplo, logos con fondo transparente), este pipeline la aplana a blanco/negro según el canvas — no es el caso de uso actual (fotos de producto), pero vale dejarlo anotado.
