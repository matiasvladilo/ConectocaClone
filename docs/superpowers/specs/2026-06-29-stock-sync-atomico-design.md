# Sincronización de Stock Atómica — Diseño

**Fecha:** 2026-06-29

## Problema

Los usuarios reportan dos síntomas al gestionar stock:

1. **Oversell:** se crean pedidos contra stock que ya fue descontado (race condition TOCTOU).
2. **Pantallas desactualizadas:** cuando despacho/producción cambian el stock (vía pedido o edición manual), los demás usuarios siguen viendo el número viejo y venden sobre eso.

### Causas raíz

- **Oversell:** `ordersAPI.create` (`src/utils/api.tsx`, ~líneas 236-357) hace la creación del pedido **enteramente del lado del cliente**: lee productos frescos, valida stock en JS y dispara N `productsAPI.update` con el nuevo stock (sobrescritura no atómica, read-modify-write). Dos clientes simultáneos leen el mismo stock y ambos descuentan → se vende de más. La ruta backend `POST /orders` existe pero está bypasseada y también es no atómica.
  - Histórico: el flujo se movió al cliente por un bug del backend ("Unlimited Stock Bug"): al pedir un producto de stock ilimitado, el backend le ponía `stock = 1` (lo trataba como producto con stock y lo descontaba). La solución nueva debe preservar el comportamiento correcto: **los productos ilimitados nunca se tocan**.
- **Pantallas desactualizadas:** el `setInterval` de 5 seg en `App.tsx` (~líneas 292-324) solo refresca pedidos y notificaciones, NO productos/stock. Los formularios (`NewOrderForm.tsx`) cargan productos una sola vez al montar (`loadProducts()`, ~línea 106) y nunca los refrescan.

### Alcance

- **En alcance:** descuento de stock de **productos** en pedidos de cliente (oversell) + propagación de cambios de stock (manual o por pedido) al resto de usuarios.
- **Fuera de alcance:** las órdenes de producción que suman stock de producto terminado (existe pero logística no lo usa hoy; se deja funcionando sin priorizar). El descuento de stock de ingredientes en producción no se modifica.

## Enfoque elegido

**Descuento atómico dentro de una función Postgres (RPC), todo en una transacción.** Reemplaza la combinación actual de "N updates de stock + `create_order_kv`" por una sola función que descuenta stock y crea el pedido juntos, o falla y revierte todo.

Enfoques descartados:
- **Centralizar en el backend `POST /orders`:** cambio más grande, esa ruta no se usa ni está testeada, igual requiere el primitivo atómico a nivel DB, y más riesgo de reintroducir el bug del ilimitado.
- **Concurrencia optimista en el update del cliente:** pedido y descuento siguen siendo pasos separados (ventana de carrera), lógica de reintentos frágil, no es atómico de verdad.

## Diseño

### Componente 1 — Función Postgres `create_order_with_stock`

Firma:

```sql
create_order_with_stock(order_id uuid, new_data jsonb, items jsonb) RETURNS void
```

`items` es un array JSON: `[{ "id": "<uuid>", "quantity": <numeric>, "name": "<texto>" }, ...]`.

Lógica (toda dentro de la transacción implícita de la función):

```
para cada item en items:
  SELECT ... FROM products WHERE id = item.id FOR UPDATE   -- lock de fila
  si es ilimitado (unlimited_stock OR NOT track_stock OR stock = -1):
    continuar (no tocar stock)
  si stock < quantity:
    RAISE EXCEPTION 'STOCK_INSUFICIENTE:<nombre>'
  UPDATE products SET stock = stock - quantity WHERE id = item.id
insertar el pedido en el KV (mismo INSERT que hace hoy create_order_kv)
```

Propiedades:
- **Atómico:** si un solo producto no tiene stock, se revierte todo (ni descuento ni pedido).
- **Sin oversell:** `SELECT ... FOR UPDATE` bloquea la fila; pedidos simultáneos del mismo producto se serializan.
- **Respeta ilimitados:** nunca descuenta productos ilimitados (no reintroduce el bug viejo).
- **Decimales:** `stock` y `quantity` son `numeric`; soporta cantidades con decimal.

Detección de ilimitado (columnas reales de `products`): `unlimited_stock = true OR track_stock = false OR stock = -1`.

> Validación previa: la lógica de descuento/atomicidad/ilimitados se probó con un script de prueba sobre tabla temporal. Resultados: descuento correcto (Empanada 5→3), ilimitado intacto (Café 0), y atomicidad confirmada (un fallo a mitad de lista revierte el descuento parcial → Empanada vuelve a 3).

### Componente 2 — Cliente `ordersAPI.create` (`src/utils/api.tsx`)

- **Eliminar** el bloque de validación de stock client-side (~líneas 267-302) y los `productsAPI.update`.
- Mantener el enriquecimiento de productos (`productionAreaId`, `areaStatus`) y la construcción de `newOrder`.
- Reemplazar `create_order_kv` por una sola llamada:

```ts
const { error } = await supabase.rpc('create_order_with_stock', {
  order_id: newOrderId,
  new_data: newOrder,
  items: orderData.products.map(p => ({ id: p.productId, quantity: p.quantity, name: p.name }))
});
```

El cliente deja de tener autoridad sobre el stock; solo pide y el servidor decide atómicamente.

### Componente 3 — Propagación vía polling (App.tsx + NewOrderForm.tsx)

- En el `setInterval` de ~5 seg de `App.tsx` (~líneas 292-324), agregar la recarga de productos junto a `loadOrders`/`loadNotifications`, para refrescar el stock en el estado global.
- En `NewOrderForm.tsx`, que hoy hace `loadProducts()` una sola vez al montar (~línea 106), refrescar también en el intervalo (o consumir los productos del estado global ya refrescado), para no validar contra stock viejo.
- Resultado: cambios de stock (manuales o por pedido) visibles en ≤5 seg en el resto de las sesiones.

### Manejo de errores

- `STOCK_INSUFICIENTE:<nombre>` → el cliente lo parsea y muestra `Stock insuficiente para "<nombre>"` (mismo texto que hoy), sin crear el pedido.
- Cualquier otro error de la RPC → `Error guardando pedido: <msg>` (igual que el `create_order_kv` actual).
- Por la atomicidad, un fallo no deja ni pedido ni stock descontado a medias.

## Testing

- **Ya validado:** descuento, respeto de ilimitados y atomicidad (script sobre tabla temporal, ver Componente 1).
- **En implementación:**
  - Concurrencia: dos pedidos simultáneos del mismo producto con stock justo → uno pasa, el otro recibe `STOCK_INSUFICIENTE`.
  - E2E manual: con dos sesiones, cambiar stock en una y verificar que la otra lo refleja en ≤5 seg; intentar un pedido sobre stock agotado y ver el rechazo.

## Riesgos / notas

- La definición de `create_order_kv` no está versionada en el repo (se creó a mano en Supabase). La nueva función debe replicar exactamente el `INSERT` al KV que hace `create_order_kv` para no romper el guardado de pedidos. Hay que obtener su definición actual antes de implementar.
- El polling de productos agrega carga: refrescar productos cada 5 seg. Aceptable según el patrón existente; si el payload es grande, evaluar traer solo lo necesario.
