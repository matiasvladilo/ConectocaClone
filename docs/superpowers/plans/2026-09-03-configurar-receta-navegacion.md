# Navegación de "Configurar receta" — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que "Configurar receta" abra la receta del producto que se está editando, y que volver deje el diálogo, la búsqueda y el scroll exactamente como estaban.

**Architecture:** `ProductIngredientConfig` gana una prop `initialProduct` y pasa a usarse en dos modos: pantalla completa (rutas existentes de App, sin cambios) y capa `fixed inset-0` montada dentro de `ProductManagement`, que así nunca se desmonta. Antes de eso, el diálogo de producto deja de mandar `ingredients` en el PUT, porque reabrirlo con una copia vieja de la receta la sobreescribiría.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind (CSS **precompilado**), Radix UI, sonner (toasts), Supabase Edge Functions (Hono/Deno), `node --test` para tests de funciones puras.

**Spec:** [docs/superpowers/specs/2026-09-03-configurar-receta-navegacion-design.md](../specs/2026-09-03-configurar-receta-navegacion-design.md)

## Global Constraints

- **Tailwind está precompilado en `src/index.css`.** Una clase que no exista ahí falla en silencio. El máximo z-index disponible es `z-50`; `z-[60]` NO existe y no debe usarse. Verificar cualquier clase nueva contra `src/index.css` antes de escribirla.
- **No se toca el backend ni el esquema de la base.** Ningún archivo bajo `supabase/`.
- **No se toca la ruta `productIngredients` de `App.tsx`** ni los tres accesos existentes al configurador (Perfil, Área de Producción, Dashboard de Producción). Deben seguir funcionando igual.
- **`node --test src/utils/*.test.ts` (`npm run test`) debe quedar verde.** Baseline actual: 38 tests pasando.
- **`npx tsc --noEmit` NO sale limpio hoy.** Arrastra 4 errores preexistentes (`TS1010: '*/' expected`) en `src/_redirects/` y `src/public/_redirects/`, archivos basura que dejó Figma Make y que no tienen relación con este trabajo. Verificar siempre con `npx tsc --noEmit 2>&1 | grep -v "_redirects/"`, que sí sale vacío. No intentar arreglarlos: es limpieza aparte.
- **Los archivos en `src/utils/` corren bajo type-stripping de Node 24.** Importar tipos desde `./api` (que es `api.tsx`) solo con `import type`, que se borra en runtime. Patrón de referencia: `src/utils/categoryTree.ts:1`.
- **Comentarios en español**, explicando el *por qué* y no el *qué*, siguiendo el estilo del archivo que se edita.
- **El orden de las tareas es deliberado.** La Tarea 1 elimina el riesgo de pérdida de datos que la Tarea 3 activaría. No reordenar 1 y 3.

---

## File Structure

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/components/ProductManagement.tsx` | Deja de escribir recetas; monta la capa del configurador | 1, 3 |
| `src/components/ProductIngredientConfig.tsx` | Acepta un producto inicial y hace scroll hasta él | 2 |
| `src/App.tsx` | Se le quita la prop muerta `onManageRecipe` | 4 |
| `src/utils/productPayload.ts` *(nuevo)* | Arma el payload del PUT/POST de producto | 5 |
| `src/utils/productPayload.test.ts` *(nuevo)* | Tests de regresión del payload | 5 |

---

### Task 1: El diálogo de producto deja de escribir recetas

El bloque "Receta" del diálogo es read-only desde el spec del 29-jun, pero `handleSubmit` sigue mandando `ingredients` y el backend borra y reinserta la receta con esa copia. Hay que quitarlo **antes** de la Tarea 3, que es la que hace posible sostener una copia vieja.

Al quitarlo, todo el andamiaje que existía solo para alimentar ese round-trip queda muerto: el estado `ingredients`, `loadIngredients`, la conversión de unidades y el campo `formData.ingredients`. Se va todo junto.

**Files:**
- Modify: `src/components/ProductManagement.tsx`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `ProductFormData` sin el campo `ingredients`. La Tarea 5 la mueve a `src/utils/productPayload.ts` con esa forma.

- [ ] **Step 1: Reemplazar el contador de la receta por uno derivado de la lista viva**

En `src/components/ProductManagement.tsx`, junto a los otros valores derivados (después de `const hayFiltroActivo = ...`, alrededor de la línea 445), agregar:

```tsx
  // El contador sale de `products` y no de `formData`: así el loadProducts(true)
  // que corre al cerrar la capa de receta lo refresca solo, sin cablear nada más.
  const recetaCount = editingProduct
    ? (products.find(p => p.id === editingProduct.id)?.ingredients?.length ?? 0)
    : 0;
```

Y en el JSX del bloque "Receta" (línea ~1237) reemplazar:

```tsx
                        {formData.ingredients.length} ingrediente{formData.ingredients.length !== 1 ? 's' : ''} configurado{formData.ingredients.length !== 1 ? 's' : ''}
```

por:

```tsx
                        {recetaCount} ingrediente{recetaCount !== 1 ? 's' : ''} configurado{recetaCount !== 1 ? 's' : ''}
```

- [ ] **Step 2: Quitar `ingredients` del payload**

En `handleSubmit`, borrar por completo estas líneas del objeto `productData` (líneas ~290-301):

```tsx
        ingredients: formData.ingredients.map(pi => {
          // Convert back to base unit if necessary before saving
          let quantityToSave = pi.quantity;
          const unit = pi.inputUnit;
          if (unit === 'g' || unit === 'ml') {
            quantityToSave = quantityToSave / 1000;
          }
          return {
            ingredientId: pi.ingredientId,
            quantity: quantityToSave
          };
        }),
```

Y borrar también el log de debug de la línea ~256:

```tsx
      console.log('📝 [DEBUG] Form Ingredients:', formData.ingredients);
```

Omitir el campo es seguro: el POST del backend exige `ingredients.length > 0` (`supabase/functions/make-server-6d979413/index.ts:821`) y el PUT solo entra al bloque si el campo viene definido (`:987`).

- [ ] **Step 3: Quitar el campo `ingredients` del formulario**

Tres puntos en el mismo archivo:

`interface ProductFormData` (línea ~71) — borrar la línea:

```tsx
  ingredients: (ProductIngredient & { inputUnit?: string })[];
```

`emptyForm` (línea ~87) — borrar la línea `ingredients: []` **y la coma de la línea anterior**, para que `allowDecimal: false` quede como último campo:

```tsx
  unlimitedStock: false,
  allowDecimal: false
};
```

`handleOpenDialog` (líneas ~177-200) — borrar el bloque completo de conversión de unidades, desde el comentario `// Transform ingredients for display` hasta el cierre del `forEach`, y en el `setFormData` de más abajo borrar la línea `ingredients: displayIngredients` junto con la coma de la línea previa (`allowDecimal: ...` pasa a ser el último campo).

- [ ] **Step 4: Quitar el estado de ingredientes, que ya no lo usa nadie**

`ingredients` / `setIngredients` solo existían para la conversión de unidades recién borrada. Eliminar:

- Línea ~94: `const [ingredients, setIngredients] = useState<Ingredient[]>([]);`
- Línea ~115: la llamada `loadIngredients();` dentro del `useEffect`
- Líneas ~163-170: la función `loadIngredients` completa

Y en el import de la línea 2, quitar `ingredientsAPI`, `type Ingredient` y `type ProductIngredient`, que quedan sin uso:

```tsx
import { Product, Category, categoriesAPI, ProductionArea, productionAreasAPI, businessAPI, notificationsAPI, profileAPI } from '../utils/api';
```

- [ ] **Step 5: Verificar que no quedaron referencias sueltas**

```bash
npx tsc --noEmit 2>&1 | grep -v "_redirects/"
```
Expected: sin salida. (El `grep -v` filtra 4 errores preexistentes — ver Global Constraints.)

```bash
grep -n "formData.ingredients\|loadIngredients\|setIngredients" src/components/ProductManagement.tsx
```
Expected: sin resultados.

```bash
npm run test
```
Expected: 38 tests pasando.

- [ ] **Step 6: Verificación manual**

Levantar el dev server. Abrir Gestión de Productos → "Queque Vainilla 500 grs".

- El bloque "Receta" sigue diciendo **3 ingredientes configurados** (ahora viene de `products`, no de `formData`).
- Cambiar el precio y guardar.
- Recargar la página y volver a abrir el producto: sigue diciendo 3.

Confirmar en base que la receta quedó intacta:

```sql
select i.name, pi.quantity
from product_ingredients pi
join ingredients i on i.id = pi.ingredient_id
where pi.product_id = '054f1120-8448-4a76-a498-1ae2c15839e9';
```
Expected: Mix Queque Neutro 0.3120, Aceite Vegetal 0.0281, Huevos 0.0625.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "fix: el diálogo de producto deja de reescribir la receta

El bloque Receta es read-only desde el rediseño de materias primas, pero
handleSubmit seguía mandando \`ingredients\` y el backend borra y reinserta
todas las filas con esa copia. Con el diálogo desmontándose al salir era
inofensivo; deja de serlo en cuanto el diálogo sobreviva a la navegación.

Arrastra el andamiaje que solo alimentaba ese round-trip: el estado
\`ingredients\`, \`loadIngredients\` y la conversión de unidades. El contador
pasa a derivarse de la lista de productos."
```

---

### Task 2: `ProductIngredientConfig` acepta un producto inicial

Hoy el componente hace `setSelectedProduct(productsData[0])` y el listado viene alfabético, así que siempre aterriza en el primer producto del abecedario. Esta tarea le permite recibir cuál preseleccionar.

**Files:**
- Modify: `src/components/ProductIngredientConfig.tsx`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `ProductIngredientConfigProps` con `initialProduct?: Product`. La Tarea 3 la usa.

- [ ] **Step 1: Agregar la prop y el ref para el scroll**

En `src/components/ProductIngredientConfig.tsx`, extender la interfaz (línea ~16):

```tsx
interface ProductIngredientConfigProps {
  onBack: () => void;
  accessToken: string;
  // Cuando se entra desde "Configurar receta" de un producto puntual. Sin esto,
  // el componente preselecciona el primer producto alfabético y el usuario
  // termina editando la receta equivocada.
  initialProduct?: Product;
}
```

Y la firma (línea ~21):

```tsx
export function ProductIngredientConfig({ onBack, accessToken, initialProduct }: ProductIngredientConfigProps) {
```

Agregar el import de `useRef` en la línea 1:

```tsx
import { useState, useEffect, useRef } from "react";
```

Y junto a los demás estados, un ref para el botón del producto preseleccionado:

```tsx
  // Solo se usa para llevar la columna izquierda hasta el producto preseleccionado.
  const botonPreseleccionado = useRef<HTMLButtonElement | null>(null);
```

- [ ] **Step 2: Preseleccionar el producto correcto al cargar**

En `loadInitialData`, reemplazar el bloque de las líneas ~98-100:

```tsx
      if (productsData.length > 0) {
        setSelectedProduct(productsData[0]);
      }
```

por:

```tsx
      if (initialProduct) {
        // Se busca en la lista recién cargada y no se usa `initialProduct` tal cual:
        // el objeto que llega por prop puede ser una copia vieja.
        const enLista = productsData.find(p => p.id === initialProduct.id);
        if (enLista) {
          setSelectedProduct(enLista);
        } else {
          // Sin fallback al primero de la lista: caer en la receta de otro producto
          // es exactamente el bug que se está arreglando.
          toast.error("Ese producto ya no está disponible");
        }
      } else if (productsData.length > 0) {
        setSelectedProduct(productsData[0]);
      }
```

- [ ] **Step 3: Colgar el ref del botón correcto y hacer scroll una sola vez**

En el `map` de la columna de productos (línea ~328), agregar el `ref` al `<button>`:

```tsx
                        <button
                          key={product.id}
                          ref={initialProduct && product.id === initialProduct.id ? botonPreseleccionado : undefined}
                          onClick={() => setSelectedProduct(product)}
```

Y agregar un efecto que dispare el scroll cuando termina la carga. Va después del `useEffect` que carga los ingredientes del producto seleccionado:

```tsx
  // Solo al terminar la carga inicial. Si dependiera de `selectedProduct`, saltaría
  // cada vez que el usuario elige otro producto de la lista, que ya está a la vista.
  useEffect(() => {
    if (loading || !initialProduct) return;
    botonPreseleccionado.current?.scrollIntoView({ block: "nearest" });
  }, [loading, initialProduct]);
```

- [ ] **Step 4: Verificar que no rompe el modo pantalla**

```bash
npx tsc --noEmit 2>&1 | grep -v "_redirects/"
```
Expected: sin salida. (El `grep -v` filtra 4 errores preexistentes — ver Global Constraints.)

Verificación manual — entrar al configurador desde **Perfil → Ingredientes por Producto** (que no pasa `initialProduct`):

- Sigue preseleccionando el primer producto alfabético ("Aceite Natura"), como siempre.
- No hay saltos de scroll al elegir otro producto de la lista.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductIngredientConfig.tsx
git commit -m "feat: el configurador de recetas acepta un producto inicial

Preseleccionaba productsData[0] y el listado viene alfabético, así que
entrar desde un producto puntual aterrizaba en la receta del primero del
abecedario. Agregar ingredientes ahí se los asignaba al producto equivocado.

Sin \`initialProduct\` el comportamiento no cambia."
```

---

### Task 3: La capa de receta dentro de Gestión de Productos

**Files:**
- Modify: `src/components/ProductManagement.tsx`

**Interfaces:**
- Consumes: `ProductIngredientConfig` con `initialProduct?: Product` (Tarea 2); `ProductFormData` sin `ingredients` (Tarea 1).
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Importar el configurador y agregar el estado de la capa**

En `src/components/ProductManagement.tsx`, junto a los otros imports de componentes (después de la línea 38):

```tsx
import { ProductIngredientConfig } from './ProductIngredientConfig';
```

Y junto a los demás estados:

```tsx
  // La receta se abre como capa y no navegando a otra pantalla: así este
  // componente no se desmonta y el diálogo, la búsqueda y el scroll sobreviven.
  const [recetaDe, setRecetaDe] = useState<Product | null>(null);
```

- [ ] **Step 2: Agregar las funciones de abrir y cerrar**

Junto a `handleCloseDialog`:

```tsx
  const abrirReceta = () => {
    if (!editingProduct) return;
    setRecetaDe(editingProduct);
    // Ojo: NO handleCloseDialog(), que además borra editingProduct, formData y
    // nameParts. Acá solo se baja la bandera; Radix desmonta el contenido del
    // diálogo pero el estado vive en este componente y vuelve intacto, incluidos
    // los campos a medio escribir.
    setIsDialogOpen(false);
  };

  const cerrarReceta = () => {
    setRecetaDe(null);
    setIsDialogOpen(true);
    // Silencioso para no perder el scroll de la grilla. Refresca `products`, y
    // con eso el contador de ingredientes del diálogo.
    // No tocar formData: conserva a propósito lo que el usuario no ha guardado.
    loadProducts(true);
  };
```

- [ ] **Step 3: Cablear el botón y esconderlo al crear un producto**

En el bloque "Receta" del diálogo (línea ~1240), reemplazar:

```tsx
                    {onManageRecipe && (
                      <Button type="button" variant="outline" onClick={onManageRecipe}>
                        Configurar receta
                      </Button>
                    )}
```

por:

```tsx
                    {/* Solo al editar: un producto que todavía no existe no tiene
                        receta que configurar, y el botón sacaba del formulario
                        perdiendo lo que se llevara escrito. */}
                    {editingProduct && (
                      <Button type="button" variant="outline" onClick={abrirReceta}>
                        Configurar receta
                      </Button>
                    )}
```

- [ ] **Step 4: Renderizar la capa**

Justo antes del cierre del JSX raíz del componente (al mismo nivel que el `<Dialog>`, después de él):

```tsx
      {/* z-50 y no más: el CSS de Tailwind está precompilado y z-50 es el máximo
          que existe. No compite con el diálogo porque abrirReceta lo cierra. */}
      {recetaDe && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
          <ProductIngredientConfig
            initialProduct={recetaDe}
            onBack={cerrarReceta}
            accessToken={accessToken}
          />
        </div>
      )}
```

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit 2>&1 | grep -v "_redirects/"
```
Expected: sin salida. (El `grep -v` filtra 4 errores preexistentes — ver Global Constraints.)

```bash
grep -n "z-\[" src/components/ProductManagement.tsx
```
Expected: sin resultados (ninguna clase z arbitraria, que no compilaría).

- [ ] **Step 6: Verificación manual — el escenario completo**

Con "Queque Vainilla 500 grs":

1. Filtrar por su categoría, buscarlo, bajar el scroll, abrirlo, **cambiar el precio sin guardar**.
2. "Configurar receta" → se abre la capa **con el Queque Vainilla ya seleccionado** y sus 3 ingredientes a la vista. La columna izquierda está scrolleada hasta él.
3. Agregar un ingrediente cualquiera.
4. Volver con la flecha → el diálogo reaparece **con el precio editado todavía puesto**, el contador dice **4 ingredientes**, y detrás siguen el filtro, la búsqueda y la posición de scroll.
5. Guardar el producto → recargar la página → siguen los 4 ingredientes. *(Este paso falla sin la Tarea 1.)*
6. Crear un producto nuevo → el bloque "Receta" **no** muestra el botón.
7. Entrar al configurador desde Perfil → sigue sin preselección propia, primer producto alfabético.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "feat: la receta se configura sin salir de Gestión de Productos

Se monta como capa a pantalla completa en vez de navegar, así el componente
no se desmonta y el diálogo, la búsqueda, el filtro y el scroll sobreviven al
viaje. El diálogo se cierra mientras la capa está abierta: el DialogContent de
Radix vive en un portal con z-50 y le ganaría por orden de DOM, y subir el
z-index no es opción con el CSS precompilado.

El botón deja de mostrarse al crear un producto, donde sacaba del formulario
perdiendo lo escrito."
```

---

### Task 4: Quitar la prop muerta `onManageRecipe`

**Files:**
- Modify: `src/components/ProductManagement.tsx`
- Modify: `src/App.tsx:1790-1792`

**Interfaces:**
- Consumes: la Tarea 3 dejó `onManageRecipe` sin uso.
- Produces: nada.

- [ ] **Step 1: Quitarla de `ProductManagement`**

Línea ~55, borrar de la interfaz:

```tsx
  onManageRecipe?: () => void;
```

Línea ~90, sacarla de la firma:

```tsx
export function ProductManagement({ accessToken, onBack, onManageCategories }: ProductManagementProps) {
```

- [ ] **Step 2: Quitarla del sitio de llamada en App**

En `src/App.tsx`, borrar las líneas ~1790-1792:

```tsx
            onManageRecipe={() =>
              irAPantalla("productIngredients")
            }
```

**No tocar** el bloque `currentScreen === "productIngredients"` (línea ~1829) ni las otras tres llamadas a `irAPantalla("productIngredients")` (líneas ~1740, ~1869, ~1883).

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit 2>&1 | grep -v "_redirects/"
```
Expected: sin salida. (El `grep -v` filtra 4 errores preexistentes — ver Global Constraints.)

```bash
grep -rn "onManageRecipe" src/
```
Expected: sin resultados.

```bash
grep -c "productIngredients" src/App.tsx
```
Expected: `5` (la unión de tipos, el bloque de render y los tres accesos).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/ProductManagement.tsx
git commit -m "refactor: quitar la prop onManageRecipe, ya sin uso

La receta se abre como capa dentro de Gestión de Productos. La ruta
productIngredients y sus tres accesos siguen igual."
```

---

### Task 5: Test de regresión del payload de producto

> **Adicional al spec.** Sin esto no queda ninguna protección automática contra que alguien vuelva a meter `ingredients` en el payload — el bug de la Tarea 1 reaparecería en silencio. Es un refactor contenido más tests, y se puede omitir sin afectar a las tareas 1-4.

De paso deja bajo test la regla de `stockSeToco`, que hoy solo está documentada en comentarios y ya causó un bug (`parseInt` truncando el stock decimal).

**Files:**
- Create: `src/utils/productPayload.ts`
- Create: `src/utils/productPayload.test.ts`
- Modify: `src/components/ProductManagement.tsx`

**Interfaces:**
- Consumes: `ProductFormData` sin `ingredients` (Tarea 1).
- Produces: `construirPayloadProducto({ formData, editingProduct, priceValue })` y el tipo `ProductFormData`, ambos exportados desde `src/utils/productPayload.ts`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/utils/productPayload.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirPayloadProducto, type ProductFormData } from './productPayload.ts';

const formBase: ProductFormData = {
  name: '  Queque Vainilla 500 grs  ',
  description: '  rico  ',
  price: '2.500',
  stock: '10',
  minStock: '3',
  category: 'Pastelería',
  categoryId: 'cat-1',
  sku: 'QV500',
  imageUrl: 'https://ejemplo/queque.png',
  productionAreaId: 'area-1',
  unlimitedStock: false,
  allowDecimal: false,
};

const productoBase = {
  id: 'p-1',
  stock: 10,
  unlimitedStock: false,
} as any;

// La razón de ser de este archivo: el diálogo de producto no edita recetas, así
// que mandar `ingredients` haría que el backend borre y reinserte la receta con
// una copia potencialmente vieja.
test('nunca incluye ingredients', () => {
  const payload = construirPayloadProducto({
    formData: formBase,
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal('ingredients' in payload, false);
});

test('recorta los campos de texto', () => {
  const payload = construirPayloadProducto({
    formData: formBase,
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.name, 'Queque Vainilla 500 grs');
  assert.equal(payload.description, 'rico');
});

// Si el stock no se tocó, mandarlo pisaría lo que haya cambiado por otro lado
// (un ajuste de stock, un pedido, otra sesión) mientras el diálogo estaba abierto.
test('omite stock cuando no se tocó', () => {
  const payload = construirPayloadProducto({
    formData: formBase,
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal('stock' in payload, false);
});

test('incluye stock cuando cambió', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, stock: '25' },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.stock, 25);
});

// Con parseInt, parseInt("9.5") = 9 nunca coincidía con 9.5: todo producto por
// peso daba "se tocó" y además mandaba el 9 truncado, comiéndose media unidad.
test('no considera tocado un stock decimal sin cambios', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, stock: '9.5', allowDecimal: true },
    editingProduct: { ...productoBase, stock: 9.5 },
    priceValue: 2500,
  });
  assert.equal('stock' in payload, false);
});

test('al crear siempre manda stock', () => {
  const payload = construirPayloadProducto({
    formData: formBase,
    editingProduct: null,
    priceValue: 2500,
  });
  assert.equal(payload.stock, 10);
});

test('stock ilimitado manda 0 y trackStock false', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, unlimitedStock: true },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.stock, 0);
  assert.equal(payload.trackStock, false);
  assert.equal(payload.unlimitedStock, true);
});

test('minStock vacío viaja como null', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, minStock: '   ' },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.minStock, null);
});

test('categoría vacía cae en General', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, category: '   ' },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.category, 'General');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npm run test
```
Expected: FAIL — `Cannot find module './productPayload.ts'`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/utils/productPayload.ts`:

```ts
import type { Product } from './api';

export interface ProductFormData {
  name: string;
  description: string;
  price: string;
  stock: string;
  minStock: string;
  category: string;
  categoryId: string;
  sku: string;
  imageUrl: string;
  productionAreaId: string;
  unlimitedStock: boolean;
  allowDecimal: boolean;
}

interface Params {
  formData: ProductFormData;
  editingProduct: Product | null;
  priceValue: number;
}

/**
 * Arma el cuerpo del POST/PUT de producto.
 *
 * Deliberadamente NO incluye `ingredients`: el diálogo de producto no edita
 * recetas (son de ProductIngredientConfig), y el backend borra y reinserta
 * product_ingredients con lo que reciba. Mandar la copia que el diálogo tenía
 * al abrirse revierte cualquier cambio hecho mientras tanto.
 */
export function construirPayloadProducto({ formData, editingProduct, priceValue }: Params) {
  const eraIlimitadoAntes = editingProduct
    ? (editingProduct.unlimitedStock === true || editingProduct.stock === -1)
    : false;

  // parseFloat y no parseInt: `stock` es numeric en Postgres y un producto con
  // allowDecimal se queda en valores fraccionados (los pedidos le restan 0.5).
  const stockSeToco = !editingProduct
    || formData.unlimitedStock !== eraIlimitadoAntes
    || parseFloat(formData.stock) !== editingProduct.stock;

  return {
    name: formData.name.trim(),
    description: formData.description.trim(),
    price: priceValue,
    minStock: formData.minStock.trim() === '' ? null : (parseInt(formData.minStock) || 0),
    unlimitedStock: formData.unlimitedStock,
    trackStock: !formData.unlimitedStock,
    allowDecimal: formData.allowDecimal,
    category: formData.category.trim() || 'General',
    categoryId: formData.categoryId || undefined,
    sku: formData.sku.trim(),
    imageUrl: formData.imageUrl.trim() || undefined,
    productionAreaId: formData.productionAreaId || undefined,
    ...(stockSeToco
      ? { stock: formData.unlimitedStock ? 0 : (parseFloat(formData.stock) || 0) }
      : {})
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npm run test
```
Expected: PASS — 47 tests (38 previos + 9 nuevos).

- [ ] **Step 5: Usar el helper desde `ProductManagement`**

En `src/components/ProductManagement.tsx`:

- Borrar la `interface ProductFormData` local (línea ~58) e importar la del util, junto al import de `productName`:

```tsx
import { construirPayloadProducto, type ProductFormData } from '../utils/productPayload';
```

- En `handleSubmit`, reemplazar todo el bloque que va desde `const eraIlimitadoAntes = ...` hasta el cierre del objeto `productData` por:

```tsx
      const productData = construirPayloadProducto({
        formData,
        editingProduct,
        priceValue,
      });
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit 2>&1 | grep -v "_redirects/"
```
Expected: sin salida. (El `grep -v` filtra 4 errores preexistentes — ver Global Constraints.)

```bash
npm run test
```
Expected: 47 tests pasando.

Verificación manual: editar el precio de un producto y guardar → se guarda bien y el stock no cambia. Ajustar el stock desde "Ajustar Stock" y guardar → el stock nuevo se conserva.

- [ ] **Step 7: Commit**

```bash
git add src/utils/productPayload.ts src/utils/productPayload.test.ts src/components/ProductManagement.tsx
git commit -m "test: cubrir el payload de producto con tests de regresión

Extrae la construcción del cuerpo del POST/PUT a una función pura y la deja
bajo test. Guarda dos cosas que ya fallaron: que no se cuele \`ingredients\`
(borraría la receta con una copia vieja) y la regla de stockSeToco con
parseFloat, que con parseInt se comía media unidad en productos por peso."
```

---

## Notas de verificación final

Tras la última tarea, con el dev server levantado:

```bash
npx tsc --noEmit 2>&1 | grep -v "_redirects/" ; npm run test
```

Y el recorrido completo del Step 6 de la Tarea 3, que es el escenario que motivó todo el trabajo.

Consulta SQL para confirmar el estado de la receta del Queque Vainilla en cualquier momento:

```sql
select i.name, pi.quantity, i.unit
from product_ingredients pi
join ingredients i on i.id = pi.ingredient_id
where pi.product_id = '054f1120-8448-4a76-a498-1ae2c15839e9';
```
