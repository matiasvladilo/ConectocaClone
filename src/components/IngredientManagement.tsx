import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Save, Trash2, Package, AlertTriangle, TrendingDown, TrendingUp, Edit2, X, Search, Filter, FlaskConical } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  ingredientsAPI,
  nutritionAPI,
  type AlergenoAPI,
  type AlergenosDeMateriaPrima,
  type FichaNutricionalAPI,
  type Ingredient as APIIngredient,
} from "../utils/api";
import { NutritionFichaDialog, EstadoPunto } from "./NutritionFichaDialog";
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
    console.log("IngredientManagement: Component mounted");
    console.log("Access Token:", accessToken ? "Present" : "Missing");
    loadIngredients();
    loadNutricion();
  }, []);

  const loadIngredients = async () => {
    try {
      console.log("Loading ingredients...");
      setLoading(true);
      const data = await ingredientsAPI.getAll(accessToken);
      console.log("Ingredients loaded:", data);
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

    // Auto-scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 shadow-lg sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="flex items-center gap-2">
                <Package className="w-6 h-6" />
                Stock de Materia Prima
              </h1>
              <p className="text-sm text-blue-100 mt-1">
                Gestión de inventario y materiales
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowNewForm(true)}
            className="bg-yellow-500 hover:bg-yellow-600 text-gray-900"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nueva Materia Prima
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-white border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Items</p>
                <p className="text-2xl mt-1">{ingredients.length}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500" />
            </div>
          </Card>

          <Card className="p-4 bg-white border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Sin Stock</p>
                <p className="text-2xl mt-1">
                  {ingredients.filter(i => i.currentStock === 0).length}
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-500" />
            </div>
          </Card>

          <Card className="p-4 bg-white border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock Bajo</p>
                <p className="text-2xl mt-1">
                  {ingredients.filter(i => i.currentStock > 0 && i.currentStock < i.minStock).length}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
          </Card>

          <Card className="p-4 bg-white border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock Normal</p>
                <p className="text-2xl mt-1">
                  {ingredients.filter(i => i.currentStock >= i.minStock && (!i.maxStock || i.currentStock <= i.maxStock)).length}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 bg-white p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar materia prima..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2 md:w-1/3">
              <Filter className="w-5 h-5 text-gray-500 shrink-0" />
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ALL">Todos los proveedores</option>
                {uniqueSuppliers.map(supplier => (
                  <option key={supplier} value={supplier as string}>{supplier}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cuánto falta para poder generar etiquetas. Con 89 materias primas,
              saber que van 12 cargadas importa más que el estado de una sola. */}
          {ingredients.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-200 text-xs text-gray-600">
              <span className="text-gray-700">Información nutricional:</span>
              <span className="flex items-center gap-1">
                <EstadoPunto estado="completa" />
                {resumenNutricional.completa} completas
              </span>
              <span className="flex items-center gap-1">
                <EstadoPunto estado="parcial" />
                {resumenNutricional.parcial} parciales
              </span>
              <span className="flex items-center gap-1">
                <EstadoPunto estado="sin_datos" />
                {resumenNutricional.sin_datos} sin datos
              </span>
            </div>
          )}
        </Card>

        {/* New/Edit Form */}
        <AnimatePresence>
          {(showNewForm || editingId) && (
            <motion.div
              ref={formRef}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="scroll-mt-40"
            >
              <Card className="p-6 bg-white shadow-lg border-2 border-blue-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    {editingId ? "Editar Materia Prima" : "Nueva Materia Prima"}
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCancel}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-2">
                      Nombre <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Harina de trigo"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2">
                      Unidad de Medida <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="kg">Kilogramos (kg)</option>
                      <option value="g">Gramos (g)</option>
                      <option value="l">Litros (l)</option>
                      <option value="ml">Mililitros (ml)</option>
                      <option value="unidades">Unidades</option>
                      <option value="bolsas">Bolsas</option>
                      <option value="cajas">Cajas</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm mb-2">
                      Stock Actual <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.currentStock}
                      onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2">
                      Stock Mínimo <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minStock}
                      onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2">
                      Stock Máximo (Opcional)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.maxStock}
                      onChange={(e) => setFormData({ ...formData, maxStock: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2">
                      Costo por Unidad (CLP) (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formData.costPerUnit}
                      onChange={(e) => {
                        // Allow only numbers, dots and commas
                        const val = e.target.value;
                        if (/^[\d.,]*$/.test(val)) {
                          setFormData({ ...formData, costPerUnit: val });
                        }
                      }}
                      onBlur={(e) => {
                        // Format on blur: 1200 -> 1.200
                        const val = e.target.value;
                        if (val) {
                          const cleanVal = val.replace(/\./g, '').replace(',', '.');
                          const num = parseFloat(cleanVal);
                          if (!isNaN(num)) {
                            // Simple format: add dots for thousands. 
                            // We can use Intl but might need to strip the '$' symbol if we just want the number part formatted.
                            // Or we keep it simple.
                            // Let's use Intl and strip symbol for input field
                            const formatted = new Intl.NumberFormat('es-CL').format(num);
                            setFormData({ ...formData, costPerUnit: formatted });
                          }
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 1.200 o 1200"

                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm mb-2">
                      Proveedor (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Nombre del proveedor"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSaving ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {isSaving ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ingredients List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Cargando materias primas...</p>
          </div>
        ) : ingredients.length === 0 ? (
          <Card className="p-12 text-center bg-white">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-gray-600 mb-2">No hay materias primas registradas</h3>
            <p className="text-gray-500 text-sm mb-6">
              Comienza agregando tu primera materia prima
            </p>
            <Button
              onClick={() => setShowNewForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Materia Prima
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredIngredients.map((ingredient) => {
              const stockStatus = getStockStatus(ingredient);
              const nutricion = diagnosticarFicha(ingredient.unit, fichas[ingredient.id] || null);
              return (
                <motion.div
                  key={ingredient.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <Card className="p-4 bg-white hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-gray-900 mb-1">{ingredient.name}</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full text-white ${stockStatus.color}`}>
                            {stockStatus.label}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-600">
                            <EstadoPunto estado={nutricion.estado} />
                            {ETIQUETA_ESTADO[nutricion.estado]}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFichaAbierta(ingredient)}
                          className="text-blue-600 hover:bg-blue-50"
                          title="Información nutricional"
                        >
                          <FlaskConical className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(ingredient)}
                          className="text-blue-600 hover:bg-blue-50"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(ingredient.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Stock Actual:</span>
                        <span className="text-gray-900">
                          {ingredient.currentStock} {ingredient.unit}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Stock Mínimo:</span>
                        <span className="text-gray-900">
                          {ingredient.minStock} {ingredient.unit}
                        </span>
                      </div>

                      {ingredient.maxStock && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Stock Máximo:</span>
                          <span className="text-gray-900">
                            {ingredient.maxStock} {ingredient.unit}
                          </span>
                        </div>
                      )}

                      {ingredient.costPerUnit && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Costo/Unidad:</span>
                          <span className="text-gray-900">
                            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(ingredient.costPerUnit)}
                          </span>
                        </div>
                      )}

                      {ingredient.supplier && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Proveedor:</span>
                          <span className="text-gray-900 truncate max-w-[150px]">
                            {ingredient.supplier}
                          </span>
                        </div>
                      )}

                      {/* Stock Progress Bar */}
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>0</span>
                          <span>Mín: {ingredient.minStock}</span>
                          {ingredient.maxStock && <span>Máx: {ingredient.maxStock}</span>}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full ${stockStatus.color} transition-all duration-300`}
                            style={{
                              width: `${Math.min(100, (ingredient.currentStock / (ingredient.maxStock || ingredient.minStock * 2)) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

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