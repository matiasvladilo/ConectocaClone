# Módulo de Información Nutricional y Etiquetas — Diagnóstico y Plan

Estado: **propuesta, sin implementar**. Fecha: 2026-09-08.

---

## 1. Cómo está modelado hoy

### Tablas Supabase involucradas (proyecto `conectocadev` / `xxmiujtywnnlqmekakzq`)

| Tabla | Columnas relevantes | Filas |
|---|---|---|
| `ingredients` | `business_id`, `name`, `unit`, `current_stock`, `min_stock`, `max_stock`, `cost_per_unit`, `supplier` | 89 |
| `product_ingredients` | `product_id`, `ingredient_id`, `quantity` | 264 |
| `products` | `business_id`, `name`, `description`, `price`, `stock`, `unlimited_stock`, `track_stock`, `category_id`, `production_area_id`, `labor_cost`, `sku`, `min_stock`, `allow_decimal` | 332 |
| `businesses` | `id`, `name`, `invite_code`, `owner_id` | 6 |

**Ninguna tabla tiene un solo campo nutricional, de peso final ni de alérgenos.** Todo es campo nuevo.

### Hechos que condicionan el diseño

1. **`product_ingredients.quantity` está expresado en la unidad del ingrediente**, no en gramos.
   No hay columna `unit` en la línea de receta. La unidad sale de `ingredients.unit`.
   Distribución real: **82 ingredientes en `kg`, 6 en `l`, 1 en `g`**.
   → El Bizcocho Marmolado con "Mix 104 g" está guardado como `quantity = 0.104` con `unit = 'kg'`.

2. **La conversión de unidades hoy es un `/1000` suelto en el componente**
   ([ProductIngredientConfig.tsx:146](../src/components/ProductIngredientConfig.tsx#L146) y
   [:175](../src/components/ProductIngredientConfig.tsx#L175)), replicado en `formatQuantity`
   ([:206](../src/components/ProductIngredientConfig.tsx#L206)). No existe un módulo de unidades.
   No hay densidad en ninguna parte: hoy g y ml se tratan igual porque nunca se cruzan.

3. **"Puede producir" y el costo son cálculos inline en el componente**
   ([:609](../src/components/ProductIngredientConfig.tsx#L609) y
   [:267](../src/components/ProductIngredientConfig.tsx#L267)). No los toco.

4. **Todo el acceso a datos pasa por un Edge Function Hono**
   (`supabase/functions/make-server-6d979413/index.ts`, 3181 líneas), no por el cliente Supabase
   directo. Cada endpoint verifica auth → `getProfile` → filtra por `business_id`.
   El PUT de ingredientes tiene **whitelist explícita de campos**
   ([index.ts:2438-2446](../supabase/functions/make-server-6d979413/index.ts#L2438)), igual el de productos
   ([index.ts:871](../supabase/functions/make-server-6d979413/index.ts#L871)).
   → Campos nuevos exigen tocar el mapper `toIngredient`/`toProduct` **y** la whitelist. Si no, se guardan en silencio como nada.

5. **Tailwind está precompilado en `src/index.css` (6239 líneas).** No hay `tailwind.config`.
   Una clase que no esté ya compilada ahí **no aplica ningún estilo y falla en silencio**.
   → La etiqueta no se puede maquetar con clases Tailwind nuevas.

6. **No hay librería de PDF.** Lo único que existe es `window.print()`
   ([StandardDeliveryGuide.tsx:46](../src/components/StandardDeliveryGuide.tsx#L46)) con reglas
   `@media print` escritas a mano dentro de `index.css`.

7. **Los tests son `node --test src/utils/*.test.ts`** (node:test + assert, TS con type-stripping,
   imports con extensión `.ts` explícita). Hay 7 archivos de test siguiendo ese patrón.
   → Módulos nuevos: sin `enum`, sin parameter properties, sin nada que type-stripping no soporte.

8. **Logo.** `src/assets/logo-icon.png` es el pato amarillo, que NO es el de la etiqueta.
   El logo circular B&N oficial quedó instalado en **`src/assets/logo-la-oca-bn.png`**
   (1254 × 1254 px, sin canal alfa, fondo blanco). Se embebe como imagen; nunca se redibuja.
   Pendientes de calidad: ver §7.

### Volumen de trabajo de carga de datos

- 47 productos tienen receta (de 329 de La Oca).
- **71 materias primas distintas aparecen en recetas** → esas son las fichas nutricionales a cargar.
- 23 líneas de receta usan ingredientes en litros → **esas 6 materias primas necesitan densidad sí o sí**.
- 0 ingredientes con unidad no másica hoy, pero el selector ofrece `unidades`/`bolsas`/`cajas`
  ([IngredientManagement.tsx:368-374](../src/components/IngredientManagement.tsx#L368)) → el motor tiene que bloquearlos.

---

## 2. Normativa chilena — lo verificado y lo que falta

### Umbrales confirmados (Tabla N°1, art. 120 bis del RSA, D.S. 977/96 según Decreto 13/2015)

Límites generales vigentes (última etapa del calendario gradual):

| Nutriente | Sólidos (por 100 g) | Líquidos (por 100 ml) |
|---|---|---|
| Energía | > 275 kcal | > 70 kcal |
| Sodio | > 400 mg | > 100 mg |
| Azúcares totales | > 10 g | > 5 g |
| Grasas saturadas | > 4 g | > 3 g |

Fuentes: [Decreto 13 (BCN)](https://www.bcn.cl/leychile/Navegar?idNorma=1078836&buscar=20606),
[Manual de Etiquetado Nutricional MINSAL](https://www.minsal.cl/ley-de-alimentos-manual-etiquetado-nutricional/),
[Ley de Alimentos — Salud Responde](https://saludresponde.minsal.cl/ley-de-alimentos-preguntas-frecuentes/).

La actualización 2026 del RSA (marzo 2026) **no modificó estos umbrales**; los cambios fueron
denominación de "leche", fortificación con vitamina D3 en harina de trigo y leche, azúcares no
tradicionales (tagatosa/alulosa) y control parasitario en pescados
([The Food Tech](https://thefoodtech.com/metodos-de-control-y-regulaciones/reglamento-sanitario-de-los-alimentos-en-chile-cambios-clave-tras-la-actualizacion-2026/)).

### ⚠️ Regla que cambia el diseño: los sellos son por nutriente **AÑADIDO**

El art. 120 bis aplica los sellos **solo a alimentos a los que se les haya adicionado** sodio,
azúcares o grasas saturadas. Los alimentos sin adición quedan excluidos aunque superen el límite
([resumen normativo](https://www.consultoraserpyme.cl/guia-para-la-declaracion-de-los-sellos-altos-en/)).

**Esto no se puede deducir de los números.** El motor necesita un dato declarado por el usuario.

**✅ Decidido:** tres flags booleanos por materia prima (`aporta_azucares_anadidos`, `aporta_sodio_anadido`,
`aporta_grasas_saturadas_anadidas`). El azúcar del mix de queque es añadido; la lactosa natural de la
leche en polvo, no. Un producto es candidato a sellos solo si **alguna** de sus materias primas tiene el
flag correspondiente en `true`; recién ahí se compara contra la Tabla N°1.

Sin estos flags cargados, el producto no puede pasar de borrador.

### Ítems regulatorios abiertos (no los invento — hay que sacarlos del texto oficial)

1. **Reglas de redondeo y expresión de cifras** del rotulado nutricional (RSA art. 115 + Manual MINSAL).
   Hasta tenerlas, el motor redondea de forma provisional y **ninguna etiqueta puede marcarse "lista para impresión"**.
2. **Tabla de porciones de consumo habitual** — define el tamaño de porción declarable. Los sellos se
   evalúan por 100 g así que no bloquea el cálculo, pero sí la porción declarada.
3. **Especificación gráfica exacta del sello** (proporciones del octógono, tipografía, tamaño mínimo
   según superficie del envase). El octógono es forma geométrica regulatoria, se dibuja vectorial;
   pero las medidas mínimas hay que confirmarlas.
4. Fecha exacta de entrada en vigor de la etapa 3 (confirmable, bajo riesgo).

Acción sugerida: conseguir el PDF del **Manual de Etiquetado Nutricional del MINSAL** y adjuntarlo al repo
como fuente de verdad de la Etapa 2.

---

## 3. Tablas y columnas nuevas propuestas

Criterio general: **tablas satélite 1:1, no columnas nuevas en `ingredients` ni `products`.**

Razón: `ingredientsAPI.getAll` y `productsAPI.getAll(limit=1000)` hacen `select('*')` y se llaman en
varias pantallas. Meter ~20 columnas nutricionales + textos largos ahí engorda cada request de la app
entera. Además evita tocar las whitelists de UPDATE que hoy protegen stock y costos.

### 3.1 `ingredient_nutrition` (1:1 con `ingredients`)

```
ingredient_id            uuid PK FK → ingredients(id) ON DELETE CASCADE
business_id              uuid NOT NULL          -- denormalizado para RLS
base_cantidad            numeric NOT NULL DEFAULT 100
base_unidad              text NOT NULL          -- 'g' | 'ml'
energia_kcal             numeric
proteinas_g              numeric
grasa_total_g            numeric
grasa_saturada_g         numeric
grasa_monoinsaturada_g   numeric
grasa_poliinsaturada_g   numeric
grasas_trans_g           numeric
colesterol_mg            numeric
carbohidratos_disp_g     numeric
azucares_totales_g       numeric
sodio_mg                 numeric
densidad_g_ml            numeric                -- obligatorio si la unidad del ingrediente es l/ml
peso_por_unidad_g        numeric                -- obligatorio si la unidad es unidades/bolsas/cajas
ingredientes_declarados  text                   -- declaración literal del fabricante (compuestos)
marca                    text
fuente                   text                   -- 'ficha técnica proveedor', 'etiqueta', ...
aporta_azucares_anadidos          boolean NOT NULL DEFAULT false
aporta_sodio_anadido              boolean NOT NULL DEFAULT false
aporta_grasas_saturadas_anadidas  boolean NOT NULL DEFAULT false
actualizado_en           timestamptz
created_at / updated_at  timestamptz
```

Todos los nutrientes **nullable**: `NULL` = "no lo tengo", distinto de `0` = "el proveedor declara cero".
Esa distinción es la que permite decir "faltan datos de 2 materias primas" en vez de calcular con ceros falsos.

### 3.2 `allergens` (catálogo normalizado)

```
id uuid PK, codigo text UNIQUE, nombre text, nombre_etiqueta text,
business_id uuid NULL   -- NULL = catálogo global sembrado; con valor = alérgeno propio del negocio
```
Semilla: `gluten_trigo`, `huevo`, `leche`, `soya`, `mani`, `frutos_secos`, `pescado`, `crustaceos`,
`moluscos`, `sesamo`, `sulfitos`, `apio`, `mostaza`.

### 3.3 `ingredient_allergens`

```
ingredient_id uuid FK, allergen_id uuid FK, tipo text CHECK (tipo IN ('contiene','trazas'))
PK (ingredient_id, allergen_id, tipo)
```
`contiene` y `trazas` se guardan separados y **nunca** se infiere una traza que el proveedor no declaró.

### 3.4 `product_label_profile` (1:1 con `products`)

```
product_id uuid PK FK, business_id uuid NOT NULL,
peso_final_promedio_g   numeric
peso_porcion_g          numeric
porciones_por_envase    numeric
porcion_descripcion     text     -- "1 unidad"
denominacion_legal      text     -- nombre para la etiqueta si difiere del comercial
descripcion_etiqueta    text
conservacion            text
vida_util_dias          integer
ingredientes_texto_override  text   -- edición administrativa; NO toca la receta
alergenos_texto_override     text
trazas_texto_override        text
```

Los `*_override` son la respuesta al punto 10 del pedido: se puede corregir el texto de la etiqueta sin
alterar `product_ingredients`. Si están vacíos se usa el texto autogenerado.

### 3.5 `business_label_settings` (1:1 con `businesses`)

```
business_id uuid PK FK,
razon_social, rut, direccion, telefono, email, planta_elaboradora  text
logo_frontal_url text     -- asset oficial subido, no generado
ancho_mm_default numeric DEFAULT 90
alto_mm_default  numeric DEFAULT 60
```

### 3.6 `label_versions` (snapshots inmutables)

```
id uuid PK, business_id uuid, product_id uuid FK,
version integer NOT NULL,                 -- UNIQUE (product_id, version)
estado text CHECK (estado IN ('borrador','lista')),
snapshot jsonb NOT NULL,                  -- receta, nutrientes por MP, totales, pesos,
                                          -- ingredientes, alérgenos, sellos, bloqueos
regulation_version text NOT NULL,         -- p.ej. 'CL-RSA-120bis-2019.3'
calculated_at timestamptz NOT NULL,
created_by uuid FK → profiles(id),
ancho_mm numeric, alto_mm numeric,
created_at timestamptz
```

El `snapshot` es autocontenido: una etiqueta v1 se puede reimprimir idéntica dentro de dos años aunque la
receta y los umbrales hayan cambiado. Nada en la generación de PDF vuelve a consultar `ingredients`.

### RLS

Las 6 tablas nacen con `ENABLE ROW LEVEL SECURITY` + policy por `business_id` siguiendo el patrón de las
tablas existentes. (Ver también el hallazgo de seguridad en §6.)

---

## 4. Arquitectura de código

Todos los módulos de cálculo son **funciones puras, sin React, sin Supabase**, bajo `src/utils/nutricion/`
para que el runner de tests actual los tome.

```
src/utils/nutricion/
  unidades.ts            conversión g/kg/ml/l/unidad; usa densidad; devuelve error tipado si no puede
  tipos.ts               Nutrientes, FichaMateriaPrima, LineaReceta, ResultadoCalculo, Bloqueo
  calculadora.ts         aporte por ingrediente → totales → por 100 g → por porción → por envase
  reglasChile.ts         umbrales Tabla N°1, versión de normativa, redondeos, nutrientes obligatorios
  sellos.ts              evalúa ALTO EN usando reglasChile + flags de "añadido"
  ingredientesTexto.ts   orden decreciente + expansión de compuestos
  alergenos.ts           consolidación contiene/trazas y redacción del texto
  validacion.ts          decide borrador vs "lista para impresión"; lista de bloqueos legibles
  snapshot.ts            arma el objeto inmutable que se guarda en label_versions
  etiquetaLayout.ts      layout en mm → lista de primitivas (texto, línea, rect, polígono, imagen)
  *.test.ts              tests node:test
src/utils/nutricion/render/
  renderPdf.ts           primitivas → jsPDF (texto vectorial, mm reales)
  renderCanvas.ts        primitivas → Canvas2D → PNG de previsualización
```

**Por qué un layout de primitivas y no HTML/CSS:** esquiva el problema del Tailwind precompilado, hace el
layout testeable sin navegador, y garantiza que el PNG y el PDF salgan idénticos porque los dibuja la
misma descripción.

**PDF:** propongo agregar `jspdf` (dibuja en mm nativamente, texto vectorial nítido, descarga programática).
Los octógonos de los sellos se dibujan como polígonos vectoriales. **El logo se embebe como imagen del
asset oficial; nunca se redibuja.**

### UI

| Pantalla | Archivo | Cambio |
|---|---|---|
| Materias primas | `IngredientManagement.tsx` | sección "Información nutricional" + estado 🟢🟡⚪ en la lista |
| Receta | `ProductIngredientConfig.tsx` | bloque "Información nutricional" bajo "Ingredientes Configurados" |
| Previsualización | `NutritionPreview.tsx` (nuevo) | tabla 100 g / porción + sellos + ingredientes + alérgenos |
| Etiqueta | `LabelGenerator.tsx` (nuevo) | tamaño mm, etiqueta 1 / etiqueta 2, PNG + PDF |
| Historial | `LabelVersions.tsx` (nuevo) | versiones, reimpresión, borrador vs lista |

Se reutilizan `ui/card`, `ui/button`, `ui/dialog`, `ui/label`, `ui/input`, `ui/select`, `ImageUpload`
(para el logo), `sonner` para toasts, y el patrón de endpoints + mappers del Edge Function.

---

## 5. Plan por etapas

**Etapa 0 — Decisiones e insumos (tuyos, no míos)**
- ~~Archivo del logo circular B&N~~ ✅ `src/assets/logo-la-oca-bn.png` (1254 px). Ver §7 por fondo transparente / versión vectorial.
- Manual de Etiquetado Nutricional MINSAL (PDF) para redondeos y porciones.
- Datos del elaborador: razón social, RUT, dirección, planta.
- Confirmar el enfoque de flags de "nutriente añadido".

**Etapa 1 — Datos** ✅ **HECHA** (2026-09-08, rama `etiquetado-nutricional`)
- Migración `20260908_create_nutrition_labeling.sql` aplicada en `conectocadev`: 6 tablas, RLS activo
  sin políticas, 13 alérgenos globales sembrados. Ninguna tabla existente modificada.
- 9 endpoints bajo `/nutrition/` en el Edge Function, desplegados en la **versión 16** (`verify_jwt: false`,
  igual que la 15). Smoke test: `/health` 200, rutas viejas y nuevas 401 sin token, y una ruta y un método
  inexistentes devuelven 404 — o sea que los 401 significan "existe y rechazó auth", no un catch-all.
- Tipos y cliente en `src/utils/api.tsx`. `FichaNutricionalAPI extends FichaNutricional`, así el
  compilador avisa si el endpoint deja de devolver un campo que el cálculo necesita.
- Whitelists verificadas campo por campo contra las columnas de las 3 tablas escribibles: cobertura
  completa. Era el modo de falla más probable de esta etapa.

**Etapa 2 — Motor + tests** ✅ **HECHA**
- 8 módulos puros en `src/utils/nutricion/`. **84 tests nuevos, 149 en total, todos verdes.**
- Cubiertos los 11 casos pedidos: g→kg, ml→g con densidad, por 100 g, por porción, multi-ingrediente,
  pérdida de peso en cocción, ingredientes sin datos, alérgenos, sellos, redondeos y no-mutación entre
  recálculos (la base del versionado).
- `npm test` ahora corre también `src/utils/nutricion/*.test.ts`.

**Etapa 3 — UI Materias primas** · ficha nutricional, alérgenos, trazas, densidad, fuente, estado visual.
*Riesgo: medio — se toca un formulario que hoy guarda stock y costos. Mitigación: los campos nuevos van en
una sección aparte con su propio submit contra el endpoint nuevo; el submit actual de `ingredients` no se toca.*

**Etapa 4 — UI Producto/Receta** · pesos, estado nutricional con lista de faltantes, botón CALCULAR,
previsualización completa (tabla + sellos + ingredientes + alérgenos).
*Riesgo: medio — se agrega una sección a `ProductIngredientConfig`. `canProduce` y `calculateTotalCost`
quedan intactos.*

**Etapa 5 — Etiquetas** · layout en mm, renderer canvas (PNG) y PDF (jsPDF), tamaño configurable,
etiqueta 1 (frontal, logo, universal, **sin sellos**) y etiqueta 2 (posterior, información obligatoria,
**con los sellos que apliquen**). Ver §8 para el flujo de sellos.
*Riesgo: bajo para el resto del sistema; alto en iteraciones de diseño.*

**Etapa 6 — Versionado** · snapshots, historial, incremento de versión al cambiar la receta,
borrador vs "lista para impresión" con los bloqueos visibles.

Sugerencia de entrega: Etapas 1+2 en una rama, revisión, y recién ahí seguir. Son la base de todo lo demás
y son las que se pueden verificar sin mirar pantallas.

---

## 6. Riesgos

1. **Unidad del ingrediente mutable.** Si alguien cambia `ingredients.unit` de `kg` a `g`, las 264 líneas
   de receta guardadas quedan mal por factor 1000 — y esto **ya afecta hoy a costos y a "puede producir"**,
   no lo introduce este módulo. Pero acá el impacto pasa a ser una etiqueta legal impresa. Recomiendo
   bloquear o advertir el cambio de unidad cuando el ingrediente ya está en recetas.
2. **Ingredientes en unidades no másicas** (`unidades`, `bolsas`, `cajas`): hoy 0 en producción pero el
   selector los ofrece. Sin `peso_por_unidad_g` el cálculo tiene que bloquearse, no estimar.
3. **Densidad faltante en los 6 ingredientes en litros** (23 líneas de receta) → bloqueo hasta cargarla.
4. **Peso final del producto:** no existe en ningún lado. Hasta cargarlo, todo producto queda en borrador.
   Es dato de balanza, no calculable.
5. **Whitelists del Edge Function:** cualquier campo nuevo que no se agregue al mapper Y a la whitelist se
   guarda en silencio como nada. Es el modo de falla más probable de la Etapa 1.
6. **Tailwind precompilado:** cualquier clase nueva no aplica y falla en silencio. Por eso el layout de la
   etiqueta va por primitivas y no por CSS.
7. **Multi-tenant:** hay 5 negocios; `La Oca` tiene 329 de los 332 productos. Todas las tablas nuevas
   filtran por `business_id`.
8. **Hallazgo de seguridad preexistente (no lo introduce este módulo):** las tablas
   `backup_product_ingredients_20260629`, `backup_ingredients_20260629` y `backup_products_labor_20260629`
   tienen **RLS deshabilitado** y son legibles/escribibles con la anon key. Contienen la receta y los costos
   completos del negocio. Recomendación: si ya no se usan, borrarlas; si se usan, habilitar RLS con policies.
   No lo aplico sin tu confirmación porque habilitar RLS sin policies bloquea todo acceso.

---

## 8. Flujo de sellos (decidido)

La etiqueta 1 queda **universal, sin sellos**: es el sticker de marca, igual para todos los productos.

Los sellos se imprimen en la **etiqueta 2, junto a la tabla nutricional, y solo los que apliquen**.
Ahí cumplen dos funciones: informar, y servirte de referencia para colocar manualmente los sellos
físicos en la cara frontal del envase.

Como el paso de la cara frontal es manual, el sistema tiene que hacerlo imposible de olvidar:

1. En la previsualización, un bloque destacado: **"Este producto lleva 3 sellos: ALTO EN AZÚCARES,
   ALTO EN GRASAS SATURADAS, ALTO EN CALORÍAS"** — o "Este producto no lleva sellos".
2. El mismo recuento queda guardado en el snapshot de `label_versions` (`sellos: [...]`), así que una
   etiqueta histórica dice con qué sellos se emitió.
3. El PDF de la etiqueta 2 lleva, fuera del área troquelada, una nota de producción no imprimible en el
   sticker: *"Colocar N sellos en cara frontal"*. (A definir en diseño si va como página aparte del PDF.)

⚠️ **Recordatorio normativo:** la norma exige los sellos en la **cara frontal** del envase. Tenerlos
impresos atrás no reemplaza ese requisito — es referencia. El riesgo operativo real es que alguien
saltee el pegado manual y el producto salga a la venta sin cumplir. Por eso los puntos 1–3.

*Opcional, a evaluar en Etapa 5:* exportar una **hoja de sellos** en PDF (los octógonos que aplican,
al tamaño correcto, repetidos en grilla) para imprimir en papel adhesivo. Solo tiene sentido si hoy
no comprás los sellos preimpresos.

---

## 9. Preguntas abiertas

1. **Logo — resuelto con reservas.** `src/assets/logo-la-oca-bn.png` sirve para todo lo previsto
   (1254 px ⇒ 106 mm a 300 DPI). Dos cosas a resolver antes de mandar a imprenta:
   - **No tiene canal alfa**: el fondo es un cuadrado blanco. En sticker blanco rectangular no se nota;
     en troquelado circular o sobre papel kraft/color, sí. Conviene una versión con fondo transparente.
   - **Es raster, no vectorial.** Alcanza para estos tamaños, pero una versión SVG/AI sería mejor a futuro.
   - El archivo venía nombrado como imagen generada. Si no es el archivo definitivo de marca, fijar uno
     canónico antes de imprimir: entre generaciones cambian detalles finos (trazo de las espigas,
     letterforms de "La Oca") y el packaging tiene que salir siempre igual.
2. ~~Flags de "nutriente añadido"~~ ✅ **Confirmado.** Ver §2.
3. ~~¿Dónde van los sellos?~~ ✅ **Decidido:** etiqueta 2, solo los que apliquen; colocación frontal
   manual usando eso como referencia. Ver §8.
4. ~~¿`jspdf` o `window.print()`?~~ ✅ **Decidido: `jspdf`.** Es la única vía para PDF real en mm exactos
   con texto vectorial y descarga programática con nombre de archivo. `window.print()` deja el tamaño
   final a merced del diálogo del navegador y no permite generar el PNG.
5. **Tamaño físico de la etiqueta 2 — sin definir, no bloquea.** Se implementa configurable con default
   90 × 60 mm (la proporción 3:2 del ejemplo). El generador incluye un **chequeo de legibilidad**: si al
   tamaño elegido algún texto queda bajo el mínimo tipográfico, lo avisa en vez de imprimir ilegible.
   Se ajusta cuando sepas qué stock de stickers vas a comprar.

### Único insumo que sigue pendiente

El **Manual de Etiquetado Nutricional del MINSAL** (PDF), para las reglas de redondeo y la tabla de
porciones de consumo habitual. No bloquea las Etapas 1–4: hasta tenerlo, el motor redondea de forma
provisional y ninguna etiqueta puede marcarse "lista para impresión", solo borrador.
