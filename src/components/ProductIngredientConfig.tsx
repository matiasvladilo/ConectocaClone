import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Save, Trash2, Package, ChefHat, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  productsAPI,
  ingredientsAPI,
  productIngredientsAPI,
  type Product,
  type Ingredient as APIIngredient,
  type ProductIngredient as APIProductIngredient,
} from "../utils/api";
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
  // Solo se usa para llevar la columna izquierda hasta el producto preseleccionado.
  const botonPreseleccionado = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    console.log("ProductIngredientConfig: Component mounted");
    console.log("Access Token:", accessToken ? "Present" : "Missing");
    loadInitialData();
  }, []);

  useEffect(() => {
    let isActive = true;

    if (selectedProduct) {
      setLaborCost(selectedProduct.laborCost ? String(selectedProduct.laborCost) : "");
      console.log("Loading ingredients for product:", selectedProduct.name);
      setLoadingIngredients(true);
      setProductIngredients([]); // Clear previous ingredients immediately

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
    } else {
      setProductIngredients([]);
    }

    return () => {
      isActive = false;
    };
  }, [selectedProduct]);

  // Solo al terminar la carga inicial. Si dependiera de `selectedProduct`, saltaría
  // cada vez que el usuario elige otro producto de la lista, que ya está a la vista.
  useEffect(() => {
    if (loading || !initialProduct) return;
    botonPreseleccionado.current?.scrollIntoView({ block: "nearest" });
  }, [loading, initialProduct]);

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
      } else if (productsData.length > 0) {
        setSelectedProduct(productsData[0]);
      }
    } catch (error: any) {
      console.error("Error loading initial data:", error);
      toast.error(error.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
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
                <ChefHat className="w-6 h-6" />
                Ingredientes por Producto
              </h1>
              <p className="text-sm text-blue-100 mt-1">
                Configure las recetas y materias primas
              </p>
            </div>
          </div>
          {selectedProduct && (
            <Button
              onClick={handleClearRecipe}
              variant="outline"
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpiar receta
            </Button>
          )}
        </div>
      </div>

      {
        loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Cargando datos...</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Products List */}
              <div className="lg:col-span-1">
                <Card className="p-4 bg-white">
                  <h2 className="mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    Productos
                  </h2>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {products.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No hay productos disponibles</p>
                      </div>
                    ) : (
                      products.map((product) => (
                        <button
                          key={product.id}
                          ref={initialProduct && product.id === initialProduct.id ? botonPreseleccionado : undefined}
                          onClick={() => setSelectedProduct(product)}
                          className={`w-full text-left p-3 rounded-lg transition-all ${selectedProduct?.id === product.id
                            ? "bg-blue-600 text-white shadow-md"
                            : "bg-gray-50 hover:bg-gray-100 text-gray-900"
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            {product.imageUrl && (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-10 h-10 rounded object-cover"
                              />
                            )}
                            <div className="flex-1">
                              <p className={selectedProduct?.id === product.id ? "text-white" : "text-gray-900"}>
                                {product.name}
                              </p>
                              <p className={`text-xs ${selectedProduct?.id === product.id ? "text-blue-100" : "text-gray-500"}`}>
                                {product.category || "Sin categoría"}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </Card>
              </div>

              {/* Product Ingredients Configuration */}
              <div className="lg:col-span-2">
                {selectedProduct ? (
                  <div className="space-y-4">
                    {/* Product Info Header */}
                    <Card className="p-6 bg-white border-l-4 border-blue-500">
                      <div className="flex items-start gap-4">
                        {selectedProduct.imageUrl && (
                          <img
                            src={selectedProduct.imageUrl}
                            alt={selectedProduct.name}
                            className="w-20 h-20 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1">
                          <h2 className="text-gray-900 mb-1">{selectedProduct.name}</h2>
                          <p className="text-sm text-gray-600 mb-2">{selectedProduct.description}</p>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-gray-600">
                              Precio: <span className="text-gray-900">${selectedProduct.price}</span>
                            </span>
                            {productIngredients.length > 0 && (
                              <span className="text-gray-600">
                                Costo Materias Primas: <span className="text-green-600">${calculateTotalCost().toFixed(2)}</span>
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <label className="text-sm text-gray-600">Costo mano de obra (opcional):</label>
                            <input
                              type="text"
                              value={laborCost}
                              onChange={(e) => setLaborCost(e.target.value.replace(/[^0-9]/g, ""))}
                              onBlur={handleSaveLaborCost}
                              placeholder="0"
                              className="w-28 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <span className="text-xs text-gray-400">CLP</span>
                            {savingLabor && <span className="text-xs text-gray-400">guardando...</span>}
                          </div>
                        </div>
                        <Button
                          onClick={() => setShowAddForm(true)}
                          className="bg-yellow-500 hover:bg-yellow-600 text-gray-900"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Agregar Ingrediente
                        </Button>
                      </div>
                    </Card>

                    {/* Add Ingredient Form */}
                    <AnimatePresence>
                      {showAddForm && (
                        <motion.div
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                        >
                          <Card className="p-6 bg-white border-2 border-yellow-500">
                            <h3 className="mb-4">Agregar Ingrediente</h3>

                            {availableIngredients.length === 0 ? (
                              <div className="text-center py-8">
                                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                <p className="text-gray-600 mb-2">No hay ingredientes disponibles</p>
                                <p className="text-sm text-gray-500">
                                  Todos los ingredientes ya están agregados o no hay ingredientes creados
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-sm mb-2">Ingrediente</label>
                                  <select
                                    value={newIngredient.ingredientId}
                                    onChange={(e) => {
                                      const id = e.target.value;
                                      setNewIngredient({ ...newIngredient, ingredientId: id });
                                      const ing = ingredients.find(i => i.id === id);
                                      if (ing) {
                                        // Normalize unit to lower case for comparison just in case, or use exact string
                                        // If it's kilogram/liters, default to the base unit
                                        // We can store the unit directly
                                        const u = ing.unit.toLowerCase();
                                        if (u === 'kilos') setInputUnit('kg');
                                        else if (u === 'litros') setInputUnit('l');
                                        else setInputUnit(ing.unit);
                                      }
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  >
                                    <option value="">Seleccione un ingrediente</option>
                                    {availableIngredients.map((ingredient) => (
                                      <option key={ingredient.id} value={ingredient.id}>
                                        {ingredient.name} ({ingredient.currentStock} {ingredient.unit} disponibles)
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-sm mb-2">
                                    Cantidad por Unidad de Producto
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={newIngredient.quantity}
                                      onChange={(e) => setNewIngredient({ ...newIngredient, quantity: e.target.value })}
                                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="0.00"
                                    />
                                    {newIngredient.ingredientId && (
                                      (() => {
                                        const ing = getIngredientDetails(newIngredient.ingredientId);
                                        if (!ing) return null;

                                        const isKg = ing.unit.toLowerCase() === 'kg' || ing.unit.toLowerCase() === 'kilos';
                                        const isL = ing.unit.toLowerCase() === 'l' || ing.unit.toLowerCase() === 'litros';

                                        if (isKg) {
                                          return (
                                            <select
                                              value={inputUnit}
                                              onChange={(e) => setInputUnit(e.target.value)}
                                              className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700"
                                            >
                                              <option value="kg">kg</option>
                                              <option value="g">gramos</option>
                                            </select>
                                          );
                                        } else if (isL) {
                                          return (
                                            <select
                                              value={inputUnit}
                                              onChange={(e) => setInputUnit(e.target.value)}
                                              className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700"
                                            >
                                              <option value="l">litros</option>
                                              <option value="ml">ml</option>
                                            </select>
                                          );
                                        } else {
                                          return (
                                            <span className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 flex items-center">
                                              {ing.unit}
                                            </span>
                                          );
                                        }
                                      })()
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Cantidad de este ingrediente necesaria para fabricar 1 unidad del producto
                                  </p>
                                </div>

                                <div className="flex gap-3">
                                  <Button
                                    onClick={handleAddIngredient}
                                    disabled={saving}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    <Save className="w-4 h-4 mr-2" />
                                    {saving ? "Guardando..." : "Guardar"}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setShowAddForm(false);
                                      setNewIngredient({ ingredientId: "", quantity: "" });
                                      setInputUnit("");
                                    }}
                                    className="flex-1"
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            )}
                          </Card>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Ingredients List */}
                    <Card className="p-6 bg-white">
                      <h3 className="mb-4">
                        Ingredientes Configurados {loadingIngredients ? "..." : `(${productIngredients.length})`}
                      </h3>

                      {loadingIngredients ? (
                        <div className="flex justify-center py-8">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                      ) : productIngredients.length === 0 ? (
                        <div className="text-center py-12">
                          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-gray-600 mb-2">
                            No hay ingredientes configurados
                          </h3>
                          <p className="text-gray-500 text-sm mb-6">
                            Este producto aún no tiene ingredientes asignados
                          </p>
                          <Button
                            onClick={() => setShowAddForm(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Agregar Primer Ingrediente
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {productIngredients.map((pi) => {
                            const ingredient = getIngredientDetails(pi.ingredientId);
                            if (!ingredient) return null;

                            const canProduce = Math.floor(ingredient.currentStock / pi.quantity);

                            return (
                              <motion.div
                                key={pi.ingredientId}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                              >
                                <Card className="p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                                  <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                      <h4 className="text-gray-900 mb-1">{ingredient.name}</h4>
                                      <div className="flex items-center gap-4 text-sm text-gray-600">
                                        <span>
                                          Cantidad: {pi.quantity} {ingredient.unit}
                                        </span>
                                        <span className="text-gray-400">•</span>
                                        <span>
                                          Stock: {ingredient.currentStock} {ingredient.unit}
                                        </span>
                                        <span className="text-gray-400">•</span>
                                        <span className={canProduce < 10 ? "text-yellow-600" : "text-green-600"}>
                                          Puede producir: {canProduce} unidades
                                        </span>
                                        {ingredient.costPerUnit && (
                                          <>
                                            <span className="text-gray-400">•</span>
                                            <span>
                                              Costo: ${(pi.quantity * ingredient.costPerUnit).toFixed(2)}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            step="0.01"
                                            defaultValue={formatQuantity(pi.quantity, ingredient.unit).value}
                                            onBlur={(e) => {
                                              const newVal = parseFloat(e.target.value);
                                              const currentFormatted = formatQuantity(pi.quantity, ingredient.unit);
                                              // Only update if value actually changed
                                              if (newVal > 0 && newVal.toString() !== currentFormatted.value) {
                                                handleUpdateQuantity(pi.ingredientId, newVal, currentFormatted.unit);
                                              }
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                const target = e.target as HTMLInputElement;
                                                const newVal = parseFloat(target.value);
                                                const currentFormatted = formatQuantity(pi.quantity, ingredient.unit);
                                                if (newVal > 0) {
                                                  handleUpdateQuantity(pi.ingredientId, newVal, currentFormatted.unit);
                                                  target.blur();
                                                }
                                              }
                                            }}
                                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          />
                                          <span className="text-xs font-medium text-gray-500 w-8">
                                            {formatQuantity(pi.quantity, ingredient.unit).unit}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-gray-400">
                                          Presiona Enter para guardar
                                        </span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveIngredient(pi.ingredientId)}
                                        className="text-red-600 hover:bg-red-50"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </Card>
                              </motion.div>
                            );
                          })}

                          {/* Summary */}
                          {productIngredients.length > 0 && (
                            <Card className="p-4 bg-blue-50 border-2 border-blue-200 mt-4">
                              <div className="flex justify-between items-center">
                                <span className="text-gray-700">
                                  Costo Total de Materias Primas por Unidad:
                                </span>
                                <span className="text-blue-900">
                                  ${calculateTotalCost().toFixed(2)}
                                </span>
                              </div>
                              {selectedProduct.price && (
                                <div className="flex justify-between items-center mt-2 pt-2 border-t border-blue-300">
                                  <span className="text-gray-700">Margen de Ganancia:</span>
                                  <span className={`${selectedProduct.price - calculateTotalCost() > 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                    }`}>
                                    ${(selectedProduct.price - calculateTotalCost()).toFixed(2)}
                                    ({((((selectedProduct.price - calculateTotalCost()) / selectedProduct.price) * 100) || 0).toFixed(1)}%)
                                  </span>
                                </div>
                              )}
                            </Card>
                          )}
                        </div>
                      )}
                    </Card>
                  </div>
                ) : (
                  <Card className="p-12 text-center bg-white">
                    <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-gray-600 mb-2">
                      Seleccione un producto
                    </h3>
                    <p className="text-gray-500 text-sm">
                      Elija un producto de la lista para configurar sus ingredientes
                    </p>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}