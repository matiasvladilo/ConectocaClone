-- supabase/migrations/20260908_create_nutrition_labeling.sql
-- Módulo de información nutricional y etiquetas (Etapa 1 de docs/plan-etiquetado-nutricional.md).
--
-- Seis tablas satélite. NINGUNA columna nueva en ingredients ni en products: los
-- endpoints /ingredients y /products hacen select('*') y se llaman en varias
-- pantallas, así que meter ~20 columnas nutricionales ahí engorda cada request de
-- la app entera. Además, ambos endpoints tienen whitelist explícita de campos en
-- el UPDATE; no tocarlas es lo que garantiza que stock y costos sigan intactos.
--
-- RLS: se habilita SIN políticas, igual que stock_events. El frontend nunca toca
-- estas tablas directamente — todo pasa por el Edge Function con la service_role
-- key, que tiene BYPASSRLS. RLS activo y sin políticas significa que la anon key
-- no puede leer ni escribir nada, que es exactamente lo que queremos.

-- ---------------------------------------------------------------------------
-- 1. Ficha nutricional de la materia prima (1:1 con ingredients)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ingredient_nutrition (
  -- PK = FK: la relación es 1:1 y la ficha no existe sin su materia prima.
  ingredient_id uuid PRIMARY KEY REFERENCES public.ingredients(id) ON DELETE CASCADE,

  -- Denormalizado desde ingredients. Evita un join en cada consulta por negocio
  -- y permite filtrar por business_id sin salir de esta tabla.
  business_id   uuid NOT NULL,

  -- Base explícita de los valores. El proveedor declara "por 100 g" o "por 100 ml";
  -- NO se asume 100 g ni se asume que 1 ml = 1 g. La conversión a la unidad de la
  -- receta la hace el motor usando densidad_g_ml cuando las bases no coinciden.
  base_cantidad numeric NOT NULL DEFAULT 100 CHECK (base_cantidad > 0),
  base_unidad   text    NOT NULL DEFAULT 'g' CHECK (base_unidad IN ('g', 'ml')),

  -- Los 11 nutrientes del rotulado chileno (RSA art. 115), en el mismo orden en
  -- que van en la etiqueta.
  --
  -- TODOS nullable A PROPÓSITO. NULL = "no tengo el dato"; 0 = "el proveedor
  -- declara cero". Esa distinción es lo único que permite decir "faltan datos de
  -- 2 materias primas" en vez de calcular en silencio con ceros inventados y
  -- emitir una etiqueta legal que miente.
  energia_kcal            numeric CHECK (energia_kcal            >= 0),
  proteinas_g             numeric CHECK (proteinas_g             >= 0),
  grasa_total_g           numeric CHECK (grasa_total_g           >= 0),
  grasa_saturada_g        numeric CHECK (grasa_saturada_g        >= 0),
  grasa_monoinsaturada_g  numeric CHECK (grasa_monoinsaturada_g  >= 0),
  grasa_poliinsaturada_g  numeric CHECK (grasa_poliinsaturada_g  >= 0),
  grasas_trans_g          numeric CHECK (grasas_trans_g          >= 0),
  colesterol_mg           numeric CHECK (colesterol_mg           >= 0),
  carbohidratos_disp_g    numeric CHECK (carbohidratos_disp_g    >= 0),
  azucares_totales_g      numeric CHECK (azucares_totales_g      >= 0),
  sodio_mg                numeric CHECK (sodio_mg                >= 0),

  -- Obligatoria cuando ingredients.unit es 'l'/'ml' y la ficha está en base 'g'
  -- (o al revés). Sin esto el motor NO estima: bloquea el cálculo. Hoy hay 6
  -- materias primas en litros usadas en 23 líneas de receta.
  densidad_g_ml    numeric CHECK (densidad_g_ml > 0),

  -- Obligatoria cuando ingredients.unit es 'unidades'/'bolsas'/'cajas'. Hoy no
  -- hay ninguna así, pero el selector de IngredientManagement las ofrece.
  peso_por_unidad_g numeric CHECK (peso_por_unidad_g > 0),

  -- Declaración LITERAL del fabricante para ingredientes compuestos, tal como
  -- viene en su ficha técnica. Ej: "harina de trigo enriquecida [harina de trigo,
  -- niacina, hierro, tiamina, riboflavina, ácido fólico], azúcar, suero de leche
  -- en polvo, ...". Se transcribe, no se deducen porcentajes internos.
  ingredientes_declarados text,

  marca  text,
  fuente text,  -- 'etiqueta del envase', 'ficha técnica proveedor', ...

  -- Art. 120 bis: los sellos aplican SOLO a alimentos con el nutriente AÑADIDO.
  -- Esto no se puede deducir de los números: el azúcar del mix de queque es
  -- añadido, la lactosa natural de la leche en polvo no lo es. Lo declara el
  -- usuario materia prima por materia prima.
  aporta_azucares_anadidos         boolean NOT NULL DEFAULT false,
  aporta_sodio_anadido             boolean NOT NULL DEFAULT false,
  aporta_grasas_saturadas_anadidas boolean NOT NULL DEFAULT false,

  -- Cuándo se transcribieron los valores desde la ficha del proveedor. Distinto
  -- de updated_at, que cambia con cualquier edición (agregar la marca, corregir
  -- un typo). Sirve para detectar fichas viejas.
  actualizado_en timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_business_idx
  ON public.ingredient_nutrition (business_id);

CREATE OR REPLACE TRIGGER ingredient_nutrition_updated_at
  BEFORE UPDATE ON public.ingredient_nutrition
  FOR EACH ROW EXECUTE FUNCTION public._update_updated_at();

ALTER TABLE public.ingredient_nutrition ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Catálogo normalizado de alérgenos
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.allergens (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = alérgeno del catálogo global (sembrado abajo, compartido por todos los
  -- negocios). Con valor = alérgeno propio de un negocio.
  business_id uuid,

  codigo text NOT NULL,

  -- nombre: para la UI ("Trigo (gluten)").
  -- nombre_etiqueta: la forma en que se redacta DENTRO de la frase de la etiqueta
  -- ("trigo (gluten)"), en minúscula, porque va en "Contiene trigo (gluten),
  -- huevos y leche." Sin este segundo campo habría que capitalizar/descapitalizar
  -- a mano y quedaría inconsistente.
  nombre          text NOT NULL,
  nombre_etiqueta text NOT NULL,

  -- Orden de presentación en la frase de alérgenos. Estable y editable, para no
  -- depender del orden alfabético ni del orden de inserción.
  orden integer NOT NULL DEFAULT 100,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Dos índices únicos parciales en vez de UNIQUE(business_id, codigo): en Postgres
-- NULL nunca es igual a NULL, así que un UNIQUE normal dejaría insertar el mismo
-- código global infinitas veces.
CREATE UNIQUE INDEX IF NOT EXISTS allergens_codigo_global_uniq
  ON public.allergens (codigo) WHERE business_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS allergens_codigo_business_uniq
  ON public.allergens (business_id, codigo) WHERE business_id IS NOT NULL;

ALTER TABLE public.allergens ENABLE ROW LEVEL SECURITY;

-- Semilla del catálogo global. Lista editable: no pretende ser la enumeración
-- legal exhaustiva, sino cubrir lo que una panadería/pastelería declara en la
-- práctica. Se puede ampliar por negocio sin tocar estas filas.
INSERT INTO public.allergens (business_id, codigo, nombre, nombre_etiqueta, orden) VALUES
  (NULL, 'gluten_trigo', 'Trigo (gluten)',  'trigo (gluten)',        10),
  (NULL, 'huevo',        'Huevo',           'huevos',                20),
  (NULL, 'leche',        'Leche',           'leche',                 30),
  (NULL, 'soya',         'Soya',            'soya',                  40),
  (NULL, 'mani',         'Maní',            'maní',                  50),
  (NULL, 'frutos_secos', 'Frutos secos',    'frutos secos',          60),
  (NULL, 'sesamo',       'Sésamo',          'sésamo',                70),
  (NULL, 'pescado',      'Pescado',         'pescado',               80),
  (NULL, 'crustaceos',   'Crustáceos',      'crustáceos',            90),
  (NULL, 'moluscos',     'Moluscos',        'moluscos',             100),
  (NULL, 'sulfitos',     'Sulfitos',        'sulfitos',             110),
  (NULL, 'apio',         'Apio',            'apio',                 120),
  (NULL, 'mostaza',      'Mostaza',         'mostaza',              130)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Alérgenos por materia prima
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ingredient_allergens (
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  allergen_id   uuid NOT NULL REFERENCES public.allergens(id)   ON DELETE RESTRICT,

  -- 'contiene' y 'trazas' se guardan como filas separadas y NUNCA se mezclan al
  -- consolidar: la etiqueta las declara en frases distintas ("Contiene X." vs
  -- "Puede contener trazas de Y."). Una traza no declarada por el proveedor no se
  -- infiere jamás.
  tipo text NOT NULL CHECK (tipo IN ('contiene', 'trazas')),

  created_at timestamptz NOT NULL DEFAULT now(),

  -- La PK incluye `tipo`: una materia prima puede declarar el mismo alérgeno como
  -- presente Y como traza sin que sea un error de carga.
  PRIMARY KEY (ingredient_id, allergen_id, tipo)
);

CREATE INDEX IF NOT EXISTS ingredient_allergens_ingredient_idx
  ON public.ingredient_allergens (ingredient_id);

ALTER TABLE public.ingredient_allergens ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Perfil de etiqueta del producto (1:1 con products)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_label_profile (
  product_id  uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,

  -- EL dato crítico del módulo. La suma de ingredientes ANTES de hornear no es el
  -- peso final: el marmolado son ~196 g de mezcla que salen 160 g horneados. Todo
  -- el cálculo "por 100 g" usa este número, no la suma de la receta.
  --
  -- Es un dato de balanza. No es calculable. Sin él, ninguna etiqueta pasa de
  -- borrador.
  peso_final_promedio_g numeric CHECK (peso_final_promedio_g > 0),

  peso_porcion_g        numeric CHECK (peso_porcion_g > 0),
  porciones_por_envase  numeric CHECK (porciones_por_envase > 0),

  -- Texto de la porción tal como va en la etiqueta: "1 unidad", "2 galletas",
  -- "1 rebanada". Se imprime como "Porción: 1 unidad (160 g)".
  porcion_descripcion   text,

  -- El nombre comercial (products.name) puede ser "Bizcocho Marmolado 160g" o
  -- traer la marca. La etiqueta necesita la denominación limpia. Si está vacío se
  -- usa products.name.
  denominacion_legal   text,
  descripcion_etiqueta text,
  conservacion         text,
  vida_util_dias       integer CHECK (vida_util_dias > 0),

  -- Edición administrativa del texto de la etiqueta (punto 10 del pedido).
  -- Cuando están seteados PISAN al texto autogenerado desde la receta, pero NO
  -- modifican product_ingredients: la receta sigue siendo la fuente de verdad
  -- para costos, stock y "puede producir". Vacío = usar el texto autogenerado.
  ingredientes_texto_override text,
  alergenos_texto_override    text,
  trazas_texto_override       text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_label_profile_business_idx
  ON public.product_label_profile (business_id);

CREATE OR REPLACE TRIGGER product_label_profile_updated_at
  BEFORE UPDATE ON public.product_label_profile
  FOR EACH ROW EXECUTE FUNCTION public._update_updated_at();

ALTER TABLE public.product_label_profile ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. Configuración de etiquetas del negocio (1:1 con businesses)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_label_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Datos del elaborador que la etiqueta debe declarar.
  razon_social       text,
  rut                text,
  direccion          text,
  telefono           text,
  email              text,
  planta_elaboradora text,

  -- URL del asset oficial subido por el negocio. NUNCA se genera ni se redibuja
  -- el logo: se embebe esta imagen tal cual.
  logo_frontal_url text,

  -- Default configurable, no hardcodeado. 90x60 mm es el punto de partida.
  ancho_mm_default numeric NOT NULL DEFAULT 90 CHECK (ancho_mm_default > 0),
  alto_mm_default  numeric NOT NULL DEFAULT 60 CHECK (alto_mm_default  > 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER business_label_settings_updated_at
  BEFORE UPDATE ON public.business_label_settings
  FOR EACH ROW EXECUTE FUNCTION public._update_updated_at();

ALTER TABLE public.business_label_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. Versiones de etiqueta (snapshots inmutables)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.label_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,

  -- Sin foreign key a products, por la misma razón que stock_events: una etiqueta
  -- emitida es historia y tiene que sobrevivir al borrado del producto (DELETE
  -- /products/:id borra físicamente). Por eso además se guarda product_name.
  product_id   uuid NOT NULL,
  product_name text NOT NULL,

  version integer NOT NULL CHECK (version > 0),

  -- 'borrador' = faltan datos o las reglas no pudieron evaluarse. Se puede
  -- generar y descargar, pero sale marcado "BORRADOR — INFORMACIÓN INCOMPLETA".
  -- 'lista'    = pasó todas las validaciones. Solo estas van a imprenta.
  estado text NOT NULL CHECK (estado IN ('borrador', 'lista')),

  -- El snapshot es AUTOCONTENIDO: receta usada, ficha nutricional de cada materia
  -- prima al momento del cálculo, totales, pesos, texto de ingredientes, alérgenos,
  -- sellos y bloqueos. Reimprimir la v1 dentro de dos años no vuelve a consultar
  -- ingredients ni product_ingredients — por eso una etiqueta histórica no cambia
  -- retroactivamente cuando cambia la receta.
  snapshot jsonb NOT NULL,

  -- Con qué versión de las reglas regulatorias se evaluó. Ej: 'CL-RSA-120bis-2019.3'.
  -- Si mañana cambian los umbrales, las etiquetas viejas siguen diciendo con qué
  -- reglas se emitieron.
  regulation_version text NOT NULL,

  calculated_at timestamptz NOT NULL,

  -- Sin FK a profiles: si el usuario se borra, la etiqueta sigue siendo válida.
  created_by uuid,

  ancho_mm numeric CHECK (ancho_mm > 0),
  alto_mm  numeric CHECK (alto_mm  > 0),

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Una sola v1 por producto. El número de versión lo asigna el Edge Function
  -- como MAX(version)+1; esta restricción es la red que atrapa la carrera entre
  -- dos generaciones simultáneas.
  UNIQUE (product_id, version)
);

CREATE INDEX IF NOT EXISTS label_versions_product_version_idx
  ON public.label_versions (product_id, version DESC);

CREATE INDEX IF NOT EXISTS label_versions_business_created_idx
  ON public.label_versions (business_id, created_at DESC);

ALTER TABLE public.label_versions ENABLE ROW LEVEL SECURITY;
