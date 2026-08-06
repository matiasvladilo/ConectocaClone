import { useState, useEffect, lazy, Suspense } from 'react';
import { Product, Category, categoriesAPI, ProductionArea, productionAreasAPI, ingredientsAPI, type Ingredient, type ProductIngredient, businessAPI, notificationsAPI, profileAPI } from '../utils/api';
import { productsAPI } from '../utils/api';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Plus,
  Package,
  Edit,
  Trash2,
  DollarSign,
  BoxIcon,
  Sparkles,
  Search,
  Tag,
  Image as ImageIcon,
  Folder,
  Factory,
  AlertTriangle,
  Filter,
  Barcode,
  Camera
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '../assets/logo-icon.png';
import { formatCLP, parseCLP, formatCLPInput } from '../utils/format';
import { ImageUpload } from './ImageUpload';

// Carga diferida: ZXing es una dependencia pesada y solo hace falta cuando
// alguien abre el escáner. Con un import estático entraría en el bundle
// inicial de toda la app, incluso para quien nunca escanea nada.
// El `.then(...)` es necesario porque BarcodeScannerDialog es un named export
// y React.lazy espera un módulo con `default`.
const BarcodeScannerDialog = lazy(() =>
  import('./BarcodeScannerDialog').then((m) => ({ default: m.BarcodeScannerDialog }))
);


interface ProductManagementProps {
  accessToken: string;
  onBack: () => void;
  onManageCategories: () => void;
  onManageRecipe?: () => void;
}

interface ProductFormData {
  name: string;
  description: string;
  price: string;
  stock: string;
  category: string;
  categoryId: string;
  sku: string;
  imageUrl: string;
  productionAreaId: string;
  unlimitedStock: boolean;
  allowDecimal: boolean;
  ingredients: (ProductIngredient & { inputUnit?: string })[];
}

const emptyForm: ProductFormData = {
  name: '',
  description: '',
  price: '',
  stock: '',
  category: 'General',
  categoryId: '',
  sku: '',
  imageUrl: '',
  productionAreaId: '',
  unlimitedStock: false,
  allowDecimal: false,
  ingredients: []
};

export function ProductManagement({ accessToken, onBack, onManageCategories, onManageRecipe }: ProductManagementProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productionAreas, setProductionAreas] = useState<ProductionArea[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyForm);
  const [isDeleting, setIsDeleting] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [formScannerOpen, setFormScannerOpen] = useState(false);
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadProductionAreas();
    loadIngredients();

    // Load profile to identify current user
    profileAPI.get(accessToken).then(profile => {
      setCurrentUserId(profile.id);
    }).catch(err => console.error("Error loading profile", err));
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      console.log('🔵 [ProductManagement] Loading products...');
      const data = await productsAPI.getAll(accessToken);
      console.log('🔵 [ProductManagement] Products received:', data?.length || 0, 'products');
      if (data && data.length > 0) {
        console.log('🔵 [ProductManagement] Sample product:', data[0]);
      }
      setProducts(data);
    } catch (error: any) {
      console.error('❌ [ProductManagement] Error loading products:', error);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await categoriesAPI.getAll(accessToken);
      setCategories(data);
    } catch (error: any) {
      console.error('Error loading categories:', error);
    }
  };

  const loadProductionAreas = async () => {
    try {
      const data = await productionAreasAPI.getAll(accessToken);
      setProductionAreas(data);
    } catch (error: any) {
      console.error('Error loading production areas:', error);
    }
  };

  const loadIngredients = async () => {
    try {
      const data = await ingredientsAPI.getAll(accessToken);
      setIngredients(data);
    } catch (error: any) {
      console.error('Error loading ingredients:', error);
    }
  };

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);

      // Transform ingredients for display
      const displayIngredients: (ProductIngredient & { inputUnit?: string })[] = [];

      (product.ingredients || []).forEach(pi => {
        const ingData = ingredients.find(i => i.id === pi.ingredientId);

        const baseUnit = ingData?.unit?.toLowerCase() || 'kg';
        let displayQty = pi.quantity;
        let displayUnit = baseUnit;

        if (baseUnit === 'kg' && pi.quantity < 1) {
          displayQty = pi.quantity * 1000;
          displayUnit = 'g';
        } else if (baseUnit === 'l' && pi.quantity < 1) {
          displayQty = pi.quantity * 1000;
          displayUnit = 'ml';
        }

        displayIngredients.push({
          ...pi,
          quantity: parseFloat(displayQty.toFixed(3)),
          inputUnit: displayUnit
        });
      });

      setFormData({
        name: product.name,
        description: product.description || '',
        price: formatCLP(product.price, false),
        stock: product.stock.toString(),
        category: product.category || 'General',
        categoryId: product.categoryId || '',
        sku: product.sku || '',
        imageUrl: product.imageUrl || '',
        productionAreaId: product.productionAreaId || '',
        unlimitedStock: product.unlimitedStock === true || product.stock === -1,
        allowDecimal: product.allowDecimal === true,
        ingredients: displayIngredients
      });
    } else {
      setEditingProduct(null);
      setFormData(emptyForm);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    // Parse Chilean peso format
    const priceValue = parseCLP(formData.price);
    if (!formData.price || priceValue < 0) {
      toast.error('El precio debe ser mayor o igual a 0');
      return;
    }
    if (!formData.unlimitedStock && (!formData.stock || parseInt(formData.stock) < 0)) {
      toast.error('El stock debe ser mayor o igual a 0');
      return;
    }

    try {
      setSubmitting(true);

      console.log('📝 [DEBUG] Form Ingredients:', formData.ingredients);

      const productData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: priceValue,
        stock: formData.unlimitedStock ? 0 : (parseInt(formData.stock) || 0),
        unlimitedStock: formData.unlimitedStock,
        trackStock: !formData.unlimitedStock,
        allowDecimal: formData.allowDecimal,
        category: formData.category.trim() || 'General',
        categoryId: formData.categoryId || undefined,
        sku: formData.sku.trim(),
        imageUrl: formData.imageUrl.trim() || undefined,
        productionAreaId: formData.productionAreaId || undefined,
        ingredients: formData.ingredients.map(pi => {
          // Convert back to base unit if necessary before saving
          let quantityToSave = pi.quantity;
          const unit = pi.inputUnit;
          if (unit === 'g' || unit === 'ml') {
            quantityToSave = quantityToSave / 1000;
          }
          return {
            ingredientId: pi.ingredientId,
            quantity: quantityToSave
          };
        })
      };

      console.log('📦 [DEBUG] Sending Product Data:', JSON.stringify(productData, null, 2));

      if (editingProduct) {
        // Update existing product
        const updated = await productsAPI.update(accessToken, editingProduct.id, productData);
        setProducts(products.map(p => p.id === updated.id ? updated : p));
        toast.success('Producto actualizado exitosamente');

        // Notify if price changed
        if (editingProduct.price !== productData.price) {
          businessAPI.getMembers(accessToken).then(({ members }) => {
            const promises = members
              .filter(m => m.id !== currentUserId)
              .map(m => notificationsAPI.create(accessToken, {
                title: 'Cambio de Precio',
                message: `El precio del producto "${productData.name}" ha cambiado a ${formatCLP(productData.price)}.`,
                type: 'product_updated',
                targetUserId: m.id
              }));
            Promise.all(promises).catch(e => console.error("Error creating notifications", e));
          }).catch(e => console.error("Error fetching members", e));
        }
      } else {
        // Create new product
        const created = await productsAPI.create(accessToken, productData);
        setProducts([created, ...products]);
        toast.success('Producto creado exitosamente');

        // Notify creation
        businessAPI.getMembers(accessToken).then(({ members }) => {
          const promises = members
            .filter(m => m.id !== currentUserId)
            .map(m => notificationsAPI.create(accessToken, {
              title: 'Nuevo Producto',
              message: `Se ha agregado el producto "${productData.name}" al catálogo.`,
              type: 'product_created',
              targetUserId: m.id
            }));
          Promise.all(promises).catch(e => console.error("Error creating notifications", e));
        }).catch(e => console.error("Error fetching members", e));
      }

      handleCloseDialog();
      // Reload everything to ensure local state matches server exactly (including ingredients)
      loadProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast.error(error.message || 'Error al guardar producto');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isDeleting) return;

    try {
      await productsAPI.delete(accessToken, isDeleting.id);
      setProducts(products.filter(p => p.id !== isDeleting.id));
      toast.success('Producto eliminado exitosamente');
      setIsDeleting(null);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error(error.message || 'Error al eliminar producto');
    }
  };

  const filteredProducts = products.filter(p => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q);

    const matchesCategory = selectedCategoryFilter === 'all' || p.category === selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  const stats = {
    total: products.length,
    lowStock: products.filter(p => !p.unlimitedStock && p.stock !== -1 && p.stock < 10).length,
    outOfStock: products.filter(p => !p.unlimitedStock && p.stock === 0).length,
    totalValue: products.reduce((sum, p) => sum + (p.price * (p.unlimitedStock || p.stock === -1 ? 0 : p.stock)), 0)
  };

  // Fallback del Suspense mientras se descarga el chunk de ZXing (~119 kB
  // comprimidos). Sin esto, en una red lenta tocar el ícono de cámara no
  // se ve como si hiciera nada y el usuario vuelve a tocar pensando que
  // falló. Se usa el mismo elemento en los dos Suspense del escáner.
  const scannerLoadingFallback = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-5 shadow-lg">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-700">Abriendo cámara…</p>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #EAF2FF 0%, #CFE0FF 100%)' }}
    >
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      {/* Header */}
      <div
        className="relative z-10 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          borderBottom: '3px solid #FFD43B',
          paddingTop: 'max(env(safe-area-inset-top), 20px)'
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.1, x: -4 }}
                whileTap={{ scale: 0.95 }}
                className="w-11 h-11 flex items-center justify-center rounded-full"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </motion.button>

              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <img
                    src={logo}
                    alt="La Oca Logo"
                    className="w-12 h-12 object-contain relative z-10"
                    style={{ imageRendering: 'crisp-edges' }}
                  />
                </motion.div>
                <div>
                  <h1 className="text-white tracking-wide flex items-center gap-2" style={{ fontSize: '24px', fontWeight: 600 }}>
                    <Package className="w-6 h-6" />
                    Gestión de Productos
                  </h1>
                  <p className="text-blue-100 text-sm">
                    Administra el catálogo de productos
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex gap-2 w-full md:w-auto mt-2 md:mt-0">
              <motion.button
                onClick={onManageCategories}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full px-2 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white'
                }}
              >
                <Folder className="w-4 h-4 shrink-0" />
                <span className="truncate">Categorías</span>
              </motion.button>

              <motion.button
                onClick={() => handleOpenDialog()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full px-2 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1 sm:gap-2 shadow-lg text-xs sm:text-sm font-semibold"
                style={{
                  background: 'linear-gradient(90deg, #FFD43B 0%, #FFC700 100%)',
                  color: '#0047BA'
                }}
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span className="truncate">Nuevo Producto</span>
              </motion.button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <motion.div
              className="p-4 rounded-xl backdrop-blur-md"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-blue-100" />
                <span className="text-xs text-blue-100">Total Productos</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.total}
              </p>
            </motion.div>

            <motion.div
              className="p-4 rounded-xl backdrop-blur-md"
              style={{
                background: 'rgba(255, 212, 59, 0.2)',
                border: '1px solid rgba(255, 212, 59, 0.3)'
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <BoxIcon className="w-4 h-4 text-yellow-200" />
                <span className="text-xs text-yellow-100">Stock Bajo</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.lowStock}
              </p>
            </motion.div>

            <motion.div
              className="p-4 rounded-xl backdrop-blur-md"
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Trash2 className="w-4 h-4 text-red-200" />
                <span className="text-xs text-red-100">Sin Stock</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.outOfStock}
              </p>
            </motion.div>

            <motion.div
              className="p-4 rounded-xl backdrop-blur-md"
              style={{
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-200" />
                <span className="text-xs text-green-100">Valor Total</span>
              </div>
              <p className="text-white" style={{ fontSize: '20px', fontWeight: 600 }}>
                {formatCLP(stats.totalValue)}
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5 relative z-10">
        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card
            className="border-2 shadow-lg"
            style={{ borderRadius: '16px', borderColor: '#E0EDFF' }}
          >
            <CardContent className="p-4 flex flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Buscar por nombre, SKU, descripción o categoría..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 pr-11 h-11 bg-white border-[#CBD5E1]"
                  style={{ borderRadius: '10px' }}
                />
                <button
                  type="button"
                  onClick={() => setSearchScannerOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors"
                  aria-label="Buscar escaneando un código de barras"
                >
                  <Camera className="w-5 h-5" />
                </button>
              </div>
              <div className="shrink-0">
                <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                  <SelectTrigger className="h-11 bg-white border-[#CBD5E1] w-[130px] sm:w-[180px]" style={{ borderRadius: '10px' }}>
                    <div className="flex items-center gap-2 text-gray-600 overflow-hidden">
                      <Filter className="w-4 h-4 shrink-0" />
                      <span className="truncate font-medium text-sm">
                        {selectedCategoryFilter === 'all' ? 'Filtrar' : selectedCategoryFilter}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Products Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Cargando productos...</p>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Card
              className="border-2 border-dashed"
              style={{ borderRadius: '16px', borderColor: '#CBD5E1' }}
            >
              <CardContent className="p-16 text-center">
                <div
                  className="w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)' }}
                >
                  <Package className="w-10 h-10 text-blue-300" />
                </div>
                <p className="text-gray-600 mb-2" style={{ fontSize: '16px', fontWeight: 500 }}>
                  {searchQuery ? 'No se encontraron productos' : 'No hay productos aún'}
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  {searchQuery ? 'Intenta con otra búsqueda' : 'Crea tu primer producto para comenzar'}
                </p>
                {!searchQuery && (
                  <Button
                    onClick={() => handleOpenDialog()}
                    className="mt-2"
                    style={{
                      background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
                      color: 'white'
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Producto
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + (index * 0.05) }}
              >
                <Card
                  className="border-2 hover:shadow-xl transition-all duration-300 group h-full"
                  style={{
                    borderRadius: '16px',
                    borderTopWidth: '4px',
                    borderTopColor: (product.unlimitedStock || product.stock === -1) ? '#6B7280' : product.stock === 0 ? '#EF4444' : product.stock < 10 ? '#F59E0B' : '#10B981',
                    borderLeftColor: '#E0EDFF',
                    borderRightColor: '#E0EDFF',
                    borderBottomColor: '#E0EDFF'
                  }}
                >
                  <CardContent className="p-5">
                    {/* Product Image/Icon */}
                    <div className="w-full h-40 sm:h-48 shrink-0 rounded-xl mb-4 overflow-hidden bg-gray-100/50 relative group flex items-center justify-center border border-gray-100">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <Package className="w-16 h-16 text-blue-300" />
                      )}
                    </div>

                    {/* Category Badge */}
                    {product.category && (
                      <Badge
                        className="mb-2 text-xs px-2 py-0.5"
                        style={{
                          background: 'rgba(0, 71, 186, 0.1)',
                          color: '#0047BA',
                          border: '1px solid rgba(0, 71, 186, 0.2)'
                        }}
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {product.category}
                      </Badge>
                    )}

                    {/* Product Name */}
                    <h3
                      className="text-[#0047BA] mb-2 line-clamp-2"
                      style={{ fontSize: '16px', fontWeight: 600 }}
                    >
                      {product.name}
                    </h3>

                    {product.sku && (
                      <p className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-mono">
                        <Barcode className="w-3.5 h-3.5 shrink-0" />
                        {product.sku}
                      </p>
                    )}

                    {/* Description */}
                    {product.description && (
                      <p className="text-gray-600 text-xs mb-3 line-clamp-2">
                        {product.description}
                      </p>
                    )}

                    {/* Price & Stock */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs text-gray-500">Precio</p>
                        <p className="text-[#0047BA]" style={{ fontSize: '18px', fontWeight: 600 }}>
                          {formatCLP(product.price)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Stock</p>
                        <p
                          className={`${(product.unlimitedStock || product.stock === -1) ? 'text-blue-500' :
                            product.stock === 0 ? 'text-red-600' :
                            product.stock < 10 ? 'text-amber-600' :
                            'text-green-600'
                          }`}
                          style={{ fontSize: '18px', fontWeight: 600 }}
                        >
                          {(product.unlimitedStock || product.stock === -1) ? '∞ Ilimitado' :
                            product.stock === 0 ? 'Sin stock' :
                            product.stock}
                        </p>
                      </div>
                    </div>

                    {/* Cost & Margin */}
                    <div className="flex items-center justify-between mb-4 pt-2 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-400">Costo</p>
                        <p className="text-gray-600 font-semibold" style={{ fontSize: '14px' }}>
                          {formatCLP((product.ingredients || []).reduce((sum, pi) => {
                            const ing = ingredients.find(i => i.id === pi.ingredientId);
                            // Auto-detect if quantity is in sub-units based on magnitude or usage pattern in form
                            // But here we rely on the saved data which is normalized to base unit in DB??
                            // Wait, in handleSubmit we divide by 1000 if inputUnit is g/ml.
                            // So stored quantity IS in base unit (kg/l).
                            // So we just multiply by costPerUnit directly.
                            return sum + ((ing?.costPerUnit || 0) * pi.quantity);
                          }, 0))}
                        </p>
                      </div>
                      <div className="text-right">
                        {/* Optional: Margin calculation could go here */}
                      </div>
                    </div>


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
                      <Button
                        onClick={() => setIsDeleting(product)}
                        variant="outline"
                        size="sm"
                        className="border-red-500 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingProduct ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? 'Actualiza la información del producto'
                : 'Completa los datos del nuevo producto'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Nombre del Producto *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Cajas de Cartón Premium"
                  required
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="sku" className="flex items-center gap-2">
                  <Barcode className="w-4 h-4 text-gray-500" />
                  SKU / Código de barras
                </Label>
                <div className="relative">
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    onKeyDown={(e) => {
                      // La pistola lectora manda Enter al final del código. Sin esto,
                      // escanear dentro del form dispararía un submit prematuro.
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                    placeholder="Ej: 7801234567890"
                    inputMode="numeric"
                    className="pr-11"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setFormScannerOpen(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors"
                    aria-label="Escanear código de barras con la cámara"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Opcional. Podés escanearlo con la pistola lectora o con la cámara.
                </p>
              </div>

              <div className="col-span-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe el producto..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="price">Precio de Venta *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="price"
                    type="text"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: formatCLPInput(e.target.value) })}
                    placeholder="0"
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="stock">Stock *</Label>
                <div className="relative">
                  <BoxIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                    className="pl-9"
                    required
                    disabled={formData.unlimitedStock}
                  />
                </div>
              </div>

              {/* Unlimited Stock Checkbox */}
              <div className="col-span-2">
                <motion.div
                  className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200"
                  whileHover={{ scale: 1.01 }}
                  transition={{ duration: 0.2 }}
                >
                  <Checkbox
                    id="unlimited-stock"
                    checked={formData.unlimitedStock}
                    onCheckedChange={(checked: boolean | "indeterminate") => setFormData({
                      ...formData,
                      unlimitedStock: checked === true,
                      stock: checked === true ? '0' : formData.stock
                    })}
                    className="border-blue-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="unlimited-stock"
                      className="text-sm text-blue-900 cursor-pointer select-none block"
                      style={{ fontWeight: 500 }}
                    >
                      ∞ Stock Ilimitado / Sin Control
                    </label>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Ideal para productos bajo pedido o servicios sin inventario físico
                    </p>
                  </div>
                  <Sparkles className="w-5 h-5 text-blue-500" />
                </motion.div>
              </div>

              {/* Allow Decimal Checkbox */}
              <div className="col-span-2">
                <motion.div
                  className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200"
                  whileHover={{ scale: 1.01 }}
                  transition={{ duration: 0.2 }}
                >
                  <Checkbox
                    id="allow-decimal"
                    checked={formData.allowDecimal}
                    onCheckedChange={(checked: boolean | "indeterminate") => setFormData({
                      ...formData,
                      allowDecimal: checked === true
                    })}
                    className="border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="allow-decimal"
                      className="text-sm text-amber-900 cursor-pointer select-none block"
                      style={{ fontWeight: 500 }}
                    >
                      ½ Venta por fracción / decimal
                    </label>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Permite pedir 0.5, 1.5, etc. — ideal para pan, masas y productos por peso
                    </p>
                  </div>
                </motion.div>
              </div>

              <div className="col-span-2">
                <Label htmlFor="categoryId">Categoría</Label>
                <Select
                  value={formData.categoryId || "none"}
                  onValueChange={(value: string) => {
                    if (value === "none") {
                      setFormData({
                        ...formData,
                        categoryId: '',
                        category: 'General'
                      });
                    } else {
                      const selectedCategory = categories.find(c => c.id === value);
                      setFormData({
                        ...formData,
                        categoryId: value,
                        category: selectedCategory?.name || 'General'
                      });
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categories.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No hay categorías. <button type="button" onClick={onManageCategories} className="text-blue-600 underline">Crear una</button>
                  </p>
                )}
              </div>

              <div className="col-span-2">
                <Label htmlFor="productionAreaId">Área de Producción</Label>
                <Select
                  value={formData.productionAreaId || "none"}
                  onValueChange={(value: string) => {
                    if (value === "none") {
                      setFormData({
                        ...formData,
                        productionAreaId: ''
                      });
                    } else {
                      setFormData({
                        ...formData,
                        productionAreaId: value
                      });
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar área de producción" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin área de producción</SelectItem>
                    {productionAreas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {productionAreas.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No hay áreas de producción. <button type="button" onClick={onManageCategories} className="text-blue-600 underline">Crear una</button>
                  </p>
                )}
              </div>

              <div className="col-span-2">
                <ImageUpload
                  value={formData.imageUrl}
                  onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                  label="Imagen del Producto"
                  accessToken={accessToken}
                />
              </div>

              {/* Recipe Summary (read-only) */}
              <div className="col-span-2">
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm flex items-center gap-2">
                        <Factory className="w-4 h-4 text-blue-600" />
                        Receta
                      </Label>
                      <p className="text-sm text-gray-500 mt-1">
                        {formData.ingredients.length} ingrediente{formData.ingredients.length !== 1 ? 's' : ''} configurado{formData.ingredients.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {onManageRecipe && (
                      <Button type="button" variant="outline" onClick={onManageRecipe}>
                        Configurar receta
                      </Button>
                    )}
                  </div>
                </div>
              </div>

            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                style={{
                  background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
                  color: 'white'
                }}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Guardando...
                  </>
                ) : (
                  <>
                    {editingProduct ? 'Guardar Cambios' : 'Guardar Producto'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Escáner del formulario: completa el campo SKU.
          Se renderiza solo cuando está abierto para que la carga diferida
          sirva de algo: el chunk de ZXing se baja recién al primer uso. */}
      {formScannerOpen && (
        <Suspense fallback={scannerLoadingFallback}>
          <BarcodeScannerDialog
            open
            onOpenChange={setFormScannerOpen}
            onScan={(code) => setFormData((prev) => ({ ...prev, sku: code }))}
            title="Escanear código del producto"
          />
        </Suspense>
      )}

      {/* Escáner del buscador: filtra la grilla por el código leído */}
      {searchScannerOpen && (
        <Suspense fallback={scannerLoadingFallback}>
          <BarcodeScannerDialog
            open
            onOpenChange={setSearchScannerOpen}
            onScan={(code) => setSearchQuery(code)}
            title="Buscar por código de barras"
          />
        </Suspense>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!isDeleting} onOpenChange={() => setIsDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              ¿Eliminar producto?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar <strong>{isDeleting?.name}</strong>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}