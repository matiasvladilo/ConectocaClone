# Ajuste Rápido de Stock — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ajustar el stock de un producto sea un botón y un número, en vez de abrir el formulario completo de edición.

**Architecture:** Un componente de diálogo nuevo (`StockAdjustDialog`) que concentra toda la aritmética de los dos modos (sumar / corregir total) y devuelve el stock final ya calculado, más un botón "Stock" en la tarjeta de producto que lo abre y persiste el resultado con el endpoint de actualización de producto que ya existe.

**Tech Stack:** React 18 + TypeScript + Vite · Tailwind (CSS **precompilado**, ver constraints) + Radix UI (`components/ui/*`) · sonner (toasts)

**Spec:** [`docs/superpowers/specs/2026-08-07-ajuste-rapido-de-stock-design.md`](../specs/2026-08-07-ajuste-rapido-de-stock-design.md)

## Global Constraints

- **Este proyecto NO tiene framework de tests.** `package.json` solo define `dev` y `build`. La verificación de cada tarea es: typecheck + prueba en navegador. No instales Jest/Vitest.
- **Comando de typecheck:** `npx tsc --noEmit 2>&1 | grep -v "_redirects"` → salida esperada **vacía**. Hay 4 errores preexistentes en `src/_redirects/` y `src/public/_redirects/` (artefactos de Figma) que ese grep filtra. Cualquier otra línea es un error tuyo.
- **⚠️ CRÍTICO — Tailwind NO se compila en este proyecto.** `src/index.css` es un bundle CSS ya compilado y no existen `tailwind.config.js` ni `postcss.config.js`. **Cualquier clase que no esté ya en ese archivo no hace nada, en silencio**: sin error, sin warning, el typecheck y el build pasan igual. Ya rompió una feature antes (`h-72` dejó un diálogo con altura 0). **Antes de escribir cualquier clase que no aparezca en este plan, verificala** con `grep -cE '\.LA-CLASE[,{ :]' src/index.css`. Todas las clases usadas en este plan ya fueron verificadas.
- **Idioma: español rioplatense** en interfaz, comentarios y mensajes de commit.
- **Usar los componentes de `src/components/ui/`** (Dialog, Button, Input, Label). No crear nuevos.
- No levantes servidores de desarrollo. La verificación en navegador la hace el controlador.

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/components/StockAdjustDialog.tsx` | Diálogo: modos, cálculo, validación. No conoce la API. | Crear |
| `src/components/ProductManagement.tsx` | Botón "Stock" en la tarjeta + persistir el resultado | Modificar |

---

### Task 1: Componente `StockAdjustDialog`

**Files:**
- Create: `src/components/StockAdjustDialog.tsx`

**Interfaces:**
- Consumes: el tipo `Product` de `src/utils/api.tsx` (ya existe, tiene `id`, `name`, `stock`, `unlimitedStock?`).
- Produces: componente exportado como **named export**, consumido por la Task 2:

```ts
interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onConfirm: (nuevoStock: number) => Promise<void>; // recibe el TOTAL final, no la diferencia
  saving?: boolean;
}
```

- [ ] **Step 1: Crear el componente**

Crear `src/components/StockAdjustDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { BoxIcon } from 'lucide-react';
import type { Product } from '../utils/api';

type Modo = 'sumar' | 'total';

interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onConfirm: (nuevoStock: number) => Promise<void>;
  saving?: boolean;
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  product,
  onConfirm,
  saving = false,
}: StockAdjustDialogProps) {
  const [modo, setModo] = useState<Modo>('sumar');
  const [valor, setValor] = useState('');

  const stockActual = product?.stock ?? 0;

  // Resetear al abrir/cambiar de producto: arrastrar el valor de un producto
  // anterior es la clase de error que deja stock mal cargado sin que se note.
  useEffect(() => {
    if (open) {
      setModo('sumar');
      setValor('');
    }
  }, [open, product?.id]);

  // Se acepta el signo menos para poder restar en modo "sumar" (mermas).
  const cantidad = /^-?\d+$/.test(valor.trim()) ? parseInt(valor.trim(), 10) : null;
  const hayNumero = cantidad !== null;
  const nuevoStock = !hayNumero ? null : modo === 'sumar' ? stockActual + cantidad : cantidad;
  const quedaNegativo = nuevoStock !== null && nuevoStock < 0;
  const puedeConfirmar = hayNumero && !quedaNegativo && !saving;

  const handleConfirmar = async () => {
    if (!puedeConfirmar || nuevoStock === null) return;
    await onConfirm(nuevoStock);
  };

  // No se puede cerrar mientras guarda, para no perder la operación a mitad.
  const handleOpenChange = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BoxIcon className="w-5 h-5 text-blue-600" />
            Ajustar stock
          </DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={modo === 'sumar' ? 'default' : 'outline'}
            onClick={() => setModo('sumar')}
            disabled={saving}
          >
            Sumar
          </Button>
          <Button
            type="button"
            variant={modo === 'total' ? 'default' : 'outline'}
            onClick={() => setModo('total')}
            disabled={saving}
          >
            Corregir total
          </Button>
        </div>

        <div className="text-sm text-gray-600">
          Stock actual: <span className="font-mono text-gray-900">{stockActual}</span>
        </div>

        <div>
          <Label htmlFor="stock-valor">
            {modo === 'sumar' ? 'Cuánto sumar' : 'Stock real contado'}
          </Label>
          <Input
            id="stock-valor"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && puedeConfirmar) {
                e.preventDefault();
                handleConfirmar();
              }
            }}
            placeholder={modo === 'sumar' ? 'Ej: 20' : 'Ej: 47'}
            inputMode="numeric"
            autoFocus
            autoComplete="off"
            disabled={saving}
          />
          <p className="text-xs text-gray-500 mt-1">
            {modo === 'sumar'
              ? 'Podés poner un número negativo para restar (mermas o roturas).'
              : 'Reemplaza el stock actual por este número.'}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-300 rounded-lg py-2 px-3 text-center">
          {!hayNumero ? (
            <span className="text-sm text-gray-500">Ingresá una cantidad</span>
          ) : quedaNegativo ? (
            <span className="text-sm text-red-600">
              El stock no puede quedar negativo
            </span>
          ) : (
            <span className="text-blue-700">
              {modo === 'sumar' ? (
                <>
                  {stockActual} {cantidad! < 0 ? '−' : '+'} {Math.abs(cantidad!)} ={' '}
                  <span className="text-2xl font-mono">{nuevoStock}</span> unidades
                </>
              ) : (
                <>
                  {stockActual} → <span className="text-2xl font-mono">{nuevoStock}</span> unidades
                </>
              )}
            </span>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmar}
            disabled={!puedeConfirmar}
            style={{ background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)', color: 'white' }}
          >
            {saving ? 'Guardando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Notas de implementación:
- El regex `/^-?\d+$/` acepta solo enteros con signo opcional. Un campo vacío, `abc` o `1.5` dan `cantidad === null` → Confirmar deshabilitado sin mensaje de error (el usuario todavía no hizo nada mal).
- En modo `total`, un número negativo hace `nuevoStock < 0` → cae en la rama de "no puede quedar negativo". No hace falta un caso aparte.
- `variant="default"` / `variant="outline"` son las variantes que ya expone `src/components/ui/button.tsx`; se usan para marcar cuál modo está elegido.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 3: Verificar que las clases CSS existen**

Este proyecto no compila Tailwind (ver Global Constraints), así que una clase inexistente falla en silencio.

Run:
```bash
for c in "max-w-md" "grid-cols-2" "gap-2" "font-mono" "bg-blue-50" "border-blue-300" "rounded-lg" "py-2" "px-3" "text-center" "text-2xl" "text-blue-700" "text-red-600" "text-xs" "mt-1"; do n=$(grep -cE "\.${c}[,{ :]" src/index.css); [ "$n" -eq 0 ] && echo "FALTA: $c"; done; echo "fin"
```
Expected: solo `fin` — ninguna línea que empiece con `FALTA:`.

- [ ] **Step 4: Commit**

```bash
git add src/components/StockAdjustDialog.tsx
git commit -m "feat: dialogo de ajuste rapido de stock con modos sumar y corregir total"
```

---

### Task 2: Botón "Stock" en la tarjeta y guardado

**Files:**
- Modify: `src/components/ProductManagement.tsx` (imports ~línea 35; estado ~línea 100; fila de acciones ~línea 777-795; montaje del diálogo al final del JSX)

**Interfaces:**
- Consumes: `StockAdjustDialog` de la Task 1, con props `{ open, onOpenChange, product, onConfirm: (nuevoStock: number) => Promise<void>, saving? }`.
- Produces: entregable final de la feature.

- [ ] **Step 1: Importar el componente**

En `src/components/ProductManagement.tsx`, debajo del import de `ImageUpload` (~línea 35), agregar:

```ts
import { StockAdjustDialog } from './StockAdjustDialog';
```

Import estático a propósito: el componente es chico y no arrastra dependencias pesadas, así que no necesita la carga diferida que sí usan `BarcodeScannerDialog` y `ImageCropDialog`.

- [ ] **Step 2: Agregar el estado**

Junto a los demás `useState` del componente (después de `searchScannerOpen`):

```ts
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [savingStock, setSavingStock] = useState(false);
```

- [ ] **Step 3: Agregar el handler de guardado**

Justo antes de `const filteredProducts = ...`, agregar:

```ts
  const handleAjustarStock = async (nuevoStock: number) => {
    if (!stockProduct) return;
    try {
      setSavingStock(true);
      // Se manda SOLO el stock: el backend actualiza únicamente los campos
      // presentes, así que la receta y el resto del producto quedan intactos
      // (y no se dispara el chequeo de permisos de recetas).
      const actualizado = await productsAPI.update(accessToken, stockProduct.id, { stock: nuevoStock });
      setProducts(products.map(p => (p.id === actualizado.id ? actualizado : p)));
      toast.success(`Stock de "${actualizado.name}" actualizado a ${nuevoStock}`);
      setStockProduct(null);
    } catch (error: any) {
      console.error('Error ajustando stock:', error);
      // El diálogo queda abierto con lo cargado, para poder reintentar.
      toast.error(error.message || 'Error al actualizar el stock');
    } finally {
      setSavingStock(false);
    }
  };
```

- [ ] **Step 4: Agregar el botón a la tarjeta**

Reemplazar el bloque de acciones (~línea 776-795) por:

```tsx
                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleOpenDialog(product)}
                        variant="outline"
                        size="sm"
                        className="flex-1 border-[#0059FF] text-[#0059FF] hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                      {/* En productos de stock ilimitado no hay nada que ajustar,
                          así que el botón no se muestra. */}
                      {!(product.unlimitedStock || product.stock === -1) && (
                        <Button
                          onClick={() => setStockProduct(product)}
                          variant="outline"
                          size="sm"
                          className="flex-1 border-[#0059FF] text-[#0059FF] hover:bg-blue-50"
                        >
                          <BoxIcon className="w-4 h-4 mr-1" />
                          Stock
                        </Button>
                      )}
                      <Button
                        onClick={() => setIsDeleting(product)}
                        variant="outline"
                        size="sm"
                        className="border-red-500 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
```

`BoxIcon` ya está importado en este archivo (se usa en la tarjeta de estadística "Stock Bajo" y en el campo Stock del formulario), no hace falta agregarlo a los imports de `lucide-react`.

- [ ] **Step 5: Montar el diálogo**

Junto a los otros diálogos montados al final del JSX del componente (donde están `BarcodeScannerDialog` y el `AlertDialog` de borrado), agregar:

```tsx
      <StockAdjustDialog
        open={!!stockProduct}
        onOpenChange={(abierto) => { if (!abierto) setStockProduct(null); }}
        product={stockProduct}
        onConfirm={handleAjustarStock}
        saving={savingStock}
      />
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "feat: boton de ajuste rapido de stock en la tarjeta de producto"
```

---

## Cierre

- [ ] **Verificación final**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"` → sin salida.
Run: `npm run build` → termina sin errores.

Si `build/index.html` queda modificado por el build, revertirlo con `git checkout build/` — no es código fuente.

- [ ] **Verificación funcional en navegador** (la hace el controlador)

En Gestión de Productos:
1. Sumar `20` a un producto con 30 → el resultado en vivo dice 50; tras confirmar la tarjeta muestra 50.
2. Sumar `-5` a un producto con 30 → resultado 25, se guarda.
3. Sumar `-100` a un producto con 30 → Confirmar deshabilitado, dice que no puede quedar negativo.
4. Corregir total a `47` → resultado 47, se guarda.
5. Corregir total a `-1` → Confirmar deshabilitado.
6. Campo vacío → Confirmar deshabilitado.
7. El botón Stock **no aparece** en un producto de stock ilimitado.
8. Abrir el diálogo en un producto, cancelar, abrirlo en otro → arranca en modo Sumar con el campo vacío.
9. Recargar la página tras confirmar → el stock nuevo persiste.
10. Confirmar en un producto que tiene receta → la receta sigue intacta.
11. Los tres botones de la tarjeta entran bien en el ancho en pantalla angosta.

- [ ] **Desplegar**

```bash
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev && git push origin dev
```

Feature puramente frontend: no requiere migración de base de datos ni redeploy de la Edge Function.
