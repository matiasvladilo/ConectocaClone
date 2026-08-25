# Subcategorías y Nombres Estructurados — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subcategorías (un nivel) dentro de las categorías y forzar un formato consistente en los nombres de producto nuevos, avisando de duplicados al crearlos.

**Architecture:** Las subcategorías son auto-referencia en la tabla `categories` (`parent_id`), con la regla de "un solo nivel" impuesta en el Edge Function. Toda la lógica pura (jerarquía de categorías, composición de nombres, detección de similares) vive en módulos sin React bajo `src/utils/`, testeados con `node --test`; los componentes solo los consumen.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (Postgres + Edge Function con Hono), Radix UI, `node:test` (nativo, sin dependencias nuevas).

**Spec:** [`docs/superpowers/specs/2026-08-23-subcategorias-y-nombres-estructurados-design.md`](../specs/2026-08-23-subcategorias-y-nombres-estructurados-design.md)

## Global Constraints

- **Tailwind está PRECOMPILADO.** No hay `tailwind.config`, ni PostCSS, ni la dependencia de Tailwind. [`src/index.css`](../../../src/index.css) es un CSS estático de ~6200 líneas. **Una clase que no esté ahí no hace nada y no da ningún error.** Ya verificado que NO existen: `pl-4`, `pl-6`, `pl-8`, `ml-4`, `border-amber-300`. Antes de escribir cualquier clase nueva: `grep -F ".mi-clase" src/index.css`. Si no está, usar `style={{ ... }}` inline.
- **Un solo nivel de anidamiento.** Categoría → subcategoría. Nunca más profundo. La regla se valida en el backend, que es el único lugar que no se puede saltear.
- **`GET /categories` sigue devolviendo la lista plana.** El árbol lo arma el frontend. Ningún consumidor actual se puede romper.
- **El nombre estructurado es solo al CREAR.** Editar un producto existente sigue mostrando el campo de texto libre.
- **El aviso de similares nunca bloquea el guardado.**
- **Idioma:** código y comentarios en español, igual que el resto del repo. Los comentarios explican **por qué**, no qué.
- **Verificación en cada tarea:** `npx tsc --noEmit -p tsconfig.json` no debe sumar errores nuevos. Los 4 errores existentes en `src/_redirects/**` son preexistentes y no cuentan — filtrarlos con `| grep -v _redirects`.
- **Orden de despliegue (Tareas 2 y 3):** la migración SQL va SIEMPRE antes del deploy del Edge Function. Al revés, `POST/PUT /categories` escribiría en una columna que no existe.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `package.json` | script `test` | 1 |
| `src/utils/api.tsx` | tipo `Category.parentId`, firma de `categoriesAPI.create` | 1 |
| `src/utils/categoryTree.ts` (nuevo) | jerarquía de categorías: raíces, hijas, agrupación, ids con hijas | 1 |
| `src/utils/categoryTree.test.ts` (nuevo) | tests de lo anterior | 1 |
| `supabase/migrations/20260823_add_category_parent.sql` (nuevo) | columna `parent_id` + índice | 2 |
| `supabase/functions/make-server-6d979413/index.ts` | `toCategory`, validación de padre, POST/PUT/DELETE | 3 |
| `src/components/CategoryManagement.tsx` | selector de padre + listado agrupado | 4 |
| `src/components/DistributionPanel.tsx` | filtro que incluye subcategorías | 5 |
| `src/components/ProductManagement.tsx` | `<Select>` agrupado + campos de nombre al crear | 6, 10 |
| `src/utils/productName.ts` (nuevo) | composición del nombre a partir de las partes | 7 |
| `src/utils/productName.test.ts` (nuevo) | tests de lo anterior | 7 |
| `src/utils/productSimilarity.ts` (nuevo) | normalización, distancia de edición, búsqueda de similares | 8 |
| `src/utils/productSimilarity.test.ts` (nuevo) | tests de lo anterior | 8 |
| `src/components/ProductNameFields.tsx` (nuevo) | UI de los tres campos + aviso de similares | 9 |

**Nota sobre los tests:** Node v24 corre archivos `.ts` de forma nativa (`node --test archivo.test.ts`), y borra los `import type`. Por eso los módulos de `src/utils/` pueden importar tipos de `./api` y seguir siendo testeables **sin agregar ninguna dependencia**. Ya verificado en este repo. Los `import` de valores (no de tipos) desde módulos de la app SÍ romperían el runner: los módulos de lógica pura no deben tener ninguno.

---

## Fase 1 — Subcategorías

### Task 1: Módulo de jerarquía de categorías + infraestructura de tests

**Files:**
- Create: `src/utils/categoryTree.ts`
- Create: `src/utils/categoryTree.test.ts`
- Modify: `package.json` (agregar script `test`)
- Modify: `src/utils/api.tsx` (interfaz `Category` ~línea 31; `categoriesAPI.create` ~línea 505)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `Category.parentId?: string | null` y `categoriesAPI.create` acepta `parentId`
  - un script `npm test` que corre todos los `src/utils/*.test.ts`
  - `esRaiz(c: Category): boolean`
  - `raicesDe(categories: Category[]): Category[]`
  - `hijasDe(categories: Category[], parentId: string): Category[]`
  - `tieneHijas(categories: Category[], id: string): boolean`
  - `idsDeCategoriaConHijas(categories: Category[], categoriaId: string): Set<string>`
  - `posiblesPadres(categories: Category[], editandoId?: string): Category[]`
  - `puedeTenerPadre(categories: Category[], editandoId?: string): boolean`
  - `agruparPorPadre(categories: Category[]): CategoriaConHijas[]`
  - `interface CategoriaConHijas { categoria: Category; hijas: Category[] }`

- [ ] **Step 1: Agregar el script de tests**

En `package.json`, la sección `scripts` pasa a:

```json
"scripts": {
      "dev": "vite",
      "build": "npm exec vite -- build",
      "test": "node --test src/utils/*.test.ts"
}
```

- [ ] **Step 2: Agregar `parentId` a los tipos del cliente**

Va en esta tarea y no en una aparte porque `categoryTree.ts` no typechequea sin esto.

En `src/utils/api.tsx`, la interfaz `Category` (~línea 31):

```ts
export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  parentId?: string | null; // null o ausente = categoría raíz. Un solo nivel de anidamiento.
  createdAt: string;
  updatedAt?: string;
}
```

Y la firma de `categoriesAPI.create` (~línea 505):

```ts
  create: async (token: string, category: {
    name: string;
    description?: string;
    color?: string;
    parentId?: string | null;
  }): Promise<Category> => {
```

`categoriesAPI.update` ya recibe `Partial<Category>`, así que acepta `parentId` sin cambios.

- [ ] **Step 3: Escribir el test que falla**

Crear `src/utils/categoryTree.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esRaiz, raicesDe, hijasDe, tieneHijas,
  idsDeCategoriaConHijas, posiblesPadres, puedeTenerPadre, agruparPorPadre,
} from './categoryTree.ts';

// Categorías de prueba: "distri" es raíz con dos hijas; "postres" es raíz sola.
const cats: any[] = [
  { id: 'distri', name: 'Distribuidora', parentId: null },
  { id: 'bebidas', name: 'Bebidas', parentId: 'distri' },
  { id: 'abarrotes', name: 'Abarrotes', parentId: 'distri' },
  { id: 'postres', name: 'Postres', parentId: null },
];

test('esRaiz distingue raices de subcategorias', () => {
  assert.equal(esRaiz(cats[0]), true);
  assert.equal(esRaiz(cats[1]), false);
});

test('raicesDe devuelve solo las de primer nivel', () => {
  assert.deepEqual(raicesDe(cats).map(c => c.id), ['distri', 'postres']);
});

test('hijasDe devuelve las subcategorias de un padre', () => {
  assert.deepEqual(hijasDe(cats, 'distri').map(c => c.id), ['bebidas', 'abarrotes']);
  assert.deepEqual(hijasDe(cats, 'postres'), []);
});

test('tieneHijas detecta si se puede borrar', () => {
  assert.equal(tieneHijas(cats, 'distri'), true);
  assert.equal(tieneHijas(cats, 'postres'), false);
});

// Este es el que evita que un producto etiquetado "Bebidas" desaparezca del
// Panel de Distribuidora cuando el filtro esta en "Distribuidora".
test('idsDeCategoriaConHijas incluye la categoria y sus hijas', () => {
  assert.deepEqual([...idsDeCategoriaConHijas(cats, 'distri')].sort(),
    ['abarrotes', 'bebidas', 'distri']);
});

test('idsDeCategoriaConHijas de una hoja es solo ella', () => {
  assert.deepEqual([...idsDeCategoriaConHijas(cats, 'postres')], ['postres']);
});

test('posiblesPadres solo ofrece raices', () => {
  assert.deepEqual(posiblesPadres(cats).map(c => c.id), ['distri', 'postres']);
});

test('posiblesPadres excluye la categoria que se esta editando', () => {
  assert.deepEqual(posiblesPadres(cats, 'distri').map(c => c.id), ['postres']);
});

// Convertir en subcategoria algo que ya tiene hijas crearia un segundo nivel.
test('puedeTenerPadre es falso si la categoria tiene hijas', () => {
  assert.equal(puedeTenerPadre(cats, 'distri'), false);
  assert.equal(puedeTenerPadre(cats, 'postres'), true);
  assert.equal(puedeTenerPadre(cats, undefined), true);
});

test('agruparPorPadre arma el arbol de dos niveles', () => {
  const grupos = agruparPorPadre(cats);
  assert.deepEqual(grupos.map(g => g.categoria.id), ['distri', 'postres']);
  assert.deepEqual(grupos[0].hijas.map(c => c.id), ['bebidas', 'abarrotes']);
  assert.deepEqual(grupos[1].hijas, []);
});

// Si el padre no esta en la lista, la hija tiene que seguir siendo visible.
// Ocultarla en silencio es la clase de bug que hace pensar que se borro sola.
test('agruparPorPadre trata como raiz a una hija huerfana', () => {
  const huerfana: any[] = [{ id: 'x', name: 'X', parentId: 'no-existe' }];
  const grupos = agruparPorPadre(huerfana);
  assert.deepEqual(grupos.map(g => g.categoria.id), ['x']);
});
```

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './categoryTree.ts'`

- [ ] **Step 5: Implementar el módulo**

Crear `src/utils/categoryTree.ts`:

```ts
import type { Category } from './api';

/**
 * Jerarquía de categorías de UN SOLO NIVEL: una categoría raíz puede tener
 * subcategorías, pero una subcategoría no. La regla la impone el backend; acá
 * solo se lee el árbol que ya viene armado en la lista plana de GET /categories.
 */

export interface CategoriaConHijas {
  categoria: Category;
  hijas: Category[];
}

export function esRaiz(c: Category): boolean {
  return !c.parentId;
}

export function raicesDe(categories: Category[]): Category[] {
  return categories.filter(esRaiz);
}

export function hijasDe(categories: Category[], parentId: string): Category[] {
  return categories.filter(c => c.parentId === parentId);
}

export function tieneHijas(categories: Category[], id: string): boolean {
  return categories.some(c => c.parentId === id);
}

/**
 * Los ids que cuentan como "pertenece a esta categoría": la categoría misma más
 * sus subcategorías. Sin esto, filtrar por "Distribuidora" con una comparación
 * exacta esconde todo lo que se etiquetó como "Bebidas", y el listado se ve
 * completo sin estarlo.
 */
export function idsDeCategoriaConHijas(categories: Category[], categoriaId: string): Set<string> {
  const ids = new Set<string>([categoriaId]);
  for (const c of categories) {
    if (c.parentId === categoriaId) ids.add(c.id);
  }
  return ids;
}

/** Candidatas a padre: solo raíces, y nunca la categoría que se está editando. */
export function posiblesPadres(categories: Category[], editandoId?: string): Category[] {
  return categories.filter(c => esRaiz(c) && c.id !== editandoId);
}

/**
 * Una categoría que ya tiene hijas no puede volverse subcategoría: eso crearía
 * un segundo nivel por la puerta de atrás. El backend lo rechaza igual; acá se
 * usa para no ofrecer en la UI algo que va a fallar.
 */
export function puedeTenerPadre(categories: Category[], editandoId?: string): boolean {
  if (!editandoId) return true;
  return !tieneHijas(categories, editandoId);
}

export function agruparPorPadre(categories: Category[]): CategoriaConHijas[] {
  const ids = new Set(categories.map(c => c.id));
  // Una hija cuyo padre no está en la lista se trata como raíz. No debería
  // pasar (la FK es ON DELETE RESTRICT), pero si pasa, el costo de mostrarla
  // fuera de lugar es mucho menor que el de hacerla desaparecer de la pantalla.
  const esRaizEfectiva = (c: Category) => !c.parentId || !ids.has(c.parentId);

  return categories
    .filter(esRaizEfectiva)
    .map(categoria => ({ categoria, hijas: hijasDe(categories, categoria.id) }));
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npm test`
Expected: PASS — 11 tests, 0 fail

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects`
Expected: sin salida

- [ ] **Step 8: Commit**

```bash
git add package.json src/utils/api.tsx src/utils/categoryTree.ts src/utils/categoryTree.test.ts
git commit -m "feat: modulo de jerarquia de categorias con tests"
```

---

### Task 2: Migración de base de datos

**Files:**
- Create: `supabase/migrations/20260823_add_category_parent.sql`

**Interfaces:**
- Produces: columna `categories.parent_id uuid NULL` con FK a `categories(id)` e índice `categories_parent_idx`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260823_add_category_parent.sql`:

```sql
-- supabase/migrations/20260823_add_category_parent.sql
-- Subcategorías de UN SOLO NIVEL por auto-referencia. Se eligió esto sobre una
-- tabla `subcategories` aparte porque una subcategoría se comporta idéntico a
-- una categoría: así todo lo que ya funciona (productos, filtros, panel de
-- distribuidora) sigue funcionando sin duplicar el CRUD entero.
--
-- La profundidad máxima de 1 NO se puede expresar como constraint de columna
-- (requeriría un CHECK con subconsulta, que Postgres no permite). La impone el
-- Edge Function en POST y PUT /categories. Ver el spec del 2026-08-23.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT;

-- ON DELETE RESTRICT y no CASCADE: borrar una categoría padre NO debe llevarse
-- puestas sus subcategorías en silencio. El backend además lo chequea y devuelve
-- un 400 explicando el motivo; esto es la red de seguridad si ese chequeo se
-- saltea por cualquier vía.

-- La consulta que más se repite: "las hijas de X" (agrupar el listado, armar el
-- conjunto de ids del filtro, contar hijas antes de borrar).
CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories (parent_id);
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Aplicar el SQL en el SQL Editor del proyecto **conectocadev** (es el entorno vivo, pese al nombre).

Verificar que la columna existe:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'categories' AND column_name = 'parent_id';
```

Expected: una fila, `uuid`, `YES`.

- [ ] **Step 3: Verificar que no rompió nada**

```sql
SELECT count(*) AS total, count(parent_id) AS con_padre FROM public.categories;
```

Expected: `total` = la cantidad de categorías de siempre, `con_padre` = 0. Todas las categorías existentes quedan como raíz, que es el comportamiento actual.

Recargar la app en el navegador: Gestión de Categorías y Gestión de Productos siguen funcionando igual (el Edge Function viejo ignora la columna nueva).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260823_add_category_parent.sql
git commit -m "feat: columna parent_id para subcategorias"
```

---

### Task 3: Backend — validación de un solo nivel

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts` (`toCategory` ~línea 104; `POST /categories` ~1962; `PUT /categories/:id` ~1994; `DELETE /categories/:id` ~2032)

**Interfaces:**
- Consumes: la columna `parent_id` de la Tarea 2.
- Produces:
  - `toCategory` devuelve `parentId: string | null`.
  - `validarPadreDeCategoria(businessId: string, parentId: string | null | undefined, categoriaId?: string): Promise<string | null>` — devuelve el mensaje de error, o `null` si el padre es válido.
  - `POST`/`PUT /categories` aceptan `parentId`; `DELETE` rechaza categorías con hijas.

- [ ] **Step 1: Agregar `parentId` al mapper**

En `toCategory` (~línea 104), agregar la línea `parentId` después de `color`:

```ts
function toCategory(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    color: r.color || '#0047BA',
    parentId: r.parent_id || null,
    businessId: r.business_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
```

- [ ] **Step 2: Agregar el helper de validación**

Justo encima de `app.get('/make-server-6d979413/categories', ...)` (~línea 1941), agregar:

```ts
/**
 * Valida que `parentId` sirva como padre. Devuelve el mensaje de error a mostrar,
 * o null si está todo bien.
 *
 * La regla "un solo nivel" vive acá y no en la base: Postgres no permite un CHECK
 * con subconsulta, así que no hay forma de expresarla como constraint. Este es el
 * único punto que la hace cumplir — si se agrega otra ruta que escriba parent_id,
 * tiene que llamar a esta función.
 */
async function validarPadreDeCategoria(
  businessId: string,
  parentId: string | null | undefined,
  categoriaId?: string,
): Promise<string | null> {
  if (!parentId) return null; // sin padre = categoría raíz, siempre válido

  if (categoriaId && parentId === categoriaId) {
    return 'Una categoría no puede ser su propia categoría padre';
  }

  const { data: padre } = await supabaseAdmin
    .from('categories')
    .select('id, business_id, parent_id')
    .eq('id', parentId)
    .maybeSingle();

  if (!padre) return 'La categoría padre no existe';
  if (padre.business_id !== businessId) return 'La categoría padre no es de este negocio';
  if (padre.parent_id) return 'No se pueden crear subcategorías dentro de una subcategoría';

  // Mover bajo un padre algo que ya tiene hijas dejaría un árbol de tres niveles.
  if (categoriaId) {
    const { count } = await supabaseAdmin
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', categoriaId);
    if (count && count > 0) {
      return 'Esta categoría tiene subcategorías: no se puede convertir en subcategoría';
    }
  }

  return null;
}
```

- [ ] **Step 3: Aceptar `parentId` en el POST**

En `POST /categories`, reemplazar la desestructuración y el insert:

```ts
    const { name, description, color, parentId } = await c.req.json();
    if (!name) return c.json({ error: 'Missing required field: name' }, 400);

    const errorPadre = await validarPadreDeCategoria(profile.businessId, parentId);
    if (errorPadre) return c.json({ error: errorPadre }, 400);

    const { data: category, error: insertErr } = await supabaseAdmin
      .from('categories')
      .insert({
        business_id: profile.businessId,
        name,
        description: description || '',
        color: color || '#0047BA',
        parent_id: parentId || null,
      })
      .select()
      .single();
```

- [ ] **Step 4: Aceptar `parentId` en el PUT**

En `PUT /categories/:id`, después de `if (body.color !== undefined) updateData.color = body.color;` (~línea 2016), agregar:

```ts
    // `null` es un valor válido y significa "convertirla en categoría raíz", así
    // que se distingue de `undefined` (= no se tocó el padre).
    if (body.parentId !== undefined) {
      // Se usa existing.business_id y no profile.businessId: el PUT no valida
      // que el perfil tenga negocio, pero ya comprobó que el de la categoría
      // coincide, así que este es el valor que seguro existe.
      const errorPadre = await validarPadreDeCategoria(existing.business_id, body.parentId, categoryId);
      if (errorPadre) return c.json({ error: errorPadre }, 400);
      updateData.parent_id = body.parentId || null;
    }
```

- [ ] **Step 5: Rechazar el borrado de una categoría con hijas**

En `DELETE /categories/:id`, **antes** del chequeo de productos asociados (antes de `// Check if any products use this category`, ~línea 2050), agregar:

```ts
    // Va antes del chequeo de productos: una categoría padre normalmente no
    // tiene productos propios, así que sin esto el borrado pasaría el único
    // chequeo que hay y la FK RESTRICT tiraría un 500 sin explicar nada.
    const { count: hijas } = await supabaseAdmin
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', categoryId);

    if (hijas && hijas > 0) {
      return c.json({
        error: `No se puede eliminar la categoria porque tiene ${hijas} subcategoria(s)`
      }, 400);
    }
```

- [ ] **Step 6: Desplegar y verificar**

**La migración de la Tarea 2 ya tiene que estar aplicada.** Desplegar el Edge Function y verificar con la app abierta:

1. Gestión de Categorías carga sin errores → `GET` sigue andando.
2. Crear una categoría sin padre → funciona igual que siempre.
3. En la consola del navegador, con un token válido, crear una con padre y verificar que devuelve 201 con `parentId` seteado.
4. Intentar crear una con `parentId` de una subcategoría → 400 con *"No se pueden crear subcategorías dentro de una subcategoría"*.
5. Intentar borrar la categoría padre → 400 con el conteo de subcategorías.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts
git commit -m "feat: el backend acepta y valida subcategorias de un nivel"
```

---

### Task 4: Gestión de Categorías — crear y ver subcategorías

**Files:**
- Modify: `src/components/CategoryManagement.tsx`

**Interfaces:**
- Consumes: `agruparPorPadre`, `posiblesPadres`, `puedeTenerPadre` y `Category.parentId` (Tarea 1).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Imports y estado del formulario**

Agregar a los imports:

```ts
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { agruparPorPadre, posiblesPadres, puedeTenerPadre } from '../utils/categoryTree';
```

Extender `CategoryFormData` y `emptyForm`:

```ts
interface CategoryFormData {
  name: string;
  description: string;
  color: string;
  parentId: string; // '' = categoría raíz
}

const emptyForm: CategoryFormData = {
  name: '',
  description: '',
  color: '#0047BA',
  parentId: ''
};
```

- [ ] **Step 2: Cargar el padre al abrir el diálogo**

En `handleOpenDialog`, dentro de la rama `if (category)`:

```ts
      setFormData({
        name: category.name,
        description: category.description || '',
        color: category.color || '#0047BA',
        parentId: category.parentId || ''
      });
```

- [ ] **Step 3: Mandar el padre al guardar**

En `handleSubmit`, reemplazar las dos llamadas para que manden `parentId` normalizado (`''` → `null`, que el backend interpreta como "raíz"):

```ts
      const payload = {
        name: formData.name,
        description: formData.description,
        color: formData.color,
        parentId: formData.parentId || null,
      };

      if (editingCategory) {
        await categoriesAPI.update(accessToken, editingCategory.id, payload);
        toast.success('Categoría actualizada exitosamente');
      } else {
        await categoriesAPI.create(accessToken, payload);
        toast.success('Categoría creada exitosamente');
      }
```

- [ ] **Step 4: Selector de categoría padre en el diálogo**

En el `<form>`, entre el campo **Descripción** y el bloque **Color**, agregar:

```tsx
              <div>
                <Label htmlFor="parentId">Categoría padre</Label>
                <Select
                  value={formData.parentId || 'none'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, parentId: value === 'none' ? '' : value })
                  }
                  disabled={!puedeTenerPadre(categories, editingCategory?.id)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ninguna (categoría principal)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguna (categoría principal)</SelectItem>
                    {posiblesPadres(categories, editingCategory?.id).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {!puedeTenerPadre(categories, editingCategory?.id)
                    ? 'Esta categoría ya tiene subcategorías, así que no puede ser subcategoría de otra.'
                    : 'Elegí una categoría padre para convertirla en subcategoría (ej: Distribuidora → Bebidas).'}
                </p>
              </div>
```

- [ ] **Step 5: Listado agrupado**

Reemplazar el bloque de la grilla (el `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">` que contiene el `<AnimatePresence>` con `categories.map`) por un listado agrupado. Cada raíz mantiene su tarjeta actual; las hijas van debajo, más chicas e indentadas.

```tsx
          <div className="space-y-6">
            {agruparPorPadre(categories).map(({ categoria, hijas }) => (
              <div key={categoria.id}>
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${categoria.color}20` }}
                      >
                        <Tag className="w-6 h-6" style={{ color: categoria.color }} />
                      </div>
                      <div>
                        <h3 className="text-gray-900">{categoria.name}</h3>
                        {categoria.description && (
                          <p className="text-xs text-gray-500 mt-1">{categoria.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleOpenDialog(categoria)} variant="outline" size="sm" className="flex-1 gap-2">
                        <Edit className="w-3 h-3" />
                        Editar
                      </Button>
                      <Button
                        onClick={() => setIsDeleting(categoria)}
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* OJO: la indentación va por estilo inline. `pl-6`/`ml-4` NO existen
                    en el CSS precompilado de este proyecto y no harían nada. */}
                {hijas.length > 0 && (
                  <div className="mt-2 space-y-2" style={{ paddingLeft: '2rem' }}>
                    {hijas.map((hija) => (
                      <Card key={hija.id}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Tag className="w-4 h-4" style={{ color: hija.color }} />
                              <span className="text-sm text-gray-900">{hija.name}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={() => handleOpenDialog(hija)} variant="outline" size="sm">
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                onClick={() => setIsDeleting(hija)}
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
```

Si `AnimatePresence` o `motion` quedan sin uso tras el reemplazo, quitarlos de los imports para no dejar imports muertos.

- [ ] **Step 6: Confirmar las clases de Tailwind usadas**

Ya verificadas contra `src/index.css`: `space-y-6`, `space-y-2`, `mt-2`, `p-3`, `w-4`, `h-4`,
`text-sm`, `text-xs`, `gap-2`, `flex`, `items-center` — **todas existen**. La indentación es
la única que no (`pl-*`/`ml-*` no existen) y por eso va inline en el Step 5.

Si agregás cualquier clase que no esté en esa lista, verificala primero:

```bash
grep -F ".mi-clase" src/index.css
```

- [ ] **Step 7: Typecheck y build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects && npm run build`
Expected: sin errores de tipos; build exitoso.

- [ ] **Step 8: Verificar en el navegador**

Con `npm run dev`:
1. Crear "Bebidas" con padre "Distribuidora" → aparece indentada debajo de Distribuidora.
2. Editar "Distribuidora" → el selector de padre está deshabilitado y explica por qué.
3. Intentar eliminar "Distribuidora" → toast de error con el conteo de subcategorías.
4. Eliminar "Bebidas" (sin productos) → funciona.

- [ ] **Step 9: Commit**

```bash
git add src/components/CategoryManagement.tsx
git commit -m "feat: crear y listar subcategorias en gestion de categorias"
```

---

### Task 5: Panel de Distribuidora — el filtro incluye subcategorías

**Files:**
- Modify: `src/components/DistributionPanel.tsx` (~línea 146-151, el `useMemo` de `productosDelAmbito`)

**Interfaces:**
- Consumes: `idsDeCategoriaConHijas` (Tarea 1).

Sin esta tarea, etiquetar un producto como "Bebidas" lo hace desaparecer del panel con el filtro en "Distribuidora" — stock que se esconde solo, que es exactamente el bug que la Fase 0 vino a arreglar por otra vía.

- [ ] **Step 1: Importar el helper**

```ts
import { idsDeCategoriaConHijas } from '../utils/categoryTree';
```

- [ ] **Step 2: Cambiar el filtro**

Reemplazar el `useMemo` de `productosDelAmbito`:

```ts
  // Productos del ámbito del panel: los de la categoría elegida —incluidas sus
  // subcategorías— que además controlan stock (los ilimitados devuelven estado
  // null y se descartan).
  //
  // El filtro NO puede ser `categoryId === categoriaId`: con subcategorías, un
  // producto etiquetado "Bebidas" quedaría fuera del ámbito de "Distribuidora" y
  // el panel mostraría un total que se lee como completo sin serlo.
  const productosDelAmbito = useMemo(() => {
    const idsValidos = categoriaId === 'all'
      ? null
      : idsDeCategoriaConHijas(categories, categoriaId);

    return products
      .map(p => ({ producto: p, estado: calcularEstadoStock(p) }))
      .filter((x): x is { producto: Product; estado: EstadoStock } => x.estado !== null)
      .filter(x => idsValidos === null || (!!x.producto.categoryId && idsValidos.has(x.producto.categoryId)));
  }, [products, categories, categoriaId]);
```

`categories` se suma al array de dependencias: sin eso, el conjunto de ids se quedaría con la lista vieja tras recargar las categorías.

- [ ] **Step 3: Typecheck y build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects && npm run build`
Expected: sin errores; build exitoso.

- [ ] **Step 4: Verificar en el navegador**

1. Asignar un producto con stock a la subcategoría "Bebidas".
2. Panel de Distribuidora con el filtro en **"Distribuidora"** → el producto **aparece**, y las tarjetas de estadísticas lo cuentan.
3. Cambiar el filtro a **"Bebidas"** → se ve solo ese subconjunto y las tarjetas se recalculan.
4. Filtro en **"Todas las categorías"** → se ve todo, como siempre.
5. Recargar la página → la categoría elegida persiste (`localStorage`).

- [ ] **Step 5: Commit**

```bash
git add src/components/DistributionPanel.tsx
git commit -m "fix: el panel de distribuidora incluye las subcategorias en el filtro"
```

---

### Task 6: Selector de categoría agrupado en el formulario de producto

**Files:**
- Modify: `src/components/ProductManagement.tsx` (el `<Select>` de Categoría, ~línea 1049)

**Interfaces:**
- Consumes: `agruparPorPadre` (Tarea 1).

Alcance: **solo el `<Select>` del formulario de alta/edición.** La barra de filtros del listado queda sin tocar (fuera de alcance por decisión del usuario); las subcategorías van a aparecer ahí como entradas sueltas y eso está bien.

- [ ] **Step 1: Imports**

Agregar `SelectGroup` y `SelectLabel` al import existente de `./ui/select` (ya los exporta), y el helper:

```ts
import { agruparPorPadre } from '../utils/categoryTree';
```

- [ ] **Step 2: Agrupar las opciones**

Reemplazar el `<SelectContent>` del selector de Categoría:

```tsx
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {agruparPorPadre(categories).map(({ categoria, hijas }) => (
                      <SelectGroup key={categoria.id}>
                        <SelectItem value={categoria.id}>{categoria.name}</SelectItem>
                        {/* La indentación va inline: `pl-4`/`pl-6` no existen en el
                            CSS precompilado de este proyecto. */}
                        {hijas.map((hija) => (
                          <SelectItem key={hija.id} value={hija.id} style={{ paddingLeft: '2.25rem' }}>
                            {hija.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
```

La categoría raíz se sigue pudiendo elegir: no todo producto de la Distribuidora tiene por qué caer en una subcategoría.

El `onValueChange` **no se toca**: sigue buscando en `categories` (la lista plana) y guardando `categoryId` + `category`. Las subcategorías están en esa lista, así que funciona sin cambios.

- [ ] **Step 3: Typecheck y build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects && npm run build`
Expected: sin errores; build exitoso.

- [ ] **Step 4: Verificar en el navegador**

1. Abrir "Nuevo Producto" → el selector muestra "Distribuidora" y debajo, indentadas, "Bebidas" y "Abarrotes".
2. Elegir "Bebidas", guardar, reabrir el producto → queda seleccionada "Bebidas".
3. Elegir la raíz "Distribuidora" → también funciona.
4. Confirmar visualmente que la indentación se ve (si no, el `style` inline no se está aplicando al `SelectItem` — en ese caso envolver el texto en un `<span style={{ paddingLeft: '1.25rem' }}>`).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "feat: selector de categoria agrupado por subcategorias"
```

---

## Fase 2 — Nombre estructurado y aviso de duplicados

### Task 7: Composición del nombre de producto

**Files:**
- Create: `src/utils/productName.ts`
- Create: `src/utils/productName.test.ts`

**Interfaces:**
- Produces:
  - `interface ProductNameParts { marca: string; cantidad: string; unidad: string; unidadOtro: string; unidades: string }`
  - `const partesVacias: ProductNameParts`
  - `const UNIDADES_PRESENTACION: { value: string; label: string }[]`
  - `componerNombre(p: ProductNameParts): string`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/utils/productName.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componerNombre, partesVacias, UNIDADES_PRESENTACION } from './productName.ts';

const partes = (over: Partial<typeof partesVacias>) => ({ ...partesVacias, ...over });

test('arma marca + presentacion + unidades', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Coca Cola', cantidad: '591', unidad: 'ml', unidades: '6' })),
    'Coca Cola 591ml 6 unidades',
  );
});

// Un "1 unidad" en cada producto suelto es ruido en todas las listas de la app.
test('omite las unidades cuando es 1', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Coca Cola', cantidad: '591', unidad: 'ml', unidades: '1' })),
    'Coca Cola 591ml',
  );
});

test('omite las unidades cuando esta vacio', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Coca Cola', cantidad: '591', unidad: 'ml' })),
    'Coca Cola 591ml',
  );
});

test('sin presentacion queda solo la marca', () => {
  assert.equal(componerNombre(partes({ marca: 'Pan hallulla' })), 'Pan hallulla');
});

// Un numero sin unidad ("Coca Cola 591") es ambiguo: se ignora entero.
test('ignora la cantidad si no hay unidad', () => {
  assert.equal(componerNombre(partes({ marca: 'Coca Cola', cantidad: '591' })), 'Coca Cola');
});

test('unidad "otro" usa el texto libre', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Servilletas', cantidad: '3', unidad: 'otro', unidadOtro: 'pack' })),
    'Servilletas 3pack',
  );
});

test('normaliza espacios de la marca', () => {
  assert.equal(componerNombre(partes({ marca: '  Coca   Cola  ' })), 'Coca Cola');
});

test('sin marca devuelve cadena vacia', () => {
  assert.equal(componerNombre(partesVacias), '');
});

test('kg y decimales funcionan', () => {
  assert.equal(
    componerNombre(partes({ marca: 'Arroz Tucapel', cantidad: '1', unidad: 'kg', unidades: '12' })),
    'Arroz Tucapel 1kg 12 unidades',
  );
});

// No se ofrece 'cc': tener ml y cc como opciones distintas para lo mismo
// reintroduce la inconsistencia que este formulario viene a eliminar.
test('la lista de unidades es cerrada y no incluye cc', () => {
  const valores = UNIDADES_PRESENTACION.map(u => u.value);
  assert.deepEqual(valores, ['ml', 'L', 'g', 'kg', 'un', 'otro']);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './productName.ts'`

- [ ] **Step 3: Implementar el módulo**

Crear `src/utils/productName.ts`:

```ts
/**
 * Composición del nombre de producto a partir de campos fijos.
 *
 * El campo Nombre era texto libre y cada persona lo escribía distinto, así que el
 * mismo producto entraba dos o tres veces con nombres diferentes. Estos campos
 * imponen un orden y un formato únicos: marca, presentación, unidades por paquete.
 *
 * Solo se usa al CREAR. Editar un producto viejo sigue siendo texto libre:
 * descomponer un nombre existente requeriría adivinar, y adivinar mal renombraría
 * productos en producción.
 */

export interface ProductNameParts {
  marca: string;
  cantidad: string;   // número de la presentación, como texto
  unidad: string;     // uno de UNIDADES_PRESENTACION, o '' si no se eligió
  unidadOtro: string; // solo se usa cuando unidad === 'otro'
  unidades: string;   // unidades por paquete, como texto
}

export const partesVacias: ProductNameParts = {
  marca: '',
  cantidad: '',
  unidad: '',
  unidadOtro: '',
  unidades: '',
};

// Lista CERRADA a propósito. No se ofrece 'cc' aunque se use en la práctica:
// tener 'ml' y 'cc' como opciones distintas para la misma magnitud reintroduce
// exactamente la inconsistencia que este formulario viene a eliminar.
export const UNIDADES_PRESENTACION = [
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'L' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'un', label: 'un' },
  { value: 'otro', label: 'Otro…' },
];

export function componerNombre(p: ProductNameParts): string {
  const partes: string[] = [];

  // Se colapsan los espacios internos pero NO se fuerza capitalización: pasar a
  // Título rompería nombres legítimos como "Coca-Cola ZERO". La comparación de
  // duplicados es case-insensitive, así que la consistencia de mayúsculas se
  // resuelve por ahí y no mutilando lo que el usuario escribió.
  const marca = p.marca.trim().replace(/\s+/g, ' ');
  if (marca) partes.push(marca);

  const cantidad = p.cantidad.trim();
  const unidad = (p.unidad === 'otro' ? p.unidadOtro : p.unidad).trim();
  // Los dos o ninguno: "Coca Cola 591" sin unidad es ambiguo y no aporta.
  if (cantidad && unidad) partes.push(`${cantidad}${unidad}`);

  const unidades = parseInt(p.unidades.trim(), 10);
  if (Number.isFinite(unidades) && unidades > 1) partes.push(`${unidades} unidades`);

  return partes.join(' ');
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test`
Expected: PASS — los 10 tests nuevos más los 11 de la Tarea 1.

- [ ] **Step 5: Commit**

```bash
git add src/utils/productName.ts src/utils/productName.test.ts
git commit -m "feat: composicion estructurada del nombre de producto"
```

---

### Task 8: Detección de productos similares

**Files:**
- Create: `src/utils/productSimilarity.ts`
- Create: `src/utils/productSimilarity.test.ts`

**Interfaces:**
- Consumes: el tipo `Product` de `src/utils/api.tsx` (solo como tipo).
- Produces:
  - `normalizarNombre(texto: string): string`
  - `distanciaEdicion(a: string, b: string): number`
  - `distanciaMaximaPara(largo: number): number`
  - `buscarSimilares(marca: string, productos: Product[], limite?: number): Product[]`
  - `const LARGO_MINIMO_BUSQUEDA: number`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/utils/productSimilarity.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarNombre, distanciaEdicion, distanciaMaximaPara,
  buscarSimilares, LARGO_MINIMO_BUSQUEDA,
} from './productSimilarity.ts';

test('normaliza tildes, mayusculas y puntuacion', () => {
  assert.equal(normalizarNombre('Coca-Cola Lata 350cc'), 'cocacolalata350cc');
  assert.equal(normalizarNombre('  Té  Verde  '), 'teverde');
  assert.equal(normalizarNombre('Jamón Serrano'), 'jamonserrano');
});

test('distanciaEdicion cuenta las ediciones minimas', () => {
  assert.equal(distanciaEdicion('cocacola', 'cocacola'), 0);
  assert.equal(distanciaEdicion('cocakola', 'cocacola'), 1);
  assert.equal(distanciaEdicion('', 'abc'), 3);
  assert.equal(distanciaEdicion('abc', ''), 3);
});

// La tolerancia escala con el largo: con 3 caracteres, permitir 2 ediciones
// haria que "pan" se parezca a casi todo.
test('distanciaMaximaPara escala con el largo', () => {
  assert.equal(distanciaMaximaPara(3), 0);
  assert.equal(distanciaMaximaPara(5), 1);
  assert.equal(distanciaMaximaPara(8), 2);
});

const productos: any[] = [
  { id: '1', name: 'Coca-Cola Lata 350cc' },
  { id: '2', name: 'Coca Cola 1.5L' },
  { id: '3', name: 'Pan hallulla' },
  { id: '4', name: 'Arroz Tucapel 1kg' },
];

// El caso frecuente: misma base, distinto sufijo.
test('encuentra por coincidencia de prefijo', () => {
  assert.deepEqual(buscarSimilares('coca cola', productos).map(p => p.id), ['1', '2']);
});

// El caso de tipeo, que la coincidencia de texto sola no detecta.
test('encuentra pese a un error de tipeo', () => {
  assert.deepEqual(buscarSimilares('Coca Kola', productos).map(p => p.id), ['1', '2']);
});

test('no devuelve nada si no hay parecidos', () => {
  assert.deepEqual(buscarSimilares('Detergente', productos), []);
});

test('no busca con menos del largo minimo', () => {
  assert.equal(LARGO_MINIMO_BUSQUEDA, 3);
  assert.deepEqual(buscarSimilares('co', productos), []);
});

test('respeta el limite de resultados', () => {
  const muchos: any[] = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Coca Cola ${i}` }));
  assert.equal(buscarSimilares('coca cola', muchos).length, 5);
  assert.equal(buscarSimilares('coca cola', muchos, 2).length, 2);
});

test('ignora productos con nombre vacio', () => {
  const conVacio: any[] = [{ id: 'x', name: '' }, { id: 'y', name: '---' }];
  assert.deepEqual(buscarSimilares('coca cola', conVacio), []);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './productSimilarity.ts'`

- [ ] **Step 3: Implementar el módulo**

Crear `src/utils/productSimilarity.ts`:

```ts
import type { Product } from './api';

/**
 * Detección de productos parecidos a uno que se está por crear.
 *
 * Los campos fijos de productName.ts ordenan el FORMATO, pero no impiden un
 * duplicado: nada evita cargar "Coca Cola 591ml" cuando ya existe
 * "Coca-Cola 591 ml". Esto es lo que ataca esa parte del problema.
 *
 * Compara contra los productos que la pantalla ya tiene en memoria: no agrega
 * ningún endpoint ni request.
 */

export const LARGO_MINIMO_BUSQUEDA = 3;

/** Deja solo letras y números en minúscula, sin tildes ni puntuación. */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Levenshtein clásico, con una sola fila viva para no armar la matriz entera. */
export function distanciaEdicion(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const siguiente = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      siguiente[j] = Math.min(
        fila[j] + 1,           // borrado
        siguiente[j - 1] + 1,  // inserción
        fila[j - 1] + costo,   // sustitución
      );
    }
    fila = siguiente;
  }

  return fila[b.length];
}

/**
 * La tolerancia a tipeos tiene que escalar con el largo. Permitir 2 ediciones
 * sobre 3 caracteres haría que "pan" se parezca a casi todo el catálogo.
 */
export function distanciaMaximaPara(largo: number): number {
  if (largo >= 8) return 2;
  if (largo >= 5) return 1;
  return 0;
}

export function buscarSimilares(marca: string, productos: Product[], limite = 5): Product[] {
  const q = normalizarNombre(marca);
  if (q.length < LARGO_MINIMO_BUSQUEDA) return [];

  const maxDistancia = distanciaMaximaPara(q.length);

  return productos
    .filter(p => {
      const n = normalizarNombre(p.name || '');
      if (!n) return false;
      // (a) mismo comienzo o contenido: "cocacolalata350cc" contiene "cocacola".
      if (n.includes(q)) return true;
      // (b) tipeo: se compara contra el prefijo del mismo largo, porque el resto
      // del nombre existente es la presentación y no debería contar como error.
      if (maxDistancia === 0) return false;
      return distanciaEdicion(q, n.slice(0, q.length)) <= maxDistancia;
    })
    .slice(0, limite);
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test`
Expected: PASS — todos.

- [ ] **Step 5: Commit**

```bash
git add src/utils/productSimilarity.ts src/utils/productSimilarity.test.ts
git commit -m "feat: deteccion de productos duplicados por nombre parecido"
```

---

### Task 9: Componente `ProductNameFields`

**Files:**
- Create: `src/components/ProductNameFields.tsx`

**Interfaces:**
- Consumes: `ProductNameParts`, `componerNombre`, `UNIDADES_PRESENTACION` (Tarea 7); `buscarSimilares` (Tarea 8); tipo `Product`.
- Produces:
  ```ts
  interface ProductNameFieldsProps {
    value: ProductNameParts;
    onChange: (value: ProductNameParts) => void;
    productosExistentes: Product[];
  }
  export function ProductNameFields(props: ProductNameFieldsProps): JSX.Element
  ```

Una sola responsabilidad: **mostrar los campos y avisar de parecidos.** No guarda nada ni conoce la API, igual que `StockAdjustDialog` y `BarcodeScannerDialog`.

- [ ] **Step 1: Tener presente qué clases NO existen**

Ya verificado contra `src/index.css`:

| Clase | ¿Existe? | Qué hacer |
|---|---|---|
| `grid-cols-3` | **NO** (solo `sm:`/`md:`/`lg:grid-cols-3`) | usar `grid-cols-1 sm:grid-cols-3` |
| `border-amber-300` | **NO** | borde inline: `style={{ border: '1px solid #FCD34D' }}` |
| `space-y-3`, `col-span-2`, `bg-amber-50`, `text-amber-800`, `text-amber-700`, `text-blue-700`, `text-gray-500`, `rounded-lg`, `py-2`, `px-3`, `mt-1`, `text-xs`, `text-sm`, `gap-2`, `w-4`, `h-4`, `flex`, `items-center` | sí | usarlas normal |

El código del Step 2 ya respeta esta tabla. Si agregás otra clase, verificala primero:

```bash
grep -F ".mi-clase" src/index.css
```

- [ ] **Step 2: Escribir el componente**

Crear `src/components/ProductNameFields.tsx`:

```tsx
import { useMemo } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AlertTriangle } from 'lucide-react';
import type { Product } from '../utils/api';
import { componerNombre, UNIDADES_PRESENTACION, type ProductNameParts } from '../utils/productName';
import { buscarSimilares } from '../utils/productSimilarity';

interface ProductNameFieldsProps {
  value: ProductNameParts;
  onChange: (value: ProductNameParts) => void;
  productosExistentes: Product[];
}

/**
 * Campos fijos para el nombre de un producto NUEVO. Reemplazan al input de texto
 * libre solo en el alta: al editar, el nombre sigue siendo libre.
 */
export function ProductNameFields({ value, onChange, productosExistentes }: ProductNameFieldsProps) {
  const set = (cambios: Partial<ProductNameParts>) => onChange({ ...value, ...cambios });

  const nombreCompuesto = componerNombre(value);
  const similares = useMemo(
    () => buscarSimilares(value.marca, productosExistentes),
    [value.marca, productosExistentes],
  );

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="marca">Marca / producto *</Label>
        <Input
          id="marca"
          value={value.marca}
          onChange={(e) => set({ marca: e.target.value })}
          placeholder="Ej: Coca Cola"
          autoComplete="off"
        />
      </div>

      {/* `grid-cols-3` a secas NO existe en el CSS precompilado: solo
          sm/md/lg:grid-cols-3. Se usa grid-cols-1 + sm:grid-cols-3, que además
          apila bien en pantallas angostas. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <Label htmlFor="cantidad">Presentación</Label>
          <Input
            id="cantidad"
            value={value.cantidad}
            onChange={(e) => set({ cantidad: e.target.value })}
            placeholder="591"
            inputMode="decimal"
            autoComplete="off"
          />
        </div>

        <div>
          <Label htmlFor="unidad">Unidad</Label>
          <Select
            value={value.unidad || 'none'}
            onValueChange={(v) => set({ unidad: v === 'none' ? '' : v, unidadOtro: '' })}
          >
            <SelectTrigger id="unidad">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {UNIDADES_PRESENTACION.map((u) => (
                <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="unidades">Unidades</Label>
          <Input
            id="unidades"
            value={value.unidades}
            onChange={(e) => set({ unidades: e.target.value })}
            placeholder="1"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
      </div>

      {value.unidad === 'otro' && (
        <div>
          <Label htmlFor="unidadOtro">¿Qué unidad?</Label>
          <Input
            id="unidadOtro"
            value={value.unidadOtro}
            onChange={(e) => set({ unidadOtro: e.target.value })}
            placeholder="Ej: pack"
            autoComplete="off"
          />
        </div>
      )}

      {/* Vista previa: el nombre que se va a guardar, tal cual. */}
      <div
        className="rounded-lg py-2 px-3"
        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
      >
        {nombreCompuesto ? (
          <span className="text-blue-700 text-sm">
            Se va a guardar como: <strong>{nombreCompuesto}</strong>
          </span>
        ) : (
          <span className="text-gray-500 text-sm">Completá la marca para ver el nombre</span>
        )}
      </div>

      {/* Aviso, NO bloqueo: dos presentaciones distintas del mismo producto son
          un caso normal en una distribuidora, y bloquear lo haría imposible. */}
      {similares.length > 0 && (
        <div
          className="rounded-lg py-2 px-3"
          style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}
        >
          <div className="flex items-center gap-2 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Ya existen productos parecidos:
          </div>
          <ul className="mt-1">
            {similares.map((p) => (
              <li key={p.id} className="text-xs text-amber-700">
                • {p.name}
                {(p.unlimitedStock || p.stock === -1) ? ' (stock ilimitado)' : ` (stock ${p.stock})`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-1">
            Si es alguno de estos, cancelá y ajustá el que ya existe en vez de crear otro.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar en el navegador que los recuadros se ven**

Con `npm run dev`, abrir "Nuevo Producto" y confirmar visualmente que:
- los tres campos (Presentación / Unidad / Unidades) quedan **en fila** en pantalla ancha y apilados en angosta;
- el recuadro azul de vista previa tiene fondo y borde;
- al escribir una marca que exista, el recuadro amarillo de aviso tiene fondo y borde.

Si alguno se ve sin fondo o sin borde, la clase correspondiente no está en el CSS
precompilado: pasarla a `style={{ ... }}` inline.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects`
Expected: sin salida

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductNameFields.tsx
git commit -m "feat: componente de campos estructurados de nombre"
```

---

### Task 10: Integrar los campos de nombre en el alta de producto

**Files:**
- Modify: `src/components/ProductManagement.tsx` (imports; estado; `handleOpenDialog`; el campo Nombre del formulario ~línea 866)

**Interfaces:**
- Consumes: `ProductNameFields` (Tarea 9); `componerNombre`, `partesVacias`, `ProductNameParts` (Tarea 7).

Clave del diseño: **`formData.name` se mantiene siempre sincronizado** con el nombre compuesto. Así `handleSubmit`, la validación y el payload no se tocan.

- [ ] **Step 1: Imports**

```ts
import { ProductNameFields } from './ProductNameFields';
import { componerNombre, partesVacias, type ProductNameParts } from '../utils/productName';
```

- [ ] **Step 2: Estado de las partes**

Al lado de los otros `useState` del componente (~línea 99-106):

```ts
  // Solo se usan al crear. Al editar, el nombre sigue siendo texto libre.
  const [nameParts, setNameParts] = useState<ProductNameParts>(partesVacias);
```

- [ ] **Step 3: Resetear al abrir y cerrar el diálogo**

En `handleOpenDialog`, agregar `setNameParts(partesVacias);` como primera línea de la función (aplica tanto al alta como a la edición: si quedaran partes de un alta anterior, reaparecerían al crear el siguiente producto).

En `handleCloseDialog`, agregar `setNameParts(partesVacias);` junto a `setFormData(emptyForm);`.

- [ ] **Step 4: Renderizar los campos según el modo**

Reemplazar el bloque del campo **Nombre** del formulario (~línea 864-871, el `<div>` que contiene el `<Label htmlFor="name">` y su `<Input>`) por:

```tsx
              {editingProduct ? (
                <div>
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Coca Cola 591ml"
                    required
                  />
                </div>
              ) : (
                <ProductNameFields
                  value={nameParts}
                  onChange={(partes) => {
                    setNameParts(partes);
                    // formData.name queda siempre igual al nombre compuesto, así
                    // la validación y el payload de handleSubmit no cambian nada.
                    setFormData(f => ({ ...f, name: componerNombre(partes) }));
                  }}
                  productosExistentes={products}
                />
              )}
```

Conservar los atributos exactos del `<Input>` original (id, placeholder, clases) al copiarlo a la rama de edición.

- [ ] **Step 5: Typecheck y build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects && npm run build`
Expected: sin errores; build exitoso.

- [ ] **Step 6: Correr todos los tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Verificar en el navegador**

Con `npm run dev`:
1. "Nuevo Producto" → marca "Coca Cola", presentación 591 + ml, unidades 6 → la vista previa dice `Coca Cola 591ml 6 unidades`. Guardar → el producto aparece en la lista con ese nombre exacto.
2. Unidades vacío o 1 → el nombre no incluye "unidades".
3. Sin presentación → el nombre es solo la marca.
4. Unidad "Otro…" → aparece el campo de texto y se usa en el nombre.
5. Tipear "coca cola" con el producto anterior ya creado → aparece el aviso amarillo con ese producto y su stock.
6. Tipear "Coca Kola" → también aparece (tipeo).
7. Tipear "co" → no aparece nada.
8. Con el aviso visible, guardar igual → **el producto se crea** (el aviso no bloquea).
9. Abrir **Editar** en cualquier producto → aparece el campo de nombre de texto libre de siempre, sin los campos nuevos, con el nombre actual cargado.
10. Editar un producto sin tocar el stock y guardar → el stock no cambia (regresión de la Fase 0, ya aplicada).

- [ ] **Step 8: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "feat: nombre estructurado y aviso de duplicados al crear productos"
```

---

## Verificación final

- [ ] `npm test` → todos los tests pasan
- [ ] `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects` → sin salida
- [ ] `npm run build` → build exitoso
- [ ] Recorrido en el navegador de los 21 casos de la sección Testing del [spec](../specs/2026-08-23-subcategorias-y-nombres-estructurados-design.md#testing)
- [ ] Confirmar visualmente que la indentación de subcategorías (Gestión de Categorías y selector de producto) y los recuadros de vista previa/aviso **se ven aplicados** — el riesgo de Tailwind precompilado es que fallen en silencio
