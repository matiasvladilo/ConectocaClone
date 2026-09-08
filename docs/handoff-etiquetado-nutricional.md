# Handoff — Módulo de Información Nutricional y Etiquetas

**Para quien retome este trabajo.** Estado al 2026-09-08.
El diseño completo está en [plan-etiquetado-nutricional.md](./plan-etiquetado-nutricional.md).
Este documento es el estado real y lo que falta.

---

## 1. Dónde estamos

Etapas 1 a 5 hechas, verificadas y commiteadas. Falta la 6.

| Etapa | Qué | Estado |
|---|---|---|
| 1 | Tablas, RLS, endpoints, API client | ✅ aplicada y desplegada |
| 2 | Motor de cálculo puro + tests | ✅ |
| 3 | UI materias primas (ficha, alérgenos, semáforo) | ✅ verificada en pantalla |
| 4 | UI producto (pesos, estado, previsualización) | ✅ verificada en pantalla |
| 5 | Etiquetas: layout mm, PDF, PNG | ✅ verificada |
| **6** | **Versionado / snapshots** | ❌ **pendiente** |

### Coordenadas exactas

- Rama: `etiquetado-nutricional`, pusheada. Commit `d3ddf01c`.
- PR sin crear: https://github.com/matiasvladilo/ConectocaClone/pull/new/etiquetado-nutricional
- Proyecto Supabase: **`xxmiujtywnnlqmekakzq`** (`conectocadev`). Es el entorno vivo pese al nombre.
- Migración `20260908_create_nutrition_labeling.sql`: **aplicada en producción**.
- Edge function `make-server-6d979413`: **desplegado, versión 16**, `verify_jwt: false`.
- Tests: **197 pasando** (`npm test`). Typecheck y build limpios.

En el working tree quedan sin commitear `vite.config.ts` y `supabase/.temp/cli-latest`.
**No son de este trabajo** — ya estaban modificados antes. No los toques.

---

## 2. Lo único que falta implementar: Etapa 6 (versionado)

La tabla `label_versions` y sus dos endpoints (`GET`/`POST
/nutrition/products/:id/label-versions`) **ya existen y están desplegados**. El
cliente en `api.tsx` también (`nutritionAPI.getLabelVersions` /
`createLabelVersion`). Lo que falta es engancharlos en la UI.

Hoy el PDF se descarga pero no queda registro. Consecuencia concreta: si cambia
la receta, no se puede reimprimir la etiqueta que se usó antes.

### Qué hay que hacer

1. **Al generar**, en `LabelGenerator.tsx`, llamar a `createLabelVersion` con:
   - `snapshot`: el `ResultadoEtiqueta` completo **más** las fichas de cada materia
     prima usadas en ese cálculo. Tiene que ser autocontenido: reimprimir la v1
     dentro de dos años no puede volver a consultar `ingredients` ni
     `product_ingredients`.
   - `estado`: `resultado.veredicto.estado`.
   - `regulationVersion`: `VERSION_REGLAS` de `reglasChile.ts`.
   - `anchoMm` / `altoMm`.
2. **Componente `LabelVersions.tsx`** (nuevo): listar versiones de un producto,
   permitir reimprimir una vieja reconstruyendo el lienzo desde su `snapshot`.
3. El número de versión lo asigna el backend (`MAX+1` con reintento ante 23505);
   el frontend no lo calcula.

`armarEtiqueta()` es determinista y no muta su entrada — hay tests que lo
verifican (`armado.test.ts`). Eso es lo que hace seguro guardar snapshots.

---

## 3. Trampas de este repo — leer antes de tocar nada

Estas cuatro cosas fallan **en silencio**. Las cuatro me mordieron.

### 3.1 Tailwind está precompilado

`src/index.css` son 6239 líneas de Tailwind ya compilado. **No hay
`tailwind.config`.** Una clase que no esté ahí no aplica ningún estilo y no
avisa.

Verificá siempre con esto antes de dar por buena una pantalla:

```bash
node -e "
const fs=require('fs');
const css=fs.readFileSync('src/index.css','utf8');
const presentes=new Set();
for (const m of css.matchAll(/\.((?:\\\\.|[^\s{},:>+~\[\]()\"'])+)/g)) presentes.add(m[1].replace(/\\\\/g,''));
let malas=0;
for (const f of process.argv.slice(1)) {
  const src=fs.readFileSync(f,'utf8');
  for (const m of src.matchAll(/className=[\"\`]([^\"\`]+)[\"\`]/g))
    for (let c of m[1].split(/\s+/)) { c=c.trim();
      if(c && !c.includes('\${') && !presentes.has(c)) { console.log('FALTA', c, 'en', f); malas++; } }
}
if(!malas) console.log('CLASES OK');
" src/components/TuArchivo.tsx
```

Ojo: la alternancia `\\.` va **primero** en el regex. Si va después, la clase
negada consume la barra invertida y corta en el `:`, y da ~19 falsos positivos
con las variantes (`md:`, `focus:`, `hover:`).

Cuando una clase no existe y la necesitás, usá estilo inline. Es lo que se hizo
con el ancho del diálogo (`sm:max-w-lg` del `DialogContent` le gana por orden a
un `max-w-3xl` sin prefijo) y con el negro de los sellos.

**Dos clases muertas preexistentes**, no las introdujo este trabajo:
`md:w-1/3` y `scroll-mt-40`, ambas en `IngredientManagement.tsx`.

### 3.2 El Edge Function tiene whitelists de campos

Todo el acceso a datos pasa por `supabase/functions/make-server-6d979413/index.ts`
(3783 líneas). Los `PUT` tienen listas explícitas de campos permitidos.

**Un campo nuevo que no esté en el mapper Y en la whitelist se guarda como nada,
sin error.** Es el modo de falla más probable de cualquier cambio acá.

Al desplegar: **`verify_jwt` tiene que quedar en `false`.** La función hace su
propia autenticación y tiene rutas públicas (`/health`, `/signup`). La
herramienta MCP de deploy usa `true` por defecto y eso rompe el login.

Desplegar con la CLI, no con MCP — el MCP obliga a retransmitir 138 KB de código
como parámetro:

```bash
npx --yes supabase@2.116.0 functions deploy make-server-6d979413 --project-ref xxmiujtywnnlqmekakzq --no-verify-jwt
```

### 3.3 `product_ingredients.quantity` NO está en gramos

Está en la unidad de la materia prima (`ingredients.unit`). No hay columna de
unidad en la línea de receta. Hoy: 82 materias primas en `kg`, 6 en `l`, 1 en `g`.

Un "104 g" está guardado como `0.104` con unidad `kg`. El motor siempre convierte
con `unidades.aGramos()`; nunca asumas gramos.

**Riesgo latente, preexistente:** si alguien cambia `ingredients.unit` de `kg` a
`g`, las 268 líneas de receta quedan mal por factor 1000. Ya afecta a costos y a
"puede producir"; este módulo lo hereda, pero acá el resultado es una etiqueta
legal impresa.

### 3.4 Vite sirve `/src/` como módulos JS

`import logo from '../assets/x.png'` da una URL bajo `/src/`. En **desarrollo**
Vite responde esa ruta con el módulo JS que envuelve al asset: un `fetch`
devuelve `text/javascript` y la imagen sale vacía. En el build funciona, o sea
que el bug **solo aparece al desarrollar**.

Los assets que se necesiten en runtime van en `public/`. Por eso el logo está en
`public/logo-la-oca-bn.png` y se referencia como `/logo-la-oca-bn.png`.

---

## 4. Reglas de dominio que no se negocian

Están codificadas y testeadas. Romperlas produce etiquetas legalmente
incorrectas, no bugs visuales.

1. **`null` ≠ `0`.** Un nutriente sin dato no es un cero. Mezclarlos hace que el
   sistema calcule con ceros inventados y emita una etiqueta que miente. Toda la
   cadena preserva la distinción — está verificado end-to-end contra Postgres.

2. **Nunca asumir 1 ml = 1 g.** Sin `densidad_g_ml` el cálculo **se bloquea**, no
   estima. Con el aceite la diferencia es 8,28 g vs 9 g: 8,7% de error.

3. **El cálculo por 100 g usa el peso FINAL horneado**, no la suma de la receta.
   Con el marmolado: 442 vs 362 kcal/100 g.

4. **Los sellos solo aplican a nutrientes AÑADIDOS** (art. 120 bis del RSA). No se
   deduce de los números: son tres flags declarados por materia prima. El azúcar
   de un mix de queque es añadido; la lactosa natural de la leche en polvo, no.

5. **No inventar umbrales regulatorios.** Los de la Tabla N°1 están verificados
   contra el Decreto 13 y documentados con fuente en `reglasChile.ts`. Cambiarlos
   obliga a subir `VERSION_REGLAS`.

6. **No inventar valores nutricionales** para materias primas reales. Si probás
   con datos falsos, borralos después.

7. **El logo se embebe como asset, nunca se redibuja.** Sin el archivo, la
   etiqueta frontal sale vacía con un aviso — no con un logo de reemplazo.

---

## 5. Arquitectura

```
src/utils/nutricion/          ← todo puro: sin React, sin Supabase, sin reloj
  tipos.ts                    tipos y NUTRIENTES (el orden define la etiqueta)
  unidades.ts                 g/kg/ml/l/conteo; densidad; bloqueos tipados
  calculadora.ts              motor matemático
  reglasChile.ts              umbrales, VERSION_REGLAS, redondeo
  sellos.ts                   evaluación ALTO EN
  alergenos.ts                consolidación contiene/trazas
  ingredientesTexto.ts        lista en orden decreciente + compuestos
  estado.ts                   semáforo de la ficha
  validacion.ts               borrador vs lista
  armado.ts                   orquesta todo lo anterior
  etiquetaLayout.ts           primitivas en mm, envolver texto, octógono
  etiquetas.ts                composición de las 2 etiquetas
  render/renderCanvas.ts      primitivas → PNG
  render/renderPdf.ts         primitivas → jsPDF
  fixtures.ts                 datos de test (Bizcocho Marmolado, valores inventados)

src/components/
  NutritionFichaDialog.tsx    ficha de materia prima
  NutritionPreview.tsx        tabla + sellos + textos
  LabelGenerator.tsx          tamaño mm, previsualización, PDF/PNG
```

**El PNG y el PDF se dibujan desde la misma lista de primitivas.** Si cada uno
maquetara por su cuenta, la vista previa dejaría de representar lo que se imprime.

### Restricciones al escribir en `src/utils/nutricion/`

`npm test` corre `node --test` con type stripping. Nada de `enum`, `namespace` ni
parameter properties. Imports de tipos con `import type`. Extensión `.ts`
explícita en los imports internos.

---

## 6. Datos de prueba en la base

Hay un producto de prueba cargado. **Borrarlo cuando ya no se use.**

- Producto: `Producto Prueba` — `aaaa0000-0000-4000-8000-000000000001`
- 4 materias primas con prefijo `PRUEBA ·` — ids `aaaa0000-…-0000000000{11,12,13,14}`
- Valores nutricionales **inventados**, marcados con `fuente = 'DATOS DE PRUEBA — NO USAR PARA ETIQUETAS REALES'`
- Aparece en el catálogo de pedidos como cualquier producto

Replica la etiqueta de referencia: 104 g mix + 58 g cacao + 9 ml aceite + 25 g
huevos → 195,28 g crudos → **160 g horneados**. Da **442 kcal/100 g** y **3
sellos** (azúcares, grasas saturadas, calorías). El aceite está en litros con
base en ml y densidad 0,92 a propósito: ejercita la conversión volumen→masa.

```sql
delete from products   where id = 'aaaa0000-0000-4000-8000-000000000001';
delete from ingredients where id::text like 'aaaa0000%';
```

Eso arrastra en cascada receta, fichas, alérgenos y perfil de etiqueta.

Estado del resto de las tablas: catálogo de alérgenos 13 filas (semilla),
`business_label_settings` **0 filas**, `label_versions` **0 filas**.

---

## 7. Bloqueado esperando al humano

Nada de esto lo puede resolver una IA sola.

1. **Manual de Etiquetado Nutricional del MINSAL (PDF).**
   `REDONDEO_CONFIRMADO = false` en `reglasChile.ts` impide marcar **cualquier**
   etiqueta como "lista para impresión". Hay un test que verifica que ése sea el
   único motivo pendiente en un producto completo, así que cuando se transcriban
   las reglas se destraba solo. También falta de ahí la tabla de porciones de
   consumo habitual y el tamaño mínimo de letra.

2. **Datos del elaborador**: razón social, RUT, dirección, planta.
   `business_label_settings` está vacía. Sin eso la etiqueta queda en borrador.
   **No inventarlos.**

3. **Tamaño físico de la etiqueta 2.** A 90×60 mm el sistema avisa que el
   contenido necesita 61 mm. **A 100×75 mm no hay ningún aviso.** Depende de qué
   stock de stickers se compre.

4. **Versión vectorial del logo, o al menos con fondo transparente.** El actual
   es raster 1254×1254 sin canal alfa: en sticker blanco rectangular no se nota,
   en troquelado circular o sobre kraft sí.

5. **Interpretación del sello de calorías.** Se implementó como "aplica si el
   alimento tiene alguno de los tres nutrientes añadidos y supera el límite de
   energía". Está documentado en `sellos.ts` como interpretación a confirmar
   contra el Manual.

---

## 8. Deuda y hallazgos abiertos

Ninguno lo introdujo este trabajo.

1. **`backup_product_ingredients_20260629`, `backup_ingredients_20260629`,
   `backup_products_labor_20260629` tienen RLS deshabilitado.** Receta y costos
   completos legibles **y escribibles** con la anon key. Hay que borrarlas o
   ponerles políticas. No se actuó porque habilitar RLS sin políticas bloquea
   todo acceso, y borrar datos necesita decisión del dueño.

2. **Dos negocios llamados "La Oca".** El activo es
   `d1fa7f40-c5e1-4bc2-9ffc-c8483950b758` (333 productos, 93 materias primas, 11
   usuarios, 4368 pedidos). `bbeb963e-…` es de nov-2025 y está vacío con 1
   usuario.

3. **`build/index.html` está trackeado pero `build/` está en `.gitignore`**, y el
   HTML referencia assets que no están en el repo. Cualquier `npm run build` lo
   ensucia. Conviene destrackearlo.

4. **Los overrides de texto no tienen UI.** `ingredientes_texto_override`,
   `alergenos_texto_override` y `trazas_texto_override` funcionan (se usan en el
   producto de prueba) pero solo se editan por SQL.

5. **Cambiar `ingredients.unit` con recetas cargadas** rompe las cantidades por
   factor 1000. Convendría bloquearlo o advertirlo.

---

## 9. Cómo verificar

```bash
npm test                                    # 197 tests
npx tsc --noEmit -p tsconfig.json           # ignorar los 4 errores de src/_redirects, son basura preexistente
npm run build
```

Para probar en el navegador hace falta sesión iniciada — el login lo tiene que
hacer el humano. Una vez dentro, se puede ejercitar la API real desde la consola
de la página tomando el token de `localStorage` (clave `sb-*-auth-token`), sin
que la credencial salga de ahí.

**Coordenadas del panel del navegador:** los clicks se pasan en espacio de
*screenshot*, no de viewport. Si medís posiciones con JS (que devuelve viewport),
dividí por `viewportWidth / screenshotWidth`. Y no llames a `resize_window` en el
medio: desincroniza el mapeo.

Después de cualquier prueba que escriba datos, **limpiar** y confirmar que
`ingredients`, `product_ingredients` y `products` quedaron en los mismos números.
