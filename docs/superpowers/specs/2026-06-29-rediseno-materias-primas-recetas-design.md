# Rediseño: Materias Primas y Recetas de Ingredientes

**Fecha:** 2026-06-29
**Rama:** dev
**Estado:** Diseño aprobado, pendiente de plan de implementación

## Contexto y problema

La funcionalidad de materias primas y recetas está en desuso. Causas detectadas:

1. **Dos UIs editan recetas, generando confusión.** El formulario de producto
   (`ProductManagement.tsx`) y la pantalla dedicada (`ProductIngredientConfig.tsx`)
   ambos editan recetas. Existe un botón manual "Sincronizar Recetas" que sugiere
   (erróneamente) que son sistemas separados.

2. **Realidad técnica:** ambas UIs ya escriben en la **misma** tabla relacional
   `product_ingredients`. No hay una columna JSON legacy separada; lo que el
   frontend lee como `product.ingredients` es el join de `product_ingredients`
   mapeado por `toProduct` en el backend. Por lo tanto la "duplicación" es solo
   de interfaz, no de datos.

3. **Hack del costo de mano de obra:** el costo de producción se guarda como un
   ingrediente falso llamado "Costo Mano de Obra" (un row en la tabla `ingredients`
   con `unit = CLP`, `currentStock = 999999`, `costPerUnit = 1`), inyectado dentro
   de la receta y luego ocultado en la UI. Contamina el inventario de materias primas.

4. **El descuento de stock SÍ funciona** en el flujo de órdenes de producción: al
   pasar una orden de `BORRADOR` a `EN_PROCESO`, el backend lee `product_ingredients`,
   valida stock suficiente, descuenta `ingredients.current_stock` y notifica stock bajo.

## Objetivo

Unificar a un único sistema de recetas (la tabla `product_ingredients` como única
fuente de verdad) que sirva para **dos propósitos simultáneos**:

- **Control de costos / rentabilidad:** costo de cada producto = ingredientes + mano de obra.
- **Descuento de inventario:** las órdenes de producción descuentan materias primas
  automáticamente (comportamiento ya existente, se mantiene).

## Decisiones tomadas

- **Edición de recetas:** solo en la pantalla dedicada `ProductIngredientConfig`.
  El formulario de producto deja de editar ingredientes.
- **Costo de mano de obra:** campo propio del producto (`labor_cost`), separado de
  los ingredientes. **Opcional** — se puede dejar vacío y completar después.
- **Datos legacy:** se preservan mediante migración automática. Se reemplaza el botón
  manual "Sincronizar Recetas".
- **Limpiar receta:** botón con diálogo de confirmación (warning) por producto.

## Resguardos (seguridad de datos)

Nota: en este momento dev y producción comparten la misma base de datos Supabase
(`xxmiujtywnnlqmekakzq`); el proyecto de producción hardcodeado en `info.tsx`
(`tmyopjxujhtmhylfybcc`) está muerto (DNS no resuelve). El área a modificar está en
desuso, por lo que el riesgo es bajo, pero se aplican estos resguardos:

- **Cambios aditivos:** agregar la columna `labor_cost` no afecta datos ni flujos existentes.
- **Migración reversible:** no se borran datos sin posibilidad de revertir. La eliminación
  del ingrediente falso "Costo Mano de Obra" ocurre solo tras confirmar que su valor quedó
  copiado a `labor_cost`.
- **El flujo de descuento de producción no se toca.**

## Diseño

### 1. Modelo de datos

- **Única fuente de verdad:** tabla `product_ingredients` (sin cambios estructurales).
- **Nueva columna:** `products.labor_cost` — numérica, opcional, default `0`.
- **Deprecación:** el ingrediente falso "Costo Mano de Obra" deja de usarse y se elimina
  del listado de materias primas tras la migración.

### 2. Migración (una sola vez, reversible)

Por cada producto cuya receta incluya el ingrediente "Costo Mano de Obra":

1. Leer la `quantity` de ese ingrediente en `product_ingredients` (es el monto CLP de mano de obra).
2. Escribir ese valor en `products.labor_cost`.
3. Quitar la fila de "Costo Mano de Obra" de `product_ingredients` para ese producto.

Al finalizar, eliminar el ingrediente "Costo Mano de Obra" de la tabla `ingredients`.

Se elimina el botón "Sincronizar Recetas" de `ProductIngredientConfig` (queda obsoleto).

### 3. Pantalla de recetas (`ProductIngredientConfig`) — única pantalla de edición

- Mantiene el layout actual (lista de productos a la izquierda, configuración a la derecha).
- **Nuevo campo "Costo de mano de obra" (opcional):** editable, se puede dejar vacío.
  Persiste en `products.labor_cost` vía la API de productos.
- **Cálculo de costo:** costo total = Σ(cantidad × costo unitario de cada ingrediente) + `labor_cost`.
  El margen se calcula contra `product.price`.
- **Botón "Limpiar receta":** con diálogo de confirmación (warning). Borra todos los
  ingredientes del producto seleccionado en `product_ingredients`. No toca `labor_cost`.

### 4. Formulario de producto (`ProductManagement`)

- Se elimina la sección de edición de ingredientes/receta del formulario.
- Se reemplaza por un resumen de solo lectura: "Receta: X ingredientes · costo $Y",
  con un botón/link que navega a la pantalla de recetas.
- Se elimina la lógica del ingrediente falso "Costo Mano de Obra" (creación/ocultamiento).

### 5. Backend

- Agregar `labor_cost` a las rutas de productos:
  - `POST /products` y `PUT /products/:id`: aceptar y persistir `laborCost`.
  - `GET /products` y `toProduct`: incluir `laborCost` en la respuesta.
- **Sin cambios** en el flujo de descuento de órdenes de producción
  (`BORRADOR → EN_PROCESO`).

### 6. Validación / pruebas (en entorno dev)

- Crear y editar una receta; confirmar que el costo total y el margen incluyen mano de obra.
- Dejar la mano de obra vacía y confirmar que el cálculo no se rompe (mano de obra = 0).
- Usar "Limpiar receta" y confirmar que borra ingredientes pero conserva `labor_cost`.
- Correr una orden de producción `BORRADOR → EN_PROCESO` y confirmar que descuenta
  materias primas y dispara notificaciones de stock bajo.
- Confirmar que el formulario de producto ya no edita receta y que el resumen de solo
  lectura enlaza correctamente a la pantalla de recetas.

## Fuera de alcance

- Descuento de materias primas en pedidos de cliente (el descuento es solo en producción).
- Atomicidad transaccional del descuento de stock en producción (mejora separada).
- Crear un proyecto Supabase de dev aislado (se decidió proceder sobre la DB actual
  por ser un área en desuso).
