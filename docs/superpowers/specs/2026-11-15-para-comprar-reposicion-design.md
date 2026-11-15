# «Para comprar»: reposición según rotación — diseño

Fecha: 2026-11-15
Estado: aprobado, pendiente de plan de implementación

## Problema

El panel de Distribuidora marca «Stock bajo» con un mínimo fijo por producto (`min_stock`, o 10 si
no está cargado). Ese número no mira cuánto sale cada producto: con la rotación rápida actual, un
producto que se despacha 30 unidades al día puede tener 40 en bodega, figurar como «OK» y agotarse
pasado mañana. Tampoco dice **cuánto comprar**.

La administración quiere ver qué productos están por agotarse y cuánto reponer de cada uno.

## Alcance

Parte 1 de 2. Esta parte usa solo datos de Conectoca (`products`, `stock_events`).

La parte 2 (diseño aparte) conecta con Oca Pricing para agregar **dónde** comprar, a qué precio y en
qué formato (redondear a la caja del proveedor), más una alerta de margen. Este diseño deja el
cálculo listo para recibir esos datos, pero no los incluye.

Fuera de alcance:
- Notificaciones push o avisos programados: el aviso es la lista en el panel (decisión del usuario).
- Días de cobertura distintos por producto: hay un único valor por negocio.
- Corregir la rotación por días en que el producto estuvo agotado (ver «Limitación conocida»).
- Registrar la compra desde la lista: la reposición se sigue cargando como hoy.

## Quién lo usa

Solo la administración (rol `admin`). Se agrega el permiso `distribucion.reposicion` a la matriz de
`authz.ts` con `['admin']`; el endpoint y la pestaña lo exigen.

## Cálculo

Para cada producto del negocio que controla stock (se excluyen `unlimitedStock`, `stock = -1` y
`trackStock = false`, igual que `calcularEstadoStock`):

| Valor | Fórmula |
|---|---|
| Ventana | 28 días hasta ahora. Si el producto se creó hace menos (`products.created_at`), la ventana empieza en su creación (mínimo 1 día). |
| Salidas netas | Σ `quantity` de `despacho` − Σ `quantity` de `devolucion` dentro de la ventana, con piso 0. `merma`, `ajuste` y `reposicion` no cuentan: no son demanda. |
| Rotación diaria | salidas netas ÷ días de la ventana |
| Días que alcanza | stock ÷ rotación (sin valor si la rotación es 0) |
| Mínimo manual | `min_stock` del producto, solo si está cargado (el 10 por defecto **no** se usa aquí) |

Un producto entra en «Para comprar» si se cumple al menos una de estas condiciones:
- tiene rotación > 0 y **días que alcanza < umbral de aviso**, o
- tiene mínimo manual y **stock ≤ mínimo manual**.

Cantidad sugerida, en la unidad en que se vende el producto (redondeada hacia arriba a entero):

```
porRotacion = rotación × días de cobertura − stock
porMinimo   = mínimo manual − stock            (solo si hay mínimo manual)
comprar     = máx(porRotacion, porMinimo, 1)
```

Si la rotación es 0 (sin salidas en la ventana), el producto solo puede entrar por el mínimo manual y
se marca «sin ventas recientes».

Orden de la lista: primero los agotados, luego por días que alcanza ascendente; al final los que
entraron solo por mínimo manual sin rotación.

Valores por defecto: **días de cobertura 7**, **umbral de aviso 3 días**. Límites al editar:
cobertura 1–60, umbral 1–30, y el umbral no puede superar la cobertura.

## Arquitectura

### Base de datos (migración nueva)

Tabla `business_replenishment_settings`, mismo patrón que `business_label_settings`:

```sql
business_id     uuid PRIMARY KEY
coverage_days   integer NOT NULL DEFAULT 7  CHECK (coverage_days BETWEEN 1 AND 60)
alert_days      integer NOT NULL DEFAULT 3  CHECK (alert_days BETWEEN 1 AND 30)
updated_at      timestamptz NOT NULL DEFAULT now()
updated_by      uuid
CHECK (alert_days <= coverage_days)
```

RLS activo sin políticas: solo la Edge Function (service_role) la toca, igual que `stock_events`.
Sin fila → se usan los valores por defecto.

### Edge Function (`make-server-6d979413`)

- `GET /distribution/replenishment` → lista calculada + ajustes vigentes.
  1. `verifyAuth`, `getProfile`, `tienePermiso(profile, 'distribucion.reposicion')`.
  2. Lee los productos del negocio y los ajustes.
  3. Una consulta a `stock_events` filtrada por `business_id`, `type IN ('despacho','devolucion')` y
     `created_at >= ahora − 28 días` (la ventana de los productos nuevos usa `products.created_at`,
     que ya viene con los productos). Con chequeo explícito de error (devolver 500, nunca `[]`).
  4. Pasa todo a la función pura `calcularReposicion` y devuelve el resultado.
- `PUT /distribution/replenishment/settings` → valida rangos y guarda (upsert) los dos números.

### Módulo puro `replenishment.ts`

Junto a `authz.ts`, sin dependencias de Supabase, con sus pruebas en `replenishment.test.ts`:

```ts
calcularReposicion(
  productos: ProductoStock[],
  salidas: Map<productId, { despachos: number; devoluciones: number }>,
  ajustes: { coverageDays: number; alertDays: number },
  ahora: Date,
): FilaReposicion[]
```

`ProductoStock` incluye `createdAt: string` (`products.created_at`), que la ventana usa para los productos nuevos.

`FilaReposicion`: id, nombre, categoría, stock, mínimo manual, rotación diaria, días que alcanza,
cantidad sugerida, motivo (`'pocos_dias' | 'agotado' | 'bajo_minimo' | 'sin_ventas_recientes'`).

Separarlo permite probar todos los casos sin base de datos y reutilizarlo en la parte 2.

### Frontend (`DistributionPanel.tsx`)

- Píldora nueva **«Para comprar»** junto a Agotados / Stock bajo / OK, con el contador. Solo visible
  con el permiso.
- Al elegirla, una lista agrupada (mismo estilo iOS del panel). Por fila: nombre, stock,
  «sale X/día», «alcanza N días» (o «agotado» / «sin ventas recientes») y **«Comprar N»** destacado.
- Encima de la lista, una fila con los dos números editables (cobertura y umbral). Al cambiarlos se
  guarda con el PUT y se recalcula.
- **Compartir lista**: arma texto plano («Para comprar — 15-11-2026\n• Coca-Cola 591: 48\n…») y lo
  abre con `@capacitor/share` (ya es dependencia) en la app móvil; en la web, `navigator.share` si
  existe y si no, copia al portapapeles con un aviso. El botón que hoy tiene el ícono de compartir en
  el encabezado descarga el Excel y no cambia.
- **Exportar Excel**: reutiliza `exportarLibroExcel` con las columnas de la lista.
- Llamadas nuevas en `utils/api` (`replenishmentAPI.get`, `replenishmentAPI.saveSettings`).

## Manejo de errores

- Error de consulta en el endpoint → 500 con mensaje; el panel muestra «No se pudo calcular la
  reposición» con botón Reintentar. Nunca una lista vacía que parezca «todo en orden».
- Ajustes fuera de rango → 400 con el motivo; el panel revierte el valor.
- Sin permiso → 403 y la pestaña no se muestra.

## Pruebas

`replenishment.test.ts` (`node:test`, como `authz.test.ts`; ya cubierto por el glob de `npm test`: `supabase/functions/make-server-6d979413/*.test.ts`):
- rotación con despachos y devoluciones; devoluciones mayores que despachos → piso 0;
- producto nuevo con ventana menor a 28 días;
- entra por pocos días; entra por mínimo manual; no entra si cubre el umbral;
- cantidad sugerida: por rotación, por mínimo, nunca menor a 1, redondeo hacia arriba;
- agotado con rotación → primero en el orden; sin ventas y sin mínimo → no aparece;
- productos sin control de stock excluidos.

`authz.test.ts`: el permiso nuevo es solo de `admin`.

Verificación manual: abrir el panel como admin y como producción (no debe ver la pestaña), cambiar
los ajustes, compartir y exportar.

## Limitación conocida

Si un producto estuvo agotado parte de la ventana, no se despachó por falta de stock y no por falta
de demanda: la rotación sale más baja que la real y la cantidad sugerida, menor. Se acepta para la
primera versión. Si en la práctica sugiere de menos, la corrección es dividir solo por los días con
stock > 0 (reconstruibles desde `stock_after`).
