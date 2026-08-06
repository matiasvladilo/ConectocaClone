# Editor de Recorte de Imágenes al Subir Foto — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda encuadrar (mover, hacer zoom, rotar) la foto de un producto antes de guardarla, en vez de que el sistema decida el recorte por él.

**Architecture:** Un componente reutilizable `ImageCropDialog` basado en `react-easy-crop` (marco fijo con la proporción de la foto, pan + zoom + rotación nativos de la librería) más un helper de canvas puro (`cropImage.ts`) que convierte la selección en un `File` final ya recortado, comprimido y con la rotación "horneada" en los píxeles. Se integra en los dos lugares donde hoy se sube/cambia la foto de un producto: `ImageUpload.tsx` (Gestión de Productos) y el modal de editar producto de `NewOrderForm.tsx` — este último además se unifica para subir a Supabase Storage en vez de guardar base64 directo en la base.

**Tech Stack:** React 18 + TypeScript + Vite · Tailwind + Radix UI (`components/ui/*`) · motion/react · sonner (toasts) · Canvas API · `react-easy-crop` (nueva)

**Spec:** [`docs/superpowers/specs/2026-08-06-editor-recorte-imagenes-design.md`](../specs/2026-08-06-editor-recorte-imagenes-design.md)

## Global Constraints

- **Este proyecto NO tiene framework de tests.** `package.json` solo define `dev` y `build`. La verificación de cada tarea es: typecheck + prueba en navegador con evidencia concreta.
- **Comando de typecheck:** `npx tsc --noEmit 2>&1 | grep -v "_redirects"` → salida esperada **vacía**. Hay 4 errores preexistentes en `src/_redirects/` y `src/public/_redirects/` (artefactos de Figma) que ese grep filtra. Cualquier otra línea es un error tuyo.
- **Servidor de desarrollo:** usar `preview_start` con el nombre `vite` (definido en `.claude/launch.json`, puerto 3000). Nunca levantar el server con Bash.
- **Versión exacta de la dependencia nueva:** `react-easy-crop@6.2.3`.
- **Idioma: español rioplatense** en toda la interfaz, comentarios y mensajes de commit.
- **Siempre se sube JPEG** (`image/jpeg`, calidad 0.85) independientemente del formato original — simplifica el pipeline, aceptable para fotos de producto.
- **El resultado final no supera 1600px** en su lado más largo (`MAX_OUTPUT_DIMENSION` en el helper de recorte).
- **`ImageCropDialog` se carga con `React.lazy`** y se renderiza **condicionalmente** (`{estaAbierto && <Suspense>...}`), no solo con `open={estado}` — mismo patrón que `BarcodeScannerDialog`, para que la librería no entre en el bundle inicial.

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/utils/cropImage.ts` | Lógica de canvas pura: recorta + rota + comprime una imagen a partir de la selección del usuario | Crear |
| `src/components/ImageCropDialog.tsx` | Diálogo reutilizable: marco fijo, pan/zoom/rotación, botones de acción | Crear |
| `src/components/ImageUpload.tsx` | Intercepta la selección de archivo para abrir el editor antes de subir | Modificar |
| `src/components/NewOrderForm.tsx` | Igual que arriba, más unificación del pipeline de subida (sube a Supabase en vez de guardar base64) | Modificar |

---

### Task 1: Helper de recorte (`cropImage.ts`)

**Files:**
- Create: `src/utils/cropImage.ts`

**Interfaces:**
- Consumes: nada (primera tarea, es lógica pura sin dependencias del resto del proyecto).
- Produces: función exportada `getCroppedImageFile`, consumida por la Task 2:

```ts
export interface CroppedAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: CroppedAreaPixels,
  rotationDeg: number,
  fileName: string
): Promise<File>
```

- [ ] **Step 1: Instalar la dependencia**

```bash
npm install react-easy-crop@6.2.3
```

Verificar: Run `npm ls react-easy-crop` → Expected: `react-easy-crop@6.2.3` sin errores de peer dependency (solo requiere `react`/`react-dom`, que el proyecto ya tiene).

- [ ] **Step 2: Crear el helper**

Crear `src/utils/cropImage.ts`:

```ts
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

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 4: Verificar la lógica en la consola del navegador**

Este paso no necesita UI todavía — se puede probar el helper de forma aislada. Con el preview corriendo (`preview_start` con `vite`), abrir la consola del navegador (DevTools) en cualquier pantalla de la app y pegar:

```js
const mod = await import('/src/utils/cropImage.ts');
// Crear una imagen de prueba de 200x100 (roja) como object URL
const canvas = document.createElement('canvas');
canvas.width = 200; canvas.height = 100;
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 200, 100);
const testBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
const testUrl = URL.createObjectURL(testBlob);

// Recortar sin rotar: debería dar un File de 100x50
const f1 = await mod.getCroppedImageFile(testUrl, { x: 0, y: 0, width: 100, height: 50 }, 0, 'test.png');
console.log('sin rotar:', f1.type, f1.size, 'bytes');

// Recortar con 90°: el bounding box rotado de 200x100 es 100x200,
// así que un recorte de 50x100 en esas coordenadas debe seguir dando un File válido
const f2 = await mod.getCroppedImageFile(testUrl, { x: 0, y: 0, width: 50, height: 100 }, 90, 'test.png');
console.log('rotado 90:', f2.type, f2.size, 'bytes');
```

Expected: ambos `console.log` muestran `image/jpeg` y un tamaño en bytes mayor a 0 (no `undefined`, sin excepciones en la consola).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/utils/cropImage.ts
git commit -m "feat: helper de recorte/rotacion/compresion de imagenes por canvas"
```

---

### Task 2: Componente `ImageCropDialog`

**Files:**
- Create: `src/components/ImageCropDialog.tsx`

**Interfaces:**
- Consumes: `getCroppedImageFile` de `src/utils/cropImage.ts` (Task 1).
- Produces: componente exportado `ImageCropDialog`, consumido por las tareas 3 y 4, con esta firma exacta:

```ts
interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onCropComplete: (result: File) => void;
  title?: string; // default: 'Encuadrar foto del producto'
}
```

- [ ] **Step 1: Crear el componente**

Crear `src/components/ImageCropDialog.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { RotateCcw, RotateCw, ZoomIn } from 'lucide-react';
import { getCroppedImageFile } from '../utils/cropImage';
import { toast } from 'sonner';

interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onCropComplete: (result: File) => void;
  title?: string;
}

export function ImageCropDialog({
  open,
  onOpenChange,
  file,
  onCropComplete,
  title = 'Encuadrar foto del producto',
}: ImageCropDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  // El marco arranca con la proporción de la foto (no una relación fija global).
  // 1 es solo el valor inicial antes de que onMediaLoaded informe el tamaño real.
  const [aspect, setAspect] = useState(1);
  const [saving, setSaving] = useState(false);
  const croppedAreaPixelsRef = useRef<Area | null>(null);

  // Genera un object URL por cada archivo nuevo y lo libera al desmontar o
  // cambiar de archivo, para no dejar memoria colgada.
  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    // Resetear el editor para el archivo nuevo.
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspect(1);
    croppedAreaPixelsRef.current = null;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleMediaLoaded = useCallback((mediaSize: { naturalWidth: number; naturalHeight: number }) => {
    // Marco = proporción real de la foto. Si la rotación actual es de 90/270,
    // ancho y alto lógicos están intercambiados respecto a la imagen fuente.
    const isSideways = rotation === 90 || rotation === 270;
    const w = isSideways ? mediaSize.naturalHeight : mediaSize.naturalWidth;
    const h = isSideways ? mediaSize.naturalWidth : mediaSize.naturalHeight;
    setAspect(w / h);
  }, [rotation]);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    croppedAreaPixelsRef.current = croppedAreaPixels;
  }, []);

  const handleRotate = (direction: 1 | -1) => {
    setRotation((prev) => {
      const next = (prev + direction * 90 + 360) % 360;
      return next;
    });
    // Intercambiar el marco también, para que el pan/zoom siga teniendo sentido
    // apenas se gira (sin esperar a un recálculo de onMediaLoaded, que no se
    // vuelve a disparar al rotar).
    setAspect((prev) => 1 / prev);
  };

  const handleConfirm = async () => {
    if (!file || !imageUrl || !croppedAreaPixelsRef.current) return;
    try {
      setSaving(true);
      const result = await getCroppedImageFile(imageUrl, croppedAreaPixelsRef.current, rotation, file.name);
      onCropComplete(result);
      onOpenChange(false);
    } catch (err) {
      console.error('[ImageCropDialog] Error al recortar la imagen:', err);
      toast.error('No se pudo procesar la imagen. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Arrastrá y hacé zoom para encuadrar la foto. Usá los botones para rotarla si hace falta.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full h-72 bg-gray-900 rounded-lg overflow-hidden">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={handleCropComplete}
              onMediaLoaded={handleMediaLoaded}
            />
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <ZoomIn className="w-4 h-4 text-gray-500 shrink-0" />
          <Slider
            value={[zoom]}
            onValueChange={([z]) => setZoom(z)}
            min={1}
            max={3}
            step={0.01}
            className="flex-1"
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => handleRotate(-1)} aria-label="Rotar a la izquierda">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => handleRotate(1)} aria-label="Rotar a la derecha">
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            style={{ background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)', color: 'white' }}
          >
            {saving ? 'Procesando...' : 'Usar esta foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Notas sobre la API usada (verificada contra los tipos de `react-easy-crop@6.2.3`):
- `Cropper` es el **default export** del paquete: `import Cropper from 'react-easy-crop'`. El tipo `Area` se importa aparte como named export.
- `onCropComplete?: (croppedArea: Area, croppedAreaPixels: Area) => void` — el **segundo** argumento es el que hay que guardar (son coordenadas en píxeles reales de la imagen, no porcentajes).
- `rotation`/`onRotationChange` son props nativas: la librería ya rota la vista previa sola, `handleRotate` solo actualiza el estado.
- `aspect` es un prop **requerido** (no opcional) en el tipo — por eso siempre se inicializa en `1` antes de que `onMediaLoaded` informe el tamaño real.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageCropDialog.tsx
git commit -m "feat: dialogo de recorte de imagenes con pan zoom y rotacion"
```

---

### Task 3: Integración en `ImageUpload.tsx`

**Files:**
- Modify: `src/components/ImageUpload.tsx` (import ~línea 1; `handleFileSelect` ~línea 76; JSX final ~línea 187)

**Interfaces:**
- Consumes: `ImageCropDialog` (Task 2).
- Produces: nada nuevo — mismo contrato externo del componente (`value`, `onChange`, `label`, `accessToken`).

- [ ] **Step 1: Agregar los imports**

En `src/components/ImageUpload.tsx`, cambiar la primera línea para sumar `lazy` y `Suspense`:

```ts
import { useState, useRef, lazy, Suspense } from 'react';
```

Debajo del import de `projectId` (~línea 7), agregar el import diferido:

```ts
import { projectId } from '../utils/supabase/info';

// Carga diferida: react-easy-crop no hace falta hasta que alguien elige una
// foto nueva. Con import estático entraría en el bundle inicial del formulario
// de producto para todo el mundo, incluso quien nunca sube una imagen.
const ImageCropDialog = lazy(() =>
  import('./ImageCropDialog').then((m) => ({ default: m.ImageCropDialog }))
);
```

- [ ] **Step 2: Agregar el estado del editor**

Junto a los `useState` existentes (~línea 17-20):

```ts
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>(value || '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Interceptar la selección de archivo**

Reemplazar `handleFileSelect` (~línea 76-81) por:

```ts
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Misma validación que hacía uploadImage, pero antes de abrir el editor
    // (no tiene sentido dejar recortar un archivo que se va a rechazar después).
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 5MB');
      return;
    }

    setPendingFile(file);
    setCropDialogOpen(true);
  };

  const handleCropComplete = (croppedFile: File) => {
    uploadImage(croppedFile);
  };
```

- [ ] **Step 4: Montar el diálogo**

Al final del JSX, justo antes del `</div>` de cierre del componente (~línea 188, después del `</AnimatePresence>`), agregar:

```tsx
      </AnimatePresence>

      {/* Editor de recorte: se renderiza solo mientras está abierto para que la
          carga diferida sirva de algo (el chunk de react-easy-crop se baja
          recién al elegir una foto). */}
      {cropDialogOpen && (
        <Suspense fallback={null}>
          <ImageCropDialog
            open
            onOpenChange={setCropDialogOpen}
            file={pendingFile}
            onCropComplete={handleCropComplete}
            title="Encuadrar imagen del producto"
          />
        </Suspense>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 6: Verificar en el navegador**

Levantar el preview, iniciar sesión, ir a **Gestión de Productos** → "Nuevo Producto" → sección "Imagen del Producto":

1. **Cargar Imagen** con una foto vertical → se abre el editor con marco vertical, la imagen se puede arrastrar y el slider de zoom funciona.
2. Botones de rotar (izquierda/derecha) → la imagen y el marco rotan.
3. **Usar esta foto** → el editor se cierra, aparece "Subiendo..." y después la vista previa recortada, con toast "Imagen subida exitosamente".
4. **Cancelar** en el editor → no se sube nada, no queda ningún estado colgado (se puede volver a intentar).
5. Repetir con **Tomar Foto** (si hay cámara disponible en el entorno de prueba).
6. Confirmar en la consola del navegador que no hay errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/ImageUpload.tsx
git commit -m "feat: abrir editor de recorte antes de subir la imagen del producto"
```

---

### Task 4: Integración y unificación en `NewOrderForm.tsx`

**Files:**
- Modify: `src/components/NewOrderForm.tsx` (imports ~línea 1 y ~línea 38; `handleImageFileChange` ~línea 360; JSX del modal ~línea 1128)

**Interfaces:**
- Consumes: `ImageCropDialog` (Task 2), endpoint `POST /upload-product-image` (ya existe, usado hoy por `ImageUpload.tsx`).
- Produces: entregable final de la feature. Este modal deja de guardar base64 y pasa a subir a Supabase Storage, igual que `ImageUpload.tsx`.

- [ ] **Step 1: Agregar los imports**

Cambiar la primera línea del archivo para sumar `lazy` y `Suspense`:

```ts
import { useState, useEffect, lazy, Suspense } from 'react';
```

Debajo del import de `formatCLP` (~línea 41), agregar:

```ts
import { formatCLP } from '../utils/format';
import { projectId } from '../utils/supabase/info';

// Carga diferida, mismo motivo que en ImageUpload.tsx: no hace falta en la
// carga inicial de Nuevo Pedido.
const ImageCropDialog = lazy(() =>
  import('./ImageCropDialog').then((m) => ({ default: m.ImageCropDialog }))
);
```

- [ ] **Step 2: Agregar el estado del editor**

Junto a `imageFile`/`imagePreview` (~línea 93-94):

```ts
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
```

- [ ] **Step 3: Reemplazar `handleImageFileChange` e implementar la subida**

Reemplazar la función completa (~línea 360-373):

```ts
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 5MB');
      return;
    }

    setImageFile(file);
    setCropDialogOpen(true);
  };

  const handleCropComplete = async (croppedFile: File) => {
    try {
      setUploadingImage(true);

      const formData = new FormData();
      formData.append('file', croppedFile);

      // Mismo endpoint que usa ImageUpload.tsx — unifica el pipeline de subida
      // en vez de guardar la imagen como base64 directo en editForm.image.
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/upload-product-image`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al subir la imagen');
      }

      const data = await response.json();
      if (!data.url) throw new Error('No se recibió la URL de la imagen');

      setImagePreview(data.url);
      setEditForm((prev) => ({ ...prev, image: data.url }));
      toast.success('Imagen subida exitosamente');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error(error.message || 'Error al subir la imagen');
    } finally {
      setUploadingImage(false);
    }
  };
```

`setEditForm` usa la forma funcional (`prev => ...`) a propósito: el callback del editor de recorte se dispara fuera del ciclo de render normal del formulario, así que leer `editForm` directo podría pisar cambios hechos en otros campos mientras el diálogo estaba abierto.

- [ ] **Step 4: Montar el diálogo y mostrar el estado de subida**

Dentro del `<Dialog>` de "Edit Product Modal", después del bloque de imagen existente (justo antes del comentario `{/* Name */}`, ~línea 1224), agregar:

```tsx
              </div>
            </div>

            {/* Editor de recorte: se renderiza solo mientras está abierto. */}
            {cropDialogOpen && (
              <Suspense fallback={null}>
                <ImageCropDialog
                  open
                  onOpenChange={setCropDialogOpen}
                  file={imageFile}
                  onCropComplete={handleCropComplete}
                  title="Encuadrar imagen del producto"
                />
              </Suspense>
            )}

            {/* Name */}
```

En el botón "Subir Imagen" y en el botón "Tomar Foto" (~líneas 1165-1173 y 1185-1193), agregar `disabled={uploadingImage}` a ambos `<Button>` para que no se pueda disparar una segunda subida mientras la primera está en curso:

```tsx
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => document.getElementById('image-upload')?.click()}
                    disabled={uploadingImage}
                  >
                    <Upload className="w-4 h-4" />
                    {uploadingImage ? 'Subiendo...' : 'Subir Imagen'}
                  </Button>
```

```tsx
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => document.getElementById('camera-capture')?.click()}
                    disabled={uploadingImage}
                  >
                    <Camera className="w-4 h-4" />
                    {uploadingImage ? 'Subiendo...' : 'Tomar Foto'}
                  </Button>
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 6: Verificar en el navegador**

Con el preview corriendo, ir a **Nuevo Pedido**, hacer clic en un producto existente para editarlo (o el ícono de editar de la tarjeta):

1. **Subir Imagen** con una foto → se abre el editor, mismo comportamiento que en Gestión de Productos (arrastrar, zoom, rotar).
2. **Usar esta foto** → mientras sube, los botones quedan deshabilitados y dicen "Subiendo...", después aparece la vista previa y el toast de éxito.
3. Guardar el producto y volver a abrir su edición → la imagen persiste (se guardó la URL de Supabase, no un base64 gigante).
4. **Verificar la unificación**: abrir las herramientas de red (Network) del navegador durante el paso 2 y confirmar que hay un request a `upload-product-image` (no que la imagen viaje directo en el `PUT` del producto como texto base64).
5. Cancelar el editor → no se sube nada.
6. Confirmar en la consola que no hay errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/NewOrderForm.tsx
git commit -m "feat: editor de recorte y subida unificada en editar producto desde pedido"
```

---

## Cierre

- [ ] **Verificación final antes de desplegar**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"` → sin salida.
Run: `npm run build` → termina sin errores.

Confirmar que la carga diferida funciona (mismo chequeo que se hizo para el escáner de códigos de barras):

```bash
npm run build
grep -o 'assets/[^"]*\.js' build/index.html
```

Anotar el nombre del bundle principal (el que imprime ese segundo comando). Después:

```bash
grep -rl "ReactEasyCrop\|onMediaLoaded" build/assets/*.js
```

Esperado: el archivo que aparece **no** es el bundle principal anotado arriba — debe ser un chunk separado (compartido con `ImageCropDialog` o propio de `react-easy-crop`). Si coincide con el bundle principal, revisar que el renderizado del diálogo sea condicional (`{cropDialogOpen && ...}`) en ambos puntos de integración, no solo `open={cropDialogOpen}`.

- [ ] **Desplegar**

```bash
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev
```

Esta feature es puramente frontend — no requiere migración de base de datos ni redeploy de la Edge Function.

- [ ] **Verificar en producción**

En `https://conectocadev.netlify.app`: subir una foto vertical y una horizontal en Gestión de Productos, confirmar que el marco se adapta a cada una, probar el botón de rotar, y repetir en el modal de editar producto desde Nuevo Pedido. Probar desde un celular real (pellizcar para zoom, arrastrar con el dedo).
