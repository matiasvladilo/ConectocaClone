# Conexión Conectoca ↔ Oca Pricing — diseño

Fecha: 2026-11-15
Estado: aprobado, pendiente de plan de implementación
Parte 2 de 2. Parte 1: `2026-11-15-para-comprar-reposicion-design.md` (implementada en la rama `feat/para-comprar`).

## Objetivo

Que los dos sistemas trabajen juntos:

- **Conectoca** sabe cuánto sale y cuánto queda de cada producto de la Distribuidora.
- **Oca Pricing** sabe dónde y a qué precio comprar cada producto.

El resultado: la lista de qué comprar y cuánto vive en Conectoca, y los dos sistemas la muestran con el
proveedor más barato y el costo estimado. Si sube la demanda de un producto, el aviso salta antes.

## Alcance

Incluido:
1. Rotación más sensible a subidas de demanda (ajuste a la parte 1).
2. Punto de integración en Conectoca, protegido con una clave compartida.
3. Vinculación automática de productos por nombre normalizado.
4. Envío diario de los mejores precios de Oca Pricing a Conectoca.
5. En Conectoca: «Para comprar» muestra dónde comprar, la cantidad redondeada al formato del proveedor y el
   costo estimado.
6. En Oca Pricing: página nueva «Para comprar» con contador en el menú, totales por proveedor y paso al carrito.

Fuera de alcance (después): alerta de margen, alta automática en Oca Pricing de productos nuevos de
Conectoca, registrar compras reales de Conectoca en el historial de Oca Pricing.

Restricción de despliegue: **el diseño de la PWA de Conectoca no cambia.** La web publicada (`main`) recibe
solo la pestaña «Para comprar» adaptada a su estilo actual; la app nativa la recibe desde la rama de
seguridad. Ver «Dónde se ve en Conectoca».

## Datos que respaldan la vinculación por nombre

Medido el 15-11-2026: Conectoca tiene 352 productos activos en Distribuidora (13 con código de barras).
**319 (91 %) tienen exactamente el mismo nombre normalizado** que un producto del catálogo de Oca Pricing
(los dos vienen de la misma planilla); 151 de ellos ya tienen precio. Los 33 restantes son productos que se
agregaron después en Conectoca.

## Arquitectura: Oca Pricing es el único que llama

```
Oca Pricing ── GET  /integracion/oca-pricing/productos  ──▶ Conectoca   (lista para vincular)
Oca Pricing ── GET  /integracion/oca-pricing/reposicion ──▶ Conectoca   (qué comprar, al abrir la página)
Oca Pricing ── PUT  /integracion/oca-pricing/precios    ──▶ Conectoca   (mejores precios, cada madrugada)
```

Conectoca nunca llama a Oca Pricing. Guarda los precios recibidos en una tabla, así que muestra dónde comprar
aunque Oca Pricing esté caído. Toda la lógica de coincidencia y de formatos vive en Oca Pricing (una sola
normalización de nombres, la que ya existe).

### Seguridad

- Clave compartida (≥ 32 caracteres aleatorios) en variables de entorno: Supabase (`OCA_PRICING_CLAVE`),
  Netlify y GitHub Actions de Oca Pricing (`CONECTOCA_INTEGRACION_CLAVE`), `.env` local.
- Conectoca también fija el negocio en `OCA_PRICING_BUSINESS_ID`: el punto de integración solo ve y escribe
  datos de ese negocio, nunca recibe el negocio en la petición.
- Header `X-Integracion-Clave`, comparado en tiempo constante. Sin clave configurada → 503 (integración
  apagada); clave incorrecta → 401.
- El punto de integración solo **lee** productos y la reposición, y solo **escribe** en `precios_compra`.
  No toca pedidos, usuarios, stock ni lotes.

## 1. Rotación sensible a la demanda (Conectoca, `replenishment.ts`)

`rotación diaria = máx(salidas netas 7 días ÷ ventana7, salidas netas 28 días ÷ ventana28)`

- ventana7 = mín(7, días de vida del producto), mínimo 1; ventana28 igual con 28 (como hoy).
- Si un producto empieza a salir más rápido, el ritmo de 7 días manda: la alerta salta antes y la cantidad
  sugerida sube. Si la demanda baja, se mantiene el promedio del mes (no se compra de menos por una semana
  floja).
- `sumarSalidas` recibe también `created_at` de cada evento y devuelve las salidas de 28 y de 7 días. La
  consulta sigue siendo una sola (los 28 días ya incluyen los 7).
- La fila agrega `rotacion7` y `rotacion28` (para mostrar «sube» cuando 7 > 28 × 1,2).

## 2. Punto de integración en Conectoca

En `make-server-6d979413/index.ts`, rutas nuevas bajo `/make-server-6d979413/integracion/oca-pricing/`.
Verificación de clave y negocio en un módulo puro `integracion.ts` (probado con `node --test`).

- `GET …/productos` → `{ data: [{ id, name, stock, unlimitedStock, trackStock }] }`: productos activos
  (no archivados) de las categorías de Distribuidora (categoría cuyo nombre contiene «distribuidora» y sus
  subcategorías, mismo criterio que `elegirCategoriaInicial`).
- `GET …/reposicion` → la misma respuesta que `GET /distribution/replenishment` (filas + ajustes +
  `calculadoEn`), restringida a Distribuidora. Reutiliza la función que ya calcula la reposición.
- `PUT …/precios` → body `{ generadoEn, precios: PrecioCompra[] }`. Reemplaza **todo** el conjunto del negocio
  (borrar + insertar en una transacción, vía RPC `reemplazar_precios_compra` sin `EXECUTE` para `anon` ni
  `authenticated`). Valida cada fila; un `product_id` que no es del negocio se rechaza (400). Límite 2000 filas.

`PrecioCompra`:

| Campo | Significado |
|---|---|
| `productId` | id del producto en Conectoca |
| `proveedor` / `proveedorNombre` | id y nombre del proveedor más barato (ej. `alvi`, «Alvi») |
| `precioUnidad` | precio por **unidad de Conectoca** (ya convertido por Oca Pricing), CLP |
| `formatoUnidades` | cuántas unidades de Conectoca trae el formato de compra (ej. 12), o `null` si no se puede convertir |
| `formato` | texto del formato («Caja 12 un.») |
| `observadoEn` | cuándo vio Oca Pricing ese precio |
| `url` | enlace al producto en el proveedor (puede ser vacío) |

### Tabla `precios_compra` (migración nueva)

`business_id`, `product_id` (PK compuesta), los campos de arriba y `recibido_en`. RLS activo sin políticas
(solo service_role), como `stock_events`.

### Uso en la reposición

`GET /distribution/replenishment` (pestaña de admin) agrega a cada fila, si hay precio:

```ts
compra: { proveedorNombre, precioUnidad, formato, formatoUnidades, observadoEn, url,
          comprarRedondeado,   // ceil(comprar ÷ formatoUnidades) × formatoUnidades; = comprar si formatoUnidades es null
          costoEstimado }      // comprarRedondeado × precioUnidad
```

Un precio con más de 7 días de antigüedad se muestra con la fecha y la marca «precio antiguo».

## 3. Vinculación y conversión de unidades (Oca Pricing)

Módulo nuevo `src/integracion/conectoca.ts`:

- `vincular(productosConectoca, catalogo)`: por `slugKey(nombre)` contra la clave y el nombre de cada producto
  del catálogo (incluidos los nombres fusionados en `mergedFrom`). Sin coincidencia → «sin vincular».
- `mejorCompra(fila)`: entre las celdas con `state: 'precio'` de la planilla, la de menor precio comparable
  (mismo criterio que la planilla, incluido el tratamiento del IVA de `pricing/settings.ts`).
- **Conversión de unidades:** la unidad de Conectoca puede ser un pack («SCORE GORILLA 473, POR MALETA» = 24
  botellas; «Kapo manzana 24uni»). Se usa `parsePresentation(nombreConectoca).packCount` (unidades
  individuales por unidad de Conectoca, `uc`) y el `packCount` del formato del proveedor (`up`):
  - `precioUnidad = precio unitario individual × uc`
  - `formatoUnidades = up ÷ uc` solo si es entero ≥ 1; si no, `null` (no se redondea).
- Funciones puras, con pruebas que incluyen packs («24uni», «POR MALETA» no detectable → `uc = 1`,
  formato no divisible).

## 4. Envío diario de precios (Oca Pricing)

Al final de `scripts/scheduled-update.ts` (GitHub Actions), y también con un botón «Enviar precios a
Conectoca» en la página nueva:

1. `GET …/productos` de Conectoca.
2. Vincular, calcular `mejorCompra` y convertir unidades.
3. `PUT …/precios` con todos los vinculados que tengan precio.

Si Conectoca no responde o devuelve error: se registra en el resumen de la ejecución
(«Conectoca: no se pudieron enviar los precios (motivo)») y la actualización **no** falla.

## 5. En Conectoca: «Para comprar» con dónde comprar

En cada fila con `compra`:

> **Comprar 36** (3 cajas de 12) · Alvi $870 c/u · ≈ $31.320 · visto hoy

Sin `compra`, la fila queda como en la parte 1. Al pie de la lista: «Costo estimado total ≈ $X (N productos
con precio)». Compartir por WhatsApp agrega el proveedor y el precio unitario a cada línea.

### Dónde se ve en Conectoca

- **App nativa:** rama `feat/para-comprar` (sale de la rama de seguridad, que es la de la app).
- **PWA / web (`main`):** rama nueva desde `main` que agrega **solo** la pestaña «Para comprar» al
  `DistributionPanel` de `main`, con su estilo actual. Compartir: `navigator.share` o portapapeles;
  Excel con `XLSX.writeFile` como ya hace `main`. Ningún otro cambio visual.
- El backend (Edge Function) es uno solo y ya corre la rama de seguridad; ambas interfaces usan las mismas
  rutas.

## 6. En Oca Pricing: página «Para comprar»

- Ítem de menú «Para comprar» (sección Abastecimiento) con contador de productos por reponer.
- `GET /api/para-comprar` (con inicio de sesión, como el resto de la API) → pide la reposición a Conectoca,
  vincula y agrega la mejor compra. Responde `{ filas, sinVincular, ajustes, calculadoEn }`.
- Tabla: producto, stock, sale/día (con «sube» si aplica), alcanza N días, comprar (redondeado al formato),
  proveedor más barato, precio, costo estimado. Agrupable por proveedor con subtotal
  («Alvi: 8 productos · $124.000»).
- Selección por fila y botón **«Agregar al carrito»**: usa el carrito existente con la cantidad sugerida.
  `POST /api/cart/add` acepta `qty` opcional (hoy usa la cantidad del mejor precio).
- «Sin vincular» (productos de Conectoca sin par en el catálogo): lista aparte con botón **«Agregar al
  catálogo»** (`addProductFromName`); la búsqueda nocturna empieza a buscarle precio.
- Estilo corporativo La Oca (ya aplicado a la app).
- Si Conectoca no responde: «No se pudo obtener la lista de Conectoca (motivo)» con Reintentar. Nunca una lista
  vacía que parezca «nada que comprar». Sin clave configurada: «La conexión con Conectoca no está
  configurada».

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| Clave ausente en Conectoca | 503 «integración apagada» |
| Clave incorrecta | 401, sin detalles |
| Conectoca caído al abrir la página de Oca Pricing | Mensaje + Reintentar |
| Envío nocturno falla | Línea en el resumen de GitHub; la actualización sigue OK |
| Precio de más de 7 días | Se muestra con fecha y marca «precio antiguo» |
| Producto vinculado sin precio | Fila sin dónde comprar; cantidad sin redondear |

## Pruebas

Conectoca (`node --test`):
- `replenishment.test.ts`: rotación 7 vs 28 (sube rápido → manda 7; baja → manda 28; producto nuevo).
- `integracion.test.ts`: clave correcta / incorrecta / ausente; comparación en tiempo constante; validación de
  `PrecioCompra` (tipos, rangos, límite de filas); redondeo `comprarRedondeado` y `costoEstimado`.

Oca Pricing (`npm test`):
- `conectoca.test.ts`: vinculación por nombre (incluye `mergedFrom`), `mejorCompra` con IVA, conversión de
  unidades con packs y formatos no divisibles, armado del body del PUT.
- `para-comprar` con un Conectoca simulado (servidor HTTP local en la prueba): respuesta normal, Conectoca
  caído, sin clave.

Verificación manual: enviar precios con un límite pequeño, abrir «Para comprar» en los dos sistemas y comparar
2 productos a mano.

## Despliegue (orden)

1. Conectoca: migraciones `_a` (`business_replenishment_settings`, parte 1) y `_b` (`precios_compra`), siempre
   antes de la función.
2. Conectoca: Edge Function con los secretos `OCA_PRICING_CLAVE` y `OCA_PRICING_BUSINESS_ID`. Desplegarla con
   la verificación JWT desactivada (`--no-verify-jwt` / `verify_jwt: false`): un despliegue puede reactivarla y
   Oca Pricing no envía JWT. Prueba de humo: sin clave → 401; `GET productos` con clave → ~352 filas.
3. Oca Pricing: variables `CONECTOCA_INTEGRACION_URL` y `CONECTOCA_INTEGRACION_CLAVE` en Netlify, GitHub y
   `.env`; desplegar.
4. Primer envío de precios a mano (botón) y verificación.
5. Interfaces de Conectoca: web (`main`, solo la pestaña) y app (rama de la app).

Cada paso que toca producción se hace con autorización explícita.
