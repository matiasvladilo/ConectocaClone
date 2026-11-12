import { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
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
  Search,
  Loader2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { productsAPI, categoriesAPI, categoriasPermitidasAPI, type Product as APIProduct, type Category, type ProductIngredient } from '../utils/api';
import { formatCLP } from '../utils/format';
import { hijasDe, idsDeCategoriaConHijas, raicesDe, recortarCatalogo } from '../utils/categoryTree';
import { calcularCantidadAgregable } from '../utils/cartStock';
import { productoUsaLotes } from '../utils/productLots';
import { projectId } from '../utils/supabase/info';

// Carga diferida, mismo motivo que en ImageUpload.tsx: no hace falta en la
// carga inicial de Nuevo Pedido.
const ImageCropDialog = lazy(() =>
  import('./ImageCropDialog').then((m) => ({ default: m.ImageCropDialog }))
);

// Paleta de sistema de iOS (misma familia que "Mi cuenta" e Historial).
const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
};

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
  allowDecimal?: boolean;
  ingredients?: ProductIngredient[];
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
  // El resumen arranca plegado (barra inferior): desplegado tapaba el catálogo.
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  // 'all' = toda la categoría padre elegida, incluidas sus subcategorías.
  const [selectedSubcategoryFilter, setSelectedSubcategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [notes, setNotes] = useState(() => {
    return localStorage.getItem('conectoca_orderNotes') || '';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Precio real (promedio ponderado de lotes FIFO) por producto del carrito,
  // para productos de Distribuidora. Se rellena de forma asíncrona vía RPC;
  // mientras no hay entrada para un producto, se usa price × quantity como
  // antes. Ver handleAddToCart/handleUpdateCartQuantity/handleSetCartQuantity
  // para qué dispara el recálculo.
  const [lotPreviews, setLotPreviews] = useState<Record<string, { quantity: number; precioUnitario: number; total: number }>>({});

  // Categorías que puede pedir este usuario (vacío = todas). La base es la que
  // hace cumplir la regla; acá solo se recorta el catálogo para no ofrecer lo
  // que después se rechazaría.
  const [permitidas, setPermitidas] = useState<string[] | null>(null);

  // Load products from API
  useEffect(() => {
    loadProducts();
    loadCategories();
    categoriasPermitidasAPI.mias().then(setPermitidas).catch(() => setPermitidas([]));
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

  // Precio real del carrito para productos de Distribuidora con lotes FIFO:
  // price × quantity (lo que se muestra por defecto) puede quedar lejos del
  // cobro real si la cantidad pedida cruza dos lotes de costo distinto — el
  // precio exacto recién se sabe pidiéndoselo al servidor (previsualizar_precio_lotes,
  // misma lógica de consumo que create_order_with_stock, de solo lectura).
  // Debounce de 300ms para no disparar una consulta por cada click de +/-.
  useEffect(() => {
    if (categories.length === 0 || cart.length === 0) return;

    const itemsEnLotes = cart.filter(item => productoUsaLotes(item, categories));
    if (itemsEnLotes.length === 0) return;

    const timeoutId = setTimeout(() => {
      itemsEnLotes.forEach(item => {
        const cantidad = item.quantity;
        productsAPI.previewLotPrice(accessToken, item.id, cantidad)
          .then(preview => {
            if (!preview) return;
            setLotPreviews(prev => ({ ...prev, [item.id]: { quantity: cantidad, ...preview } }));
          })
          .catch(() => {}); // Fallo silencioso: se sigue mostrando price × quantity.
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [cart, categories, accessToken]);

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
        allowDecimal: p.allowDecimal === true,
        ingredients: p.ingredients
      }));

      if (transformedProducts.length > 0) {
        console.log('🟢 [NewOrderForm] Sample transformed product:', transformedProducts[0]);
      } else {
        console.log('⚠️ [NewOrderForm] No products received from API');
      }

      setProducts(transformedProducts);

      // El carrito guarda una FOTO del stock del momento en que se agregó cada
      // producto, y sobrevive en localStorage entre sesiones. Ese número
      // congelado es el que miran los topes del carrito, así que un producto
      // repuesto de 1 a 100 seguía mostrando "Stock máximo alcanzado" en 1 y el
      // botón + gris, aunque la tarjeta ya dijera "Stock: 100". Este refresco es
      // el que faltaba para que el intervalo de 5 seg de arriba cumpla lo que
      // promete. Las cantidades pedidas no se tocan: son decisión del local.
      setCart(prev => {
        let cambio = false;
        const reconciliado = prev.map(item => {
          const fresco = transformedProducts.find(p => p.id === item.id);
          if (!fresco || (fresco.stock === item.stock && fresco.trackStock === item.trackStock)) {
            return item;
          }
          cambio = true;
          return { ...item, stock: fresco.stock, trackStock: fresco.trackStock };
        });
        // Devolver la misma referencia si no cambió nada evita un re-render y
        // una escritura a localStorage cada 5 segundos.
        return cambio ? reconciliado : prev;
      });

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

  const handleAddToCart = (product: Product, quantity?: number) => {
    const qtyToAdd = quantity || productQuantities[product.id] || 1;

    if (qtyToAdd <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }

    const existingItem = cart.find(item => item.id === product.id);
    const currentCartQuantity = existingItem ? existingItem.quantity : 0;

    // Se agrega lo que haya en vez de rechazar el pedido completo. Antes, pedir
    // 6 de un producto con 1 unidad no agregaba NADA: para el local eso era "la
    // app no me deja pedir este producto". Ver src/utils/cartStock.ts.
    const { agregable, recortada } = calcularCantidadAgregable(product, qtyToAdd, currentCartQuantity);

    if (agregable <= 0) {
      // Dos motivos distintos para no poder agregar nada, y el local necesita
      // distinguirlos: no queda mercadería, o ya se llevó toda la que había.
      toast.error(
        currentCartQuantity > 0
          ? `Ya tienes las ${product.stock} unidades disponibles en tu pedido`
          : 'Producto sin stock disponible'
      );
      return;
    }

    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + agregable }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: agregable }]);
    }

    if (recortada) {
      toast.warning(`Solo quedan ${product.stock} de ${product.name}: se agregaron ${agregable} al pedido`);
    } else if (existingItem) {
      toast.success(`${agregable} unidades agregadas al pedido`);
    } else {
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

    // Este editor rápido nunca manda stock: sólo edita productos existentes y
    // el campo de stock es de solo lectura (ver el diálogo de ajuste en
    // Gestión de Productos, que es la única vía para cambiarlo).
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

  // Si hay una previsualización vigente para la cantidad actual del item, usa
  // el precio real de lotes FIFO; si no (todavía no llegó, o el producto no
  // está en alcance), cae a price × quantity como antes.
  const getItemUnitPrice = (item: CartItem): number => {
    const preview = lotPreviews[item.id];
    return preview && preview.quantity === item.quantity ? preview.precioUnitario : item.price;
  };

  const getItemTotal = (item: CartItem): number => {
    const preview = lotPreviews[item.id];
    return preview && preview.quantity === item.quantity ? preview.total : item.price * item.quantity;
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + getItemTotal(item), 0);
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

  // La fila de chips muestra solo categorías raíz: elegir una trae también lo
  // etiquetado en sus subcategorías. Con la comparación exacta anterior, tocar
  // "Distribuidora" dejaba el catálogo vacío y el operador concluía que le
  // borraron los productos.
  const catalogo = recortarCatalogo(products, categories, permitidas);
  const categoriasRaiz = raicesDe(catalogo.categories);

  // Segunda fila: las subcategorías del padre elegido, para afinar. Solo aparece
  // si ese padre tiene hijas.
  const subcategoriasVisibles = (selectedCategoryFilter === 'all' || selectedCategoryFilter === 'uncategorized')
    ? []
    : hijasDe(catalogo.categories, selectedCategoryFilter);

  // Se re-valida contra las hijas visibles y no se confía solo en limpiar el
  // estado al cambiar de padre: un filtro de subcategoría que sobreviva a un
  // cambio de padre escondería productos sin que nada en pantalla lo explique.
  const subcategoriaActiva = subcategoriasVisibles.some(h => h.id === selectedSubcategoryFilter)
    ? selectedSubcategoryFilter
    : null;

  const idsDelFiltro = (selectedCategoryFilter === 'all' || selectedCategoryFilter === 'uncategorized')
    ? null
    : idsDeCategoriaConHijas(catalogo.categories, selectedCategoryFilter);

  const handleSeleccionarCategoria = (valor: string) => {
    setSelectedCategoryFilter(valor);
    setSelectedSubcategoryFilter('all');
  };

  // Productos que pasan búsqueda + categoría.
  const productosVisibles = catalogo.products.filter((product) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(searchLower) ||
      (product.description && product.description.toLowerCase().includes(searchLower));
    if (!matchesSearch) return false;
    if (selectedCategoryFilter === 'all') return true;
    if (selectedCategoryFilter === 'uncategorized') return !product.categoryId;
    // Una subcategoría elegida filtra solo por ella; el padre trae todo lo suyo
    // más lo de sus subcategorías.
    if (subcategoriaActiva) return product.categoryId === subcategoriaActiva;
    return idsDelFiltro !== null && !!product.categoryId && idsDelFiltro.has(product.categoryId);
  });

  const unidadesEnCarrito = cart.reduce((s, i) => s + i.quantity, 0);

  // Control − cantidad + (estilo UIStepper). La cantidad se puede tipear: se
  // guarda el texto mientras se edita (decimalInputs) y se confirma con
  // handleSetCartQuantity, igual que antes en el resumen. En el mínimo, el "−"
  // pasa a ser un tacho y saca el producto del pedido.
  const renderStepper = (item: CartItem, grande = false) => {
    const permiteDecimal = !!(item as any).allowDecimal;
    const minimo = permiteDecimal ? 0.5 : 1;
    const enMinimo = item.quantity <= minimo;
    const enTope = item.trackStock !== false && item.stock !== -1 && item.quantity >= item.stock;
    const alto = grande ? 34 : 32;
    const boton = (deshabilitado: boolean): React.CSSProperties => ({
      width: alto, height: alto, border: 'none', borderRadius: alto / 2, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', cursor: deshabilitado ? 'default' : 'pointer',
      color: deshabilitado ? '#C7C7CC' : IOS.azul,
    });
    return (
      <div
        className="quantity-controls"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', borderRadius: alto / 2, background: IOS.relleno }}
      >
        <button
          type="button"
          aria-label={enMinimo ? `Quitar ${item.name}` : `Restar ${item.name}`}
          onClick={() => enMinimo ? handleRemoveFromCart(item.id) : handleUpdateCartQuantity(item.id, -1)}
          style={{ ...boton(false), color: enMinimo ? '#FF3B30' : IOS.azul }}
        >
          {enMinimo ? <Trash2 style={{ width: 15, height: 15 }} /> : <Minus style={{ width: 16, height: 16 }} />}
        </button>
        <input
          type="text"
          inputMode={permiteDecimal ? 'decimal' : 'numeric'}
          aria-label={`Cantidad de ${item.name}`}
          value={decimalInputs[item.id] ?? String(item.quantity)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.');
            if (!(permiteDecimal ? /^\d*\.?\d*$/ : /^\d*$/).test(raw)) return;
            setDecimalInputs(prev => ({ ...prev, [item.id]: raw }));
            const parsed = parseFloat(raw);
            if (!isNaN(parsed) && parsed > 0) handleSetCartQuantity(item.id, raw);
          }}
          onBlur={() => setDecimalInputs(prev => { const n = { ...prev }; delete n[item.id]; return n; })}
          style={{
            width: grande ? 44 : 36, minWidth: 0, textAlign: 'center', border: 'none', outline: 'none',
            background: 'transparent', fontSize: 16, fontWeight: 600,
            color: enTope ? '#FF9500' : IOS.texto, padding: 0,
          }}
        />
        <button
          type="button"
          aria-label={`Sumar ${item.name}`}
          disabled={enTope}
          onClick={() => handleUpdateCartQuantity(item.id, 1)}
          style={boton(enTope)}
        >
          <Plus style={{ width: 16, height: 16 }} />
        </button>
      </div>
    );
  };

  const chip = (activo: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
    height: 32, padding: '0 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: activo ? 600 : 500,
    background: activo ? IOS.azul : IOS.tarjeta,
    color: activo ? '#fff' : IOS.texto,
    boxShadow: activo ? 'none' : '0 0 0 0.5px rgba(0,0,0,0.08)',
  });

  const fechaEntregaTexto = (() => {
    if (!deadlineDate) return 'Elegir fecha';
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const d = new Date(deadlineDate); d.setHours(0, 0, 0, 0);
    const dias = Math.round((d.getTime() - hoy.getTime()) / 86400000);
    const fecha = deadlineDate.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
    if (dias === 0) return `Hoy, ${fecha}`;
    if (dias === 1) return `Mañana, ${fecha}`;
    return fecha.charAt(0).toUpperCase() + fecha.slice(1);
  })();

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado compacto */}
      <div
        className="sticky top-0"
        style={{
          zIndex: 10,
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          paddingTop: 'max(env(safe-area-inset-top), 16px)',
        }}
      >
        <div className="max-w-6xl mx-auto" style={{ padding: '8px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver"
              style={{
                width: 36, height: 36, borderRadius: 18, flexShrink: 0, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
              }}
            >
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
                Nuevo pedido
              </h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                {cart.length === 0
                  ? 'Elegí los productos'
                  : `${cart.length} ${cart.length === 1 ? 'producto' : 'productos'} · ${formatCLP(calculateTotal())}`}
              </p>
            </div>
            {/* Carrito: abre el resumen */}
            <button
              type="button"
              aria-label={`Ver pedido (${cart.length} productos)`}
              onClick={() => cart.length > 0 && setSummaryExpanded(true)}
              style={{
                position: 'relative', width: 36, height: 36, borderRadius: 18, flexShrink: 0, border: 'none',
                cursor: cart.length > 0 ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
              }}
            >
              <ShoppingCart style={{ width: 19, height: 19, color: '#fff' }} />
              {cart.length > 0 && (
                <span
                  style={{
                    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                    background: '#FF3B30', color: '#fff', fontSize: 11, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {cart.length}
                </span>
              )}
            </button>
          </div>

          {/* Búsqueda */}
          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 17, height: 17, color: 'rgba(255,255,255,0.75)' }} />
            <input
              type="search"
              placeholder="Buscar productos"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="buscador-sobre-azul"
              style={{
                width: '100%', height: 38, borderRadius: 10, border: 'none', outline: 'none',
                background: 'rgba(255,255,255,0.18)', padding: '0 34px', fontSize: 16, color: '#fff',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 20, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X style={{ width: 12, height: 12, color: '#fff' }} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto" style={{ padding: '12px 16px', paddingBottom: cart.length > 0 ? 'calc(110px + env(safe-area-inset-bottom))' : 32 }}>
        {/* Categorías (y subcategorías del padre elegido) en carriles deslizables */}
        {categories.length > 0 && (
          <>
            <div className="sin-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 2px' }}>
              <button type="button" aria-pressed={selectedCategoryFilter === 'all'} onClick={() => handleSeleccionarCategoria('all')} style={chip(selectedCategoryFilter === 'all')}>
                Todas
              </button>
              {categoriasRaiz.map((cat) => {
                const activo = selectedCategoryFilter === cat.id;
                return (
                  <button key={cat.id} type="button" aria-pressed={activo} onClick={() => handleSeleccionarCategoria(cat.id)} style={chip(activo)}>
                    {!activo && <span style={{ width: 7, height: 7, borderRadius: 4, background: cat.color }} />}
                    {cat.name}
                  </button>
                );
              })}
              <button type="button" aria-pressed={selectedCategoryFilter === 'uncategorized'} onClick={() => handleSeleccionarCategoria('uncategorized')} style={chip(selectedCategoryFilter === 'uncategorized')}>
                Sin categoría
              </button>
            </div>
            {subcategoriasVisibles.length > 0 && (
              <div className="sin-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px -16px 0', padding: '0 16px 2px' }}>
                <button type="button" aria-pressed={subcategoriaActiva === null} onClick={() => setSelectedSubcategoryFilter('all')} style={{ ...chip(subcategoriaActiva === null), height: 28, fontSize: 13 }}>
                  Todo {categories.find(c => c.id === selectedCategoryFilter)?.name}
                </button>
                {subcategoriasVisibles.map((sub) => {
                  const activo = subcategoriaActiva === sub.id;
                  return (
                    <button key={sub.id} type="button" aria-pressed={activo} onClick={() => setSelectedSubcategoryFilter(sub.id)} style={{ ...chip(activo), height: 28, fontSize: 13 }}>
                      {!activo && <span style={{ width: 7, height: 7, borderRadius: 4, background: sub.color }} />}
                      {sub.name}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Encabezado de sección */}
        <p style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '18px 16px 6px' }}>
          {isLoadingProducts ? 'Cargando productos…' : `${productosVisibles.length} ${productosVisibles.length === 1 ? 'producto' : 'productos'}`}
        </p>

        {isLoadingProducts ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: IOS.secundario }} />
          </div>
        ) : productosVisibles.length === 0 ? (
          <div style={{ background: IOS.tarjeta, borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
            <Package style={{ width: 36, height: 36, color: '#C7C7CC', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 17, fontWeight: 600, color: IOS.texto }}>Sin productos</p>
            <p style={{ fontSize: 15, color: IOS.secundario, marginTop: 4 }}>
              {searchQuery ? `No hay resultados para "${searchQuery}".` : 'No hay productos en esta categoría.'}
            </p>
          </div>
        ) : (
          /* 2 columnas en celular, 3-4 en pantallas más grandes. */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4" style={{ gap: 10 }}>
            {productosVisibles.map((product) => {
              const productStock = product.stock ?? 0;
              const isUnlimitedProduct = product.trackStock === false || productStock === -1;
              const isOutOfStock = !isUnlimitedProduct && productStock <= 0;
              const cartItem = cart.find(item => item.id === product.id);
              const stockBajo = !isUnlimitedProduct && !isOutOfStock && productStock < 10;

              return (
                <div
                  key={product.id}
                  style={{
                    background: IOS.tarjeta, borderRadius: 14, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: cartItem ? `0 0 0 2px ${IOS.azul}` : 'none',
                  }}
                >
                  {/* Imagen: tocarla agrega 1. El alto va inline: la regla global
                      `img { height: auto }` de globals.css (sin @layer) le gana a h-full. */}
                  <div
                    onClick={() => { if (!isOutOfStock) handleAddToCart(product, 1); }}
                    style={{ position: 'relative', height: 120, background: '#F2F2F7', cursor: isOutOfStock ? 'default' : 'pointer', flexShrink: 0 }}
                  >
                    <ImageWithFallback src={product.image} alt={product.name} className="w-full h-full object-cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {isOutOfStock && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '4px 10px', borderRadius: 12 }}>
                          Sin stock
                        </span>
                      </div>
                    )}
                    {cartItem && (
                      <span
                        style={{
                          position: 'absolute', top: 8, left: 8, minWidth: 24, height: 24, borderRadius: 12, padding: '0 7px',
                          background: IOS.azul, color: '#fff', fontSize: 13, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {cartItem.quantity}
                      </span>
                    )}
                    {userRole !== 'local' && (
                      <button
                        type="button"
                        aria-label={`Editar ${product.name}`}
                        onClick={(e) => { e.stopPropagation(); handleEditProduct(product); }}
                        style={{
                          position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
                          background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Edit style={{ width: 14, height: 14, color: IOS.azul }} />
                      </button>
                    )}
                  </div>

                  <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <p className="line-clamp-2" style={{ fontSize: 14, fontWeight: 600, color: IOS.texto, lineHeight: 1.25 }}>
                      {product.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 'auto' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: IOS.texto }}>{formatCLP(product.price)}</span>
                      <span style={{ fontSize: 12, color: isOutOfStock ? '#FF3B30' : stockBajo ? '#FF9500' : IOS.secundario }}>
                        {isUnlimitedProduct ? '' : isOutOfStock ? 'Agotado' : `${productStock} disp.`}
                      </span>
                    </div>
                    {cartItem ? (
                      <div style={{ display: 'flex', justifyContent: 'center' }}>{renderStepper(cartItem)}</div>
                    ) : (
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => handleAddToCart(product, 1)}
                        style={{
                          height: 32, borderRadius: 16, border: 'none', cursor: isOutOfStock ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          fontSize: 15, fontWeight: 600,
                          background: isOutOfStock ? IOS.relleno : 'rgba(0,122,255,0.12)',
                          color: isOutOfStock ? '#C7C7CC' : IOS.azul,
                        }}
                      >
                        <Plus style={{ width: 16, height: 16 }} />
                        Agregar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Resumen del pedido: barra inferior + hoja que se despliega */}
        {cart.length > 0 && createPortal(
          <>
            <AnimatePresence>
              {summaryExpanded && (
                <motion.div
                  key="fondo"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSummaryExpanded(false)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99998 }}
                />
              )}
            </AnimatePresence>
            <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 99999 }}>
              <div
                className="max-w-6xl mx-auto"
                style={{
                  background: summaryExpanded ? IOS.fondo : 'rgba(249,249,249,0.94)',
                  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  borderTopLeftRadius: summaryExpanded ? 14 : 0, borderTopRightRadius: summaryExpanded ? 14 : 0,
                  borderTop: summaryExpanded ? 'none' : `0.5px solid ${IOS.separador}`,
                  paddingBottom: 'env(safe-area-inset-bottom)',
                  boxShadow: summaryExpanded ? '0 -8px 30px rgba(0,0,0,0.12)' : 'none',
                }}
              >
                <AnimatePresence initial={false}>
                  {summaryExpanded && (
                    <motion.div
                      key="hoja"
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '8px 16px 4px' }}>
                        {/* Tirador + título */}
                        <div style={{ width: 36, height: 5, borderRadius: 3, background: '#C7C7CC', margin: '0 auto 10px' }} />
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                          <p style={{ fontSize: 20, fontWeight: 700, color: IOS.texto }}>Tu pedido</p>
                          <button
                            type="button"
                            aria-label="Cerrar resumen"
                            onClick={() => setSummaryExpanded(false)}
                            style={{
                              marginLeft: 'auto', width: 30, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
                              background: IOS.relleno, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <X style={{ width: 16, height: 16, color: IOS.secundario }} />
                          </button>
                        </div>

                        {/* Productos */}
                        <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>
                          {cart.map((item, i) => {
                            const atLimit = item.trackStock !== false && item.stock !== -1 && item.quantity >= item.stock;
                            const previewVigente = lotPreviews[item.id]?.quantity === item.quantity ? lotPreviews[item.id] : null;
                            const precioMixto = previewVigente !== null && previewVigente.precioUnitario !== item.price;
                            return (
                              <div key={item.id}>
                                {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 68 }} />}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
                                  <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: IOS.fondo, flexShrink: 0 }}>
                                    <ImageWithFallback src={item.image} alt={item.name} className="w-full h-full object-cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate" style={{ fontSize: 15, fontWeight: 600, color: IOS.texto }}>{item.name}</p>
                                    <p style={{ fontSize: 13, color: IOS.secundario }}>
                                      {formatCLP(getItemTotal(item))}
                                      {item.quantity !== 1 && ` · ${formatCLP(getItemUnitPrice(item))} c/u`}
                                    </p>
                                    {precioMixto && (
                                      <p style={{ fontSize: 12, color: IOS.azul }}>Precio promedio por stock de distinto costo</p>
                                    )}
                                    {atLimit && (
                                      <p style={{ fontSize: 12, color: '#FF9500', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <AlertCircle style={{ width: 12, height: 12 }} />
                                        Máximo disponible
                                      </p>
                                    )}
                                  </div>
                                  {renderStepper(item, true)}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Entrega + observaciones */}
                        <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden', marginTop: 16 }}>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: 48, padding: '0 16px', gap: 12 }}>
                            <span style={{ width: 30, height: 30, borderRadius: 7, background: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Calendar style={{ width: 17, height: 17, color: '#fff' }} />
                            </span>
                            <span style={{ fontSize: 16, color: IOS.texto }}>Entrega</span>
                            <span style={{ marginLeft: 'auto', fontSize: 15, padding: '5px 10px', borderRadius: 7, background: IOS.relleno, color: IOS.azul }}>
                              {fechaEntregaTexto}
                            </span>
                            <input
                              type="date"
                              aria-label="Fecha de entrega"
                              value={deadline}
                              min={today}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                setDeadline(e.target.value);
                                setDeadlineDate(new Date(e.target.value + 'T00:00:00'));
                              }}
                              onClick={(e) => {
                                try { (e.target as HTMLInputElement).showPicker(); } catch { /* sin showPicker */ }
                              }}
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                            />
                          </div>
                          <div style={{ height: 0.5, background: IOS.separador, marginLeft: 58 }} />
                          <div style={{ display: 'flex', gap: 12, padding: '12px 16px' }}>
                            <span style={{ width: 30, height: 30, borderRadius: 7, background: '#FF9500', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <FileText style={{ width: 17, height: 17, color: '#fff' }} />
                            </span>
                            <div className="flex-1">
                              <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Observaciones (opcional)"
                                maxLength={500}
                                rows={2}
                                style={{
                                  width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent',
                                  fontSize: 16, color: IOS.texto, padding: '4px 0 0', lineHeight: 1.35,
                                }}
                              />
                              {notes.length > 400 && (
                                <p style={{ fontSize: 12, color: IOS.secundario, textAlign: 'right' }}>{notes.length}/500</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Barra siempre visible: total + acción principal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                  <button
                    type="button"
                    onClick={() => setSummaryExpanded(!summaryExpanded)}
                    aria-expanded={summaryExpanded}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <p style={{ fontSize: 13, color: IOS.secundario, display: 'flex', alignItems: 'center', gap: 2 }}>
                      {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
                      {unidadesEnCarrito !== cart.length && ` · ${Math.round(unidadesEnCarrito * 100) / 100} unid.`}
                      {summaryExpanded ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronUp style={{ width: 14, height: 14 }} />}
                    </p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: IOS.texto, letterSpacing: -0.3 }}>
                      {formatCLP(calculateTotal())}
                    </p>
                  </button>
                  {summaryExpanded ? (
                    <button
                      type="button"
                      onClick={() => { handleConfirmOrder().catch(() => { /* el error ya se avisó */ }); }}
                      disabled={isSubmitting}
                      style={{
                        height: 50, padding: '0 22px', borderRadius: 14, border: 'none', cursor: isSubmitting ? 'default' : 'pointer',
                        background: IOS.azul, color: '#fff', fontSize: 17, fontWeight: 600, opacity: isSubmitting ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                      }}
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> : null}
                      {isSubmitting ? 'Enviando…' : 'Confirmar pedido'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSummaryExpanded(true)}
                      style={{
                        height: 50, padding: '0 22px', borderRadius: 14, border: 'none', cursor: 'pointer',
                        background: IOS.azul, color: '#fff', fontSize: 17, fontWeight: 600, flexShrink: 0,
                      }}
                    >
                      Revisar pedido
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>,
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

            {/* Stock: solo lectura. Este editor rápido no lo modifica; la única vía
                para cambiar stock es el diálogo de ajuste en Gestión de Productos. */}
            <div className="space-y-2">
              <Label>Stock Disponible</Label>
              <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
                <span className="text-lg font-mono text-gray-900">
                  {editForm.trackStock ? editForm.stock : '∞'}
                </span>
                <span className="text-xs text-gray-500">
                  Se cambia desde Gestión de Productos
                </span>
              </div>
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