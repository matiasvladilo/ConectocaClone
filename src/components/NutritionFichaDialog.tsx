import { useEffect, useState } from "react";
import { Save, FlaskConical } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { nutritionAPI, type AlergenoAPI, type FichaNutricionalAPI, type Ingredient } from "../utils/api";
import { NUTRIENTES } from "../utils/nutricion/tipos";
import type { ClaveNutriente } from "../utils/nutricion/tipos";
import { ETIQUETA_NUTRIENTE } from "../utils/nutricion/reglasChile";
import { diagnosticarFicha } from "../utils/nutricion/estado";
import { normalizarUnidad } from "../utils/nutricion/unidades";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  ingredient: Ingredient;
  ficha: FichaNutricionalAPI | null;
  contieneIniciales: AlergenoAPI[];
  trazasIniciales: AlergenoAPI[];
  catalogo: AlergenoAPI[];
  /** Se llama después de guardar para que la pantalla recargue el estado. */
  onSaved: () => void;
  accessToken: string;
}

// Los valores se manejan como TEXTO, no como número, por el mismo motivo que la
// cantidad de receta y el stock: un estado numérico no puede representar "campo
// vacío" y obliga a dibujar un 0 que el usuario no puede borrar. Acá además el 0
// tiene significado propio ("el proveedor declara cero"), así que confundirlo con
// vacío sería peor todavía.
type ValoresTexto = Record<ClaveNutriente, string>;

function vacios(): ValoresTexto {
  const out = {} as ValoresTexto;
  for (const clave of NUTRIENTES) out[clave] = "";
  return out;
}

function aTexto(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

function aNumero(s: string): number | null {
  const limpio = s.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
}

export function NutritionFichaDialog({
  open,
  onClose,
  ingredient,
  ficha,
  contieneIniciales,
  trazasIniciales,
  catalogo,
  onSaved,
  accessToken,
}: Props) {
  const [valores, setValores] = useState<ValoresTexto>(vacios());
  const [baseCantidad, setBaseCantidad] = useState("100");
  const [baseUnidad, setBaseUnidad] = useState<"g" | "ml">("g");
  const [densidad, setDensidad] = useState("");
  const [pesoPorUnidad, setPesoPorUnidad] = useState("");
  const [marca, setMarca] = useState("");
  const [fuente, setFuente] = useState("");
  const [ingredientesDeclarados, setIngredientesDeclarados] = useState("");
  const [azucaresAnadidos, setAzucaresAnadidos] = useState(false);
  const [sodioAnadido, setSodioAnadido] = useState(false);
  const [grasasAnadidas, setGrasasAnadidas] = useState(false);
  const [contiene, setContiene] = useState<string[]>([]);
  const [trazas, setTrazas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Se recarga cada vez que se abre: si el usuario cancela y vuelve a entrar,
  // tiene que ver lo guardado y no lo que había tipeado antes.
  useEffect(() => {
    if (!open) return;

    const v = vacios();
    for (const clave of NUTRIENTES) v[clave] = aTexto(ficha?.valores?.[clave]);
    setValores(v);

    setBaseCantidad(ficha ? String(ficha.baseCantidad) : "100");
    setBaseUnidad((ficha?.baseUnidad as "g" | "ml") || "g");
    setDensidad(aTexto(ficha?.densidadGMl));
    setPesoPorUnidad(aTexto(ficha?.pesoPorUnidadG));
    setMarca(ficha?.marca || "");
    setFuente(ficha?.fuente || "");
    setIngredientesDeclarados(ficha?.ingredientesDeclarados || "");
    setAzucaresAnadidos(ficha?.aportaAzucaresAnadidos || false);
    setSodioAnadido(ficha?.aportaSodioAnadido || false);
    setGrasasAnadidas(ficha?.aportaGrasasSaturadasAnadidas || false);
    setContiene(contieneIniciales.map((a) => a.id));
    setTrazas(trazasIniciales.map((a) => a.id));
  }, [open, ficha, contieneIniciales, trazasIniciales]);

  const unidadNorm = normalizarUnidad(ingredient.unit);
  const esConteo = unidadNorm === "conteo";

  // Diagnóstico en vivo sobre lo que hay tipeado, no sobre lo último guardado:
  // el usuario ve el semáforo moverse mientras carga.
  const fichaEnVivo = {
    baseCantidad: aNumero(baseCantidad) ?? 100,
    baseUnidad,
    valores: Object.fromEntries(
      NUTRIENTES.map((c) => [c, aNumero(valores[c])]),
    ) as Record<ClaveNutriente, number | null>,
    densidadGMl: aNumero(densidad),
    pesoPorUnidadG: aNumero(pesoPorUnidad),
    aportaAzucaresAnadidos: azucaresAnadidos,
    aportaSodioAnadido: sodioAnadido,
    aportaGrasasSaturadasAnadidas: grasasAnadidas,
  };
  const diagnostico = diagnosticarFicha(ingredient.unit, fichaEnVivo);

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) => {
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  };

  const guardar = async () => {
    if (guardando) return;

    const base = aNumero(baseCantidad);
    if (base === null || base <= 0) {
      toast.error("La base nutricional tiene que ser mayor a 0");
      return;
    }

    try {
      setGuardando(true);
      await nutritionAPI.saveIngredientNutrition(accessToken, ingredient.id, {
        baseCantidad: base,
        baseUnidad,
        // Se mandan las 11 claves siempre, incluso las vacías como null: es lo
        // que permite BORRAR un valor cargado por error. Omitirlas dejaría el
        // dato viejo en la base sin que el usuario lo note.
        valores: fichaEnVivo.valores,
        densidadGMl: aNumero(densidad),
        pesoPorUnidadG: aNumero(pesoPorUnidad),
        marca,
        fuente,
        ingredientesDeclarados,
        aportaAzucaresAnadidos: azucaresAnadidos,
        aportaSodioAnadido: sodioAnadido,
        aportaGrasasSaturadasAnadidas: grasasAnadidas,
        actualizadoEn: new Date().toISOString(),
        contiene,
        trazas,
      });
      toast.success("Información nutricional guardada");
      onSaved();
      onClose();
    } catch (error: any) {
      console.error("Error saving nutrition:", error);
      toast.error(error.message || "Error al guardar la información nutricional");
    } finally {
      setGuardando(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* El ancho va inline y no como clase: DialogContent trae `sm:max-w-lg` por
          defecto y, con la misma especificidad, la variante responsive gana por
          orden en el CSS. Un estilo inline le gana a las dos. `max-h-[90vh]` y
          `overflow-y-auto` sí están compiladas en index.css. */}
      <DialogContent
        className="max-h-[90vh] overflow-y-auto bg-white"
        style={{ maxWidth: "48rem" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            Información nutricional — {ingredient.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Estado en vivo */}
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <EstadoPunto estado={diagnostico.estado} />
              <span className="text-sm text-gray-900">
                {diagnostico.nutrientesCargados} de {diagnostico.nutrientesTotales} nutrientes cargados
              </span>
            </div>
            {diagnostico.pendientes.map((p) => (
              <p key={p} className="text-xs text-gray-600">{p}</p>
            ))}
          </div>

          {/* Base */}
          <div>
            <h3 className="text-sm text-gray-900 mb-2">Base de los valores</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Valores por</span>
              <input
                type="text"
                inputMode="decimal"
                value={baseCantidad}
                onChange={(e) => setBaseCantidad(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={baseUnidad}
                onChange={(e) => setBaseUnidad(e.target.value as "g" | "ml")}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="g">gramos (g)</option>
                <option value="ml">mililitros (ml)</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Copiá la base tal como la declara el proveedor. Normalmente 100 g o 100 ml.
            </p>
          </div>

          {/* Nutrientes */}
          <div>
            <h3 className="text-sm text-gray-900 mb-2">Nutrientes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {NUTRIENTES.map((clave) => (
                <div key={clave}>
                  <label className="block text-xs text-gray-600 mb-1">
                    {ETIQUETA_NUTRIENTE[clave]}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valores[clave]}
                    onChange={(e) => setValores({ ...valores, [clave]: e.target.value })}
                    className={inputClass}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Dejá vacío lo que el proveedor no declare. Un campo vacío es “no tengo el dato”; un 0 es
              “el proveedor declara cero”, y no significan lo mismo.
            </p>
          </div>

          {/* Conversiones */}
          <div>
            <h3 className="text-sm text-gray-900 mb-2">Conversión de unidades</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Densidad (g/ml)
                  {diagnostico.necesitaDensidad && <span className="text-red-500"> *</span>}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={densidad}
                  onChange={(e) => setDensidad(e.target.value)}
                  className={inputClass}
                  placeholder="Ej: 0.92"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Obligatoria si se mide en volumen. No se asume que 1 ml = 1 g.
                </p>
              </div>

              {esConteo && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Peso por unidad (g) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pesoPorUnidad}
                    onChange={(e) => setPesoPorUnidad(e.target.value)}
                    className={inputClass}
                    placeholder="Ej: 55"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Esta materia prima se mide en “{ingredient.unit}”.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Nutrientes añadidos */}
          <div>
            <h3 className="text-sm text-gray-900 mb-1">Nutrientes añadidos</h3>
            <p className="text-xs text-gray-500 mb-2">
              Los sellos “ALTO EN” solo aplican a nutrientes <strong>añadidos</strong>. El azúcar de un mix
              de queque es añadido; la lactosa natural de la leche en polvo, no. Esto no se puede deducir
              de los números.
            </p>
            <div className="space-y-2">
              <Marca label="Tiene azúcares añadidos" checked={azucaresAnadidos} onChange={setAzucaresAnadidos} />
              <Marca label="Tiene sodio añadido" checked={sodioAnadido} onChange={setSodioAnadido} />
              <Marca label="Tiene grasas saturadas añadidas" checked={grasasAnadidas} onChange={setGrasasAnadidas} />
            </div>
          </div>

          {/* Alérgenos */}
          <div>
            <h3 className="text-sm text-gray-900 mb-1">Alérgenos</h3>
            <p className="text-xs text-gray-500 mb-2">
              Solo lo que el proveedor declara. Nunca se infiere una traza que no esté declarada.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">Contiene</p>
                <div className="space-y-1">
                  {catalogo.map((a) => (
                    <Marca
                      key={`c-${a.id}`}
                      label={a.nombre}
                      checked={contiene.includes(a.id)}
                      onChange={() => alternar(contiene, setContiene, a.id)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Puede contener trazas de</p>
                <div className="space-y-1">
                  {catalogo.map((a) => (
                    <Marca
                      key={`t-${a.id}`}
                      label={a.nombre}
                      checked={trazas.includes(a.id)}
                      onChange={() => alternar(trazas, setTrazas, a.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Declaración del proveedor */}
          <div>
            <h3 className="text-sm text-gray-900 mb-2">Datos del proveedor</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Ingredientes declarados (para materias primas compuestas)
                </label>
                <textarea
                  value={ingredientesDeclarados}
                  onChange={(e) => setIngredientesDeclarados(e.target.value)}
                  rows={3}
                  className={inputClass}
                  placeholder="harina de trigo enriquecida, azúcar, suero de leche en polvo, sal…"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Transcribí la declaración tal cual. Se usa para expandir el ingrediente en la etiqueta.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Marca</label>
                  <input
                    type="text"
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Fuente de la información</label>
                  <input
                    type="text"
                    value={fuente}
                    onChange={(e) => setFuente(e.target.value)}
                    className={inputClass}
                    placeholder="Ej: ficha técnica del proveedor"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {guardando ? "Guardando..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Marca({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4"
      />
      {label}
    </label>
  );
}

export function EstadoPunto({ estado }: { estado: "completa" | "parcial" | "sin_datos" }) {
  const color =
    estado === "completa" ? "bg-green-500" : estado === "parcial" ? "bg-yellow-500" : "bg-gray-300";
  return <span className={`w-3 h-3 rounded-full ${color}`} />;
}
