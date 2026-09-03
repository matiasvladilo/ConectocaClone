import { useState, useEffect, lazy, Suspense } from 'react';
import { Product, Category, categoriesAPI, ProductionArea, productionAreasAPI, businessAPI, notificationsAPI, profileAPI } from '../utils/api';
import { productsAPI } from '../utils/api';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup } from './ui/select';
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
import { agruparPorPadre, idsDeCategoriaConHijas } from '../utils/categoryTree';
import { ImageUpload } from './ImageUpload';
import { StockAdjustDialog, type ModoAjuste } from './StockAdjustDialog';
import { ProductNameFields } from './ProductNameFields';
import { componerNombre, partesVacias, type ProductNameParts } from '../utils/productName';
import { construirPayloadProducto, type ProductFormData } from '../utils/productPayload';
import { ProductIngredientConfig } from './ProductIngredientConfig';

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
}

const emptyForm: ProductFormData = {
  name: '',
  description: '',
  price: '',
  stock: '',
  minStock: '',
  category: 'General',
  categoryId: '',
  sku: '',
  imageUrl: '',
  productionAreaId: '',
  unlimitedStock: false,
  allowDecimal: false
};

export function ProductManagement({ accessToken, onBack, onManageCategories }: ProductManagementProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productionAreas, setProductionAreas] = useState<ProductionArea[]>([]);
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
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [savingStock, setSavingStock] = useState(false);
  // Solo se usan al crear. Al editar, el nombre sigue siendo texto libre.
  const [nameParts, setNameParts] = useState<ProductNameParts>(partesVacias);
  // La receta se abre como capa y no navegando a otra pantalla: así este
  // componente no se desmonta y el diálogo, la búsqueda y el scroll sobreviven.
  const [recetaDe, setRecetaDe] = useState<Product | null>(null);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadProductionAreas();

    // Load profile to identify current user
    profileAPI.get(accessToken).then(profile => {
      setCurrentUserId(profile.id);
    }).catch(err => console.error("Error loading profile", err));
  }, []);

  // `silent` evita el spinner de pantalla completa: se usa para recargar tras
  // guardar un producto, donde reemplazar toda la grilla por el spinner
  // colapsa la altura de la página y el navegador tira el scroll arriba,
  // obligando a volver a bajar cada vez que se edita un producto.
  const loadProducts = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      console.log('🔵 [ProductManagement] Loading products...', silent ? '(silent)' : '');
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
      if (!silent) setLoading(false);
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

  const handleOpenDialog = (product?: Product) => {
    setNameParts(partesVacias);
    if (product) {
      setEditingProduct(product);

      setFormData({
        name: product.name,
        description: product.description || '',
        price: formatCLP(product.price, false),
        stock: product.stock.toString(),
        minStock: product.minStock !== undefined ? product.minStock.toString() : '',
        category: product.category || 'General',
        categoryId: product.categoryId || '',
        sku: product.sku || '',
        imageUrl: product.imageUrl || '',
        productionAreaId: product.productionAreaId || '',
        unlimitedStock: product.unlimitedStock === true || product.stock === -1,
        allowDecimal: product.allowDecimal === true
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
    setNameParts(partesVacias);
  };

  const abrirReceta = () => {
    if (!editingProduct) return;
    setRecetaDe(editingProduct);
    // Ojo: NO handleCloseDialog(), que además borra editingProduct, formData y
    // nameParts. Acá solo se baja la bandera; Radix desmonta el contenido del
    // diálogo pero el estado vive en este componente y vuelve intacto, incluidos
    // los campos a medio escribir.
    setIsDialogOpen(false);
  };

  const cerrarReceta = () => {
    setRecetaDe(null);
    setIsDialogOpen(true);
    // Silencioso para no perder el scroll de la grilla. Refresca `products`, y
    // con eso el contador de ingredientes del diálogo.
    // No tocar formData: conserva a propósito lo que el usuario no ha guardado.
    loadProducts(true);
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
    // parseFloat acá también: con parseInt, "-0.4" se leía como -0 y pasaba la
    // validación, y ahora que el valor se guarda con decimales entraría negativo.
    if (!formData.unlimitedStock && (!formData.stock || parseFloat(formData.stock) < 0)) {
      toast.error('El stock debe ser mayor o igual a 0');
      return;
    }

    try {
      setSubmitting(true);

      // El stock solo se manda si de verdad se tocó en este formulario (o es un
      // producto nuevo). Si no, este PUT viajaría con el número con el que se
      // abrió el diálogo, y pisaría un stock que haya cambiado por otro lado
      // mientras estuvo abierto (un "Ajustar stock", un pedido, otra sesión) sin
      // que nadie lo haya pedido. StockAdjustDialog es el único lugar pensado
      // para tocar stock, mandando solo { stock, modo }; este formulario general
      // no debe pisarlo de rebote por editar, por ejemplo, la categoría.
      const productData = construirPayloadProducto({
        formData,
        editingProduct,
        priceValue,
      });

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
        // `stock` queda opcional en el tipo de productData porque el spread de
        // más arriba es condicional (así el guardado de edición no pisa el stock
        // con un valor viejo). Pero en esta rama `editingProduct` es null, así que
        // `stockSeToco` da `true` siempre (ver su definición) y `stock` SIEMPRE
        // está presente acá: el assert solo hace explícito para TS lo que ya es
        // cierto en runtime, sin tocar el tipo de Product ni el de la API.
        const created = await productsAPI.create(accessToken, productData as typeof productData & { stock: number });
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
      // Reload everything to ensure local state matches server exactly (including
      // ingredients). Silencioso para no perder la posición de scroll en la grilla.
      loadProducts(true);
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

      // Si el borrado se disparó desde el diálogo de edición, hay que cerrarlo:
      // si no, queda un formulario abierto sobre un producto que ya no existe y
      // guardarlo devolvería un error del servidor.
      if (editingProduct?.id === isDeleting.id) {
        handleCloseDialog();
      }

      setIsDeleting(null);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error(error.message || 'Error al eliminar producto');
    }
  };

  const handleAjustarStock = async (nuevoStock: number, modo: ModoAjuste) => {
    if (!stockProduct) return;
    try {
      setSavingStock(true);
      // Se manda SOLO el stock + el modo: el backend actualiza únicamente los
      // campos presentes, así que la receta y el resto del producto quedan
      // intactos (y no se dispara el chequeo de permisos de recetas).
      // El `modo` no modifica el producto: le dice al backend si esto fue una
      // reposición, una merma o una corrección de conteo.
      const actualizado = await productsAPI.update(accessToken, stockProduct.id, { stock: nuevoStock, modo });
      setProducts(products.map(p => (p.id === actualizado.id ? actualizado : p)));

      // Si el ajuste salió del diálogo de edición, ese formulario sigue mostrando
      // el stock viejo. Hay que sincronizar LAS DOS cosas: lo que se ve
      // (formData.stock) y la referencia contra la que se compara al guardar
      // (editingProduct). Si solo se actualizara una, guardar volvería a mandar
      // un stock desactualizado y pisaría este ajuste.
      if (editingProduct?.id === actualizado.id) {
        setEditingProduct(actualizado);
        setFormData(prev => ({ ...prev, stock: actualizado.stock.toString() }));
      }

      toast.success(`Stock de "${actualizado.name}" actualizado a ${nuevoStock}`);
      setStockProduct(null);
    } catch (error: any) {
      console.error('Error ajustando stock:', error);
      // El diálogo queda abierto con lo cargado, para poder reintentar.
      toast.error(error.message || 'Error al actualizar el stock');
    } finally {
      setSavingStock(false);
    }
  };

  // El filtro del listado va por id y no por nombre. Por nombre fallaba de dos
  // maneras: elegir una categoría padre no traía NADA si todos los productos
  // están etiquetados en sus subcategorías (y el estado vacío afirmaba que no
  // hay productos), y dos subcategorías homónimas bajo padres distintos —los
  // nombres no son únicos y "Bebidas" o "Varios" se repiten solos— quedaban
  // mezcladas en un mismo filtro.
  const idsDelFiltro = selectedCategoryFilter === 'all'
    ? null
    : idsDeCategoriaConHijas(categories, selectedCategoryFilter);

  // El disparador muestra SIEMPRE la palabra "Categoría" (se renderiza aparte) y
  // este valor al lado. Antes este texto REEMPLAZABA a "Filtrar", así que el
  // control nunca decía qué filtraba: o decía "Filtrar" (vago) o el nombre de una
  // categoría (sin contexto).
  const nombreDelFiltro = selectedCategoryFilter === 'all'
    ? 'Todas'
    : (categories.find(c => c.id === selectedCategoryFilter)?.name || 'Todas');

  // El estado vacío no puede mirar solo la búsqueda: filtrar por una categoría
  // sin productos (con el buscador vacío) también da una lista vacía, y antes
  // el mensaje decía "no hay productos aún" e invitaba a crear el primero
  // aunque el catálogo tuviera cientos. Mismo problema que ya se corrigió a
  // nivel de filtro (ver comentario de idsDelFiltro), pero acá no había llegado.
  const hayFiltroActivo = !!searchQuery || selectedCategoryFilter !== 'all';

  // El contador sale de `products` y no de `formData`: así el loadProducts(true)
  // que corre al cerrar la capa de receta lo refresca solo, sin cablear nada más.
  const recetaCount = editingProduct
    ? (products.find(p => p.id === editingProduct.id)?.ingredients?.length ?? 0)
    : 0;

  const filteredProducts = products.filter(p => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q);

    const matchesCategory = idsDelFiltro === null
      || (!!p.categoryId && idsDelFiltro.has(p.categoryId));

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
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
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
              {/* `sm:w-auto` y `sm:shrink-0` no existen en el CSS precompilado
                  (verificado: 0 matches), así que no se puede alternar el ancho
                  por breakpoint con clases ni con `style` (los estilos inline de
                  React no soportan media queries). En su lugar se usa el
                  comportamiento por defecto del flex: el contenedor no fija
                  "align-items", así que su valor inicial "stretch" ya estira
                  este div a lo ancho completo cuando el layout es columna
                  (celular, "flex-col") y "shrink-0" evita que se comprima
                  cuando el layout es fila (escritorio, "sm:flex-row") — el
                  mismo resultado que buscaba "w-full sm:w-auto sm:shrink-0". */}
              <div className="shrink-0">
                <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                  {/* El ancho va inline y no por `w-[...]`: las clases de valor
                      arbitrario no existen en el CSS precompilado de este proyecto.
                      Las que había acá antes (w-[130px] sm:w-[180px]) no hacían nada. */}
                  <SelectTrigger
                    className="h-11 bg-white border-[#CBD5E1] w-full"
                    style={{ borderRadius: '10px', minWidth: '190px' }}
                  >
                    <div className="flex items-center gap-2 text-gray-600 overflow-hidden">
                      <Filter className="w-4 h-4 shrink-0" />
                      {/* "Categoría" no se trunca nunca: es lo que le dice al
                          usuario qué hace este control. Se trunca solo el valor. */}
                      <span className="font-medium text-sm shrink-0">Categoría</span>
                      <span className="text-sm truncate">· {nombreDelFiltro}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {agruparPorPadre(categories).map(({ categoria, hijas }) => (
                      <SelectGroup key={categoria.id}>
                        <SelectItem value={categoria.id}>{categoria.name}</SelectItem>
                        {hijas.map((hija) => (
                          <SelectItem key={hija.id} value={hija.id} style={{ paddingLeft: '2.25rem' }}>
                            {hija.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
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
                  {hayFiltroActivo ? 'No se encontraron productos' : 'No hay productos aún'}
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  {hayFiltroActivo ? 'Intenta con otra búsqueda o categoría' : 'Crea tu primer producto para comenzar'}
                </p>
                {!hayFiltroActivo && (
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
          <>
          {/* Estilo local para el desktop grande: subir tamaño de imagen/texto y mostrar
              el botón de Stock solo desde 1024px necesita reglas @media que Tailwind no
              tiene precompiladas acá (ver nota más abajo sobre clases arbitrarias que no
              existen). Estas propiedades quedan TODAS acá adentro (no en `style` inline
              del elemento): un `style` inline le gana en especificidad a cualquier clase
              externa, así que si la altura o el tamaño de fuente quedaran mitad en
              `style` y mitad acá, la regla de acá nunca se aplicaría. */}
          <style>{`
            .tarjeta-producto-img { height: 112px; }
            .tarjeta-producto-nombre { font-size: 12px; font-weight: 600; min-height: 30px; }
            .tarjeta-producto-precio { font-size: 13px; font-weight: 700; }
            .tarjeta-producto-stock-btn { display: none; }
            @media (min-width: 1024px) {
              .tarjeta-producto-img { height: 220px; }
              .tarjeta-producto-nombre { font-size: 15px; min-height: 38px; }
              .tarjeta-producto-precio { font-size: 18px; }
              .tarjeta-producto-stock-btn { display: inline-flex; }
            }
          `}</style>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3">
            {filteredProducts.map((product, index) => {
              const esIlimitado = product.unlimitedStock || product.stock === -1;
              const colorEstado = esIlimitado ? '#6B7280'
                : product.stock === 0 ? '#EF4444'
                : product.stock < 10 ? '#F59E0B'
                : '#10B981';

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  // El delay se acota: con 249 productos, escalonar cada uno
                  // dejaría los últimos apareciendo más de 10 segundos después.
                  transition={{ delay: Math.min(index * 0.02, 0.4) }}
                >
                  {/* Todo el cuadrado abre Editar: los tres botones que había antes
                      no entran en ~150px de ancho, así que Ajustar Stock y Eliminar
                      viven ahora dentro de ese diálogo. */}
                  {/* La tarjeta reemplazó a tres botones (Editar/Ajustar Stock/Eliminar)
                      que eran focuseables por naturaleza. Como ahora es la ÚNICA forma
                      de llegar a esas acciones, necesita comportarse como un botón real
                      para teclado y lectores de pantalla: rol, foco y activación con
                      Enter/Espacio (el div no los da gratis). */}
                  <Card
                    onClick={() => handleOpenDialog(product)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenDialog(product);
                      }
                    }}
                    className="border-2 hover:shadow-lg transition-all cursor-pointer h-full overflow-hidden"
                    style={{
                      borderRadius: '12px',
                      borderTopWidth: '3px',
                      borderTopColor: colorEstado,
                      borderLeftColor: '#E0EDFF',
                      borderRightColor: '#E0EDFF',
                      borderBottomColor: '#E0EDFF'
                    }}
                  >
                    <CardContent className="p-2">
                      {/* Altura fija y no `aspect-square`: esa clase NO existe en el
                          CSS precompilado de este proyecto y no haría nada. */}
                      {/* El fondo va inline: `bg-gray-100/50` (la que usaba la
                          tarjeta vieja) NO existe en el CSS y nunca se aplicó. */}
                      <div
                        className="tarjeta-producto-img w-full rounded-lg mb-1 overflow-hidden flex items-center justify-center"
                        style={{ background: 'rgba(243, 244, 246, 0.5)' }}
                      >
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Package className="w-8 h-8 text-blue-300" />
                        )}
                      </div>

                      <h3 className="tarjeta-producto-nombre text-[#0047BA] line-clamp-2 leading-tight mb-1">
                        {product.name}
                      </h3>

                      <div className="flex items-center justify-between gap-2">
                        <span className="tarjeta-producto-precio text-[#0047BA]">
                          {formatCLP(product.price)}
                        </span>
                        {/* La etiqueta "Stock" va separada del número y en gris: sin ella,
                            un número de 10px pelado no se leía como stock a simple vista.
                            El número sube a text-xs (12px) para que se note más.
                            No se muestra la etiqueta cuando el texto ya es "Sin stock":
                            la palabra "stock" ya está ahí, y "Stock Sin stock" se lee mal. */}
                        <span className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                          {!(!esIlimitado && product.stock === 0) && (
                            <span className="text-[10px] text-gray-500">Stock</span>
                          )}
                          <span
                            className="text-xs font-medium truncate"
                            style={{ color: colorEstado }}
                          >
                            {esIlimitado ? '∞' : product.stock === 0 ? 'Sin stock' : product.stock}
                          </span>
                        </span>
                      </div>

                      {/* Solo visible desde 1024px (ver .tarjeta-producto-stock-btn más
                          arriba): en celular el cuadrado sigue chico a propósito, y
                          Ajustar Stock ya está a un toque de distancia dentro de Editar.
                          `stopPropagation` es obligatorio: el botón vive adentro de la
                          tarjeta clickeable que abre Editar, y sin esto un click acá
                          abriría los dos diálogos a la vez. */}
                      {!esIlimitado && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStockProduct(product);
                          }}
                          className="tarjeta-producto-stock-btn w-full items-center justify-center gap-1 mt-2 py-1 rounded-md border-[#0059FF] text-[#0059FF] hover:bg-blue-50 text-xs"
                        >
                          <BoxIcon className="w-4 h-4" />
                          Stock
                        </button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
          </>
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
                {editingProduct ? (
                  <>
                    <Label htmlFor="name">Nombre del Producto *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: Cajas de Cartón Premium"
                      required
                    />
                  </>
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

              <div>
                <Label htmlFor="min-stock">Stock mínimo</Label>
                <Input
                  id="min-stock"
                  type="number"
                  min="0"
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                  placeholder="Ej: 10"
                  disabled={formData.unlimitedStock}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cuando el stock llegue a este número, el panel de Distribuidora lo marca como bajo. Si lo dejás vacío se usa 10.
                </p>
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
                    {agruparPorPadre(categories).map(({ categoria, hijas }) => (
                      <SelectGroup key={categoria.id}>
                        <SelectItem value={categoria.id}>{categoria.name}</SelectItem>
                        {hijas.map((hija) => (
                          <SelectItem key={hija.id} value={hija.id} style={{ paddingLeft: '2.25rem' }}>
                            {hija.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
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
                        {recetaCount} ingrediente{recetaCount !== 1 ? 's' : ''} configurado{recetaCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {/* Solo al editar: un producto que todavía no existe no tiene
                        receta que configurar, y el botón sacaba del formulario
                        perdiendo lo que se llevara escrito. */}
                    {editingProduct && (
                      <Button type="button" variant="outline" onClick={abrirReceta}>
                        Configurar receta
                      </Button>
                    )}
                  </div>
                </div>
              </div>

            </div>

            <DialogFooter>
              {/* Estas dos acciones vivían en la tarjeta del listado. Con la grilla
                  compacta ya no entran ahí, así que se movieron acá.
                  `type="button"` es obligatorio: el contenido del diálogo es un
                  <form> y sin eso dispararían un submit. */}
              {editingProduct && (
                <>
                  {!(editingProduct.unlimitedStock || editingProduct.stock === -1) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStockProduct(editingProduct)}
                      disabled={submitting}
                      className="border-[#0059FF] text-[#0059FF] hover:bg-blue-50"
                    >
                      <BoxIcon className="w-4 h-4 mr-1" />
                      Ajustar Stock
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDeleting(editingProduct)}
                    disabled={submitting}
                    className="border-red-500 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Eliminar
                  </Button>
                </>
              )}
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

      <StockAdjustDialog
        open={!!stockProduct}
        onOpenChange={(abierto) => { if (!abierto) setStockProduct(null); }}
        product={stockProduct}
        onConfirm={handleAjustarStock}
        saving={savingStock}
      />

      {/* z-50 y no más: el CSS de Tailwind está precompilado y z-50 es el máximo
          que existe. No compite con el diálogo porque abrirReceta lo cierra. */}
      {recetaDe && (
        // overscrollBehavior va inline porque `overscroll-*` no está compilada en
        // src/index.css (no existe como clase). Sin esto, al llegar al final del
        // scroll de la capa el gesto encadena al document, que Radix ya dejó
        // scrolleable al cerrar el diálogo, y mueve la grilla de atrás en silencio.
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-white"
          style={{ overscrollBehavior: 'contain' }}
        >
          <ProductIngredientConfig
            initialProduct={recetaDe}
            onBack={cerrarReceta}
            accessToken={accessToken}
          />
        </div>
      )}
    </div >
  );
}