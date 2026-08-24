# Subcategorías, nombres estructurados y fix de sobrescritura de stock — Diseño

**Fecha:** 2026-08-23

## Problema

Tres problemas distintos, todos del mismo origen: **el catálogo creció y encontrar un producto se volvió difícil**.

### 1. El stock cargado "desaparece" (bug, ya corregido)

Reportado por el usuario: se cargó stock a un producto y después no estaba.

El formulario general de **Editar producto** siempre mandaba `stock` en el `PUT`, con el valor
que tenía cargado el formulario **desde el momento en que se abrió el diálogo**. Nunca lo
volvía a consultar antes de guardar. La secuencia que borra stock:

1. Se abre "Editar producto" para X (stock real = 10; el formulario guarda `stock: "10"`).
2. Con ese diálogo abierto, el stock real cambia de verdad: alguien usa "Ajustar stock" (+20),
   o entra un pedido que descuenta. El stock real pasa a 30.
3. La persona del paso 1 solo quería cambiar la categoría. No toca el campo stock. Guarda.
4. El backend recibe `stock: 10` y lo escribe tal cual. No tiene forma de distinguir ese eco
   viejo de una corrección deliberada. Las 20 unidades desaparecen, sin error ni aviso.

Agravante: como el body no traía `modo`, el kardex clasificaba esa pérdida como
`ajuste` ("corrección de conteo") — así que en el historial no se ve como un error, se ve
como si alguien hubiera contado mal.

Esto ya estaba anotado como riesgo conocido al pie del spec de
[Ajuste Rápido de Stock](2026-08-07-ajuste-rapido-de-stock-design.md) ("la lista de productos
no se auto-refresca... el cálculo partiría de ese valor viejo") y en las limitaciones del
kardex. Pasó de riesgo teórico a pérdida real de datos.

### 2. No hay subcategorías

`categories` es una lista plana. La Distribuidora es **una sola categoría** con todo el
surtido adentro: bebidas, abarrotes, limpieza, todo junto. No hay forma de acotar la búsqueda
a "las bebidas".

### 3. Los nombres de producto no tienen formato

El campo Nombre es texto libre. Cada persona lo escribe distinto, así que el mismo producto
entra dos o tres veces con nombres diferentes ("Coca Cola 350ml", "Coca-Cola lata 350cc"),
más los errores de tipeo. El catálogo tiene variantes duplicadas del mismo ítem y buscar
"coca" no garantiza encontrarlas todas.

## Alcance

**En alcance:**

- Fase 0 — Fix de la sobrescritura de stock en el formulario de edición. **Ya aplicado.**
- Fase 1 — Subcategorías: un nivel, para cualquier categoría del negocio.
- Fase 2 — Formulario estructurado de nombre + aviso de producto similar, **solo al crear**.

**Fuera de alcance (decidido explícitamente con el usuario):**

- Anidamiento de más de un nivel. Categoría → subcategoría y nada más.
- Agrupación visual de subcategorías en Armado de Pedidos ([`NewOrderForm.tsx`](../../../src/components/NewOrderForm.tsx))
  y en la **barra de filtros del listado** de Gestión de Productos. Las subcategorías van a
  **aparecer y funcionar** ahí como entradas sueltas de la lista plana; lo que no se hace
  ahora es mostrarlas indentadas bajo su padre. (Ojo con la distinción: el `<Select>` de
  categoría **del formulario de alta/edición** sí se agrupa — eso es lo que el usuario
  eligió. Son dos controles distintos en la misma pantalla.)
- Persistir marca / presentación / unidades como columnas propias. Ver "Riesgos".
- Renombrar o reorganizar los productos que ya existen. Este cambio ordena lo que entra
  de ahora en adelante; no toca el histórico.
- Bloqueo duro de duplicados. El aviso nunca impide guardar.

---

## Fase 0 — Fix de sobrescritura de stock (aplicado)

Archivo: [`src/components/ProductManagement.tsx`](../../../src/components/ProductManagement.tsx),
en `handleSubmit`.

**Regla:** el formulario general de producto solo manda `stock` si el usuario **realmente lo
tocó en ese formulario**, o si el producto es nuevo. Si no lo tocó, el campo no viaja en el
`PUT`, y el backend —que solo actualiza los campos presentes en el body— no tiene nada que
pisar.

```
stockSeToco = es producto nuevo
            OR cambió el check de stock ilimitado
            OR el número del campo difiere del que tenía el producto al abrir
```

Es el mismo principio que ya usa [`StockAdjustDialog`](../../../src/components/StockAdjustDialog.tsx),
que manda solo `{ stock, modo }` y por eso nunca tuvo este problema. La diferencia con el
diálogo de ajuste es que ese es el camino *pensado* para tocar stock; el formulario general
lo tocaba **de rebote**, al editar cualquier otro campo.

**Relación con el invariante del kardex** (documentado en
[el plan del panel de distribuidora](../plans/2026-08-19-panel-distribuidora.md)): el
invariante es "toda escritura a `products.stock` registra un evento". Este fix no lo debilita
— elimina escrituras que nunca debieron ocurrir. Menos escrituras espurias significa menos
eventos `ajuste` falsos ensuciando el historial.

**Lo que este fix NO resuelve:** dos personas ajustando el stock del mismo producto a la vez
se siguen pisando, porque `PUT /products/:id` escribe un valor absoluto sin lock. Eso es la
limitación conocida de concurrencia y requiere un endpoint de incremento atómico, fuera de
alcance acá.

---

## Fase 1 — Subcategorías

### Enfoque elegido

**Auto-referencia en la tabla existente (`parent_id`), con un solo nivel de profundidad
impuesto por el backend.**

Descartado — **tabla `subcategories` aparte:** duplicaría el CRUD entero (rutas, mappers,
UI de gestión) para una entidad que se comporta idéntico a una categoría, y obligaría a
`products` a tener dos columnas (`category_id` + `subcategory_id`) con la pregunta abierta
de qué pasa si no coinciden. La auto-referencia hace que una subcategoría **sea** una
categoría, así que todo lo que ya funciona con categorías sigue funcionando sin tocarse.

Descartado — **prefijo en el nombre ("Distribuidora / Bebidas"):** cero cambios de schema,
pero es una jerarquía falsa: nada impide escribirla mal, no se puede filtrar de forma
confiable y arrastra el mismo problema de formato libre que la Fase 2 viene a corregir.

### Base de datos

Migración nueva: `supabase/migrations/20260823_add_category_parent.sql`

```sql
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories (parent_id);
```

`ON DELETE RESTRICT` a propósito: aunque el backend también lo valide, la base impide borrar
una categoría que tiene hijas. Si el chequeo del backend se saltea por cualquier vía, el peor
caso es un error, no subcategorías huérfanas apuntando a un padre inexistente.

La columna es nullable y sin default: **todas las categorías que ya existen quedan como
categorías raíz**, que es exactamente el comportamiento actual. La migración es compatible
hacia atrás — el Edge Function viejo ignora la columna nueva y sigue andando.

### Backend

Archivo: [`supabase/functions/make-server-6d979413/index.ts`](../../../supabase/functions/make-server-6d979413/index.ts)

- **`toCategory`** (~línea 104): agrega `parentId: r.parent_id || null`.
- **`GET /categories`**: sin cambios de lógica. Sigue devolviendo la **lista plana**, ahora
  con `parentId`. El árbol lo arma el frontend. Así ninguno de los consumidores actuales
  (Gestión de Productos, Armado de Pedidos, Panel de Distribuidora) se rompe.
- **`POST /categories`**: acepta `parentId` opcional. Valida, en este orden:
  1. El padre existe y `business_id` coincide con el del que llama → si no, 400.
  2. El padre tiene `parent_id IS NULL` → si no, 400 con
     *"No se pueden crear subcategorías dentro de una subcategoría"*.
- **`PUT /categories/:id`**: acepta `parentId` (incluido `null` para volverla raíz). Además
  de las dos validaciones de arriba:
  3. `parentId !== id` → una categoría no puede ser su propio padre.
  4. La categoría que se está moviendo **no tiene hijas** → si las tiene, 400: convertirla
     en subcategoría crearía un segundo nivel por la puerta de atrás.
- **`DELETE /categories/:id`**: antes del chequeo de productos asociados que ya existe, suma
  el chequeo de hijas → 400 con
  *"No se puede eliminar: la categoría tiene N subcategoría(s)"*.

Las validaciones 2 y 4 son las dos únicas formas de llegar a dos niveles, y las dos están
cerradas del lado del servidor. El frontend además no las va a ofrecer, pero **la regla vive
en el backend**: es el único lugar que no se puede saltear.

### Frontend — tipo compartido

[`src/utils/api.tsx`](../../../src/utils/api.tsx), interfaz `Category`: agrega
`parentId?: string | null`. `categoriesAPI.create` suma `parentId?: string` a su firma.

### Frontend — Gestión de Categorías

Archivo: [`src/components/CategoryManagement.tsx`](../../../src/components/CategoryManagement.tsx)

- El diálogo de crear/editar suma un `<Select>` **"Categoría padre"**, con "Ninguna
  (categoría principal)" como opción por defecto. Las opciones son solo las categorías raíz
  (`parentId == null`), y al editar se excluye la categoría misma y cualquiera que ya tenga
  hijas — los dos casos que el backend rechaza. **No ofrecer lo que va a fallar** es mejor
  que mostrar el error después.
- El listado deja de ser una grilla plana: cada categoría raíz se muestra con sus
  subcategorías debajo, indentadas y con tipografía menor. Las subcategorías conservan sus
  propias acciones de editar/eliminar.

### Frontend — Alta/edición de producto

Archivo: [`src/components/ProductManagement.tsx`](../../../src/components/ProductManagement.tsx),
el `<Select>` de Categoría (~línea 1049).

Pasa a usar `SelectGroup` + `SelectLabel` (ya exportados por
[`ui/select.tsx`](../../../src/components/ui/select.tsx)): cada categoría raíz encabeza un
grupo y sus subcategorías van indentadas debajo. **La categoría raíz se sigue pudiendo
elegir** — no todo producto de la Distribuidora tiene por qué caer en una subcategoría.

El handler `onValueChange` no cambia: sigue guardando `categoryId` + el `category` (nombre)
que el resto de la app usa para mostrar.

### Frontend — Panel de Distribuidora (corrección necesaria)

Archivo: [`src/components/DistributionPanel.tsx`](../../../src/components/DistributionPanel.tsx),
línea 150.

Hoy filtra con `x.producto.categoryId === categoriaId`, comparación exacta. **Con
subcategorías, eso es un bug de datos que se ve idéntico al de la Fase 0**: etiquetar un
producto como "Bebidas" lo haría desaparecer del panel de la Distribuidora, y el panel
seguiría mostrando un total que se lee como completo.

El filtro pasa a "la categoría elegida **o cualquiera de sus hijas**": se arma el conjunto de
ids válidos (la elegida + las que tengan `parentId === categoriaId`) y se pregunta si el
`categoryId` del producto está en ese conjunto.

Beneficio de arrastre sin UI nueva: el `<Select>` de categoría que ese panel ya tiene se
llena desde `GET /categories`, así que "Bebidas" y "Abarrotes" van a aparecer solas como
opción filtrable. Ahí queda cubierto el "buscar más fácil" del pedido original.

`elegirCategoriaInicial` no cambia: sigue detectando la raíz "Distribuidora" por nombre.

---

## Fase 2 — Nombre estructurado + aviso de similares

### Enfoque elegido

**Campos fijos que componen el nombre, más un aviso no bloqueante de productos parecidos,
los dos solo en el alta.**

Se decidió hacer las dos cosas juntas porque atacan causas distintas del mismo síntoma:
los campos fijos matan la variación de formato, pero **no impiden un duplicado** — nada evita
cargar "Coca Cola 591ml" cuando ya existe "Coca-Cola 591 ml". Solo los campos fijos daría un
catálogo con duplicados prolijos.

**Solo al crear, no al editar.** Editar un producto viejo sigue mostrando el campo de texto
libre. Descomponer un nombre existente en marca/presentación/unidades requiere adivinar, y
adivinar mal renombraría productos en producción. El formulario estructurado ordena lo que
entra; lo que ya está se corrige a mano si hace falta.

### Composición del nombre

Tres campos, en este orden:

| Campo | Tipo | Obligatorio |
|---|---|---|
| **Marca / producto** | texto libre | sí |
| **Presentación** | número + unidad de lista fija | no |
| **Unidades por paquete** | número, default 1 | no |

La lista de unidades es **cerrada**: `ml`, `L`, `g`, `kg`, `un`, y `otro` (que habilita un
campo de texto corto). No se ofrece `cc` **a propósito**, aunque se use en la práctica:
tener `ml` y `cc` como opciones distintas para lo mismo reintroduce exactamente la
inconsistencia que este formulario viene a eliminar. Quien quiera "591cc" carga "591ml".

Reglas de armado, con vista previa en vivo debajo de los campos:

| Marca | Presentación | Unidades | Nombre resultante |
|---|---|---|---|
| Coca Cola | 591 ml | 6 | `Coca Cola 591ml 6 unidades` |
| Coca Cola | 591 ml | 1 (o vacío) | `Coca Cola 591ml` |
| Arroz Tucapel | 1 kg | 12 | `Arroz Tucapel 1kg 12 unidades` |
| Pan hallulla | (vacío) | 1 | `Pan hallulla` |

- Número y unidad se pegan sin espacio (`591ml`). Las unidades van como ` N unidades`.
- **Si Unidades es 1 o está vacío, no aparece en el nombre.** Un "1 unidad" en cada producto
  suelto es ruido en todas las listas de la app.
- A la Marca se le hace `trim` y se le colapsan los espacios internos.
- **No se fuerza capitalización.** Pasar a Título rompería nombres legítimos ("Coca-Cola
  ZERO" → "Coca-Cola Zero"). El aviso de similares es case-insensitive, así que escribir
  "coca cola" igual muestra la "Coca Cola" que ya existe y deja elegir.

El nombre compuesto se manda como el campo `name` de siempre. **Nada cambia en el backend,
ni en la base, ni en ningún otro lugar donde se muestra el nombre.** No hay override de texto
libre en el alta — para eso está Editar, que es la vía deliberada de renombrar.

### Componente nuevo

Archivo nuevo: `src/components/ProductNameFields.tsx`

Una sola responsabilidad: **tomar las partes y devolver el nombre compuesto**. No conoce la
API ni guarda nada, igual que `StockAdjustDialog` y `BarcodeScannerDialog`.

```ts
interface ProductNameParts {
  marca: string;
  cantidad: string;    // número de la presentación, como texto
  unidad: string;      // 'ml' | 'L' | 'g' | 'kg' | 'un' | 'otro' | ''
  unidadOtro: string;  // solo se usa cuando unidad === 'otro'
  unidades: string;    // unidades por paquete, como texto
}

interface ProductNameFieldsProps {
  value: ProductNameParts;
  onChange: (value: ProductNameParts) => void;
  productosExistentes: Product[];   // para el aviso de similares
}
```

La función de composición (`componerNombre`) y la de normalización se exportan por separado,
para poder probarlas sin renderizar nada.

### Aviso de producto similar

Se dispara mientras se escribe la **Marca**, a partir de 3 caracteres. Compara contra los
productos que la pantalla **ya tiene cargados en memoria** — no agrega ningún endpoint ni
request. Sin debounce: la comparación es memoizada por tecleo y son ~1000 productos contra
una cadena corta, así que el costo es de milisegundos y un debounce solo agregaría latencia
percibida.

Normalización de ambos lados antes de comparar: minúsculas, sin tildes, sin espacios,
guiones ni puntuación. `"Coca-Cola Lata 350cc"` → `"cocacolalata350cc"`.

Un producto existente se marca como similar si:

- **(a)** su nombre normalizado **contiene** la marca normalizada — cubre el caso frecuente
  (misma base, distinto sufijo): `"cocacolalata350cc".includes("cocacola")`; **o**
- **(b)** la distancia de edición entre la marca normalizada y el prefijo del mismo largo del
  nombre existente es **≤ 2** — cubre los errores de tipeo ("Coca Kola" ≈ "Coca Cola"), que
  el caso (a) por sí solo no detecta.

Se muestran hasta 5 coincidencias en un recuadro de advertencia, con el nombre completo y el
stock de cada una:

> ⚠️ Ya existen productos parecidos: **Coca-Cola Lata 350cc** (stock 24), **Coca Cola 1.5L**
> (stock 8). ¿Es alguno de estos?

**Nunca bloquea el guardado.** Un bloqueo duro haría imposible cargar dos presentaciones
legítimamente distintas del mismo producto, que es un caso normal en una distribuidora.

La distancia de edición se implementa a mano (~20 líneas, matriz clásica); no se agrega
ninguna dependencia.

---

## Testing

El proyecto no tiene framework de tests. La verificación es typecheck + navegador, con
evidencia. Las funciones puras (`componerNombre`, `normalizar`, `distanciaEdicion`,
`idsDeCategoriaConHijas`) se exportan para poder ejercitarlas con un script suelto.

**Fase 0 — sobrescritura de stock**
1. Abrir Editar en un producto con stock 10. **Sin cerrarlo**, desde otra pestaña sumar 20
   con Ajustar stock. Volver a la primera pestaña, cambiar solo la categoría, guardar.
   → El stock queda en **30**, no en 10.
2. Mismo escenario, pero cambiando el stock a mano de 10 a 15 antes de guardar → queda 15
   (una edición deliberada sigue funcionando).
3. Editar un producto sin tocar nada y guardar → no aparece ningún movimiento nuevo en el
   kardex del producto.
4. Marcar/desmarcar "stock ilimitado" y guardar → se aplica correctamente.

**Fase 1 — subcategorías**
5. Crear "Bebidas" con padre "Distribuidora" → aparece indentada bajo Distribuidora.
6. Intentar crear una subcategoría cuyo padre sea "Bebidas" → la opción no se ofrece en la UI,
   y forzando el request el backend responde 400.
7. Intentar eliminar "Distribuidora" teniendo "Bebidas" adentro → 400 con el motivo.
8. Asignar un producto a "Bebidas" → **sigue apareciendo** en el Panel de Distribuidora con
   la categoría "Distribuidora" seleccionada (el caso que hoy lo haría desaparecer).
9. En el Panel de Distribuidora, elegir "Bebidas" en el filtro → muestra solo esos productos,
   y las cuatro tarjetas de estadísticas se recalculan sobre ese subconjunto.
10. Recargar: la categoría elegida persiste en `localStorage` como hasta ahora.
11. Armado de Pedidos y el filtro de Gestión de Productos siguen funcionando sin errores
    (las subcategorías aparecen como entradas sueltas, que es lo esperado en esta fase).

**Fase 2 — nombre y duplicados**
12. Marca "Coca Cola", presentación 591 ml, unidades 6 → la vista previa dice
    `Coca Cola 591ml 6 unidades`, y el producto se guarda con ese nombre exacto.
13. Unidades vacío o 1 → el nombre no incluye "unidades".
14. Sin presentación → el nombre es solo la marca.
15. Unidad "otro" → habilita el campo de texto y lo usa en el nombre.
16. Con "Coca-Cola Lata 350cc" ya en el catálogo, tipear "coca cola" → aparece el aviso con
    ese producto.
17. Tipear "Coca Kola" → también aparece (caso de tipeo, vía distancia de edición).
18. Tipear "Pan" con 2 caracteres o menos cargados → no se dispara ningún aviso.
19. Con el aviso visible, guardar igual → **el producto se crea** (el aviso no bloquea).
20. Abrir Editar en cualquier producto existente → muestra el campo de nombre de texto libre
    de siempre, sin los campos nuevos.

**Estilos (constraint del proyecto)**
21. Verificar en el navegador que la indentación de las subcategorías y el recuadro del aviso
    se ven realmente aplicados. Ver "Riesgos".

## Riesgos / notas

- **Tailwind está precompilado.** No hay `tailwind.config`, ni PostCSS, ni la dependencia de
  Tailwind: [`src/index.css`](../../../src/index.css) es un CSS estático de ~6200 líneas.
  Una clase que no esté ahí **no hace nada y no avisa**. Ya verificado: `pl-4`, `pl-6`,
  `ml-4` y `border-amber-300` **no existen**. La indentación de subcategorías y cualquier
  espaciado nuevo va por `style={{ paddingLeft: ... }}` inline, como ya hace buena parte de
  `ProductManagement.tsx`. Antes de escribir cualquier clase nueva, buscarla en `index.css`.

- **Las partes del nombre no se persisten.** Se componen al crear y se guarda solo el `name`
  final. Consecuencia asumida: al editar, el nombre vuelve a ser texto libre, y no se puede
  hacer "listame todos los productos de 591ml". Persistirlas requeriría tres columnas nuevas
  y decidir qué hacer con los miles de productos viejos que no las tienen. Si más adelante se
  quiere reportería por presentación, esa es la evolución natural — y el formulario de esta
  fase es justamente lo que empieza a generar los datos limpios para justificarla.

- **El aviso de similares solo ve lo que la pantalla tiene cargado.** `productsAPI.getAll`
  trae hasta 1000 productos por defecto. Por debajo de ese número la comparación es completa;
  por encima, silenciosamente parcial. Vale la pena revisarlo si el catálogo se acerca a 1000.

- **La detección de similares va a tener falsos positivos.** "Agua" va a marcar como parecidos
  a todos los productos que contengan "agua". Es aceptable porque el aviso no bloquea: el
  costo de un falso positivo es leer una línea de más; el de un falso negativo es un duplicado
  permanente en el catálogo.

- **La concurrencia en el stock sigue sin resolverse.** El fix de la Fase 0 elimina las
  escrituras espurias del formulario de edición, pero dos ajustes deliberados simultáneos
  se siguen pisando, porque `PUT /products/:id` escribe un absoluto sin lock. Es la
  limitación ya documentada en el plan del kardex; corregirla necesita un endpoint de
  incremento atómico.

- **Orden de despliegue.** La migración va **antes** que el deploy del Edge Function. Al
  revés, el `POST`/`PUT /categories` nuevo escribiría en una columna `parent_id` que todavía
  no existe y devolvería error. Es la misma dependencia de orden que ya documenta el plan del
  panel de distribuidora, y la razón por la que la migración usa `IF NOT EXISTS` y deja la
  columna nullable: aplicada sola, no rompe nada de lo que ya está corriendo.
