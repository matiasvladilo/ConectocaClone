# Rediseño Materias Primas y Recetas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar el sistema de recetas en `product_ingredients`, mover el costo de mano de obra a una columna propia `products.labor_cost`, y centralizar la edición en la pantalla dedicada `ProductIngredientConfig`.

**Architecture:** El backend es una Supabase Edge Function (Hono) con tablas relacionales (`products`, `ingredients`, `product_ingredients`). El frontend es React + Vite + TypeScript. Se agrega una columna aditiva, se ajustan las rutas de productos, se actualiza la UI de dos componentes y se corre una migración única de datos para eliminar el ingrediente falso "Costo Mano de Obra".

**Tech Stack:** React 18, Vite 6, TypeScript, Supabase (Postgres + Edge Functions / Deno), Hono.

---

## Notas de entorno (leer antes de empezar)

- **No hay framework de tests** en el repo (`package.json` solo tiene `dev` y `build`).
  La verificación de compilación es `npm run build` (hace typecheck vía Vite). La
  verificación funcional es **manual en el navegador** con `npm run dev`.
- **Base de datos:** dev y producción comparten el proyecto Supabase
  `xxmiujtywnnlqmekakzq`. Las SQL de los Task 1 y Task 7 se ejecutan en el **SQL Editor
  del dashboard de Supabase** de ese proyecto. Se guardan en el repo como archivos `.sql`
  para registro.
- **Deploy del backend:** los cambios de `supabase/functions/make-server-6d979413/index.ts`
  requieren `supabase functions deploy make-server-6d979413` para tomar efecto. Si la CLI
  no está disponible, el cambio se pega manualmente en el editor de funciones de Supabase.
- Trabajar siempre en la rama `dev`.

---

## Estructura de archivos

- **Crear:** `supabase/migrations/20260629_add_labor_cost.sql` — columna `labor_cost`.
- **Crear:** `supabase/migrations/20260629_migrate_labor_cost.sql` — migración de datos (Task 7).
- **Modificar:** `supabase/functions/make-server-6d979413/index.ts` — `toProduct`, POST/PUT products.
- **Modificar:** `src/utils/api.tsx` — interface `Product`, payloads de `productsAPI`.
- **Modificar:** `src/components/ProductIngredientConfig.tsx` — campo mano de obra, botón limpiar, quitar sync.
- **Modificar:** `src/components/ProductManagement.tsx` — quitar edición de receta + lógica del ingrediente falso, agregar resumen de solo lectura.

---

## Task 1: Agregar columna `labor_cost` a la tabla `products`

**Files:**
- Create: `supabase/migrations/20260629_add_labor_cost.sql`

- [ ] **Step 1: Crear el archivo SQL**

```sql
-- supabase/migrations/20260629_add_labor_cost.sql
-- Agrega el costo de mano de obra como columna propia del producto.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS labor_cost numeric NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Ejecutar la SQL en Supabase**

Ir al dashboard de Supabase (proyecto `xxmiujtywnnlqmekakzq`) → SQL Editor → pegar y ejecutar el contenido del archivo.
Expected: "Success. No rows returned".

- [ ] **Step 3: Verificar la columna**

En SQL Editor ejecutar:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'labor_cost';
```
Expected: una fila con `labor_cost | numeric | 0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260629_add_labor_cost.sql
git commit -m "feat(db): agregar columna labor_cost a products"
```

---

## Task 2: Backend — persistir y devolver `labor_cost`

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts` (`toProduct` ~75-99, POST ~662-728, PUT ~731-816)

- [ ] **Step 1: Mapear `labor_cost` en `toProduct`**

En `toProduct` (línea ~80, dentro del objeto retornado), agregar después de `ingredients,`:
```ts
    ingredients,
    laborCost: Number(r.labor_cost) || 0,
```

- [ ] **Step 2: Aceptar `laborCost` en POST /products**

En el handler `app.post(".../products")`, en el destructuring del body (línea ~671) agregar `laborCost`:
```ts
    const { name, description, price, image, imageUrl, stock, categoryId, productionAreaId, ingredients, unlimitedStock, allowDecimal, laborCost } = body;
```
Y en el `.insert({ ... })` del producto (línea ~680-692), agregar:
```ts
        production_area_id: productionAreaId || null,
        labor_cost: laborCost !== undefined ? Number(laborCost) : 0,
```

- [ ] **Step 3: Aceptar `laborCost` en PUT /products/:id**

En el handler `app.put(".../products/:id")`, en el destructuring (línea ~750) agregar `laborCost`:
```ts
    const { ingredients, imageUrl, image, name, description, price, stock, categoryId, productionAreaId, unlimitedStock, trackStock, allowDecimal, laborCost } = updates;
```
Y en la construcción de `updateData` (después de la línea ~776 `if (allowDecimal !== undefined)...`), agregar:
```ts
    if (laborCost !== undefined) updateData.labor_cost = Number(laborCost) || 0;
```

- [ ] **Step 4: Desplegar la edge function**

Run: `supabase functions deploy make-server-6d979413`
Expected: "Deployed Function make-server-6d979413". (Si no hay CLI, pegar el archivo en el editor de funciones de Supabase y guardar.)

- [ ] **Step 5: Verificar manualmente**

Con un token válido, hacer `GET /products` y confirmar que cada producto incluye `laborCost` (0 por defecto). Crear/editar un producto con `laborCost: 1500` y confirmar que persiste.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts
git commit -m "feat(api): persistir y devolver labor_cost en productos"
```

---

## Task 3: Frontend — tipos y payloads de `productsAPI`

**Files:**
- Modify: `src/utils/api.tsx` (interface `Product` ~15-31, `productsAPI.create` ~532-548, `productsAPI.update` ~550-556)

- [ ] **Step 1: Agregar `laborCost` a la interface `Product`**

En `interface Product` (después de `unlimitedStock?: boolean;`, línea ~23) agregar:
```ts
  laborCost?: number; // Costo de mano de obra por unidad (CLP)
```

- [ ] **Step 2: Aceptar `laborCost` en el payload de `create`**

En `productsAPI.create`, en la firma del objeto `product` (línea ~532-541) agregar:
```ts
    productionAreaId?: string;
    laborCost?: number;
    ingredients?: Array<{ ingredientId: string; quantity: number }>;
```
(El método ya hace `JSON.stringify(product)`, así que `laborCost` se envía automáticamente.)

- [ ] **Step 3: Verificar typecheck**

Run: `npm run build`
Expected: build exitoso, sin errores de TypeScript. (`update` ya acepta `Partial<Product>`, así que `laborCost` queda cubierto.)

- [ ] **Step 4: Commit**

```bash
git add src/utils/api.tsx
git commit -m "feat(api): agregar laborCost al tipo Product y payloads"
```

---

## Task 4: `ProductIngredientConfig` — campo mano de obra + botón limpiar + quitar sync

**Files:**
- Modify: `src/components/ProductIngredientConfig.tsx`

- [ ] **Step 1: Estado para el costo de mano de obra**

Después de `const [inputUnit, setInputUnit] = useState<string>("");` (línea ~34) agregar:
```ts
  const [laborCost, setLaborCost] = useState<string>("");
  const [savingLabor, setSavingLabor] = useState(false);
```

- [ ] **Step 2: Cargar el labor cost al seleccionar producto**

En el `useEffect([selectedProduct])` (línea ~42), dentro del `if (selectedProduct) {` agregar al inicio:
```ts
      setLaborCost(selectedProduct.laborCost ? String(selectedProduct.laborCost) : "");
```

- [ ] **Step 3: Función para guardar el labor cost**

Agregar esta función (después de `handleRemoveIngredient`, ~línea 207):
```ts
  const handleSaveLaborCost = async () => {
    if (!selectedProduct || savingLabor) return;
    try {
      setSavingLabor(true);
      const value = parseInt(laborCost.replace(/[^0-9]/g, "")) || 0;
      await productsAPI.update(accessToken, selectedProduct.id, { laborCost: value });
      setSelectedProduct({ ...selectedProduct, laborCost: value });
      setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, laborCost: value } : p));
      toast.success("Costo de mano de obra guardado");
    } catch (error: any) {
      console.error("Error saving labor cost:", error);
      toast.error(error.message || "Error al guardar costo de mano de obra");
    } finally {
      setSavingLabor(false);
    }
  };
```

- [ ] **Step 4: Función para limpiar la receta (con confirmación)**

Agregar después de `handleSaveLaborCost`:
```ts
  const handleClearRecipe = async () => {
    if (!selectedProduct) return;
    if (!confirm(`¿Seguro que querés limpiar TODA la receta de "${selectedProduct.name}"? Se eliminarán todos los ingredientes. El costo de mano de obra se conserva. Esta acción no se puede deshacer.`)) return;
    try {
      await productIngredientsAPI.setIngredients(accessToken, selectedProduct.id, []);
      toast.success("Receta limpiada");
      loadProductIngredients(selectedProduct.id);
    } catch (error: any) {
      console.error("Error clearing recipe:", error);
      toast.error(error.message || "Error al limpiar la receta");
    }
  };
```

- [ ] **Step 5: Incluir el labor cost en `calculateTotalCost`**

Reemplazar la función `calculateTotalCost` (línea ~267-275) por:
```ts
  const calculateTotalCost = () => {
    const ingredientsCost = productIngredients.reduce((total, pi) => {
      const ingredient = getIngredientDetails(pi.ingredientId);
      if (ingredient?.costPerUnit) {
        return total + (pi.quantity * ingredient.costPerUnit);
      }
      return total;
    }, 0);
    const labor = parseInt(laborCost.replace(/[^0-9]/g, "")) || 0;
    return ingredientsCost + labor;
  };
```

- [ ] **Step 6: Reemplazar el botón "Sincronizar Recetas" del header por "Limpiar receta"**

Reemplazar el `<Button onClick={handleSyncRecipes} ...>` del header (línea ~305-312) por:
```tsx
          {selectedProduct && (
            <Button
              onClick={handleClearRecipe}
              variant="outline"
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpiar receta
            </Button>
          )}
```

- [ ] **Step 7: Eliminar `handleSyncRecipes` y el import `RefreshCw`**

Borrar la función `handleSyncRecipes` completa (líneas ~213-265). En el import de lucide-react (línea 2) quitar `RefreshCw`. Verificar que `Trash2` ya esté importado (lo está, línea 2).

- [ ] **Step 8: Agregar el input de mano de obra en el header del producto**

En la "Product Info Header" Card (después del bloque de costos, ~línea 398, antes del `<Button onClick={() => setShowAddForm(true)}>`), agregar un bloque para editar mano de obra. Insertar dentro del `<div className="flex-1">` después del `</div>` de los costos:
```tsx
                          <div className="mt-3 flex items-center gap-2">
                            <label className="text-sm text-gray-600">Costo mano de obra (opcional):</label>
                            <input
                              type="text"
                              value={laborCost}
                              onChange={(e) => setLaborCost(e.target.value.replace(/[^0-9]/g, ""))}
                              onBlur={handleSaveLaborCost}
                              placeholder="0"
                              className="w-28 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <span className="text-xs text-gray-400">CLP</span>
                            {savingLabor && <span className="text-xs text-gray-400">guardando...</span>}
                          </div>
```

- [ ] **Step 9: Verificar typecheck**

Run: `npm run build`
Expected: build exitoso. Si TypeScript marca `selectedProduct.laborCost`, confirmar que Task 3 (interface `Product`) está aplicado.

- [ ] **Step 10: Commit**

```bash
git add src/components/ProductIngredientConfig.tsx
git commit -m "feat(recetas): campo mano de obra, limpiar receta y quitar sync en ProductIngredientConfig"
```

---

## Task 5: `ProductManagement` — quitar edición de receta y lógica del ingrediente falso

**Files:**
- Modify: `src/components/ProductManagement.tsx`

**Decisión clave:** ProductManagement deja de manejar `laborCost` por completo (estado,
campo, carga y guardado). El backend usa `if (laborCost !== undefined)`, así que al NO
enviar `laborCost` desde el formulario de producto, los guardados de producto **no pisan**
el valor configurado en la pantalla de recetas.

- [ ] **Step 1: Quitar la inyección del ingrediente falso y el envío de laborCost al guardar**

En `handleSubmit` (líneas ~252-282), eliminar todo el bloque que crea/agrega el ingrediente "Costo Mano de Obra":
- Borrar desde `let finalFormIngredients = [...formData.ingredients];` hasta el cierre del `if (laborCostValue > 0) { ... }` (línea ~282), incluyendo `const laborCostValue = ...`.
- Reemplazar las referencias posteriores a `finalFormIngredients` por `formData.ingredients`.

En el `productData` (línea ~296), cambiar:
```ts
        ingredients: finalFormIngredients.map(pi => {
```
por (sin agregar `laborCost`):
```ts
        ingredients: formData.ingredients.map(pi => {
```

- [ ] **Step 2: Quitar `laborCost` del estado del formulario y de la carga al editar**

- En `interface ProductFormData` (línea ~72) borrar la propiedad `laborCost: string;`.
- En `emptyForm` (línea ~87) borrar `laborCost: '',`.
- En la función que arma el form al editar (línea ~211, `laborCost: extractedLaborCost,`), borrar esa línea.
- Eliminar la lógica previa que extraía `extractedLaborCost` del ingrediente "Costo Mano de Obra" (el bloque ~líneas 170-211 que filtra/oculta el ingrediente especial). Los ingredientes de display pasan a ser directamente `product.ingredients` mapeados sin filtrar el falso.

- [ ] **Step 3: Eliminar la UI de receta y el campo "Costo Mano de Obra"**

- Borrar el bloque del campo "Costo Mano de Obra" (~líneas 870-885) que referencia `formData.laborCost`.
- Borrar el bloque JSX completo de edición de receta (desde `Receta del Producto (Ingredientes)` ~línea 1060 hasta el cierre de esa Card/sección ~línea 1390, incluyendo el Popover de búsqueda de ingredientes, la lista editable y el resumen de costos que usa `formData.laborCost`).

- [ ] **Step 4: Agregar resumen de solo lectura + link a la pantalla de recetas**

En el lugar donde estaba la receta, agregar un resumen de solo lectura. Requiere una prop nueva `onManageRecipe?: () => void` en la interface de props del componente y pasarla desde `App.tsx` (ver Task 6). Insertar:
```tsx
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Receta</Label>
                        <p className="text-sm text-gray-500">
                          {formData.ingredients.length} ingrediente{formData.ingredients.length !== 1 ? 's' : ''} configurado{formData.ingredients.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {onManageRecipe && (
                        <Button type="button" variant="outline" onClick={onManageRecipe}>
                          Configurar receta
                        </Button>
                      )}
                    </div>
                  </div>
```

- [ ] **Step 5: Limpiar imports y estado sin uso**

Quitar `isIngredientSearchOpen`/`setIsIngredientSearchOpen` (línea ~105) y los imports de `Popover`/`Command` y `ingredientsAPI`/`Ingredient`/`ProductIngredient` si quedaron sin uso tras borrar la receta. Verificar con el typecheck del Step 6.

- [ ] **Step 6: Verificar typecheck**

Run: `npm run build`
Expected: build exitoso. Resolver cualquier import/variable sin uso que marque TypeScript.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "refactor(productos): quitar edición de receta y costo falso del formulario de producto"
```

---

## Task 6: Conectar el link "Configurar receta" desde App.tsx

**Files:**
- Modify: `src/App.tsx` (render de `ProductManagement` y de `ProductIngredientConfig`)

- [ ] **Step 1: Pasar `onManageRecipe` a `ProductManagement`**

En el bloque donde se renderiza `<ProductManagement ... />` en `App.tsx`, agregar la prop:
```tsx
            onManageRecipe={() => setCurrentScreen("productIngredients")}
```

- [ ] **Step 2: Declarar la prop en la interface de `ProductManagement`**

En `src/components/ProductManagement.tsx`, en la interface de props del componente, agregar:
```ts
  onManageRecipe?: () => void;
```
Y desestructurarla en la firma de la función junto a las demás props.

- [ ] **Step 3: Verificar typecheck**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/ProductManagement.tsx
git commit -m "feat(productos): enlazar 'Configurar receta' a la pantalla de recetas"
```

---

## Task 7: Migración de datos — extraer el ingrediente falso "Costo Mano de Obra"

**IMPORTANTE:** Ejecutar este Task **después** de desplegar Task 2 y de aplicar los Tasks 4-6,
para que ninguna UI vuelva a crear el ingrediente falso.

**Files:**
- Create: `supabase/migrations/20260629_migrate_labor_cost.sql`

- [ ] **Step 1: Crear el archivo SQL de migración**

```sql
-- supabase/migrations/20260629_migrate_labor_cost.sql
-- Migra el ingrediente falso "Costo Mano de Obra" a products.labor_cost.
-- Reversible: hacer backup de product_ingredients antes de correr (ver Step 2).

-- 1. Copiar la cantidad del ingrediente falso a products.labor_cost
UPDATE products p
SET labor_cost = pi.quantity
FROM product_ingredients pi
JOIN ingredients i ON i.id = pi.ingredient_id
WHERE pi.product_id = p.id
  AND i.name = 'Costo Mano de Obra';

-- 2. Quitar las filas del ingrediente falso de las recetas
DELETE FROM product_ingredients pi
USING ingredients i
WHERE pi.ingredient_id = i.id
  AND i.name = 'Costo Mano de Obra';

-- 3. Eliminar el ingrediente falso del listado de materias primas
DELETE FROM ingredients
WHERE name = 'Costo Mano de Obra';
```

- [ ] **Step 2: Backup previo (reversibilidad)**

En el SQL Editor de Supabase, antes de migrar, ejecutar:
```sql
CREATE TABLE backup_product_ingredients_20260629 AS TABLE product_ingredients;
CREATE TABLE backup_ingredients_20260629 AS TABLE ingredients;
CREATE TABLE backup_products_labor_20260629 AS
  SELECT id, labor_cost FROM products;
```
Expected: tres tablas de backup creadas.

- [ ] **Step 3: Inspeccionar qué se va a migrar (dry-run)**

```sql
SELECT p.name AS producto, pi.quantity AS labor_cost_a_migrar
FROM product_ingredients pi
JOIN ingredients i ON i.id = pi.ingredient_id
JOIN products p ON p.id = pi.product_id
WHERE i.name = 'Costo Mano de Obra';
```
Expected: lista de productos con su costo de mano de obra. Revisar que tenga sentido.

- [ ] **Step 4: Ejecutar la migración**

Pegar y ejecutar el contenido de `20260629_migrate_labor_cost.sql` en el SQL Editor.
Expected: tres statements ejecutados sin error.

- [ ] **Step 5: Verificar el resultado**

```sql
-- No deben quedar referencias al ingrediente falso
SELECT count(*) FROM ingredients WHERE name = 'Costo Mano de Obra'; -- esperado: 0
-- Productos con labor_cost migrado
SELECT name, labor_cost FROM products WHERE labor_cost > 0;
```
Expected: 0 ingredientes falsos; productos con su `labor_cost` poblado.

- [ ] **Step 6: Commit del archivo de migración**

```bash
git add supabase/migrations/20260629_migrate_labor_cost.sql
git commit -m "feat(db): migrar costo de mano de obra desde ingrediente falso a labor_cost"
```

---

## Task 8: Verificación funcional end-to-end (manual)

**Files:** ninguno (pruebas en navegador con `npm run dev`).

- [ ] **Step 1: Levantar el entorno**

Run: `npm run dev`
Abrir http://localhost:3000 e iniciar sesión con un usuario con permisos de producción/admin.

- [ ] **Step 2: Pantalla de recetas — costo y mano de obra**

Ir a "Ingredientes por Producto". Seleccionar un producto, agregar ingredientes, escribir un costo de mano de obra y salir del campo (blur). Verificar:
- El costo total = suma de ingredientes + mano de obra.
- El margen se recalcula contra el precio.
- Recargar la pantalla: el costo de mano de obra persiste.

- [ ] **Step 3: Mano de obra vacía**

Dejar el costo de mano de obra vacío. Verificar que el costo total = solo ingredientes (mano de obra = 0) y no hay errores.

- [ ] **Step 4: Limpiar receta**

Usar "Limpiar receta", confirmar el diálogo. Verificar que se borran todos los ingredientes pero el costo de mano de obra se conserva.

- [ ] **Step 5: Formulario de producto**

Abrir el formulario de un producto. Verificar que ya NO se editan ingredientes ahí, que aparece el resumen "Receta: X ingredientes" y que el botón "Configurar receta" navega a la pantalla de recetas.

- [ ] **Step 6: Descuento en producción**

Crear una orden de producción en `BORRADOR` con un producto que tenga receta, pasarla a `EN_PROCESO`. Verificar:
- El stock de las materias primas baja según la receta.
- Si una materia prima queda bajo el mínimo, llega la notificación de stock bajo.
- El "Costo Mano de Obra" ya NO aparece como materia prima en el inventario.

- [ ] **Step 7: Build de producción**

Run: `npm run build`
Expected: build exitoso sin errores.

---

## Self-review (cobertura del spec)

- **Modelo de datos** (spec §1): Task 1 (columna), Task 2 (`toProduct`/rutas), Task 3 (tipos). ✓
- **Migración** (spec §2): Task 7 (extrae ingrediente falso, reversible, reemplaza sync). ✓
- **Pantalla de recetas** (spec §3): Task 4 (mano de obra, costo total, limpiar receta, quita sync). ✓
- **Formulario de producto** (spec §4): Task 5 (quita receta + costo falso, resumen) + Task 6 (link). ✓
- **Backend** (spec §5): Task 2 (labor_cost en rutas; descuento de producción intacto). ✓
- **Validación** (spec §6): Task 8 (pruebas manuales end-to-end). ✓
