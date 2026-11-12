import { useState, useEffect } from "react";
import { ArrowLeft, Plus, ChefHat, FlaskConical, FileText, Search, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { formatCLP } from "../utils/format";
import {
  productsAPI,
  ingredientsAPI,
  productIngredientsAPI,
  nutritionAPI,
  type Product,
  type Ingredient as APIIngredient,
  type ProductIngredient as APIProductIngredient,
  type NutritionDataset,
  type LabelVersion,
} from "../utils/api";
import { NutritionPreview } from "./NutritionPreview";
import { LabelGenerator } from "./LabelGenerator";
import { armarEtiqueta } from "../utils/nutricion/armado";
import type { ResultadoEtiqueta } from "../utils/nutricion/armado";
import { construirSnapshot, mismaEtiqueta, restaurarDeSnapshot } from "../utils/nutricion/snapshot";
import type { SnapshotEtiqueta } from "../utils/nutricion/snapshot";
import { VERSION_REGLAS } from "../utils/nutricion/reglasChile";
import { toast } from 'sonner';
import { motion, AnimatePresence } from "motion/react";

interface ProductIngredientConfigProps {
  onBack: () => void;
  accessToken: string;
  // Cuando se entra desde "Configurar receta" de un producto puntual. Sin esto,
  // el componente preselecciona el primer producto alfabético y el usuario
  // termina editando la receta equivocada.
  initialProduct?: Product;
}

export function ProductIngredientConfig({ onBack, accessToken, initialProduct }: ProductIngredientConfigProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<APIIngredient[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productIngredients, setProductIngredients] = useState<APIProductIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingIngredients, setLoadingIngredients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  // La cantidad se guarda como TEXTO, no como número. Un estado numérico no puede
  // representar "campo vacío": obliga a dibujar un 0 que el usuario no puede borrar,
  // y al escribir al lado queda "05" —o peor, "50"— guardando un valor equivocado.
  // Es el mismo patrón que ya usan precio y stock en Gestión de Productos.
  const [newIngredient, setNewIngredient] = useState({
    ingredientId: "",
    quantity: "",
  });
  const [inputUnit, setInputUnit] = useState<string>("");
  const [laborCost, setLaborCost] = useState<string>("");
  const [savingLabor, setSavingLabor] = useState(false);

  // ── Información nutricional ──────────────────────────────────────────────
  // Los pesos se manejan como texto por el mismo motivo que la cantidad de
  // receta: un estado numérico no puede representar "campo vacío".
  const [dataset, setDataset] = useState<NutritionDataset | null>(null);
  const [pesoFinal, setPesoFinal] = useState("");
  const [pesoPorcion, setPesoPorcion] = useState("");
  const [porciones, setPorciones] = useState("");
  const [porcionDesc, setPorcionDesc] = useState("");
  const [guardandoPesos, setGuardandoPesos] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEtiqueta | null>(null);
  const [generadorAbierto, setGeneradorAbierto] = useState(false);
  const [versiones, setVersiones] = useState<LabelVersion[]>([]);
  // Cuando se está mirando una etiqueta ya emitida en vez de una recién calculada.
  const [versionAbierta, setVersionAbierta] = useState<LabelVersion | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    let isActive = true;

    if (selectedProduct) {
      setLaborCost(selectedProduct.laborCost ? String(selectedProduct.laborCost) : "");
      console.log("Loading ingredients for product:", selectedProduct.name);
      setLoadingIngredients(true);
      setProductIngredients([]); // Clear previous ingredients immediately

      // El resultado anterior se descarta al cambiar de producto: dejarlo en
      // pantalla mostraría la tabla nutricional de OTRO producto bajo este nombre.
      setResultado(null);
      setDataset(null);
      setVersiones([]);

      const load = async () => {
        try {
          const data = await productIngredientsAPI.getByProduct(accessToken, selectedProduct.id);
          if (isActive) {
            setProductIngredients(data);
          }
        } catch (error: any) {
          if (isActive) {
            console.error("Error loading product ingredients:", error);
            toast.error(error.message || "Error al cargar ingredientes del producto");
          }
        } finally {
          if (isActive) {
            setLoadingIngredients(false);
          }
        }
      };

      load();
      loadDataset(selectedProduct.id, () => isActive);
      loadVersiones(selectedProduct.id, () => isActive);
    } else {
      setProductIngredients([]);
      setResultado(null);
      setDataset(null);
      setVersiones([]);
    }

    return () => {
      isActive = false;
    };
  }, [selectedProduct]);


  const loadInitialData = async () => {
    try {
      console.log("Loading initial data...");
      setLoading(true);
      const [productsData, ingredientsData] = await Promise.all([
        productsAPI.getAll(accessToken),
        ingredientsAPI.getAll(accessToken),
      ]);
      console.log("Products loaded:", productsData.length);
      console.log("Ingredients loaded:", ingredientsData.length);
      setProducts(productsData);
      setIngredients(ingredientsData);

      if (initialProduct) {
        // Se busca en la lista recién cargada y no se usa `initialProduct` tal cual:
        // el objeto que llega por prop puede ser una copia vieja.
        const enLista = productsData.find(p => p.id === initialProduct.id);
        if (enLista) {
          setSelectedProduct(enLista);
        } else {
          // Sin fallback al primero de la lista: caer en la receta de otro producto
          // es exactamente el bug que se está arreglando.
          toast.error("Ese producto ya no está disponible");
        }
      }
      // Sin producto inicial se muestra la lista para elegir (antes se abría
      // el primero alfabético y en el teléfono la lista quedaba encima).
    } catch (error: any) {
      console.error("Error loading initial data:", error);
      toast.error(error.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  // Sin toast de error: que todavía no haya datos nutricionales es lo normal al
  // empezar, y esta pantalla existe para configurar la receta. El bloque de
  // nutrición ya comunica qué falta.
  const loadDataset = async (productId: string, sigueVigente: () => boolean) => {
    try {
      const d = await nutritionAPI.getProductDataset(accessToken, productId);
      if (!sigueVigente()) return;
      setDataset(d);
      const p = d.labelProfile;
      setPesoFinal(p?.pesoFinalPromedioG != null ? String(p.pesoFinalPromedioG) : "");
      setPesoPorcion(p?.pesoPorcionG != null ? String(p.pesoPorcionG) : "");
      setPorciones(p?.porcionesPorEnvase != null ? String(p.porcionesPorEnvase) : "");
      setPorcionDesc(p?.porcionDescripcion || "");
    } catch (error: any) {
      console.error("Error loading nutrition dataset:", error);
    }
  };

  // El historial se carga siempre, no solo despues de calcular: la idea es
  // justamente poder ver una etiqueta ya emitida SIN volver a calcularla.
  const loadVersiones = async (productId: string, sigueVigente: () => boolean) => {
    try {
      const v = await nutritionAPI.getLabelVersions(accessToken, productId);
      if (sigueVigente()) setVersiones(v);
    } catch (error: any) {
      console.error("Error loading label versions:", error);
    }
  };

  const aNumero = (s: string): number | null => {
    const limpio = s.trim().replace(",", ".");
    if (limpio === "") return null;
    const n = parseFloat(limpio);
    return Number.isFinite(n) ? n : null;
  };

  const perfilEnVivo = () => ({
    pesoFinalPromedioG: aNumero(pesoFinal),
    pesoPorcionG: aNumero(pesoPorcion),
    porcionesPorEnvase: aNumero(porciones),
    porcionDescripcion: porcionDesc,
    denominacionLegal: dataset?.labelProfile?.denominacionLegal || "",
    ingredientesTextoOverride: dataset?.labelProfile?.ingredientesTextoOverride || "",
    alergenosTextoOverride: dataset?.labelProfile?.alergenosTextoOverride || "",
    trazasTextoOverride: dataset?.labelProfile?.trazasTextoOverride || "",
  });

  const handleGuardarPesos = async () => {
    if (!selectedProduct || guardandoPesos) return;
    try {
      setGuardandoPesos(true);
      await nutritionAPI.saveLabelProfile(accessToken, selectedProduct.id, perfilEnVivo());
      toast.success("Datos de etiqueta guardados");
      await loadDataset(selectedProduct.id, () => true);
    } catch (error: any) {
      console.error("Error saving label profile:", error);
      toast.error(error.message || "Error al guardar los datos de etiqueta");
    } finally {
      setGuardandoPesos(false);
    }
  };

  const elaboradorDe = (d: NutritionDataset | null) => ({
    razonSocial: d?.labelSettings?.razonSocial,
    rut: d?.labelSettings?.rut,
    direccion: d?.labelSettings?.direccion,
    plantaElaboradora: d?.labelSettings?.plantaElaboradora,
  });

  /**
   * Registra la etiqueta al descargarla. Devuelve el numero de version asignado,
   * o null si no habia nada nuevo que guardar.
   *
   * Si el contenido es identico a la ultima version, NO crea una nueva: sin eso
   * el historial se llena de copias y deja de servir para lo unico que importa,
   * que es saber que cambio y cuando.
   */
  const registrarVersion = async (anchoMm: number, altoMm: number): Promise<number | null> => {
    if (!selectedProduct || !resultado || !dataset) return null;

    const nuevo = construirSnapshot({
      resultado,
      elaborador: elaboradorDe(dataset),
      lineas: dataset.lineas.map((l) => ({
        ingredienteId: l.ingredienteId,
        nombre: l.nombre,
        cantidad: l.cantidad,
        unidad: l.unidad,
        ficha: l.ficha,
      })),
      anchoMm,
      altoMm,
      regulationVersion: VERSION_REGLAS,
    });

    const ultima = versiones[0];
    if (ultima && mismaEtiqueta(nuevo, ultima.snapshot as unknown as SnapshotEtiqueta)) {
      return null;
    }

    const creada = await nutritionAPI.createLabelVersion(accessToken, selectedProduct.id, {
      estado: resultado.veredicto.estado,
      snapshot: nuevo as unknown as Record<string, unknown>,
      regulationVersion: VERSION_REGLAS,
      calculatedAt: new Date().toISOString(),
      anchoMm,
      altoMm,
    });

    setVersiones((prev) => [creada, ...prev]);
    return creada.version;
  };

  // Una version historica se dibuja desde su snapshot, no desde la receta actual.
  const restaurada = versionAbierta ? restaurarDeSnapshot(versionAbierta.snapshot) : null;

  const handleCalcular = () => {
    if (!dataset) return;
    setResultado(
      armarEtiqueta({
        productName: dataset.product.name,
        lineas: dataset.lineas,
        perfil: perfilEnVivo(),
        elaborador: dataset.labelSettings?.razonSocial || null,
      }),
    );
  };

  const loadProductIngredients = async (productId: string) => {
    try {
      const data = await productIngredientsAPI.getByProduct(accessToken, productId);
      setProductIngredients(data);
    } catch (error: any) {
      console.error("Error loading product ingredients:", error);
      toast.error(error.message || "Error al cargar ingredientes del producto");
    }
  };

  const handleAddIngredient = async () => {
    if (saving) return;
    const cantidad = parseFloat(newIngredient.quantity);
    if (!selectedProduct || !newIngredient.ingredientId || !Number.isFinite(cantidad) || cantidad <= 0) {
      toast.error("Complete todos los campos");
      return;
    }

    try {
      setSaving(true);
      let quantityToSave = cantidad;
      if (inputUnit === 'g' || inputUnit === 'ml') {
        quantityToSave = quantityToSave / 1000;
      }

      await productIngredientsAPI.addIngredient(
        accessToken,
        selectedProduct.id,
        newIngredient.ingredientId,
        quantityToSave
      );

      toast.success("Ingrediente agregado al producto");
      setShowAddForm(false);
      setNewIngredient({ ingredientId: "", quantity: "" });
      setInputUnit("");
      loadProductIngredients(selectedProduct.id);
    } catch (error: any) {
      console.error("Error adding ingredient:", error);
      toast.error(error.message || "Error al agregar ingrediente");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateQuantity = async (ingredientId: string, value: number, unit: string) => {
    if (!selectedProduct) return;

    // Convert to base unit (kg/l) if needed
    let quantityToSave = value;
    if (unit === 'g' || unit === 'ml') {
      quantityToSave = value / 1000;
    }

    if (quantityToSave <= 0) {
      toast.error("La cantidad debe ser mayor a 0");
      return;
    }

    try {
      // Get all current ingredients
      const updatedIngredients = productIngredients.map(pi => ({
        ingredientId: pi.ingredientId,
        quantity: pi.ingredientId === ingredientId ? quantityToSave : pi.quantity
      }));

      // Use setIngredients to update all at once
      await productIngredientsAPI.setIngredients(
        accessToken,
        selectedProduct.id,
        updatedIngredients
      );

      toast.success("Cantidad actualizada");
      loadProductIngredients(selectedProduct.id);
    } catch (error: any) {
      console.error("Error updating quantity:", error);
      toast.error(error.message || "Error al actualizar cantidad");
    }
  };

  const formatQuantity = (qty: number, unit: string) => {
    const lowerUnit = unit.toLowerCase();
    if (lowerUnit === 'kg' || lowerUnit === 'kilos') {
      if (qty < 1) return { value: (qty * 1000).toFixed(0), unit: 'g' };
      return { value: qty.toString(), unit: 'kg' };
    }
    if (lowerUnit === 'l' || lowerUnit === 'litros') {
      if (qty < 1) return { value: (qty * 1000).toFixed(0), unit: 'ml' };
      return { value: qty.toString(), unit: 'l' };
    }
    return { value: qty.toString(), unit };
  };

  const handleRemoveIngredient = async (ingredientId: string) => {
    if (!selectedProduct) return;
    if (!confirm("¿Está seguro de eliminar este ingrediente del producto?")) return;

    try {
      await productIngredientsAPI.removeIngredient(accessToken, selectedProduct.id, ingredientId);
      toast.success("Ingrediente eliminado del producto");
      loadProductIngredients(selectedProduct.id);
    } catch (error: any) {
      console.error("Error removing ingredient:", error);
      toast.error(error.message || "Error al eliminar ingrediente");
    }
  };

  const getIngredientDetails = (ingredientId: string) => {
    return ingredients.find(i => i.id === ingredientId);
  };

  const handleSaveLaborCost = async () => {
    if (!selectedProduct || savingLabor) return;
    try {
      setSavingLabor(true);
      const value = parseInt(laborCost.replace(/[^0-9]/g, "")) || 0;
      await productsAPI.update(accessToken, selectedProduct.id, { laborCost: value });
      setSelectedProduct({ ...selectedProduct, laborCost: value });
      setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, laborCost: value } : p));
      toast.success("Costo de mano de obra guardado");
    } catch (error: any) {
      console.error("Error saving labor cost:", error);
      toast.error(error.message || "Error al guardar costo de mano de obra");
    } finally {
      setSavingLabor(false);
    }
  };

  const handleClearRecipe = async () => {
    if (!selectedProduct) return;
    if (!confirm(`¿Seguro que querés limpiar TODA la receta de "${selectedProduct.name}"? Se eliminarán todos los ingredientes. El costo de mano de obra se conserva. Esta acción no se puede deshacer.`)) return;
    try {
      await productIngredientsAPI.setIngredients(accessToken, selectedProduct.id, []);
      toast.success("Receta limpiada");
      loadProductIngredients(selectedProduct.id);
    } catch (error: any) {
      console.error("Error clearing recipe:", error);
      toast.error(error.message || "Error al limpiar la receta");
    }
  };

  const calculateTotalCost = () => {
    const ingredientsCost = productIngredients.reduce((total, pi) => {
      const ingredient = getIngredientDetails(pi.ingredientId);
      if (ingredient?.costPerUnit) {
        return total + (pi.quantity * ingredient.costPerUnit);
      }
      return total;
    }, 0);
    const labor = parseInt(laborCost.replace(/[^0-9]/g, "")) || 0;
    return ingredientsCost + labor;
  };

  const availableIngredients = ingredients.filter(
    (ing) => !productIngredients.some((pi) => pi.ingredientId === ing.id)
  );

  // ── Estado de la UI nueva ────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState("");
  const [filtroReceta, setFiltroReceta] = useState<"todos" | "con" | "sin">("todos");
  const [busquedaIng, setBusquedaIng] = useState("");
  const [editando, setEditando] = useState<APIProductIngredient | null>(null);
  const [editValor, setEditValor] = useState("");
  const [editUnidad, setEditUnidad] = useState("");
  const [nutricionAbierta, setNutricionAbierta] = useState(false);

  // El conteo de la lista sigue a la receta editada (sin recargar el catálogo).
  useEffect(() => {
    if (!selectedProduct || loadingIngredients) return;
    setProducts((prev) => prev.map((p) => (p.id === selectedProduct.id ? { ...p, ingredients: productIngredients } : p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIngredients]);

  const volver = () => {
    // Desde "Configurar receta" de un producto se vuelve a donde se vino; desde
    // el menú, a la lista de productos.
    if (initialProduct || !selectedProduct) onBack();
    else setSelectedProduct(null);
  };

  const unidadesDe = (unit: string): string[] => {
    const u = unit.toLowerCase();
    if (u === "kg" || u === "kilos") return ["kg", "g"];
    if (u === "l" || u === "litros") return ["l", "ml"];
    return [unit];
  };

  const abrirEdicion = (pi: APIProductIngredient) => {
    const ing = getIngredientDetails(pi.ingredientId);
    if (!ing) return;
    const f = formatQuantity(pi.quantity, ing.unit);
    setEditando(pi);
    setEditValor(f.value);
    setEditUnidad(f.unit);
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    const v = parseFloat(editValor.replace(",", "."));
    if (!(v > 0)) {
      toast.error("La cantidad debe ser mayor a 0");
      return;
    }
    await handleUpdateQuantity(editando.ingredientId, v, editUnidad);
    setEditando(null);
  };

  const cerrarAgregar = () => {
    setShowAddForm(false);
    setNewIngredient({ ingredientId: "", quantity: "" });
    setInputUnit("");
    setBusquedaIng("");
  };

  const elegirIngrediente = (ing: APIIngredient) => {
    setNewIngredient({ ingredientId: ing.id, quantity: "" });
    const u = ing.unit.toLowerCase();
    // En una receta por unidad casi todo se mide en gramos/ml: se arranca ahí.
    setInputUnit(u === "kilos" || u === "kg" ? "g" : u === "litros" || u === "l" ? "ml" : ing.unit);
  };

  const fmtNum = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 3 });

  const productosFiltrados = products
    .filter((p) => {
      const n = p.ingredients?.length ?? 0;
      if (filtroReceta === "con" && n === 0) return false;
      if (filtroReceta === "sin" && n > 0) return false;
      const q = busqueda.trim().toLowerCase();
      return !q || p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const conReceta = products.filter((p) => (p.ingredients?.length ?? 0) > 0).length;

  const costoTotal = calculateTotalCost();
  const precio = selectedProduct?.price ?? 0;
  const margen = precio - costoTotal;
  const margenPct = precio > 0 ? (margen / precio) * 100 : 0;

  const ingredienteElegido = newIngredient.ingredientId ? getIngredientDetails(newIngredient.ingredientId) : undefined;
  const ingredientesParaAgregar = availableIngredients
    .filter((i) => !busquedaIng.trim() || i.name.toLowerCase().includes(busquedaIng.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const encabezado = (titulo: string, subtitulo: string, derecha?: React.ReactNode, abajo?: React.ReactNode) => (
    <div style={{ background: "linear-gradient(135deg, #0047BA 0%, #0078FF 100%)", paddingTop: "max(env(safe-area-inset-top), 16px)", position: "sticky", top: 0, zIndex: 20 }}>
      <div className="max-w-3xl mx-auto" style={{ padding: "8px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={volver} aria-label="Volver" style={botonRedondoR}>
            <ArrowLeft style={{ width: 20, height: 20, color: "#fff" }} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate" style={{ color: "#fff", fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{titulo}</h1>
            <p className="truncate" style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{subtitulo}</p>
          </div>
          {derecha}
        </div>
        {abajo}
      </div>
    </div>
  );

  // ── Lista de productos ───────────────────────────────────────────────────
  if (!selectedProduct) {
    return (
      <div className="min-h-screen" style={{ background: R.fondo }}>
        {encabezado(
          "Recetas",
          loading ? "Cargando…" : `${conReceta} de ${products.length} productos con receta`,
          undefined,
          <div style={{ position: "relative", marginTop: 12 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "rgba(255,255,255,0.75)" }} />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto"
              className="buscador-sobre-azul"
              style={{ width: "100%", height: 36, borderRadius: 10, border: "none", outline: "none", background: "rgba(255,255,255,0.18)", color: "#fff", fontSize: 16, padding: "0 12px 0 34px" }}
            />
          </div>,
        )}
        <div className="max-w-3xl mx-auto" style={{ padding: "12px 16px max(env(safe-area-inset-bottom), 32px)" }}>
          <div role="group" style={{ display: "flex", padding: 2, borderRadius: 9, background: R.relleno, marginBottom: 14 }}>
            {([["todos", "Todos"], ["con", "Con receta"], ["sin", "Sin receta"]] as const).map(([v, t]) => {
              const activo = filtroReceta === v;
              return (
                <button key={v} type="button" aria-pressed={activo} onClick={() => setFiltroReceta(v)}
                  style={{ flex: 1, height: 30, borderRadius: 7, border: "none", fontSize: 13, fontWeight: activo ? 600 : 500, color: "#000", background: activo ? "#fff" : "transparent", boxShadow: activo ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                  {t}
                </button>
              );
            })}
          </div>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: R.secundario }} />
            </div>
          ) : productosFiltrados.length === 0 ? (
            <div style={{ ...tarjetaR, padding: "32px 16px", textAlign: "center", color: R.secundario, fontSize: 15 }}>No hay productos con este filtro</div>
          ) : (
            <div style={tarjetaR}>
              {productosFiltrados.map((p, i) => {
                const n = p.ingredients?.length ?? 0;
                return (
                  <div key={p.id}>
                    {i > 0 && <div style={{ height: 0.5, background: R.separador, marginLeft: 68 }} />}
                    <button type="button" onClick={() => setSelectedProduct(p)} className="fila-ios"
                      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 60, padding: "8px 16px", textAlign: "left", border: "none" }}>
                      <span style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", background: R.fondo, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <ChefHat style={{ width: 18, height: 18, color: "#C7C7CC" }} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="truncate" style={{ display: "block", fontSize: 16, color: "#000" }}>{p.name}</span>
                        <span className="truncate" style={{ display: "block", fontSize: 13, color: R.secundario }}>{p.category || "Sin categoría"}</span>
                      </span>
                      <span style={{ fontSize: 14, color: n ? "#248A3D" : R.secundario, flexShrink: 0 }}>{n ? `${n} ingr.` : "Sin receta"}</span>
                      <ChevronRight style={{ width: 18, height: 18, color: "#C7C7CC", flexShrink: 0 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Receta de un producto ────────────────────────────────────────────────
  const sinFicha = dataset ? dataset.lineas.filter((l) => !l.ficha) : [];

  return (
    <div className="min-h-screen" style={{ background: R.fondo }}>
      {encabezado(selectedProduct.name, "Receta por unidad")}

      <div className="max-w-3xl mx-auto" style={{ padding: "16px 16px max(env(safe-area-inset-bottom), 32px)" }}>
        {/* Costo y margen */}
        <div style={{ ...tarjetaR, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "14px 0 12px" }}>
            {[
              { t: "Precio", v: formatCLP(precio), c: "#000" },
              { t: "Costo", v: loadingIngredients ? "—" : formatCLP(costoTotal), c: "#000" },
              { t: "Margen", v: !loadingIngredients && (productIngredients.length || laborCost) ? `${fmtNum(Math.round(margenPct * 10) / 10)}%` : "—", c: margen >= 0 ? "#248A3D" : R.rojo },
            ].map((m, i) => (
              <div key={m.t} style={{ textAlign: "center", borderLeft: i ? `0.5px solid ${R.separador}` : undefined }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: m.c, fontVariantNumeric: "tabular-nums" }}>{m.v}</p>
                <p style={{ fontSize: 12, color: R.secundario }}>{m.t}</p>
              </div>
            ))}
          </div>
          <div style={{ height: 0.5, background: R.separador, marginLeft: 16 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 46, padding: "0 16px" }}>
            <label htmlFor="mano-obra" style={{ flex: 1, fontSize: 16, color: "#000" }}>Mano de obra</label>
            {savingLabor && <Loader2 className="animate-spin" style={{ width: 14, height: 14, color: R.secundario }} />}
            <span style={{ fontSize: 16, color: laborCost ? "#000" : "#C7C7CC" }}>$</span>
            <input
              id="mano-obra"
              type="text"
              inputMode="numeric"
              value={laborCost}
              onChange={(e) => setLaborCost(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={handleSaveLaborCost}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="0"
              style={{ width: `${Math.max(1, laborCost.length) + 1}ch`, height: 40, border: "none", outline: "none", background: "transparent", fontSize: 16, color: "#000", textAlign: "right" }}
            />
          </div>
        </div>

        {/* Ingredientes */}
        <h3 style={tituloSeccion}>{loadingIngredients ? "Ingredientes" : `${productIngredients.length} ingredientes`}</h3>
        <div style={tarjetaR}>
          {loadingIngredients ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <Loader2 className="animate-spin" style={{ width: 20, height: 20, color: R.secundario }} />
            </div>
          ) : (
            productIngredients.map((pi) => {
              const ing = getIngredientDetails(pi.ingredientId);
              if (!ing) return null;
              const f = formatQuantity(pi.quantity, ing.unit);
              const alcanza = pi.quantity > 0 ? Math.floor(ing.currentStock / pi.quantity) : 0;
              return (
                <div key={pi.ingredientId}>
                  <button type="button" onClick={() => abrirEdicion(pi)} className="fila-ios"
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: "8px 16px", textAlign: "left", border: "none" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="truncate" style={{ display: "block", fontSize: 16, color: "#000" }}>{ing.name}</span>
                      <span style={{ display: "block", fontSize: 12, color: alcanza < 10 ? "#C93400" : R.secundario }}>
                        {ing.costPerUnit ? `${formatCLP(pi.quantity * ing.costPerUnit)} · ` : ""}alcanza para {fmtNum(alcanza)}
                      </span>
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: "#000", fontVariantNumeric: "tabular-nums" }}>{f.value} {f.unit}</span>
                    <ChevronRight style={{ width: 18, height: 18, color: "#C7C7CC", flexShrink: 0 }} />
                  </button>
                  <div style={{ height: 0.5, background: R.separador, marginLeft: 16 }} />
                </div>
              );
            })
          )}
          <button type="button" onClick={() => setShowAddForm(true)} className="fila-ios"
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, padding: "0 16px", border: "none", color: R.azul, fontSize: 16 }}>
            <Plus style={{ width: 20, height: 20 }} />
            Agregar ingrediente
          </button>
        </div>
        <p style={pieR}>Cantidad por cada unidad del producto. Toca un ingrediente para cambiarlo o quitarlo.</p>

        {/* Información nutricional (plegada) */}
        <div style={{ ...tarjetaR, marginTop: 22 }}>
          <button type="button" onClick={() => setNutricionAbierta((v) => !v)} aria-expanded={nutricionAbierta} className="fila-ios"
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 52, padding: "0 16px", textAlign: "left", border: "none" }}>
            <FlaskConical style={{ width: 20, height: 20, color: R.azul }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 16, color: "#000" }}>Información nutricional</span>
              <span style={{ display: "block", fontSize: 12, color: !dataset ? R.secundario : sinFicha.length ? "#C93400" : R.secundario }}>
                {!dataset ? "Cargando…" : dataset.lineas.length === 0 ? "Primero agrega ingredientes" : sinFicha.length ? `Faltan datos de ${sinFicha.length} materia${sinFicha.length === 1 ? "" : "s"} prima${sinFicha.length === 1 ? "" : "s"}` : versiones.length ? `${versiones.length} etiqueta${versiones.length === 1 ? "" : "s"} generada${versiones.length === 1 ? "" : "s"}` : "Lista para calcular"}
              </span>
            </span>
            <ChevronDown style={{ width: 18, height: 18, color: "#C7C7CC", transform: nutricionAbierta ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }} />
          </button>
          {nutricionAbierta && dataset && (
            <div style={{ borderTop: `0.5px solid ${R.separador}`, padding: "12px 16px 16px" }}>
              {sinFicha.length > 0 && (
                <div style={{ background: "#FFF8E5", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
                  <p style={{ fontSize: 14, color: "#000" }}>Faltan los datos nutricionales de:</p>
                  <p style={{ fontSize: 14, color: "#3C3C43", marginTop: 2 }}>{sinFicha.map((l) => l.nombre).join(", ")}</p>
                  <p style={{ fontSize: 12, color: R.secundario, marginTop: 4 }}>Se cargan en Materia prima, con el botón del matraz.</p>
                </div>
              )}
              <p style={{ fontSize: 13, color: R.secundario, marginBottom: 8, lineHeight: 1.35 }}>
                Peso del producto terminado: en el horno se pierde agua, así que el cálculo por 100 g usa este peso y no el de la mezcla cruda.
              </p>
              <div style={{ background: R.fondo, borderRadius: 10, overflow: "hidden" }}>
                {[
                  { id: "peso-final", t: "Peso final (g)", v: pesoFinal, s: setPesoFinal, ph: "160", m: "decimal" as const },
                  { id: "peso-porcion", t: "Porción (g)", v: pesoPorcion, s: setPesoPorcion, ph: "160", m: "decimal" as const },
                  { id: "porciones", t: "Porciones por envase", v: porciones, s: setPorciones, ph: "1", m: "decimal" as const },
                  { id: "porcion-desc", t: "Descripción porción", v: porcionDesc, s: setPorcionDesc, ph: "1 unidad", m: "text" as const },
                ].map((c, i) => (
                  <div key={c.id}>
                    {i > 0 && <div style={{ height: 0.5, background: R.separador, marginLeft: 12 }} />}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 12px" }}>
                      <label htmlFor={c.id} style={{ flex: 1, fontSize: 15, color: "#000" }}>{c.t}</label>
                      <input id={c.id} type="text" inputMode={c.m} value={c.v} onChange={(e) => c.s(e.target.value)} placeholder={c.ph}
                        style={{ width: 110, height: 40, border: "none", outline: "none", background: "transparent", fontSize: 16, textAlign: "right", color: "#000" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="button" onClick={handleGuardarPesos} disabled={guardandoPesos}
                  style={{ flex: 1, height: 44, borderRadius: 10, border: "none", background: R.relleno, color: R.azul, fontSize: 15, fontWeight: 600 }}>
                  {guardandoPesos ? "Guardando…" : "Guardar pesos"}
                </button>
                <button type="button" onClick={handleCalcular} className="boton-ios"
                  style={{ flex: 1, height: 44, borderRadius: 10, border: "none", background: R.azul, color: "#fff", fontSize: 15, fontWeight: 600 }}>
                  Calcular
                </button>
              </div>
              {resultado && (
                <div style={{ marginTop: 14 }}>
                  <NutritionPreview resultado={resultado} />
                  {/* Generar recién después de calcular: no imprimir algo sin haber visto los números. */}
                  <button type="button" onClick={() => setGeneradorAbierto(true)} className="boton-ios"
                    style={{ width: "100%", height: 46, borderRadius: 10, border: "none", background: R.azul, color: "#fff", fontSize: 15, fontWeight: 600, marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <FileText style={{ width: 17, height: 17 }} />
                    Generar etiqueta
                  </button>
                </div>
              )}
              {versiones.length > 0 && (
                <>
                  <p style={{ ...tituloSeccion, padding: "16px 0 6px" }}>Etiquetas generadas</p>
                  <div style={{ background: R.fondo, borderRadius: 10, overflow: "hidden" }}>
                    {versiones.map((v, i) => (
                      <div key={v.id}>
                        {i > 0 && <div style={{ height: 0.5, background: R.separador, marginLeft: 12 }} />}
                        <button type="button" onClick={() => setVersionAbierta(v)} className="fila-ios"
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 46, padding: "0 12px", border: "none", textAlign: "left", background: "transparent" }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: "#000" }}>v{v.version}</span>
                          <span style={{ flex: 1, fontSize: 13, color: R.secundario }}>
                            {new Date(v.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}
                            {v.anchoMm && v.altoMm ? ` · ${v.anchoMm}×${v.altoMm} mm` : ""}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: v.estado === "lista" ? "#E8F7EC" : "#FFF4D6", color: v.estado === "lista" ? "#248A3D" : "#9A6700" }}>
                            {v.estado === "lista" ? "Lista" : "Borrador"}
                          </span>
                          <ChevronRight style={{ width: 16, height: 16, color: "#C7C7CC" }} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: R.secundario, marginTop: 6 }}>Cada etiqueta guarda los datos con que se calculó, aunque la receta cambie después.</p>
                </>
              )}
            </div>
          )}
        </div>

        {productIngredients.length > 0 && (
          <div style={{ ...tarjetaR, marginTop: 22 }}>
            <button type="button" onClick={handleClearRecipe} className="fila-ios"
              style={{ width: "100%", minHeight: 48, border: "none", color: R.rojo, fontSize: 16 }}>
              Borrar toda la receta
            </button>
          </div>
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {/* Editar cantidad de un ingrediente */}
          {editando && (() => {
            const ing = getIngredientDetails(editando.ingredientId);
            if (!ing) return null;
            const unidades = unidadesDe(ing.unit);
            return (
              <HojaR key="editar" onClose={() => setEditando(null)} etiqueta={`Editar ${ing.name}`}>
                <BarraHoja izquierda="Cancelar" onIzquierda={() => setEditando(null)} titulo={ing.name} derecha="Guardar" onDerecha={() => void guardarEdicion()} />
                <div style={{ padding: "8px 16px 0" }}>
                  <CampoCantidad valor={editValor} onValor={setEditValor} unidades={unidades} unidad={editUnidad} onUnidad={setEditUnidad} onEnter={() => void guardarEdicion()} />
                  <p style={pieR}>Por cada unidad de {selectedProduct.name}.</p>
                  <div style={{ ...tarjetaR, marginTop: 20 }}>
                    <button type="button" className="fila-ios" style={{ width: "100%", minHeight: 48, border: "none", color: R.rojo, fontSize: 16 }}
                      onClick={async () => { await handleRemoveIngredient(editando.ingredientId); setEditando(null); }}>
                      Quitar de la receta
                    </button>
                  </div>
                </div>
              </HojaR>
            );
          })()}

          {/* Agregar ingrediente: primero se elige, después la cantidad */}
          {showAddForm && (
            <HojaR key="agregar" onClose={cerrarAgregar} etiqueta="Agregar ingrediente" alto>
              {ingredienteElegido ? (
                <>
                  <BarraHoja izquierda="Atrás" onIzquierda={() => setNewIngredient({ ingredientId: "", quantity: "" })} titulo={ingredienteElegido.name} derecha={saving ? "Guardando" : "Agregar"} onDerecha={() => void handleAddIngredient()} />
                  <div style={{ padding: "8px 16px 0" }}>
                    <CampoCantidad
                      valor={newIngredient.quantity}
                      onValor={(q) => setNewIngredient({ ...newIngredient, quantity: q.replace(",", ".") })}
                      unidades={unidadesDe(ingredienteElegido.unit)}
                      unidad={inputUnit}
                      onUnidad={setInputUnit}
                      onEnter={() => void handleAddIngredient()}
                      autoFocus
                    />
                    <p style={pieR}>Cuánto lleva cada unidad de {selectedProduct.name}. Hay {fmtNum(ingredienteElegido.currentStock)} {ingredienteElegido.unit} en stock.</p>
                  </div>
                </>
              ) : (
                <>
                  <BarraHoja izquierda="Cancelar" onIzquierda={cerrarAgregar} titulo="Agregar ingrediente" />
                  <div style={{ padding: "4px 16px 10px" }}>
                    <div style={{ position: "relative" }}>
                      <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: R.secundario }} />
                      <input type="search" value={busquedaIng} onChange={(e) => setBusquedaIng(e.target.value)} placeholder="Buscar materia prima"
                        style={{ width: "100%", height: 36, borderRadius: 10, border: "none", outline: "none", background: R.relleno, fontSize: 16, padding: "0 12px 0 34px", color: "#000" }} />
                    </div>
                  </div>
                  <div style={{ overflowY: "auto", padding: "0 16px" }}>
                    <div style={tarjetaR}>
                      {ingredientesParaAgregar.length === 0 ? (
                        <p style={{ padding: "24px 16px", textAlign: "center", fontSize: 14, color: R.secundario }}>
                          {availableIngredients.length === 0 ? "Todas las materias primas ya están en la receta" : "No hay coincidencias"}
                        </p>
                      ) : ingredientesParaAgregar.map((ing, i) => (
                        <div key={ing.id}>
                          {i > 0 && <div style={{ height: 0.5, background: R.separador, marginLeft: 16 }} />}
                          <button type="button" onClick={() => elegirIngrediente(ing)} className="fila-ios"
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 50, padding: "0 16px", textAlign: "left", border: "none" }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span className="truncate" style={{ display: "block", fontSize: 16, color: "#000" }}>{ing.name}</span>
                              <span style={{ display: "block", fontSize: 12, color: R.secundario }}>
                                {fmtNum(ing.currentStock)} {ing.unit} en stock{ing.costPerUnit ? ` · ${formatCLP(ing.costPerUnit)}/${ing.unit}` : ""}
                              </span>
                            </span>
                            <ChevronRight style={{ width: 18, height: 18, color: "#C7C7CC" }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </HojaR>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {generadorAbierto && resultado && (
        <LabelGenerator
          open={generadorAbierto}
          onClose={() => setGeneradorAbierto(false)}
          resultado={resultado}
          elaborador={elaboradorDe(dataset)}
          anchoInicial={dataset?.labelSettings?.anchoMmDefault ?? 90}
          altoInicial={dataset?.labelSettings?.altoMmDefault ?? 60}
          alDescargar={registrarVersion}
        />
      )}

      {versionAbierta && restaurada && (
        <LabelGenerator
          open
          onClose={() => setVersionAbierta(null)}
          resultado={restaurada.resultado}
          elaborador={restaurada.elaborador}
          anchoInicial={restaurada.anchoMm}
          altoInicial={restaurada.altoMm}
          versionHistorica={{
            version: versionAbierta.version,
            fecha: new Date(versionAbierta.createdAt).toLocaleDateString("es-CL"),
          }}
        />
      )}
    </div>
  );
}

const R = {
  fondo: "#F2F2F7",
  secundario: "#8E8E93",
  separador: "rgba(60, 60, 67, 0.18)",
  relleno: "rgba(118, 118, 128, 0.12)",
  azul: "#007AFF",
  rojo: "#FF3B30",
};

const tarjetaR: React.CSSProperties = { background: "#fff", borderRadius: 12, overflow: "hidden" };
const tituloSeccion: React.CSSProperties = { fontSize: 13, color: R.secundario, textTransform: "uppercase", letterSpacing: "0.02em", padding: "0 16px 6px", fontWeight: 400 };
const pieR: React.CSSProperties = { fontSize: 13, color: R.secundario, padding: "6px 16px 0", lineHeight: 1.35 };
const botonRedondoR: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(255,255,255,0.18)", border: "none", cursor: "pointer",
};

function HojaR({ children, onClose, etiqueta, alto }: { children: React.ReactNode; onClose: () => void; etiqueta: string; alto?: boolean }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onClose]);
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 60 }} />
      <motion.div role="dialog" aria-modal="true" aria-label={etiqueta}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61, margin: "0 auto", maxWidth: 560,
          background: R.fondo, borderRadius: "14px 14px 0 0", height: alto ? "85dvh" : undefined, maxHeight: "92dvh",
          display: "flex", flexDirection: "column", paddingBottom: "max(env(safe-area-inset-bottom), 20px)",
        }}>
        {children}
      </motion.div>
    </>
  );
}

function BarraHoja({ izquierda, onIzquierda, titulo, derecha, onDerecha }: { izquierda: string; onIzquierda: () => void; titulo: string; derecha?: string; onDerecha?: () => void }) {
  const b: React.CSSProperties = { background: "none", border: "none", padding: "6px 0", fontSize: 17, color: R.azul, cursor: "pointer", flex: 1 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px 10px" }}>
      <button type="button" onClick={onIzquierda} style={{ ...b, textAlign: "left" }}>{izquierda}</button>
      <span className="truncate" style={{ flex: 2, textAlign: "center", fontSize: 17, fontWeight: 600, color: "#000" }}>{titulo}</span>
      {derecha ? <button type="button" onClick={onDerecha} style={{ ...b, textAlign: "right", fontWeight: 600 }}>{derecha}</button> : <span style={{ flex: 1 }} />}
    </div>
  );
}

function CampoCantidad({ valor, onValor, unidades, unidad, onUnidad, onEnter, autoFocus }: {
  valor: string; onValor: (v: string) => void; unidades: string[]; unidad: string; onUnidad: (u: string) => void; onEnter: () => void; autoFocus?: boolean;
}) {
  return (
    <div style={{ ...tarjetaR, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
        <input
          className="input-grande"
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => onValor(e.target.value.replace(/[^\d.,]/g, ""))}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }}
          placeholder="0"
          autoFocus={autoFocus}
          aria-label="Cantidad"
          style={{ width: `${Math.max(1, valor.length || 1) + 0.5}ch`, border: "none", outline: "none", background: "transparent", fontSize: 44, fontWeight: 700, textAlign: "center", color: "#000", padding: 0 }}
        />
        {unidades.length === 1 && <span style={{ fontSize: 22, fontWeight: 600, color: R.secundario }}>{unidades[0]}</span>}
      </div>
      {unidades.length > 1 && (
        <div role="group" style={{ display: "flex", padding: 2, borderRadius: 9, background: R.relleno, marginTop: 10 }}>
          {unidades.map((u) => {
            const activo = unidad === u;
            return (
              <button key={u} type="button" aria-pressed={activo} onClick={() => onUnidad(u)}
                style={{ flex: 1, height: 32, borderRadius: 7, border: "none", fontSize: 15, fontWeight: activo ? 600 : 500, color: "#000", background: activo ? "#fff" : "transparent", boxShadow: activo ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                {u === "g" ? "gramos" : u === "ml" ? "mililitros" : u === "kg" ? "kilos" : u === "l" ? "litros" : u}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
