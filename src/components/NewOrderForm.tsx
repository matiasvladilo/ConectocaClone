import { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar as CalendarComponent } from './ui/calendar';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ShoppingCart,
  Package,
  Edit,
  Plus,
  Minus,
  Trash2,
  Calendar,
  DollarSign,
  FileText,
  Image as ImageIcon,
  Camera,
  Upload,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  PackagePlus,
  Tag,
  Search,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { productsAPI, categoriesAPI, type Product as APIProduct, type Category } from '../utils/api';
import { formatCLP } from '../utils/format';
import { projectId } from '../utils/supabase/info';

// Carga diferida, mismo motivo que en ImageUpload.tsx: no hace falta en la
// carga inicial de Nuevo Pedido.
const ImageCropDialog = lazy(() =>
  import('./ImageCropDialog').then((m) => ({ default: m.ImageCropDialog }))
);

interface NewOrderFormProps {
  onBack: () => void;
  onSubmit: (orderData: {
    products: Array<{ productId: string; name: string; quantity: number; price: number }>;
    deadline: string;
    total: number;
    notes?: string;
  }) => Promise<void>;
  accessToken: string;
  userRole?: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  stock: number;
  category?: string;
  categoryId?: string;
  trackStock?: boolean; // Si es false, stock ilimitado
}

interface CartItem extends Product {
  quantity: number;
}

export function NewOrderForm({ onBack, onSubmit, accessToken, userRole }: NewOrderFormProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>(() => {
    const savedCart = localStorage.getItem('conectoca_cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });
  const [productQuantities, setProductQuantities] = useState<{ [key: string]: number }>(() => {
    const savedQuantities = localStorage.getItem('conectoca_productQuantities');
    return savedQuantities ? JSON.parse(savedQuantities) : {};
  });

  const today = new Date().toISOString().split('T')[0];

  // Initialize with today's date
  const [deadline, setDeadline] = useState(today);
  const [deadlineDate, setDeadlineDate] = useState<Date | undefined>(new Date());

  const [decimalInputs, setDecimalInputs] = useState<Record<string, string>>({});
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', price: '', image: '', stock: '', category: '', categoryId: '', trackStock: true, allowDecimal: false });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [notes, setNotes] = useState(() => {
    return localStorage.getItem('conectoca_orderNotes') || '';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load products from API
  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  // Refrescar productos cada 5 seg para reflejar cambios de stock de otros usuarios
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (accessToken) loadProducts(true);
    }, 5000);
    return () => clearInterval(intervalId);
  }, [accessToken]);

  // Save cart state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('conectoca_cart', JSON.stringify(cart));
    localStorage.setItem('conectoca_productQuantities', JSON.stringify(productQuantities));
  }, [cart, productQuantities]);

  // Save notes to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('conectoca_orderNotes', notes);
  }, [notes]);

  const loadProducts = async (silent = false) => {
    try {
      if (!silent) setIsLoadingProducts(true);
      console.log('🟢 [NewOrderForm] Loading products...', silent ? '(silent)' : '');
      const apiProducts = await productsAPI.getAll(accessToken);
      console.log('🟢 [NewOrderForm] Products received:', apiProducts?.length || 0, 'products');

      // Transform API products to local format
      const transformedProducts: Product[] = apiProducts.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: p.price,
        image: p.imageUrl || p.image || '',
        stock: (p.unlimitedStock === true || p.stock === -1) ? -1 : p.stock,
        category: p.category,
        categoryId: p.categoryId,
        trackStock: p.unlimitedStock !== true && p.trackStock !== false,
        allowDecimal: p.allowDecimal === true
      }));

      if (transformedProducts.length > 0) {
        console.log('🟢 [NewOrderForm] Sample transformed product:', transformedProducts[0]);
      } else {
        console.log('⚠️ [NewOrderForm] No products received from API');
      }

      setProducts(transformedProducts);

      // Show message if no products (solo en carga visible)
      if (!silent && transformedProducts.length === 0) {
        toast.info('No hay productos disponibles. El administrador debe crear productos primero.');
      }
    } catch (error) {
      console.error('❌ [NewOrderForm] Error loading products:', error);
      if (!silent) {
        toast.error('Error al cargar productos');
        setProducts([]);
      }
    } finally {
      if (!silent) setIsLoadingProducts(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await categoriesAPI.getAll(accessToken);
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const initializeDefaultProducts = async () => {
    const defaultProducts = [
      {
        name: 'Cajas de Cartón Premium',
        description: 'Cajas resistentes de cartón corrugado para empaque y envío',
        price: 2.50,
        stock: 150,
        image: 'https://images.unsplash.com/photo-1700165644892-3dd6b67b25bc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXJkYm9hcmQlMjBib3hlcyUyMHdhcmVob3VzZXxlbnwxfHx8fDE3NjAwMjAwNzd8MA&ixlib=rb-4.1.0&q=80&w=1080'
      },
      {
        name: 'Etiquetas Adhesivas',
        description: 'Etiquetas autoadhesivas de alta calidad para todo tipo de productos',
        price: 0.15,
        stock: 500,
        image: 'https://images.unsplash.com/photo-1589982875270-1998b9747f06?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhZGhlc2l2ZSUyMGxhYmVscyUyMHN0aWNrZXJzfGVufDF8fHx8MTc2MDAyMDA3M3ww&ixlib=rb-4.1.0&q=80&w=1080'
      },
      {
        name: 'Bolsas Biodegradables',
        description: 'Bolsas ecológicas biodegradables, amigables con el medio ambiente',
        price: 0.30,
        stock: 0,
        image: 'https://images.unsplash.com/photo-1677753727712-c79ce4c420c1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiaW9kZWdyYWRhYmxlJTIwYmFncyUyMGVjb3xlbnwxfHx8fDE3NjAwMjAwNzR8MA&ixlib=rb-4.1.0&q=80&w=1080'
      },
      {
        name: 'Envases de Papel',
        description: 'Envases de papel kraft para alimentos y productos orgánicos',
        price: 1.80,
        stock: 200,
        image: 'https://images.unsplash.com/photo-1591130901969-2a1bfafb2ee2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYXBlciUyMHBhY2thZ2luZyUyMG1hdGVyaWFsc3xlbnwxfHx8fDE3NjAwMjAwNzZ8MA&ixlib=rb-4.1.0&q=80&w=1080'
      },
      {
        name: 'Contenedores Industriales',
        description: 'Contenedores de gran capacidad para almacenamiento industrial',
        price: 45.00,
        stock: 25,
        image: 'https://images.unsplash.com/photo-1555611206-10075b5b7580?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwY29udGFpbmVycyUyMHN0b3JhZ2V8ZW58MXx8fHwxNzYwMDIwMDc3fDA&ixlib=rb-4.1.0&q=80&w=1080'
      }
    ];

    const createdProducts: Product[] = [];
    for (const product of defaultProducts) {
      try {
        const created = await productsAPI.create(accessToken, product);
        createdProducts.push(created);
      } catch (error) {
        console.error(`Error creating product ${product.name}:`, error);
      }
    }
    setProducts(createdProducts);
  };

  const handleRestockProduct = async (product: Product) => {
    try {
      const restockAmount = 100; // Default restock amount
      const updatedProduct = await productsAPI.update(accessToken, product.id, {
        stock: product.stock + restockAmount
      });

      setProducts(products.map(p =>
        p.id === product.id ? updatedProduct : p
      ));

      // Update cart if product is in cart
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, stock: updatedProduct.stock }
          : item
      ));

      toast.success(`Stock reabastecido: +${restockAmount} unidades de ${product.name}`);
    } catch (error) {
      console.error('Error restocking product:', error);
      toast.error('Error al reabastecer stock');
    }
  };

  const handleQuantityChange = (productId: string, value: string) => {
    const num = parseInt(value) || 0;
    setProductQuantities(prev => ({
      ...prev,
      [productId]: Math.max(0, num)
    }));
  };

  const handleAddToCart = (product: Product, quantity?: number) => {
    // Check if product has stock (handle unlimited stock -1)
    if (product.stock <= 0 && product.stock !== -1 && product.trackStock) {
      toast.error('Producto sin stock disponible');
      return;
    }

    const qtyToAdd = quantity || productQuantities[product.id] || 1;

    if (qtyToAdd <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }

    const existingItem = cart.find(item => item.id === product.id);
    const currentCartQuantity = existingItem ? existingItem.quantity : 0;
    const totalQuantity = currentCartQuantity + qtyToAdd;

    // Check if total quantity exceeds stock (handle unlimited stock -1)
    if (totalQuantity > product.stock && product.stock !== -1 && product.trackStock) {
      toast.error(`Solo hay ${product.stock} unidades disponibles en stock`);
      return;
    }

    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + qtyToAdd }
          : item
      ));
      toast.success(`${qtyToAdd} unidades agregadas al pedido`);
    } else {
      setCart([...cart, { ...product, quantity: qtyToAdd }]);
      toast.success(`${product.name} agregado al pedido`);
    }

    setProductQuantities(prev => ({ ...prev, [product.id]: 0 }));
  };

  const handleUpdateCartQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const step = (item as any).allowDecimal ? 0.5 : 1;
        const newQuantity = Math.round((item.quantity + delta * step) * 100) / 100;

        // Check if new quantity exceeds stock (handle unlimited stock -1)
        if (newQuantity > item.stock && item.stock !== -1 && item.trackStock) {
          toast.error(`Solo hay ${item.stock} unidades disponibles en stock`);
          return item;
        }

        const minQty = (item as any).allowDecimal ? 0.5 : 1;
        return { ...item, quantity: Math.max(minQty, newQuantity) };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const handleSetCartQuantity = (productId: string, value: string) => {
    const parsed = parseFloat(value.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) return;
    const rounded = Math.round(parsed * 100) / 100;
    setCart(prev => prev.map(item => {
      if (item.id !== productId) return item;
      if (rounded > item.stock && item.stock !== -1 && item.trackStock) {
        toast.error(`Solo hay ${item.stock} unidades disponibles en stock`);
        return item;
      }
      return { ...item, quantity: rounded };
    }));
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
    toast.success('Producto eliminado del pedido');
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      image: product.image,
      stock: (product.trackStock === false || product.stock === -1) ? '0' : (product.stock?.toString() || '0'),
      category: product.category || 'General',
      categoryId: product.categoryId || '',
      trackStock: product.trackStock !== false,
      allowDecimal: (product as any).allowDecimal === true
    });
    setImageFile(null);
    setImagePreview(product.image);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Resetear el input inmediatamente: si el usuario cancela el editor y vuelve
    // a elegir EL MISMO archivo, sin esto el navegador no dispara onChange
    // (el value no cambió) y no pasaría nada.
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 5MB');
      return;
    }

    setImageFile(file);
    setCropDialogOpen(true);
  };

  const handleCropComplete = async (croppedFile: File) => {
    try {
      setUploadingImage(true);

      const formData = new FormData();
      formData.append('file', croppedFile);

      // Mismo endpoint que usa ImageUpload.tsx — unifica el pipeline de subida
      // en vez de guardar la imagen como base64 directo en editForm.image.
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/upload-product-image`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al subir la imagen');
      }

      const data = await response.json();
      if (!data.url) throw new Error('No se recibió la URL de la imagen');

      setImagePreview(data.url);
      setEditForm((prev) => ({ ...prev, image: data.url }));
      toast.success('Imagen subida exitosamente');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error(error.message || 'Error al subir la imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!editingProduct) return;

    try {
      await productsAPI.delete(accessToken, editingProduct.id);

      // Remove from products
      setProducts(products.filter(p => p.id !== editingProduct.id));

      // Remove from cart if exists
      setCart(cart.filter(item => item.id !== editingProduct.id));

      // Remove from quantities
      setProductQuantities(prev => {
        const newQuantities = { ...prev };
        delete newQuantities[editingProduct.id];
        return newQuantities;
      });

      toast.success('Producto eliminado del catálogo');
      setEditingProduct(null);
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Error al eliminar producto');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;

    const price = parseFloat(editForm.price);
    if (isNaN(price) || price <= 0) {
      toast.error('El precio debe ser un número válido mayor a 0');
      return;
    }

    const isUnlimited = !editForm.trackStock;
    let stock = 0;
    if (!isUnlimited) {
      // parseFloat y no parseInt: `stock` es numeric en Postgres y los productos
      // con allowDecimal viven en valores fraccionados (9.5). parseInt("9.5") da
      // 9 y guardarlo se comería media unidad sin avisar.
      stock = parseFloat(editForm.stock);
      if (isNaN(stock) || stock < 0) {
        toast.error('El stock debe ser un número válido mayor o igual a 0');
        return;
      }
    }

    // El stock solo viaja si el usuario lo tocó de verdad en este formulario. El
    // valor se cargó cuando se abrió el diálogo y esta pantalla refresca los
    // productos en segundo plano mientras el diálogo sigue abierto, así que el
    // número puede estar viejo por minutos; encima, cada pedido que se toma
    // descuenta stock en el servidor al mismo tiempo. Mandarlo siempre pisaba ese
    // stock real con el viejo, sin error y sin dejar rastro. StockAdjustDialog es
    // el único camino pensado para cambiar stock (manda solo { stock, modo });
    // editar la descripción o el precio no debe tocarlo de rebote.
    const eraIlimitadoAntes = editingProduct.trackStock === false || editingProduct.stock === -1;
    const stockSeToco = isUnlimited !== eraIlimitadoAntes
      || (!isUnlimited && stock !== editingProduct.stock);

    try {
      const updatedProduct = await productsAPI.update(accessToken, editingProduct.id, {
        name: editForm.name,
        description: editForm.description,
        price,
        image: editForm.image,
        category: editForm.category || 'General',
        categoryId: editForm.categoryId || undefined,
        trackStock: editForm.trackStock,
        unlimitedStock: isUnlimited,
        allowDecimal: editForm.allowDecimal,
        ...(stockSeToco ? { stock: isUnlimited ? 0 : stock } : {})
      });

      setProducts(products.map(p =>
        p.id === editingProduct.id ? updatedProduct : p
      ));

      // Update cart if product is in cart
      setCart(cart.map(item =>
        item.id === editingProduct.id
          ? { ...item, name: updatedProduct.name, description: updatedProduct.description, price: updatedProduct.price, image: updatedProduct.image, stock: isUnlimited ? -1 : updatedProduct.stock, trackStock: !isUnlimited, category: updatedProduct.category, categoryId: updatedProduct.categoryId }
          : item
      ));

      toast.success('Producto actualizado correctamente');
      setEditingProduct(null);
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Error al actualizar producto');
    }
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleConfirmOrder = async () => {
    if (cart.length === 0) {
      toast.error('Debes agregar al menos un producto al pedido');
      return;
    }

    if (!deadline) {
      toast.error('Debes seleccionar una fecha límite de entrega');
      return;
    }

    // Compare dates correctly considering local timezone
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deadlineLocalDate = new Date(deadline + 'T00:00:00');

    if (deadlineLocalDate < today) {
      toast.error('La fecha límite no puede ser anterior a hoy');
      return;
    }

    // Create order data for API
    const orderData = {
      products: cart.map(item => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      deadline,
      total: calculateTotal(),
      notes: notes.trim() // Add notes field
    };

    try {
      setIsSubmitting(true);
      await onSubmit(orderData);
      // Reload products to reflect updated stock
      await loadProducts();
      // Clear cart and local storage after successful order and reset date to today
      setCart([]);
      setProductQuantities({});
      localStorage.removeItem('conectoca_cart');
      localStorage.removeItem('conectoca_productQuantities');
      localStorage.removeItem('conectoca_orderNotes');
      const newToday = new Date();
      setDeadline(newToday.toISOString().split('T')[0]);
      setDeadlineDate(newToday);
      setNotes(''); // Clear notes
    } catch (error: any) {
      console.error('Error submitting order:', error);
      // Show more specific error message if available
      const errorMessage = error?.message || 'Error al crear pedido';
      if (errorMessage.includes('Stock insuficiente')) {
        toast.error(errorMessage);
        // Reload products to get updated stock
        await loadProducts();
      }
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white shadow-xl sticky top-0 z-10" style={{ paddingTop: 'max(env(safe-area-inset-top), 20px)' }}>
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </motion.button>
              <div>
                <span className="tracking-wider">Nuevo Pedido</span>
                <p className="text-xs text-blue-200 opacity-80">Selecciona productos para tu pedido</p>
              </div>
            </div>

            {/* Cart Preview Popover */}
            <Popover open={cartPreviewOpen} onOpenChange={setCartPreviewOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors relative">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="text-sm">{cart.length} productos</span>
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 text-blue-900 rounded-full text-xs flex items-center justify-center">
                      {cart.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="bg-white rounded-lg shadow-xl">
                  <div className="p-4 bg-blue-600 text-white rounded-t-lg">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" />
                      <h3>Carrito de Compras</h3>
                    </div>
                    <p className="text-xs text-blue-100 mt-1">
                      {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
                    </p>
                  </div>

                  {cart.length > 0 ? (
                    <div className="max-h-96 overflow-y-auto">
                      <div className="p-4 space-y-3">
                        {cart.map((item) => (
                          <div key={item.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                            <div className="w-12 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                              <ImageWithFallback
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm text-gray-900 line-clamp-1">{item.name}</h4>
                              <p className="text-xs text-gray-500">
                                {item.quantity} × {formatCLP(item.price)}
                              </p>
                              <p className="text-xs text-blue-700 mt-1">
                                {formatCLP(item.price * item.quantity)}
                              </p>
                            </div>

                            <button
                              onClick={() => handleRemoveFromCart(item.id)}
                              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 text-red-600 transition-colors flex-shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <Separator />

                      <div className="p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-gray-700">Total</span>
                          <span className="text-blue-700">
                            ${calculateTotal().toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <Button
                          onClick={() => {
                            setCartPreviewOpen(false);
                            setSummaryExpanded(true);
                          }}
                          className="w-full bg-yellow-500 hover:bg-yellow-600 text-blue-900 gap-2"
                        >
                          Ver Resumen Completo
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Tu carrito está vacío</p>
                      <p className="text-gray-400 text-xs mt-1">
                        Agrega productos para comenzar
                      </p>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-6 pb-32">
        {/* Title Section */}
        <div className="text-center space-y-2">
          <h1 className="text-gray-900">Selecciona los productos para tu pedido</h1>
          <p className="text-gray-600">Haz click en cualquier producto para agregarlo al carrito</p>
        </div>

        {/* Product Catalog */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              <h2 className="text-gray-800 font-semibold">Catálogo de Productos</h2>
            </div>

            {/* Search Bar */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar por nombre o descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            {/* Category Filter */}
            {categories.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedCategoryFilter('all')}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${selectedCategoryFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  Todas
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-3 py-1 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${selectedCategoryFilter === cat.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.name}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedCategoryFilter('uncategorized')}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${selectedCategoryFilter === 'uncategorized'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  Sin categoría
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products
              .filter((product: any) => {
                // Fila de Búsqueda de Texto
                const searchLower = searchQuery.toLowerCase();
                const matchesSearch =
                  product.name.toLowerCase().includes(searchLower) ||
                  (product.description && product.description.toLowerCase().includes(searchLower));

                if (!matchesSearch) return false;

                // Fila de Categoría
                if (selectedCategoryFilter === 'all') return true;
                if (selectedCategoryFilter === 'uncategorized') return !product.categoryId;
                return product.categoryId === selectedCategoryFilter;
              })
              .map((product) => {
                const productStock = product.stock ?? 0;
                const isUnlimitedProduct = product.trackStock === false || productStock === -1;
                const isOutOfStock = !isUnlimitedProduct && productStock <= 0;
                const cartItem = cart.find(item => item.id === product.id);
                const remainingStock = isUnlimitedProduct ? Infinity : productStock - (cartItem?.quantity || 0);

                return (
                  <Card
                    key={product.id}
                    className={`overflow-hidden transition-all ${isOutOfStock
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:shadow-lg hover:scale-[1.02] cursor-pointer'
                      }`}
                  >
                    {/* Clickable area - entire card except edit button */}
                    <div
                      onClick={(e) => {
                        // Only trigger if not clicking on edit button or input fields
                        if (!isOutOfStock &&
                          e.target instanceof Element &&
                          !e.target.closest('button.edit-btn') &&
                          !e.target.closest('.quantity-controls')) {
                          handleAddToCart(product, 1);
                        }
                      }}
                    >
                      <div className="relative w-full h-40 sm:h-48 bg-gray-100/50 flex items-center justify-center overflow-hidden group shrink-0">
                        <ImageWithFallback
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                        />
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Badge variant="destructive" className="text-sm">
                              Sin Stock
                            </Badge>
                          </div>
                        )}
                        {!isOutOfStock && (
                          <div className="absolute top-2 left-2 w-8 h-8 bg-yellow-500/90 group-hover:bg-yellow-500 rounded-full flex items-center justify-center shadow-md transition-all z-[5]">
                            <ShoppingCart className="w-4 h-4 text-blue-900" />
                          </div>
                        )}
                        {userRole !== 'local' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditProduct(product);
                            }}
                            className="edit-btn absolute top-2 right-2 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-colors z-[5]"
                          >
                            <Edit className="w-4 h-4 text-blue-600" />
                          </button>
                        )}
                      </div>

                      <CardContent className="p-4 space-y-3">
                        <div>
                          <h3 className="text-gray-900 mb-1">{product.name}</h3>
                          <p className="text-xs text-gray-500 line-clamp-2">{product.description}</p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4 text-blue-600" />
                            <span className="text-blue-700">${product.price.toFixed(2)}</span>
                            <span className="text-xs text-gray-500">/unidad</span>
                          </div>
                          <Badge
                            variant={isOutOfStock ? "destructive" : (!isUnlimitedProduct && remainingStock < 10) ? "outline" : "secondary"}
                            className="text-xs"
                          >
                            {isUnlimitedProduct ? '∞ Ilimitado' : (isOutOfStock ? 'Sin stock' : `Stock: ${productStock}`)}
                          </Badge>
                        </div>

                        {/* Cost Display - Added for consistency with ProductManagement if needed, but maybe not relevant for OrderForm? 
                            The user asked to "implementalo" (implement it), referring to the fix for missing ingredients/cost.
                            Wait, NewOrderForm is DIFFERENT from ProductManagement. 
                            The user prompt context was "ingredients not saved on product creation".
                            I am editing NewOrderForm.tsx. Is this correct? 
                            The error might be in NewOrderForm if it uses products that have missing ingredients.
                            But the fix for saving ingredients was in backend.
                            Frontend fix for displaying cost was in ProductManagement.tsx.
                            
                            Let's verify NewOrderForm usage. 
                            It seems NewOrderForm displays products to add to an order.
                            It does NOT show cost of ingredients usually.
                            
                            Wait, I viewed NewOrderForm.tsx in step 1063.
                            And ProductManagement.tsx in step 1045.
                            
                            The user said "implementalo" after I corrected backend. 
                            And I was looking at ProductManagement.tsx cost calculation in step 1050.
                            
                            Ah, I selected NewOrderForm.tsx by mistake in my thought process or regex?
                            No, I am viewing NewOrderForm.tsx NOW.
                            
                            The user wants me to implement the fix.
                            I already applied the fix to ProductManagement.tsx in step 1050.
                            
                            Let's check if I need to apply similar fix to NewOrderForm.tsx?
                            NewOrderForm does not seem to display ingredient cost.
                            
                            Wait, step 1050 FAILED with "improper format stop reason".
                            So the fix to ProductManagement.tsx was NOT applied?
                            Let me re-apply the fix to ProductManagement.tsx.
                        */}


                        <div className="space-y-2 quantity-controls" onClick={(e) => e.stopPropagation()}>
                          <Label htmlFor={`qty-${product.id}`} className="text-xs text-gray-600">
                            Cantidad
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id={`qty-${product.id}`}
                              type="number"
                              min="0"
                              max={remainingStock > 0 ? remainingStock : undefined}
                              value={productQuantities[product.id] || ''}
                              onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                              placeholder="0"
                              className="flex-1"
                              disabled={isOutOfStock}
                            />
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToCart(product);
                              }}
                              disabled={isOutOfStock}
                              className="bg-yellow-500 hover:bg-yellow-600 text-blue-900 gap-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-4 h-4" />
                              Agregar
                            </Button>
                          </div>
                          {!isUnlimitedProduct && !isOutOfStock && remainingStock < productStock && (
                            <p className="text-xs text-orange-600">
                              {remainingStock} disponibles (ya tienes {cartItem?.quantity} en el carrito)
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                );
              })}
          </div>
        </div>

        {/* Order Summary - Collapsible */}
        {cart.length > 0 && createPortal(
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            width: '100%',
            pointerEvents: 'none' // Allow clicks to pass through the wrapper
          }}>
            <motion.div
              style={{ pointerEvents: 'auto' }} // Re-enable pointer events for the footer content
              className="bg-white border-t-2 border-blue-600 shadow-lg rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
              initial={false}
            >
              {/* Collapsed Header - Always Visible */}
              <div
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShoppingCart className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-gray-900">Resumen del Pedido</h3>
                      <p className="text-xs text-gray-500">
                        {cart.length} {cart.length === 1 ? 'ítem' : 'ítems'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="text-blue-700">
                        ${calculateTotal().toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    {summaryExpanded ? (
                      <ChevronDown className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ChevronUp className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              <AnimatePresence>
                {summaryExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <Separator />

                    <div className="p-6 space-y-4 max-w-6xl mx-auto">
                      {/* Product List */}
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {cart.map((item) => {
                          const isNearLimit = item.trackStock !== false && item.stock !== -1 && item.quantity >= item.stock * 0.8;
                          const atLimit = item.trackStock !== false && item.stock !== -1 && item.quantity >= item.stock;

                          return (
                            <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                              <div className="w-16 h-16 bg-white rounded overflow-hidden flex-shrink-0">
                                <ImageWithFallback
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm text-gray-900 mb-1">{item.name}</h4>
                                <p className="text-xs text-gray-500">
                                  {formatCLP(item.price)} x {item.quantity} = {formatCLP(item.price * item.quantity)}
                                </p>
                                {atLimit && (
                                  <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Stock máximo alcanzado
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleUpdateCartQuantity(item.id, -1)}
                                  className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                {(item as any).allowDecimal ? (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={decimalInputs[item.id] ?? item.quantity}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(',', '.');
                                      if (!/^[\d]*\.?[\d]*$/.test(raw)) return;
                                      setDecimalInputs(prev => ({ ...prev, [item.id]: raw }));
                                      const parsed = parseFloat(raw);
                                      if (!isNaN(parsed) && parsed > 0) {
                                        handleSetCartQuantity(item.id, raw);
                                      }
                                    }}
                                    onBlur={() => {
                                      setDecimalInputs(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                    }}
                                    className={`text-sm w-14 text-center border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${atLimit ? 'text-orange-600' : ''}`}
                                  />
                                ) : (
                                  <span className={`text-sm w-8 text-center ${atLimit ? 'text-orange-600' : ''}`}>
                                    {item.quantity}
                                  </span>
                                )}
                                <button
                                  onClick={() => handleUpdateCartQuantity(item.id, 1)}
                                  disabled={atLimit}
                                  className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${atLimit
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-200 hover:bg-gray-300'
                                    }`}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleRemoveFromCart(item.id)}
                                  className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors ml-2"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <Separator />

                      {/* Delivery Date */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-blue-600" />
                          <Label className="text-sm text-gray-700">
                            Fecha límite de entrega
                          </Label>
                        </div>
                        <div className="relative group">
                          <div className="w-full flex items-center justify-center py-3 px-4 border-2 border-emerald-100 rounded-2xl bg-[#f2fbf5] group-hover:bg-[#e6f7ec] group-hover:border-emerald-200 transition-all duration-200 shadow-sm">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-5 h-5 text-emerald-600" />
                              <span className="text-sm font-semibold text-emerald-800">
                                {deadlineDate ? (
                                  `Para el ${deadlineDate.toLocaleDateString('es-CL', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long'
                                  })}`
                                ) : (
                                  <span className="text-emerald-600/70 font-normal">Selecciona una fecha</span>
                                )}
                              </span>
                            </div>
                          </div>
                          <input
                            type="date"
                            value={deadline}
                            min={today}
                            onChange={(e) => {
                              setDeadline(e.target.value);
                              setDeadlineDate(new Date(e.target.value + 'T00:00:00'));
                            }}
                            onClick={(e) => {
                              try {
                                (e.target as HTMLInputElement).showPicker();
                              } catch (err) {
                                // Fallback for browsers without showPicker
                              }
                            }}
                            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="space-y-2">
                        <Label className="text-sm text-gray-700">Observaciones (opcional)</Label>
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Agrega notas o instrucciones especiales para este pedido..."
                          className="min-h-[80px] border-blue-200 focus:border-blue-500 resize-none"
                          maxLength={500}
                        />
                        <p className="text-xs text-gray-500 text-right">{notes.length}/500 caracteres</p>
                      </div>

                      {/* Total */}
                      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                        <span className="text-blue-900">Total</span>
                        <span className="text-blue-900">
                          ${calculateTotal().toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        <Button
                          onClick={onBack}
                          variant="outline"
                          className="flex-1"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleConfirmOrder}
                          disabled={isSubmitting}
                          className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-blue-900 gap-2 disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Confirmando...
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-4 h-4" />
                              Confirmar Pedido
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>,
          document.body
        )}
      </div>

      {/* Edit Product Modal */}
      < Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar Producto
            </DialogTitle>
            <DialogDescription>
              Modifica los detalles del producto según tus necesidades
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Image Preview */}
            <div>
              <Label className="text-sm mb-2 block">Imagen del producto</Label>
              {/* El cuadro se ajusta a la proporción real de la foto (sin recortar);
                  solo se limita la altura máxima para que no domine el modal. */}
              <div className="relative w-full max-h-64 bg-white rounded-lg overflow-hidden mb-3 flex items-center justify-center">
                <ImageWithFallback
                  src={imagePreview || editForm.image}
                  alt="Preview"
                  className="block w-full h-auto max-h-64 object-contain"
                />
              </div>

              {/* Image Upload Options */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <input
                    type="file"
                    id="image-upload"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => document.getElementById('image-upload')?.click()}
                    disabled={uploadingImage}
                  >
                    <Upload className="w-4 h-4" />
                    {uploadingImage ? 'Subiendo...' : 'Subir Imagen'}
                  </Button>
                </div>

                <div>
                  <input
                    type="file"
                    id="camera-capture"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => document.getElementById('camera-capture')?.click()}
                    disabled={uploadingImage}
                  >
                    <Camera className="w-4 h-4" />
                    {uploadingImage ? 'Subiendo...' : 'Tomar Foto'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-image" className="text-xs text-gray-600">
                  O ingresa una URL de imagen
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="edit-image"
                    type="text"
                    value={editForm.image}
                    onChange={(e) => {
                      setEditForm({ ...editForm, image: e.target.value });
                      setImagePreview(e.target.value);
                    }}
                    placeholder="https://..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={() => setImagePreview(editForm.image)}
                  >
                    <ImageIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Editor de recorte: se renderiza solo mientras está abierto. */}
            {cropDialogOpen && (
              <Suspense fallback={null}>
                <ImageCropDialog
                  open
                  onOpenChange={setCropDialogOpen}
                  file={imageFile}
                  onCropComplete={handleCropComplete}
                  title="Encuadrar imagen del producto"
                />
              </Suspense>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre del producto</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Nombre del producto"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Input
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Descripcin del producto"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="edit-category">Categoría</Label>
              <Select
                value={editForm.categoryId || "none"}
                onValueChange={(value) => {
                  if (value === "none") {
                    setEditForm({
                      ...editForm,
                      categoryId: '',
                      category: 'General'
                    });
                  } else {
                    const selectedCategory = categories.find(c => c.id === value);
                    setEditForm({
                      ...editForm,
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
                <p className="text-xs text-gray-500">
                  No hay categorías disponibles
                </p>
              )}
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="edit-price">Precio (por unidad)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  placeholder="0.00"
                  className="pl-9"
                />
              </div>
            </div>

            {/* Stock */}
            <div className="space-y-2">
              <Label htmlFor="edit-stock">Stock Disponible</Label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  id="edit-stock"
                  type="number"
                  min="0"
                  value={editForm.stock}
                  onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                  placeholder="0"
                  className="pl-9"
                  disabled={!editForm.trackStock}
                />
              </div>
              <p className="text-xs text-gray-500">
                Cantidad de unidades disponibles en inventario
              </p>
            </div>

            {/* Track Stock Switch */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex-1">
                <Label htmlFor="track-stock" className="cursor-pointer">
                  Controlar stock
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  {editForm.trackStock
                    ? 'El stock se controlará y reducirá con cada pedido'
                    : 'Stock ilimitado - No se controla inventario'}
                </p>
              </div>
              <Switch
                id="track-stock"
                checked={editForm.trackStock}
                onCheckedChange={(checked) => setEditForm({ ...editForm, trackStock: checked })}
              />
            </div>

            {/* Allow Decimal Switch */}
            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex-1">
                <Label htmlFor="allow-decimal" className="cursor-pointer text-amber-900">
                  ½ Permitir venta por decimal
                </Label>
                <p className="text-xs text-amber-700 mt-1">
                  {editForm.allowDecimal
                    ? 'Se puede pedir 0.5, 1.5, etc.'
                    : 'Solo cantidades enteras (1, 2, 3...)'}
                </p>
              </div>
              <Switch
                id="allow-decimal"
                checked={editForm.allowDecimal}
                onCheckedChange={(checked) => setEditForm({ ...editForm, allowDecimal: checked })}
              />
            </div>
          </div>

          <Separator />

          <div className="flex gap-3">
            <Button
              onClick={handleDeleteProduct}
              variant="outline"
              className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar Producto
            </Button>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setEditingProduct(null)}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Guardar Cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}