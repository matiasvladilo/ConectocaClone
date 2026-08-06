# SKU / Código de Barras en Productos — Diseño

**Fecha:** 2026-08-06

## Problema

Con la incorporación de la línea de distribución al catálogo, los productos ahora tienen códigos de barras impresos de fábrica (EAN-13 y similares). Hoy el sistema no tiene dónde guardarlos: `products` solo identifica por nombre, y la búsqueda en Gestión de Productos matchea nombre, descripción y categoría ([`ProductManagement.tsx:318-326`](../../../src/components/ProductManagement.tsx)).

Esto obliga a buscar productos tipeando el nombre, que es lento y propenso a error cuando el catálogo crece. El personal necesita poder identificar un producto escaneando su código, con dos herramientas distintas:

- **Pistola lectora de códigos de barras** (hardware USB/Bluetooth) en el mostrador o depósito.
- **Cámara del celular**, para quien no tiene la pistola a mano.

### Alcance

- **En alcance:** campo SKU en el producto (crear/editar), búsqueda por SKU y escaneo por cámara — todo dentro de **Gestión de Productos**.
- **Fuera de alcance:** búsqueda/escaneo por SKU en Nuevo Pedido (`NewOrderForm.tsx`). Se decidió dejarlo para una iteración posterior. El componente de escaneo se diseña reutilizable para que agregarlo ahí después sea trivial.
- **Fuera de alcance:** el SKU es un campo de todos los productos, no exclusivo de la categoría de distribución. No se agrega lógica condicional por categoría.

## Enfoque elegido

**Una columna `sku` en `products` con índice único parcial por negocio, más un componente de escaneo reutilizable basado en ZXing.**

Sobre la pistola lectora: **no requiere integración alguna**. Estos dispositivos se presentan al sistema operativo como un teclado (HID) — al disparar, "tipean" el código y suelen enviar Enter. Con el cursor puesto en el campo de búsqueda o en el campo SKU del formulario, el flujo ya funciona. Esto es una propiedad del hardware, no una feature a construir.

Enfoques descartados para el escaneo por cámara:

- **`BarcodeDetector` nativo del navegador:** cero dependencias y muy rápido, pero **no existe en Safari/iOS**. Como el requerimiento es explícitamente "que se pueda leer por el celular", dejaría afuera a todos los usuarios de iPhone. Descartado como solución única (podría sumarse después como fast-path en Android).
- **`html5-qrcode`:** era la opción propuesta inicialmente por su UI lista para usar, pero al verificarla su última publicación es de **abril de 2023** (~3 años sin mantenimiento). Además inyecta su propia interfaz, que no combina con el diseño del resto de la app. Descartada.

Se usa **`@zxing/browser` + `@zxing/library`** (publicados en julio y abril de 2026 respectivamente, mantenimiento activo). ZXing es la implementación de referencia, funciona en Safari/iOS y decodifica los formatos de retail relevantes. Se monta sobre un `<video>` propio dentro de un `Dialog` del design system existente, así el modal queda visualmente consistente con el resto de la app.

## Diseño

### Componente 1 — Migración de base de datos

Archivo nuevo: `supabase/migrations/20260806_add_product_sku.sql`

```sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku text;

CREATE UNIQUE INDEX IF NOT EXISTS products_business_sku_unique
  ON products (business_id, sku)
  WHERE sku IS NOT NULL AND sku <> '';
```

Decisiones:

- **`text` y nullable:** el SKU es opcional. Los productos existentes quedan con `NULL` y siguen funcionando sin cambios.
- **Índice único parcial:** la unicidad aplica dentro de un mismo negocio (dos negocios distintos pueden tener el mismo EAN, que es lo correcto: el EAN identifica al producto del fabricante, no al del negocio). La cláusula `WHERE` permite que muchos productos convivan sin SKU — sin ella, múltiples `''` colisionarían.
- **`text` y no `numeric`:** los códigos EAN pueden empezar con cero y superan la precisión de un entero. Guardarlos como número los corrompería.

Normalización: el SKU se guarda **trimmeado**, y vacío se convierte a `NULL` (no a `''`), para que el índice parcial se comporte de forma predecible.

### Componente 2 — Backend (`supabase/functions/make-server-6d979413/index.ts`)

**`toProduct` (~línea 75):** agregar `sku: r.sku || ''` al objeto devuelto. Se normaliza a string vacío hacia el cliente para que los formularios no tengan que lidiar con `null`.

**`POST /products` (~línea 663):** aceptar `sku` en el body. Antes de insertar, si viene un SKU no vacío, verificar duplicado siguiendo el patrón ya usado para áreas de producción (~líneas 1834-1843):

```
const skuNorm = (sku || '').trim();
si skuNorm no está vacío:
  contar products donde business_id = profile.businessId y sku = skuNorm
  si count > 0: return 400 { error: 'Ya existe un producto con el SKU "<skuNorm>"' }
insertar con sku: skuNorm || null
```

**`PUT /products/:id` (~línea 733):** misma validación, excluyendo el propio producto (`.neq('id', productId)`), para que editar un producto sin cambiarle el SKU no choque contra sí mismo. Agregar `if (sku !== undefined) updateData.sku = skuNorm || null;`.

**Manejo del caso de carrera:** el pre-chequeo es una consulta separada del insert, así que dos requests simultáneos podrían pasar ambos. El índice único de la DB es la garantía real; ante un error de Postgres con código `23505` en el insert/update, devolver el mismo 400 con el mensaje de SKU duplicado en lugar del 500 genérico. El pre-chequeo existe para dar un mensaje claro en el caso normal; el índice cubre el caso raro.

### Componente 3 — Tipos del cliente (`src/utils/api.tsx`)

Agregar `sku?: string;` a la interface `Product` (~línea 40). No hay cambios en las funciones de `productsAPI`: ya pasan el objeto de datos completo al backend, así que el campo viaja solo.

### Componente 4 — `BarcodeScannerDialog` (componente nuevo)

Archivo nuevo: `src/components/BarcodeScannerDialog.tsx`

Una sola responsabilidad: **abrir la cámara, leer un código y devolverlo**. No sabe nada de productos ni de búsqueda.

```ts
interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;   // se llama una vez, con el código leído
  title?: string;                    // ej: "Escanear código del producto"
}
```

Comportamiento:

- Al abrirse, pide la cámara con `facingMode: 'environment'` (cámara trasera, que es la que se usa para escanear).
- Muestra el video en vivo dentro de un `Dialog`, con un marco guía superpuesto.
- Al decodificar un código: dispara `onScan(code)`, detiene la cámara y cierra el diálogo. **Un escaneo por apertura** — sin lecturas repetidas ni acumulación de callbacks.
- Al cerrarse (por escaneo, por Cancelar o por desmontaje), **libera el stream de la cámara**. Un `MediaStream` sin detener deja la luz de la cámara encendida y consume batería; el `useEffect` de limpieza debe llamar a `stop()` sobre el `IScannerControls` que devuelve `decodeFromConstraints`. (Verificado contra los tipos de `@zxing/browser@0.2.1`: el método es `controls.stop()`, no el `reader.reset()` de la API anterior.)

Formatos habilitados (vía `DecodeHintType.POSSIBLE_FORMATS`): `EAN_13`, `EAN_8`, `UPC_A`, `UPC_E`, `CODE_128`, `CODE_39`, `ITF`. Restringir la lista acelera la decodificación y reduce falsos positivos frente a intentar todos los formatos. Se excluye QR a propósito: acá se escanean códigos de barras de producto.

Errores contemplados, cada uno con su mensaje dentro del diálogo (no un toast genérico):

| Caso | Mensaje |
|---|---|
| Permiso denegado (`NotAllowedError`) | "Necesitamos permiso para usar la cámara. Habilitalo en los ajustes del navegador." |
| Sin cámara disponible (`NotFoundError`) | "No se encontró ninguna cámara en este dispositivo." |
| Contexto inseguro (sin HTTPS) | "El escaneo requiere una conexión segura (HTTPS)." |
| Otro error | "No se pudo iniciar la cámara." |

Sobre HTTPS: `getUserMedia` solo funciona en contextos seguros. Producción está en Netlify (HTTPS) y `localhost` cuenta como seguro, así que ambos entornos funcionan. El caso a cubrir es el acceso por IP de red local (ej. `http://192.168.x.x:3000`) al probar desde el celular, donde el navegador bloquea la cámara — de ahí el mensaje explícito en vez de un fallo silencioso.

### Componente 5 — Gestión de Productos (`src/components/ProductManagement.tsx`)

**a) Campo SKU en el formulario** (dentro del `<form>`, después del nombre, ~línea 782):

- Agregar `sku: string` a `ProductFormData` y a `emptyForm`.
- `handleOpenDialog` lo carga desde `product.sku || ''`; `handleSubmit` lo manda trimmeado dentro de `productData`.
- Campo etiquetado **"SKU / Código de barras"** con la aclaración de que es opcional, ícono `Barcode` a la izquierda y botón de cámara a la derecha que abre el `BarcodeScannerDialog` y escribe el resultado en el campo.
- El input tiene `inputMode="numeric"` — en celular abre el teclado numérico, que es lo cómodo para tipear un EAN a mano, sin impedir códigos alfanuméricos (Code 39/128).

**b) Búsqueda por SKU** (`filteredProducts`, ~línea 318):

```ts
const q = searchQuery.trim().toLowerCase();
const matchesSearch = !q ||
  p.name.toLowerCase().includes(q) ||
  p.description?.toLowerCase().includes(q) ||
  p.category?.toLowerCase().includes(q) ||
  p.sku?.toLowerCase().includes(q);
```

Actualizar el placeholder a `"Buscar por nombre, SKU, descripción o categoría..."`.

**c) Botón de cámara en la barra de búsqueda** (~línea 536): ícono de cámara a la derecha del input que abre el `BarcodeScannerDialog`; el código escaneado se escribe en `searchQuery` y la grilla filtra sola.

**d) SKU visible en la tarjeta del producto** (~línea 672): mostrarlo bajo el nombre, en tipografía monoespaciada y tamaño chico, solo si existe. Sin esto, un usuario que busca por SKU no tiene forma de confirmar que el resultado es el correcto.

Ambos botones de cámara (búsqueda y formulario) usan el **mismo** `BarcodeScannerDialog` con distinto `onScan` y distinto título. Cada uno controla su propio estado de apertura, para que abrir uno no afecte al otro.

## Testing

Este proyecto no tiene suite de tests automatizados, así que la verificación es manual y en navegador, con evidencia:

**Base de datos y backend**
1. Crear producto con SKU → se guarda y vuelve en el `GET /products`.
2. Crear un segundo producto con el **mismo** SKU → error 400 con mensaje claro, no un 500.
3. Editar un producto sin tocar su SKU → guarda bien (no choca contra sí mismo).
4. Crear dos productos **sin** SKU → ambos se guardan (el índice parcial no los bloquea).
5. Vaciar el SKU de un producto que tenía uno → queda `NULL`, y ese SKU se puede reutilizar en otro producto.

**Búsqueda**
6. Tipear un SKU completo en el buscador → filtra al producto correcto.
7. Tipear un fragmento del SKU → matchea (búsqueda por substring, consistente con los otros campos).
8. Verificar que la búsqueda por nombre/descripción/categoría **sigue funcionando** (no hay regresión).

**Escaneo por cámara**
9. Con un código EAN-13 real: abrir el escáner desde el buscador → lee y filtra.
10. Abrir el escáner desde el formulario → completa el campo SKU.
11. Cancelar el diálogo sin escanear → **la cámara se apaga** (verificar que el indicador del dispositivo se apaga; es la falla más común y silenciosa de este tipo de componente).
12. Denegar el permiso de cámara → se muestra el mensaje explicativo, la app no se rompe.
13. Probar en un celular real vía HTTPS (deploy de Netlify), en Android y iPhone.

**Pistola lectora**
14. Con el foco en el buscador, disparar la pistola → el código se escribe y filtra. (Si la pistola envía Enter y el input está dentro de un `<form>`, verificar que no dispare un submit no deseado; el buscador está fuera del form del producto, así que no debería, pero conviene confirmarlo con el hardware real.)

## Riesgos / notas

- **La migración debe correrse en Supabase.** Como en trabajos anteriores de este repo, el archivo en `supabase/migrations/` versiona el cambio pero no lo aplica solo. Si el deploy sale sin la columna, todo alta/edición de producto va a fallar. La migración va primero.
- **`@zxing/library` pesa.** Es una dependencia considerable para el bundle. Mitigación: importar el `BarcodeScannerDialog` con `React.lazy`, para que ZXing se descargue recién cuando alguien abre el escáner y no en la carga inicial de la app.
- **La calidad de lectura depende de la cámara y la luz.** Los códigos EAN chicos o mal impresos pueden costar. El campo SKU manual y la pistola siguen siendo las vías confiables; la cámara es la comodidad.
- **El escaneo por SKU en Nuevo Pedido queda pendiente** por decisión explícita. El `BarcodeScannerDialog` se diseña sin acoplamiento a Gestión de Productos justamente para que ese paso sea agregar el botón y el filtro, no reescribir el escáner.
