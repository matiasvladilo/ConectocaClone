import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Package, Search, FlaskConical, ChevronRight, ChevronsUpDown, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { formatCLP } from "../utils/format";
import {
  ingredientsAPI,
  nutritionAPI,
  type AlergenoAPI,
  type AlergenosDeMateriaPrima,
  type FichaNutricionalAPI,
  type Ingredient as APIIngredient,
} from "../utils/api";
import { NutritionFichaDialog } from "./NutritionFichaDialog";
import { diagnosticarFicha, ETIQUETA_ESTADO } from "../utils/nutricion/estado";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

interface IngredientManagementProps {
  onBack: () => void;
  accessToken: string;
}

export function IngredientManagement({ onBack, accessToken }: IngredientManagementProps) {
  const [ingredients, setIngredients] = useState<APIIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Usamos strings para los campos numéricos durante la edición
  const [formData, setFormData] = useState<{
    name: string;
    unit: string;
    currentStock: string;
    minStock: string;
    maxStock: string;
    costPerUnit: string;
    supplier: string;
  }>({
    name: "",
    unit: "kg",
    currentStock: "",
    minStock: "",
    maxStock: "",
    costPerUnit: "",
    supplier: "",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("ALL");

  // Datos nutricionales. Van en su propio estado y se cargan aparte: si el
  // endpoint de nutrición falla, la pantalla de stock tiene que seguir andando.
  const [fichas, setFichas] = useState<Record<string, FichaNutricionalAPI>>({});
  const [alergenos, setAlergenos] = useState<Record<string, AlergenosDeMateriaPrima>>({});
  const [catalogoAlergenos, setCatalogoAlergenos] = useState<AlergenoAPI[]>([]);
  const [fichaAbierta, setFichaAbierta] = useState<APIIngredient | null>(null);

  useEffect(() => {
    loadIngredients();
    loadNutricion();
  }, []);

  const loadIngredients = async () => {
    try {
      setLoading(true);
      const data = await ingredientsAPI.getAll(accessToken);
      setIngredients(data);
    } catch (error: any) {
      console.error("Error loading ingredients:", error);
      toast.error(error.message || "Error al cargar materias primas");
    } finally {
      setLoading(false);
    }
  };

  // Sin toast de error a propósito: que no haya datos nutricionales todavía es el
  // estado normal al empezar, y un cartel rojo cada vez que se abre la pantalla de
  // stock sería ruido. El semáforo de cada tarjeta ya comunica que falta cargar.
  const loadNutricion = async () => {
    try {
      const [datos, catalogo] = await Promise.all([
        nutritionAPI.getIngredientNutrition(accessToken),
        nutritionAPI.getAllergens(accessToken),
      ]);
      const porId: Record<string, FichaNutricionalAPI> = {};
      for (const f of datos.fichas) porId[f.ingredientId] = f;
      setFichas(porId);
      setAlergenos(datos.alergenos || {});
      setCatalogoAlergenos(catalogo);
    } catch (error: any) {
      console.error("Error loading nutrition data:", error);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;

    try {
      if (!formData.name || !formData.unit || !formData.currentStock || !formData.minStock) {
        toast.error("Complete los campos obligatorios");
        return;
      }

      setIsSaving(true);
      // Helper to parse CLP currency string to number
      const parseCurrency = (value: string): number | undefined => {
        if (!value) return undefined;
        // Remove dots and replace comma with dot (if consistent with previous numeric logic, 
        // though CLP usually doesn't use decimals for prices, but let's be robust)
        // However, standard CLP is integer. Let's assume user inputs 1.200 as 1200.
        // User request: "1.200 or 1200 sea el mismo monto" -> 1200.
        const cleanValue = value.replace(/\./g, '').replace(',', '.');
        return parseFloat(cleanValue);
      };

      const numericFormData = {
        name: formData.name,
        unit: formData.unit,
        currentStock: parseFloat(formData.currentStock),
        minStock: parseFloat(formData.minStock),
        maxStock: formData.maxStock ? parseFloat(formData.maxStock) : undefined,
        costPerUnit: parseCurrency(formData.costPerUnit),
        supplier: formData.supplier,
      };

      if (editingId) {
        await ingredientsAPI.update(accessToken, editingId, numericFormData);
        toast.success("Materia prima actualizada");
      } else {
        await ingredientsAPI.create(accessToken, numericFormData);
        toast.success("Materia prima creada");
      }

      setEditingId(null);
      setShowNewForm(false);
      setFormData({
        name: "",
        unit: "kg",
        currentStock: "",
        minStock: "",
        maxStock: "",
        costPerUnit: "",
        supplier: "",
      });
      loadIngredients();
    } catch (error: any) {
      console.error("Error saving ingredient:", error);
      toast.error(error.message || "Error al guardar materia prima");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar esta materia prima?")) return;

    try {
      await ingredientsAPI.delete(accessToken, id);
      toast.success("Materia prima eliminada");
      handleCancel();
      loadIngredients();
    } catch (error: any) {
      console.error("Error deleting ingredient:", error);
      toast.error(error.message || "Error al eliminar materia prima");
    }
  };

  const formatCurrency = (value: number | string) => {
    if (!value) return "";
    // Format number to CLP with thousand separators (dots)
    // If it's a string, try to parse it first if it's raw number
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return value.toString();
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(num);
  };

  const handleEdit = (ingredient: APIIngredient) => {
    setFormData({
      name: ingredient.name,
      unit: ingredient.unit,
      currentStock: ingredient.currentStock.toString(),
      minStock: ingredient.minStock.toString(),
      maxStock: ingredient.maxStock ? ingredient.maxStock.toString() : "",
      // Maintain as string, but maybe unformatted for editing or formatted? 
      // User likely wants to see formatted value. Let's provide raw value first or allow both.
      // But for "text" input handling we might want to just show the raw number initially or handle formatting.
      // To strictly follow "1.200 or 1200", let's load it as normal string.
      costPerUnit: ingredient.costPerUnit ? ingredient.costPerUnit.toString() : "",
      supplier: ingredient.supplier || "",
    });
    setEditingId(ingredient.id);
    setShowNewForm(false);

  };

  const handleCancel = () => {
    setEditingId(null);
    setShowNewForm(false);
    setFormData({
      name: "",
      unit: "kg",
      currentStock: "",
      minStock: "",
      maxStock: "",
      costPerUnit: "",
      supplier: "",
    });
  };

  const getStockStatus = (ingredient: APIIngredient) => {
    const percentage = (ingredient.currentStock / ingredient.minStock) * 100;

    if (ingredient.currentStock === 0) {
      return { status: "sin-stock", label: "Sin Stock", color: "bg-red-600" };
    } else if (ingredient.currentStock < ingredient.minStock) {
      return { status: "bajo", label: "Stock Bajo", color: "bg-yellow-500" };
    } else if (ingredient.maxStock && ingredient.currentStock > ingredient.maxStock) {
      return { status: "exceso", label: "Exceso", color: "bg-purple-500" };
    } else {
      return { status: "normal", label: "Normal", color: "bg-green-500" };
    }
  };



  // Filter logic
  const uniqueSuppliers = Array.from(new Set(ingredients.map(i => i.supplier).filter(Boolean)));

  const filteredIngredients = ingredients.filter(ingredient => {
    const matchesSearch = ingredient.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSupplier = supplierFilter === "ALL" || ingredient.supplier === supplierFilter;
    return matchesSearch && matchesSupplier;
  });

  // Sobre el total, no sobre lo filtrado: es el avance de la carga de datos, y
  // buscar "harina" no debería cambiarlo.
  const resumenNutricional = ingredients.reduce(
    (acc, ing) => {
      acc[diagnosticarFicha(ing.unit, fichas[ing.id] || null).estado] += 1;
      return acc;
    },
    { completa: 0, parcial: 0, sin_datos: 0 },
  );

  // ── UI ───────────────────────────────────────────────────────────────────
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "sin-stock" | "bajo" | "normal" | "nutricion">("todos");

  const conteo = ingredients.reduce(
    (acc, i) => {
      const s = getStockStatus(i).status;
      if (s === "sin-stock") acc.sin += 1;
      else if (s === "bajo") acc.bajo += 1;
      else acc.normal += 1;
      return acc;
    },
    { sin: 0, bajo: 0, normal: 0 },
  );

  const visibles = filteredIngredients
    .filter((i) => {
      if (filtroEstado === "todos") return true;
      // Para cargar los datos nutricionales que faltan, de a uno.
      if (filtroEstado === "nutricion") return diagnosticarFicha(i.unit, fichas[i.id] || null).estado !== "completa";
      const s = getStockStatus(i).status;
      return filtroEstado === "normal" ? s === "normal" || s === "exceso" : s === filtroEstado;
    })
    .sort((a, b) => {
      // Lo urgente arriba: sin stock, bajo, resto; después alfabético.
      const peso: Record<string, number> = { "sin-stock": 0, bajo: 1, normal: 2, exceso: 2 };
      const d = peso[getStockStatus(a).status] - peso[getStockStatus(b).status];
      return d !== 0 ? d : a.name.localeCompare(b.name, "es");
    });

  const COLOR_ESTADO: Record<string, string> = { "sin-stock": "#FF3B30", bajo: "#FF9500", normal: "#34C759", exceso: "#AF52DE" };
  const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
  const hojaAbierta = showNewForm || !!editingId;
  const editado = editingId ? ingredients.find((i) => i.id === editingId) : undefined;

  const abrirNueva = () => {
    handleCancel();
    setShowNewForm(true);
  };

  const eliminarEditado = () => {
    if (editingId) void handleDelete(editingId);
  };

  return (
    <div className="min-h-screen" style={{ background: M.fondo }}>
      {/* Encabezado */}
      <div style={{ background: "linear-gradient(135deg, #0047BA 0%, #0078FF 100%)", paddingTop: "max(env(safe-area-inset-top), 16px)", position: "sticky", top: 0, zIndex: 20 }}>
        <div className="max-w-3xl mx-auto" style={{ padding: "8px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" style={botonRedondoM}>
              <ArrowLeft style={{ width: 20, height: 20, color: "#fff" }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: "#fff", fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Materia prima</h1>
              <p className="truncate" style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                {loading ? "Cargando…" : `${ingredients.length} insumos`}
              </p>
            </div>
            <button type="button" onClick={abrirNueva} aria-label="Nueva materia prima" style={{ ...botonRedondoM, background: "#fff" }}>
              <Plus style={{ width: 20, height: 20, color: "#0047BA" }} />
            </button>
          </div>
          <div style={{ position: "relative", marginTop: 12 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "rgba(255,255,255,0.75)" }} />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar materia prima"
              className="buscador-sobre-azul"
              style={{ width: "100%", height: 36, borderRadius: 10, border: "none", outline: "none", background: "rgba(255,255,255,0.18)", color: "#fff", fontSize: 16, padding: "0 12px 0 34px" }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto" style={{ padding: "12px 16px max(env(safe-area-inset-bottom), 32px)" }}>
        {/* Estado de stock */}
        <div className="sin-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px 12px", padding: "0 16px" }}>
          {([
            ["todos", "Todos", ingredients.length, M.azul],
            ["sin-stock", "Sin stock", conteo.sin, "#FF3B30"],
            ["bajo", "Bajo el mínimo", conteo.bajo, "#FF9500"],
            ["normal", "OK", conteo.normal, "#34C759"],
            ["nutricion", "Sin datos nutricionales", resumenNutricional.parcial + resumenNutricional.sin_datos, "#5856D6"],
          ] as const).map(([k, t, n, c]) => {
            const activo = filtroEstado === k;
            return (
              <button key={k} type="button" aria-pressed={activo} onClick={() => setFiltroEstado(k)}
                style={{ flexShrink: 0, height: 32, padding: "0 12px", borderRadius: 16, border: "none", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: activo ? 600 : 500, background: activo ? c : "#fff", color: activo ? "#fff" : "#000", boxShadow: activo ? "none" : "0 0 0 0.5px rgba(0,0,0,0.08)" }}>
                {!activo && k !== "todos" && <span style={{ width: 8, height: 8, borderRadius: 4, background: c }} />}
                {t}
                <span style={{ fontSize: 12, fontWeight: 600, opacity: activo ? 0.9 : 0.5 }}>{loading ? "—" : n}</span>
              </button>
            );
          })}
        </div>

        {/* Proveedor + avance nutricional */}
        <div style={{ ...tarjetaM, marginBottom: 20 }}>
          <label className="fila-ios" style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, minHeight: 46, padding: "0 16px", cursor: "pointer" }}>
            <span style={{ fontSize: 16, color: "#000" }}>Proveedor</span>
            <span className="truncate" style={{ flex: 1, textAlign: "right", fontSize: 15, color: M.secundario }}>{supplierFilter === "ALL" ? "Todos" : supplierFilter}</span>
            <ChevronsUpDown style={{ width: 15, height: 15, color: M.secundario, flexShrink: 0 }} />
            <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} aria-label="Proveedor" style={{ position: "absolute", inset: 0, opacity: 0, fontSize: 16 }}>
              <option value="ALL">Todos</option>
              {uniqueSuppliers.map((s) => <option key={s} value={s as string}>{s}</option>)}
            </select>
          </label>
          {ingredients.length > 0 && (
            <>
              <div style={{ height: 0.5, background: M.separador, marginLeft: 16 }} />
              {/* Cuánto falta para poder generar etiquetas nutricionales. Al
                  tocarlo filtra la lista por lo que falta cargar. */}
              <button type="button" className="fila-ios" onClick={() => setFiltroEstado(filtroEstado === "nutricion" ? "todos" : "nutricion")}
                style={{ display: "block", width: "100%", textAlign: "left", border: "none", padding: "10px 16px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FlaskConical style={{ width: 16, height: 16, color: M.azul }} />
                  <span style={{ flex: 1, fontSize: 15, color: "#000" }}>Datos nutricionales</span>
                  <span style={{ fontSize: 14, color: M.secundario }}>{resumenNutricional.completa} de {ingredients.length}</span>
                </div>
                <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2, marginTop: 8, background: M.relleno }}>
                  <span style={{ flex: resumenNutricional.completa, background: "#34C759" }} />
                  <span style={{ flex: resumenNutricional.parcial, background: "#FFCC00" }} />
                  <span style={{ flex: resumenNutricional.sin_datos }} />
                </div>
                <p style={{ fontSize: 12, color: M.secundario, marginTop: 6 }}>
                  {resumenNutricional.completa} completas · {resumenNutricional.parcial} parciales · {resumenNutricional.sin_datos} sin datos
                  {resumenNutricional.parcial + resumenNutricional.sin_datos > 0 && filtroEstado !== "nutricion" ? " · Ver las que faltan ›" : ""}
                </p>
              </button>
            </>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: M.secundario }} />
          </div>
        ) : ingredients.length === 0 ? (
          <div style={{ ...tarjetaM, padding: "36px 16px", textAlign: "center" }}>
            <Package style={{ width: 36, height: 36, color: "#C7C7CC", margin: "0 auto 10px" }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>No hay materias primas</p>
            <button type="button" onClick={abrirNueva} style={{ marginTop: 12, height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: M.azul, color: "#fff", fontSize: 15, fontWeight: 600 }}>Agregar la primera</button>
          </div>
        ) : (
          <>
            {filtroEstado === "nutricion" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 6px" }}>
                <span style={{ ...tituloM, padding: 0, flex: 1 }}>{visibles.length} sin datos nutricionales completos</span>
                <button type="button" onClick={() => setFiltroEstado("todos")} style={{ background: "none", border: "none", padding: 0, color: M.azul, fontSize: 14 }}>Quitar filtro</button>
              </div>
            ) : (
              <h3 style={tituloM}>{visibles.length} materias primas · lo urgente primero</h3>
            )}
            <div style={tarjetaM}>
              {visibles.length === 0 ? (
                <p style={{ padding: "24px 16px", textAlign: "center", fontSize: 15, color: M.secundario }}>Ninguna coincide con el filtro</p>
              ) : visibles.map((ing, i) => {
                const s = getStockStatus(ing).status;
                return (
                  <div key={ing.id}>
                    {i > 0 && <div style={{ height: 0.5, background: M.separador, marginLeft: 34 }} />}
                    <button type="button" onClick={() => (filtroEstado === "nutricion" ? setFichaAbierta(ing) : handleEdit(ing))} className="fila-ios"
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 58, padding: "8px 12px 8px 16px", textAlign: "left", border: "none" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: COLOR_ESTADO[s], flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="truncate" style={{ display: "block", fontSize: 16, color: "#000" }}>{ing.name}</span>
                        <span className="truncate" style={{ display: "block", fontSize: 12, color: M.secundario }}>
                          {filtroEstado === "nutricion"
                            ? ETIQUETA_ESTADO[diagnosticarFicha(ing.unit, fichas[ing.id] || null).estado]
                            : `${ing.costPerUnit ? `${formatCLP(ing.costPerUnit)}/${ing.unit}` : "Sin costo"}${ing.supplier ? ` · ${ing.supplier}` : ""}`}
                        </span>
                      </span>
                      <span style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: s === "sin-stock" ? "#FF3B30" : "#000", fontVariantNumeric: "tabular-nums" }}>{fmt(ing.currentStock)} {ing.unit}</span>
                        <span style={{ display: "block", fontSize: 12, color: M.secundario }}>mín. {fmt(ing.minStock)}</span>
                      </span>
                      <ChevronRight style={{ width: 18, height: 18, color: "#C7C7CC", flexShrink: 0 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Hoja: nueva / editar */}
      {createPortal(
        <AnimatePresence>
          {hojaAbierta && (
            <HojaM key="hoja" onClose={handleCancel}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px 10px" }}>
                <button type="button" onClick={handleCancel} disabled={isSaving} style={{ ...textoBotonM, flex: 1, textAlign: "left" }}>Cancelar</button>
                <span className="truncate" style={{ flex: 2, textAlign: "center", fontSize: 17, fontWeight: 600, color: "#000" }}>{editingId ? "Editar" : "Nueva materia prima"}</span>
                <button type="button" onClick={() => void handleSave()} disabled={isSaving} style={{ ...textoBotonM, flex: 1, textAlign: "right", fontWeight: 600 }}>{isSaving ? "Guardando" : "Guardar"}</button>
              </div>
              <div style={{ overflowY: "auto", padding: "4px 16px max(env(safe-area-inset-bottom), 24px)" }}>
                <div style={{ ...tarjetaM, marginBottom: 22 }}>
                  <FilaM>
                    <input aria-label="Nombre" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nombre (ej. Harina de trigo)" style={{ ...campoM, textAlign: "left" }} />
                  </FilaM>
                  <Sep />
                  <label className="fila-ios" style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 16px", cursor: "pointer" }}>
                    <span style={{ fontSize: 16, color: "#000" }}>Unidad</span>
                    <span style={{ flex: 1, textAlign: "right", fontSize: 16, color: M.secundario }}>{UNIDADES.find(([v]) => v === formData.unit)?.[1] ?? formData.unit}</span>
                    <ChevronsUpDown style={{ width: 15, height: 15, color: M.secundario }} />
                    <select value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} aria-label="Unidad" style={{ position: "absolute", inset: 0, opacity: 0, fontSize: 16 }}>
                      {UNIDADES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      {!UNIDADES.some(([v]) => v === formData.unit) && <option value={formData.unit}>{formData.unit}</option>}
                    </select>
                  </label>
                </div>

                <h3 style={tituloM}>Stock ({formData.unit})</h3>
                <div style={{ ...tarjetaM, marginBottom: 6 }}>
                  <FilaM etiqueta="Actual">
                    <input inputMode="decimal" value={formData.currentStock} onChange={(e) => setFormData({ ...formData, currentStock: e.target.value.replace(",", ".") })} placeholder="0" style={campoM} />
                  </FilaM>
                  <Sep />
                  <FilaM etiqueta="Mínimo">
                    <input inputMode="decimal" value={formData.minStock} onChange={(e) => setFormData({ ...formData, minStock: e.target.value.replace(",", ".") })} placeholder="0" style={campoM} />
                  </FilaM>
                  <Sep />
                  <FilaM etiqueta="Máximo">
                    <input inputMode="decimal" value={formData.maxStock} onChange={(e) => setFormData({ ...formData, maxStock: e.target.value.replace(",", ".") })} placeholder="Opcional" style={campoM} />
                  </FilaM>
                </div>
                <p style={{ ...pieM, marginBottom: 22 }}>Bajo el mínimo se marca para reponer.</p>

                <h3 style={tituloM}>Compra</h3>
                <div style={{ ...tarjetaM, marginBottom: 22 }}>
                  <FilaM etiqueta={`Costo por ${formData.unit}`}>
                    <span style={{ fontSize: 16, color: formData.costPerUnit ? "#000" : "#C7C7CC", marginLeft: "auto" }}>$</span>
                    <input
                      inputMode="numeric"
                      value={formData.costPerUnit}
                      onChange={(e) => { if (/^[\d.,]*$/.test(e.target.value)) setFormData({ ...formData, costPerUnit: e.target.value }); }}
                      onBlur={(e) => {
                        // 1200 → 1.200 (se guarda igual: parseCurrency quita los puntos).
                        const n = parseFloat(e.target.value.replace(/\./g, "").replace(",", "."));
                        if (!isNaN(n)) setFormData((f) => ({ ...f, costPerUnit: new Intl.NumberFormat("es-CL").format(n) }));
                      }}
                      placeholder="0"
                      style={{ ...campoM, flex: "none", width: `${Math.max(1, formData.costPerUnit.length) + 1}ch` }}
                    />
                  </FilaM>
                  <Sep />
                  <FilaM etiqueta="Proveedor">
                    <input value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value })} placeholder="Opcional" style={campoM} />
                  </FilaM>
                </div>

                {editado && (
                  <>
                    <div style={{ ...tarjetaM, marginBottom: 22 }}>
                      <button type="button" onClick={() => setFichaAbierta(editado)} className="fila-ios"
                        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 50, padding: "0 16px", textAlign: "left", border: "none" }}>
                        <FlaskConical style={{ width: 19, height: 19, color: M.azul }} />
                        <span style={{ flex: 1 }}>
                          <span style={{ display: "block", fontSize: 16, color: "#000" }}>Información nutricional</span>
                          <span style={{ display: "block", fontSize: 12, color: M.secundario }}>{ETIQUETA_ESTADO[diagnosticarFicha(editado.unit, fichas[editado.id] || null).estado]}</span>
                        </span>
                        <ChevronRight style={{ width: 18, height: 18, color: "#C7C7CC" }} />
                      </button>
                    </div>
                    <div style={tarjetaM}>
                      <button type="button" onClick={eliminarEditado} className="fila-ios" style={{ width: "100%", minHeight: 48, border: "none", color: "#FF3B30", fontSize: 16 }}>
                        Eliminar materia prima
                      </button>
                    </div>
                  </>
                )}
              </div>
            </HojaM>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {fichaAbierta && (
        <NutritionFichaDialog
          open={!!fichaAbierta}
          onClose={() => setFichaAbierta(null)}
          ingredient={fichaAbierta}
          ficha={fichas[fichaAbierta.id] || null}
          contieneIniciales={alergenos[fichaAbierta.id]?.contiene || []}
          trazasIniciales={alergenos[fichaAbierta.id]?.trazas || []}
          catalogo={catalogoAlergenos}
          onSaved={loadNutricion}
          accessToken={accessToken}
        />
      )}
    </div>
  );
}

const M = {
  fondo: "#F2F2F7",
  secundario: "#8E8E93",
  separador: "rgba(60, 60, 67, 0.18)",
  relleno: "rgba(118, 118, 128, 0.12)",
  azul: "#007AFF",
};

const UNIDADES: [string, string][] = [
  ["kg", "Kilos"], ["g", "Gramos"], ["l", "Litros"], ["ml", "Mililitros"],
  ["unidades", "Unidades"], ["bolsas", "Bolsas"], ["cajas", "Cajas"],
];

const tarjetaM: React.CSSProperties = { background: "#fff", borderRadius: 12, overflow: "hidden" };
const tituloM: React.CSSProperties = { fontSize: 13, color: M.secundario, textTransform: "uppercase", letterSpacing: "0.02em", padding: "0 16px 6px", fontWeight: 400 };
const pieM: React.CSSProperties = { fontSize: 13, color: M.secundario, padding: "6px 16px 0", lineHeight: 1.35 };
const textoBotonM: React.CSSProperties = { background: "none", border: "none", padding: "6px 0", fontSize: 17, color: M.azul, cursor: "pointer" };
const campoM: React.CSSProperties = { flex: 1, minWidth: 0, height: 44, border: "none", outline: "none", background: "transparent", fontSize: 16, color: "#000", textAlign: "right", padding: 0 };
const botonRedondoM: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(255,255,255,0.18)", border: "none", cursor: "pointer",
};

function Sep() {
  return <div style={{ height: 0.5, background: M.separador, marginLeft: 16 }} />;
}

function FilaM({ etiqueta, children }: { etiqueta?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44, padding: "0 16px" }}>
      {etiqueta && <span style={{ fontSize: 16, color: "#000", flexShrink: 0 }}>{etiqueta}</span>}
      {children}
    </label>
  );
}

function HojaM({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onClose]);
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 45 }} />
      <motion.div role="dialog" aria-modal="true" aria-label="Materia prima"
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 46, margin: "0 auto", maxWidth: 560, background: M.fondo, borderRadius: "14px 14px 0 0", maxHeight: "92dvh", display: "flex", flexDirection: "column" }}>
        {children}
      </motion.div>
    </>
  );
}
