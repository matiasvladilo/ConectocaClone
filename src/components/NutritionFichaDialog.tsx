import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
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

  // Nombre y unidad separados: "Energía (kcal)" → ["Energía", "kcal"].
  const partes = (clave: ClaveNutriente) => {
    const m = ETIQUETA_NUTRIENTE[clave].match(/^(.*?)\s*\(([^)]+)\)$/);
    return m ? [m[1], m[2]] : [ETIQUETA_NUTRIENTE[clave], ""];
  };
  const colorEstado = diagnostico.estado === "completa" ? "#34C759" : diagnostico.estado === "parcial" ? "#FFCC00" : "#C7C7CC";
  const nContiene = contiene.length;
  const nTrazas = trazas.length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="hoja-ios"
        style={{
          top: "auto", bottom: 0, left: 0, right: 0, translate: "none", margin: "0 auto",
          width: "100%", maxWidth: 560, height: "94dvh", padding: 0, gap: 0, border: "none",
          borderRadius: "14px 14px 0 0", background: N.fondo, display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px 4px" }}>
          <button type="button" onClick={onClose} disabled={guardando} style={{ ...txtBtn, flex: 1, textAlign: "left" }}>Cancelar</button>
          <DialogTitle className="truncate" style={{ flex: 2, textAlign: "center", fontSize: 17, fontWeight: 600, color: "#000" }}>
            Nutrición
          </DialogTitle>
          <button type="button" onClick={() => void guardar()} disabled={guardando} style={{ ...txtBtn, flex: 1, textAlign: "right", fontWeight: 600 }}>
            {guardando ? "Guardando" : "Guardar"}
          </button>
        </div>
        <DialogDescription className="truncate" style={{ textAlign: "center", fontSize: 14, color: N.sec, padding: "0 16px 12px" }}>
          {ingredient.name}
        </DialogDescription>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px max(env(safe-area-inset-bottom), 28px)" }}>
          {/* Estado en vivo */}
          <div style={{ ...tarjeta, padding: "12px 16px", marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: colorEstado, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 15, color: "#000" }}>
                {diagnostico.nutrientesCargados} de {diagnostico.nutrientesTotales} nutrientes
              </span>
              <span style={{ fontSize: 13, color: N.sec }}>
                {diagnostico.estado === "completa" ? "Completa" : diagnostico.estado === "parcial" ? "Parcial" : "Sin datos"}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: N.relleno, marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: 4, width: `${(diagnostico.nutrientesCargados / Math.max(1, diagnostico.nutrientesTotales)) * 100}%`, background: colorEstado }} />
            </div>
            {diagnostico.pendientes.length > 0 && (
              <p style={{ fontSize: 12, color: N.sec, marginTop: 6, lineHeight: 1.4 }}>{diagnostico.pendientes.join(" · ")}</p>
            )}
          </div>

          {/* Base + nutrientes */}
          <h3 style={titulo}>Valores por</h3>
          <div style={{ ...tarjeta, marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "0 16px" }}>
              <span style={{ flex: 1, fontSize: 16, color: "#000" }}>Base</span>
              <input
                aria-label="Cantidad base"
                inputMode="decimal"
                value={baseCantidad}
                onChange={(e) => setBaseCantidad(e.target.value)}
                style={{ ...campo, flex: "none", width: 56 }}
              />
              <div role="group" style={{ display: "flex", padding: 2, borderRadius: 8, background: N.relleno }}>
                {(["g", "ml"] as const).map((u) => (
                  <button key={u} type="button" aria-pressed={baseUnidad === u} onClick={() => setBaseUnidad(u)}
                    style={{ minWidth: 40, height: 28, borderRadius: 6, border: "none", fontSize: 14, fontWeight: baseUnidad === u ? 600 : 500, color: "#000", background: baseUnidad === u ? "#fff" : "transparent", boxShadow: baseUnidad === u ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
            {NUTRIENTES.map((clave) => {
              const [nombre, unidad] = partes(clave);
              return (
                <div key={clave}>
                  <div style={{ height: 0.5, background: N.sep, marginLeft: 16 }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 46, padding: "0 16px" }}>
                    <span style={{ flex: 1, fontSize: 15, color: "#000" }}>{nombre}</span>
                    <input
                      inputMode="decimal"
                      value={valores[clave]}
                      onChange={(e) => setValores({ ...valores, [clave]: e.target.value })}
                      placeholder="—"
                      style={{ ...campo, flex: "none", width: 80 }}
                    />
                    <span style={{ width: 34, fontSize: 14, color: N.sec }}>{unidad}</span>
                  </label>
                </div>
              );
            })}
          </div>
          <p style={pie}>Copia lo que declara el proveedor. Vacío = “no tengo el dato”; 0 = “declara cero”: no es lo mismo.</p>

          {/* Conversión */}
          <h3 style={{ ...titulo, marginTop: 22 }}>Conversión</h3>
          <div style={{ ...tarjeta, marginBottom: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 46, padding: "0 16px" }}>
              <span style={{ flex: 1, fontSize: 15, color: "#000" }}>
                Densidad{diagnostico.necesitaDensidad && <span style={{ color: N.rojo }}> *</span>}
              </span>
              <input inputMode="decimal" value={densidad} onChange={(e) => setDensidad(e.target.value)} placeholder="0,92" style={{ ...campo, flex: "none", width: 80 }} />
              <span style={{ width: 34, fontSize: 14, color: N.sec }}>g/ml</span>
            </label>
            {esConteo && (
              <>
                <div style={{ height: 0.5, background: N.sep, marginLeft: 16 }} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 46, padding: "0 16px" }}>
                  <span style={{ flex: 1, fontSize: 15, color: "#000" }}>Peso por {ingredient.unit.replace(/s$/, "")}<span style={{ color: N.rojo }}> *</span></span>
                  <input inputMode="decimal" value={pesoPorUnidad} onChange={(e) => setPesoPorUnidad(e.target.value)} placeholder="55" style={{ ...campo, flex: "none", width: 80 }} />
                  <span style={{ width: 34, fontSize: 14, color: N.sec }}>g</span>
                </label>
              </>
            )}
          </div>
          <p style={pie}>La densidad es obligatoria si se mide en volumen: no se asume que 1 ml = 1 g.</p>

          {/* Añadidos */}
          <h3 style={{ ...titulo, marginTop: 22 }}>Añadidos (sellos “ALTO EN”)</h3>
          <div style={{ ...tarjeta, marginBottom: 6 }}>
            <FilaSwitch label="Azúcares añadidos" checked={azucaresAnadidos} onChange={setAzucaresAnadidos} />
            <div style={{ height: 0.5, background: N.sep, marginLeft: 16 }} />
            <FilaSwitch label="Sodio añadido" checked={sodioAnadido} onChange={setSodioAnadido} />
            <div style={{ height: 0.5, background: N.sep, marginLeft: 16 }} />
            <FilaSwitch label="Grasas saturadas añadidas" checked={grasasAnadidas} onChange={setGrasasAnadidas} />
          </div>
          <p style={pie}>Los sellos solo cuentan lo añadido: el azúcar de un mix de queque sí; la lactosa natural de la leche, no.</p>

          {/* Alérgenos */}
          <h3 style={{ ...titulo, marginTop: 22 }}>
            Alérgenos{nContiene || nTrazas ? ` · ${nContiene} contiene · ${nTrazas} trazas` : ""}
          </h3>
          <div style={{ ...tarjeta, marginBottom: 6 }}>
            {catalogo.map((a, i) => {
              const c = contiene.includes(a.id);
              const t = trazas.includes(a.id);
              return (
                <div key={a.id}>
                  {i > 0 && <div style={{ height: 0.5, background: N.sep, marginLeft: 16 }} />}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 46, padding: "0 12px 0 16px" }}>
                    <span style={{ flex: 1, fontSize: 15, color: c ? "#000" : t ? "#3C3C43" : N.sec }}>{a.nombre}</span>
                    <Pastilla activo={c} color={N.rojo} onClick={() => alternar(contiene, setContiene, a.id)}>Contiene</Pastilla>
                    <Pastilla activo={t} color="#FF9500" onClick={() => alternar(trazas, setTrazas, a.id)}>Trazas</Pastilla>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={pie}>Solo lo que declara el proveedor. Nunca se infiere una traza que no esté declarada.</p>

          {/* Proveedor */}
          <h3 style={{ ...titulo, marginTop: 22 }}>Datos del proveedor</h3>
          <div style={{ ...tarjeta, marginBottom: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 46, padding: "0 16px" }}>
              <span style={{ fontSize: 15, color: "#000" }}>Marca</span>
              <input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Opcional" style={campo} />
            </label>
            <div style={{ height: 0.5, background: N.sep, marginLeft: 16 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 46, padding: "0 16px" }}>
              <span style={{ fontSize: 15, color: "#000" }}>Fuente</span>
              <input value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="Ficha técnica" style={campo} />
            </label>
            <div style={{ height: 0.5, background: N.sep, marginLeft: 16 }} />
            <textarea
              aria-label="Ingredientes declarados"
              value={ingredientesDeclarados}
              onChange={(e) => setIngredientesDeclarados(e.target.value)}
              rows={3}
              placeholder="Ingredientes declarados (si es compuesta): harina de trigo, azúcar, sal…"
              style={{ display: "block", width: "100%", border: "none", outline: "none", resize: "none", padding: "12px 16px", fontSize: 16, color: "#000", background: "transparent", fontFamily: "inherit" }}
            />
          </div>
          <p style={pie}>Los ingredientes declarados se transcriben tal cual y se usan para la lista de ingredientes de la etiqueta.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const N = {
  fondo: "#F2F2F7",
  sec: "#8E8E93",
  sep: "rgba(60, 60, 67, 0.18)",
  relleno: "rgba(118, 118, 128, 0.12)",
  azul: "#007AFF",
  rojo: "#FF3B30",
};
const tarjeta: React.CSSProperties = { background: "#fff", borderRadius: 12, overflow: "hidden" };
const titulo: React.CSSProperties = { fontSize: 13, color: N.sec, textTransform: "uppercase", letterSpacing: "0.02em", padding: "0 16px 6px", fontWeight: 400 };
const pie: React.CSSProperties = { fontSize: 13, color: N.sec, padding: "6px 16px 0", lineHeight: 1.35 };
const txtBtn: React.CSSProperties = { background: "none", border: "none", padding: "6px 0", fontSize: 17, color: N.azul, cursor: "pointer" };
const campo: React.CSSProperties = { flex: 1, minWidth: 0, height: 40, border: "none", outline: "none", background: "transparent", fontSize: 16, color: "#000", textAlign: "right", padding: 0 };

function FilaSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: "0 16px" }}>
      <span style={{ flex: 1, fontSize: 15, color: "#000" }}>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Pastilla({ activo, color, onClick, children }: { activo: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick}
      style={{ height: 28, padding: "0 10px", borderRadius: 14, border: "none", fontSize: 13, fontWeight: 600, background: activo ? color : N.relleno, color: activo ? "#fff" : "#3C3C43" }}>
      {children}
    </button>
  );
}

export function EstadoPunto({ estado }: { estado: "completa" | "parcial" | "sin_datos" }) {
  const color = estado === "completa" ? "#34C759" : estado === "parcial" ? "#FFCC00" : "#C7C7CC";
  return <span style={{ width: 10, height: 10, borderRadius: 5, background: color, display: "inline-block" }} />;
}
