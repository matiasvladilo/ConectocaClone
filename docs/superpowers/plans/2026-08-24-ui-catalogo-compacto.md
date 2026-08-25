# Catálogo Compacto y Filtro Más Claro — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer usable el catálogo desde el celular: tarjetas compactas en grilla, un filtro de categoría que se explique solo, y sacar una opción del formulario de nombre que nadie entiende.

**Architecture:** Tres cambios independientes sobre `ProductManagement.tsx` y `productName.ts`. Ninguno toca lógica de datos: se sacan campos de la vista de lista, se reubican dos botones al diálogo de edición que ya existe, y se corrige el texto y el ancho de un control. La única lógica nueva es sincronizar el formulario tras un ajuste de stock y cerrarlo tras un borrado.

**Tech Stack:** React 18 + TypeScript + Vite, Radix UI, `node --test` (nativo, sin dependencias nuevas).

**Spec:** [`docs/superpowers/specs/2026-08-24-ui-catalogo-compacto-design.md`](../specs/2026-08-24-ui-catalogo-compacto-design.md)

## Global Constraints

- **Tailwind está PRECOMPILADO.** No hay `tailwind.config`, ni PostCSS, ni la dependencia. [`src/index.css`](../../../src/index.css) es un CSS estático. **Una clase que no esté ahí no hace nada y no da ningún error.**
- **Las clases de valor arbitrario (`w-[...]`, `text-[...]`) casi nunca existen.** Ya verificado: `w-[130px]` y `sm:w-[180px]`, que el código usa HOY en el filtro, **no existen** — nunca hicieron nada. Toda medida a mano va por `style={{ ... }}` inline.
- **Clases verificadas como PRESENTES** (usables sin chequear de nuevo): `grid-cols-2`, `sm:grid-cols-3`, `md:grid-cols-4`, `lg:grid-cols-6`, `w-full`, `flex-col`, `sm:flex-row`, `cursor-pointer`, `object-contain`, `h-28`, `line-clamp-2`, `leading-tight`, `truncate`, `shrink-0`, `gap-2`, `gap-3`, `p-2`, `p-3`, `text-xs`, `text-sm`, `text-[10px]`, `font-medium`, `mb-1`, `rounded-lg`, `rounded-xl`, `overflow-hidden`, `items-center`, `justify-between`, `flex-1`, `w-5`, `h-5`.
- **Clases verificadas como AUSENTES** (nunca usarlas): `aspect-square`, `grid-cols-3`, `md:grid-cols-3`, `xl:grid-cols-6`, `text-[11px]`, `w-[130px]`, `sm:w-[180px]`, **`bg-gray-100/50`** (la usa la tarjeta actual y nunca se aplicó).
- Para cualquier clase fuera de esas listas: `grep -F ".mi-clase" src/index.css` antes de escribirla. **Ojo con el escapado:** en el CSS, tanto los dos puntos como las barras van escapados — `sm:foo` aparece como `.sm\:foo` y `bg-gray-100/50` como `.bg-gray-100\/50`. Un `grep -F ".sm:foo"` da un **cero falso**. Usar: `grep -cF "$(printf '%b' ".sm\\:foo")" src/index.css`.
- **Código y comentarios en español**, explicando POR QUÉ, no qué.
- **No cambiar lógica de datos.** El filtrado (`idsDeCategoriaConHijas`), la composición de nombres y el guardado de stock quedan como están.
- **Verificación en cada tarea:** `npm test` (31 tests), `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects` sin salida, y `npm run build` exitoso.
- **Sin verificación en navegador por parte del implementador.** No hay credenciales de Supabase en el entorno de ejecución. La pasada visual la hace el usuario al final.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/utils/productName.ts` | sacar `un` de la lista de unidades | 1 |
| `src/utils/productName.test.ts` | test de la lista actualizado | 1 |
| `src/components/ProductManagement.tsx` | filtro con etiqueta fija y ancho real | 2 |
| `src/components/ProductManagement.tsx` | grilla compacta + acciones movidas al diálogo | 3 |

Las tareas 2 y 3 tocan el mismo archivo pero zonas distintas y sin solapamiento (la barra de búsqueda ~línea 642 vs. la grilla ~línea 738 y el `DialogFooter` ~línea 1213). Se mantienen separadas porque un revisor puede aprobar una y rechazar la otra.

---

### Task 1: Sacar la unidad `un` de Presentación

**Files:**
- Modify: `src/utils/productName.ts` (`UNIDADES_PRESENTACION`, ~línea 32)
- Modify: `src/utils/productName.test.ts` (~línea 63)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `UNIDADES_PRESENTACION` con 5 entradas — `['ml','L','g','kg','otro']`. `ProductNameFields.tsx` la consume sin cambios (itera la lista, no la asume de largo fijo).

- [ ] **Step 1: Actualizar el test primero y verlo fallar**

En `src/utils/productName.test.ts`, el test de la línea ~62 pasa a:

```ts
// No se ofrece 'cc' porque duplicaría a 'ml' para la misma magnitud, ni 'un'
// porque se solapa con el campo "Unidades por paquete": un producto sin medida
// física se carga dejando la presentación vacía.
test('la lista de unidades es cerrada, sin cc ni un', () => {
  const valores = UNIDADES_PRESENTACION.map(u => u.value);
  assert.deepEqual(valores, ['ml', 'L', 'g', 'kg', 'otro']);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — el test nuevo reporta que recibió `['ml','L','g','kg','un','otro']` y esperaba 5 valores.

- [ ] **Step 3: Sacar `un` de la lista**

En `src/utils/productName.ts`, borrar la línea `{ value: 'un', label: 'un' },` y ajustar el comentario que encabeza la constante:

```ts
// Lista CERRADA a propósito. No se ofrece 'cc' aunque se use en la práctica:
// tener 'ml' y 'cc' como opciones distintas para la misma magnitud reintroduce
// exactamente la inconsistencia que este formulario viene a eliminar.
// Tampoco se ofrece 'un': se solapaba con el campo "Unidades por paquete" y
// nadie entendía cuál llenar. Un producto sin medida física (un encendedor, una
// caja de café) se carga dejando la presentación vacía y usando solo ese campo.
export const UNIDADES_PRESENTACION = [
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'L' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'otro', label: 'Otro…' },
];
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test`
Expected: PASS — 31 tests, 0 fail.

- [ ] **Step 5: Typecheck y build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects && npm run build`
Expected: sin errores de tipos; build exitoso.

- [ ] **Step 6: Commit**

```bash
git add src/utils/productName.ts src/utils/productName.test.ts
git commit -m "fix: la unidad 'un' se solapaba con unidades por paquete"
```

---

### Task 2: Filtro de categoría con etiqueta fija y ancho real

**Files:**
- Modify: `src/components/ProductManagement.tsx` (`nombreDelFiltro` ~línea 404; el `CardContent` de búsqueda ~línea 642; el `SelectTrigger` ~línea 663)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: nada que consuman tareas posteriores.

Contexto: hoy el disparador muestra `nombreDelFiltro`, que vale `'Filtrar'` sin filtro y el nombre de la categoría con filtro — así el control **nunca** dice qué filtra. Además el buscador y el filtro comparten fila incluso en celular, y las clases de ancho que hay escritas no existen en el CSS.

- [ ] **Step 1: Que el fallback sea "Todas" en vez de "Filtrar"**

En `src/components/ProductManagement.tsx` (~línea 404), reemplazar:

```ts
  // El disparador muestra SIEMPRE la palabra "Categoría" (se renderiza aparte) y
  // este valor al lado. Antes este texto REEMPLAZABA a "Filtrar", así que el
  // control nunca decía qué filtraba: o decía "Filtrar" (vago) o el nombre de una
  // categoría (sin contexto).
  const nombreDelFiltro = selectedCategoryFilter === 'all'
    ? 'Todas'
    : (categories.find(c => c.id === selectedCategoryFilter)?.name || 'Todas');
```

- [ ] **Step 2: Apilar buscador y filtro en celular**

En el mismo archivo (~línea 642), el `CardContent` pasa de `className="p-4 flex flex-row gap-3"` a:

```tsx
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
```

- [ ] **Step 3: Ancho real y etiqueta fija en el disparador**

Reemplazar el `<div className="shrink-0">` que envuelve al `<Select>` y el `<SelectTrigger>` entero (~líneas 661-670) por:

```tsx
              <div className="w-full sm:w-auto sm:shrink-0">
                <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                  {/* El ancho va inline y no por `w-[...]`: las clases de valor
                      arbitrario no existen en el CSS precompilado de este proyecto.
                      Las que había acá antes (w-[130px] sm:w-[180px]) no hacían nada. */}
                  <SelectTrigger
                    className="h-11 bg-white border-[#CBD5E1] w-full"
                    style={{ borderRadius: '10px', minWidth: '190px' }}
                  >
                    <div className="flex items-center gap-2 text-gray-600 overflow-hidden">
                      <Filter className="w-4 h-4 shrink-0" />
                      {/* "Categoría" no se trunca nunca: es lo que le dice al
                          usuario qué hace este control. Se trunca solo el valor. */}
                      <span className="font-medium text-sm shrink-0">Categoría</span>
                      <span className="text-sm truncate">· {nombreDelFiltro}</span>
                    </div>
                  </SelectTrigger>
```

El `</Select>` y el `</div>` de cierre quedan donde están. El `<SelectContent>` **no se toca**.

- [ ] **Step 4: Verificar las clases usadas**

Run: `for c in ".w-full" ".sm\\:w-auto" ".sm\\:shrink-0" ".flex-col" ".sm\\:flex-row" ".font-medium" ".truncate"; do printf "%-18s %s\n" "$c" "$(grep -cF "$(printf '%b' "$c")" src/index.css)"; done`
Expected: todas ≥ 1. Si alguna da 0, reemplazarla por `style` inline y anotarlo en el reporte.

- [ ] **Step 5: Typecheck y build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects && npm run build && npm test`
Expected: sin errores; build exitoso; 31 tests pasando.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "fix: el filtro del catalogo ahora dice que filtra por categoria"
```

---

### Task 3: Grilla compacta y acciones dentro del diálogo

**Files:**
- Modify: `src/components/ProductManagement.tsx` (grilla ~líneas 738-892; `handleDelete` ~línea 358; `handleAjustarStock` ~línea 371; `DialogFooter` ~línea 1213)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: nada que consuman tareas posteriores.

Es la tarea grande. Se hace en este orden a propósito: primero los dos arreglos de comportamiento (Steps 1-2), después la grilla (Step 3), y al final los botones nuevos (Step 4). Así, si algo falla, la grilla ya tiene dónde delegar las acciones.

- [ ] **Step 1: Que borrar cierre también el formulario de edición**

Contexto: si se confirma el borrado desde adentro del diálogo de Editar, hoy quedaría abierto un formulario sobre un producto que ya no existe, y guardar ahí daría error del servidor.

En `handleDelete` (~línea 358), agregar el cierre del diálogo después de sacar el producto de la lista:

```ts
  const handleDelete = async () => {
    if (!isDeleting) return;

    try {
      await productsAPI.delete(accessToken, isDeleting.id);
      setProducts(products.filter(p => p.id !== isDeleting.id));
      toast.success('Producto eliminado exitosamente');

      // Si el borrado se disparó desde el diálogo de edición, hay que cerrarlo:
      // si no, queda un formulario abierto sobre un producto que ya no existe y
      // guardarlo devolvería un error del servidor.
      if (editingProduct?.id === isDeleting.id) {
        handleCloseDialog();
      }

      setIsDeleting(null);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error(error.message || 'Error al eliminar producto');
    }
  };
```

- [ ] **Step 2: Que el formulario refleje el stock recién ajustado**

Contexto: al ajustar el stock desde adentro del diálogo de edición, `formData.stock` y `editingProduct` se quedan con el valor viejo. El valor guardado NO se pierde (el resguardo del 2026-08-23 solo manda `stock` si el usuario lo tocó, y ahí los dos coinciden en el número viejo), pero el formulario **muestra** un número que no es el real, y alguien podría "corregirlo" a mano pisando el ajuste.

En `handleAjustarStock` (~línea 371), después de `setProducts(...)`:

```ts
      const actualizado = await productsAPI.update(accessToken, stockProduct.id, { stock: nuevoStock, modo });
      setProducts(products.map(p => (p.id === actualizado.id ? actualizado : p)));

      // Si el ajuste salió del diálogo de edición, ese formulario sigue mostrando
      // el stock viejo. Hay que sincronizar LAS DOS cosas: lo que se ve
      // (formData.stock) y la referencia contra la que se compara al guardar
      // (editingProduct). Si solo se actualizara una, guardar volvería a mandar
      // un stock desactualizado y pisaría este ajuste.
      if (editingProduct?.id === actualizado.id) {
        setEditingProduct(actualizado);
        setFormData(prev => ({ ...prev, stock: actualizado.stock.toString() }));
      }

      toast.success(`Stock de "${actualizado.name}" actualizado a ${nuevoStock}`);
      setStockProduct(null);
```

- [ ] **Step 3: Reemplazar la grilla de tarjetas**

Reemplazar el bloque completo que va desde `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">` (~línea 738) hasta su `</div>` de cierre (~línea 892), incluyendo el `filteredProducts.map` entero, por:

```tsx
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {filteredProducts.map((product, index) => {
              const esIlimitado = product.unlimitedStock || product.stock === -1;
              const colorEstado = esIlimitado ? '#6B7280'
                : product.stock === 0 ? '#EF4444'
                : product.stock < 10 ? '#F59E0B'
                : '#10B981';

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  // El delay se acota: con 249 productos, escalonar cada uno
                  // dejaría los últimos apareciendo más de 10 segundos después.
                  transition={{ delay: Math.min(index * 0.02, 0.4) }}
                >
                  {/* Todo el cuadrado abre Editar: los tres botones que había antes
                      no entran en ~150px de ancho, así que Ajustar Stock y Eliminar
                      viven ahora dentro de ese diálogo. */}
                  <Card
                    onClick={() => handleOpenDialog(product)}
                    className="border-2 hover:shadow-lg transition-all cursor-pointer h-full overflow-hidden"
                    style={{
                      borderRadius: '12px',
                      borderTopWidth: '3px',
                      borderTopColor: colorEstado,
                      borderLeftColor: '#E0EDFF',
                      borderRightColor: '#E0EDFF',
                      borderBottomColor: '#E0EDFF'
                    }}
                  >
                    <CardContent className="p-2">
                      {/* Altura fija y no `aspect-square`: esa clase NO existe en el
                          CSS precompilado de este proyecto y no haría nada. */}
                      {/* El fondo va inline: `bg-gray-100/50` (la que usaba la
                          tarjeta vieja) NO existe en el CSS y nunca se aplicó. */}
                      <div
                        className="w-full h-28 rounded-lg mb-1 overflow-hidden flex items-center justify-center"
                        style={{ background: 'rgba(243, 244, 246, 0.5)' }}
                      >
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Package className="w-8 h-8 text-blue-300" />
                        )}
                      </div>

                      <h3
                        className="text-[#0047BA] line-clamp-2 leading-tight mb-1"
                        style={{ fontSize: '12px', fontWeight: 600, minHeight: '30px' }}
                      >
                        {product.name}
                      </h3>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#0047BA]" style={{ fontSize: '13px', fontWeight: 700 }}>
                          {formatCLP(product.price)}
                        </span>
                        <span
                          className="text-[10px] font-medium truncate"
                          style={{ color: colorEstado }}
                        >
                          {esIlimitado ? '∞' : product.stock === 0 ? 'Sin stock' : product.stock}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
```

- [ ] **Step 4: Agregar Ajustar Stock y Eliminar al diálogo de edición**

En el `<DialogFooter>` (~línea 1213), agregar los dos botones **antes** del botón "Cancelar" que ya existe:

```tsx
            <DialogFooter>
              {/* Estas dos acciones vivían en la tarjeta del listado. Con la grilla
                  compacta ya no entran ahí, así que se movieron acá.
                  `type="button"` es obligatorio: el contenido del diálogo es un
                  <form> y sin eso dispararían un submit. */}
              {editingProduct && (
                <>
                  {!(editingProduct.unlimitedStock || editingProduct.stock === -1) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStockProduct(editingProduct)}
                      disabled={submitting}
                      className="border-[#0059FF] text-[#0059FF] hover:bg-blue-50"
                    >
                      <BoxIcon className="w-4 h-4 mr-1" />
                      Ajustar Stock
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDeleting(editingProduct)}
                    disabled={submitting}
                    className="border-red-500 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Eliminar
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={submitting}
              >
                Cancelar
              </Button>
```

El botón de submit ("Guardar Cambios") queda exactamente como está.

- [ ] **Step 5: Verificar que no quedaron imports muertos**

Los íconos `Edit`, `Tag` y `Barcode` podrían haber quedado sin uso tras sacar los botones y el badge de la tarjeta.

Run: `for i in Edit Tag Barcode Package BoxIcon Trash2; do printf "%-10s %s\n" "$i" "$(grep -c "$i" src/components/ProductManagement.tsx)"; done`
Expected: cada ícono con conteo ≥ 2 (import + uso). Si alguno da exactamente 1, solo está el import: quitarlo de la lista de imports de `lucide-react`.

- [ ] **Step 6: Verificar las clases nuevas de la grilla**

Run: `for c in ".grid-cols-2" ".sm\\:grid-cols-3" ".md\\:grid-cols-4" ".lg\\:grid-cols-6" ".h-28" ".object-contain" ".cursor-pointer" ".line-clamp-2" ".leading-tight" ".text-\[10px\]" ".w-8" ".h-8" ".hover\\:shadow-lg" ".transition-all" ".h-full" ".border-2"; do printf "%-22s %s\n" "$c" "$(grep -cF "$(printf '%b' "$c")" src/index.css)"; done`
Expected: **todas ≥ 1** (ya verificadas al escribir el plan). Cualquiera en 0 se reemplaza por `style` inline y se anota en el reporte.

- [ ] **Step 7: Typecheck, tests y build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects && npm test && npm run build`
Expected: sin errores de tipos; 31 tests pasando; build exitoso.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "feat: grilla compacta de productos con acciones en el dialogo"
```

---

## Verificación final (la hace el usuario en el navegador)

Nada de esto se puede verificar en el entorno de ejecución: no hay credenciales de Supabase.

- [ ] En celular se ven **2 cuadrados por fila**; en desktop, 6. (Si se ve 1 sola columna, una clase de grilla falló en silencio.)
- [ ] Un producto con foto la muestra sin deformarse; uno sin foto muestra el ícono.
- [ ] El color del borde superior sigue distinguiendo ilimitado / agotado / bajo / ok.
- [ ] Tocar cualquier parte de un cuadrado abre Editar con los datos correctos.
- [ ] Buscar por SKU sigue encontrando productos, aunque el SKU ya no se vea en la tarjeta.
- [ ] Sin filtro el control dice `Categoría · Todas`; con filtro, `Categoría · Bebidas`.
- [ ] En pantalla angosta, buscador y filtro quedan en filas separadas y el texto no se corta.
- [ ] Filtrar por una categoría padre sigue trayendo los productos de sus subcategorías.
- [ ] Al crear un producto, el selector de unidad ofrece ml / L / g / kg / Otro — **sin `un`**.
- [ ] Editar → Ajustar Stock → poner 50 → confirmar → **el campo Stock del formulario muestra 50**.
- [ ] Seguido de lo anterior, guardar sin tocar nada más → el stock sigue en 50.
- [ ] Editar → Eliminar → confirmar → se cierran **los dos** diálogos y el producto desaparece.
- [ ] En un producto de stock ilimitado, el botón Ajustar Stock no aparece.
- [ ] Al **crear** un producto nuevo, no aparecen ni Ajustar Stock ni Eliminar.
