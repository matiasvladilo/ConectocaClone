import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Product, Category, categoriesAPI, ProductionArea, productionAreasAPI, businessAPI, notificationsAPI, profileAPI } from '../utils/api';
import { productsAPI } from '../utils/api';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
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
  Search,
  Image as ImageIcon,
  Folder,
  Factory,
  AlertTriangle,
  Filter,
  Barcode,
  Camera,
  ChevronsUpDown
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCLP, parseCLP, formatCLPInput } from '../utils/format';
import { agruparPorPadre, idsDeCategoriaConHijas } from '../utils/categoryTree';
import { ImageUpload } from './ImageUpload';
import { StockAdjustDialog, type ModoAjuste } from './StockAdjustDialog';
import { ProductNameFields } from './ProductNameFields';
import { componerNombre, partesVacias, type ProductNameParts } from '../utils/productName';
import { construirPayloadProducto, type ProductFormData } from '../utils/productPayload';
import { productoUsaLotes } from '../utils/productLots';
import { alternarStockIlimitado } from '../utils/stockForm';
import { ProductIngredientConfig } from './ProductIngredientConfig';
import { ProductDetailDialog } from './ProductDetailDialog';

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

const IOS_PM = {
  fondo: '#F2F2F7',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
  rojo: '#FF3B30',
};

const botonRedondoPM: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
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
  // Producto cuya ficha está abierta. Es la puerta de entrada desde la grilla:
  // la tarjeta ya no abre el formulario de edición directamente.
  const [detalleProduct, setDetalleProduct] = useState<Product | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  // Solo se usan al crear. Al editar, el nombre sigue siendo texto libre.
  const [nameParts, setNameParts] = useState<ProductNameParts>(partesVacias);
  // La receta se abre como capa y no navegando a otra pantalla: así este
  // componente no se desmonta y el diálogo, la búsqueda y el scroll sobreviven.
  const [recetaDe, setRecetaDe] = useState<Product | null>(null);
  // De dónde se abrió la receta, para saber a dónde volver al cerrarla
  // (Hallazgo 1 del review final). 'edicion' = se abrió con "Configurar
  // receta" desde el diálogo de editar (abrirReceta); hay que reabrir ESE
  // diálogo. 'ficha' = se abrió con "Receta" desde la ficha de solo lectura
  // (onReceta de ProductDetailDialog); hay que volver a esa ficha. Sin este
  // estado, cerrarReceta no tiene forma de distinguir los dos caminos y
  // siempre reabría el diálogo de edición, aunque editingProduct fuera null
  // (formulario "Crear" en blanco) o perteneciera a otro producto editado
  // antes y cerrado con Escape.
  const [recetaOrigen, setRecetaOrigen] = useState<'edicion' | 'ficha' | null>(null);
  // Foco de la capa de receta. Al montarse, el botón "Configurar receta" que
  // tenía el foco ya se desmontó (estaba dentro del diálogo, que se cerró), así
  // que el foco cae en document.body: desde ahí, espacio/PageDown/flechas
  // scrollean la grilla de atrás (overscrollBehavior solo corta el
  // encadenamiento de rueda y touch, no el del teclado), y Tab alcanza esa
  // misma grilla tapada, donde Enter en un "Editar" de otra tarjeta pisa
  // editingProduct/formData y abre el diálogo del producto equivocado encima
  // de la capa. Enfocar el div de la capa (con tabIndex={-1}) cierra las dos
  // fugas: el teclado ya no tiene forma de llegar a lo de atrás.
  const recetaLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadProductionAreas();

    // Load profile to identify current user
    profileAPI.get(accessToken).then(profile => {
      setCurrentUserId(profile.id);
      setEsAdmin(profile.role === 'admin');
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
    setRecetaOrigen('edicion');
    // Ojo: NO handleCloseDialog(), que además borra editingProduct, formData y
    // nameParts. Acá solo se baja la bandera; Radix desmonta el contenido del
    // diálogo pero el estado vive en este componente y vuelve intacto, incluidos
    // los campos a medio escribir.
    setIsDialogOpen(false);
  };

  // Le da foco a la capa apenas se monta (ver comentario de recetaLayerRef).
  // `preventScroll` es obligatorio: sin él, el navegador scrollea para revelar
  // el elemento recién enfocado, y como la capa ya cubre toda la pantalla
  // (fixed inset-0) ese scroll cae sobre el documento de atrás — exactamente
  // el movimiento que este mismo efecto existe para evitar.
  useEffect(() => {
    if (recetaDe) {
      recetaLayerRef.current?.focus({ preventScroll: true });
    }
  }, [recetaDe]);

  const cerrarReceta = () => {
    // Se captura ANTES de limpiar recetaDe: es la única oportunidad de saber
    // a qué producto volver si el origen fue la ficha.
    const productoDeFicha = recetaOrigen === 'ficha' ? recetaDe : null;
    setRecetaDe(null);
    setRecetaOrigen(null);
    if (productoDeFicha) {
      // Se abrió desde la ficha (onReceta): volver ahí, no al diálogo de
      // edición. editingProduct puede ser null (formulario "Crear" en blanco)
      // o pertenecer a otro producto editado antes y cerrado con Escape/X —
      // abrir el diálogo de edición acá sería exactamente el Hallazgo 1.
      setDetalleProduct(productoDeFicha);
    } else {
      // Se abrió con "Configurar receta" desde el diálogo de editar: reabrir
      // ese mismo diálogo, como siempre.
      setIsDialogOpen(true);
    }
    // Silencioso para no perder el scroll de la grilla. Refresca `products`, y
    // con eso el contador de ingredientes del diálogo/ficha.
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
    // Solo corre al CREAR: al editar, formData.stock ni siquiera viaja en el
    // payload (construirPayloadProducto lo omite), así que validarlo acá
    // quedaba muerto y además podía bloquear sin salida: un producto legado
    // con stock -1 abre con unlimitedStock=true y formData.stock="-1"; si el
    // usuario destildaba "Stock Ilimitado", el guardado quedaba atascado en
    // este toast sin ningún campo donde corregir el valor (Hallazgo 3).
    if (!editingProduct && !formData.unlimitedStock && (!formData.stock || parseFloat(formData.stock) < 0)) {
      toast.error('El stock debe ser mayor o igual a 0');
      return;
    }

    try {
      setSubmitting(true);

      // El stock no viaja en el payload de edición: se cambia sólo desde
      // StockAdjustDialog. Ver construirPayloadProducto.
      // `enLotes` viene del closure de más abajo (ver su declaración junto a
      // `recetaCount`): se calcula una sola vez, contra el producto
      // refrescado, y handleSubmit lo reutiliza así en vez de recalcularlo
      // contra `editingProduct` directamente, que puede haber quedado
      // desactualizado (ver comentario de `productoEditado`).
      const productData = construirPayloadProducto({
        formData,
        editingProduct,
        priceValue,
        enLotes,
      });

      console.log('📦 [DEBUG] Sending Product Data:', JSON.stringify(productData, null, 2));

      if (editingProduct) {
        // Update existing product
        const updated = await productsAPI.update(accessToken, editingProduct.id, productData);
        setProducts(products.map(p => p.id === updated.id ? updated : p));
        toast.success('Producto actualizado exitosamente');

        // Notify if price changed
        // `'price' in productData` primero: para un producto en alcance de
        // lotes, construirPayloadProducto deliberadamente OMITE `price` del
        // payload (lo recalcula el backend), así que productData.price es
        // `undefined` acá. Sin este chequeo, `editingProduct.price !== undefined`
        // es siempre true, y el mensaje de abajo (formatCLP(productData.price))
        // mandaba "$NaN" a todo el equipo en cada guardado de un producto en
        // alcance, haya cambiado el precio o no.
        if ('price' in productData && editingProduct.price !== productData.price) {
          businessAPI.getMembers(accessToken).then(({ members }) => {
            const promises = members
              // A todos: cada uno decide en Mi cuenta → Notificaciones si quiere
              // este aviso (por defecto solo los locales). El servidor no crea
              // el aviso para quien lo tiene apagado y la app lo oculta.
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
        // más arriba es condicional (para que el guardado de edición no pise el
        // stock con un valor viejo). Pero en esta rama `editingProduct` es null,
        // que es exactamente la condición que hace que construirPayloadProducto
        // incluya `stock`: el assert solo hace explícito para TS lo que ya es
        // cierto en runtime, sin tocar el tipo de Product ni el de la API.
        const created = await productsAPI.create(accessToken, productData as typeof productData & { stock: number });
        setProducts([created, ...products]);
        toast.success('Producto creado exitosamente');

        // Notify creation
        businessAPI.getMembers(accessToken).then(({ members }) => {
          const promises = members
            // A todos; cada uno decide si lo recibe (ver cambio de precio, arriba).
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
      const result = await productsAPI.delete(accessToken, isDeleting.id);
      setProducts(products.filter(p => p.id !== isDeleting.id));
      toast.success(
        result?.archived
          ? 'Producto eliminado del catálogo (su historial de pedidos se conserva)'
          : 'Producto eliminado exitosamente'
      );

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

  const handleAjustarStock = async (nuevoStock: number, modo: ModoAjuste, costoUnitario?: number) => {
    if (!stockProduct) return;
    try {
      setSavingStock(true);
      // Se manda SOLO el stock + el modo (+ el costo, cuando corresponde): el
      // backend actualiza únicamente los campos presentes, así que la receta y
      // el resto del producto quedan intactos (y no se dispara el chequeo de
      // permisos de recetas).
      // El `modo` no modifica el producto: le dice al backend si esto fue una
      // reposición, una merma o una corrección de conteo. `costoUnitario` es el
      // costo del lote nuevo cuando esto es una reposición de un producto en
      // alcance (lo pide StockAdjustDialog solo en ese caso).
      const actualizado = await productsAPI.update(accessToken, stockProduct.id, { stock: nuevoStock, modo, costoUnitario });
      setProducts(products.map(p => (p.id === actualizado.id ? actualizado : p)));

      // Si el ajuste salió del diálogo de edición, ese formulario sigue mostrando
      // el stock viejo. Hay que sincronizar LAS DOS cosas: lo que se ve
      // (formData.stock) y la referencia contra la que se compara al guardar
      // (editingProduct). Si solo se actualizara una, guardar volvería a mandar
      // un stock desactualizado y pisaría este ajuste.
      //
      // El precio SOLO se sincroniza cuando el producto está en alcance de
      // lotes (enLotes): en ese caso el campo es de solo lectura y formData.price
      // nunca tiene nada "sin guardar" que proteger, así que pisarlo con el
      // precio recién recalculado por el backend es seguro y necesario (si no,
      // el campo de solo lectura queda mostrando el precio viejo hasta reabrir
      // el diálogo). Pero "Ajustar" también está disponible para productos FUERA
      // de alcance (merma/corregir total), donde el precio sigue siendo editable
      // a mano: ahí el backend no toca price, así que sincronizar sin condición
      // pisaría en silencio cualquier precio que el usuario hubiera tipeado sin
      // guardar todavía — el mismo bug de pérdida silenciosa que ya describe el
      // comentario original para el stock, aplicado por error al precio.
      if (editingProduct?.id === actualizado.id) {
        setEditingProduct(actualizado);
        setFormData(prev => ({
          ...prev,
          stock: actualizado.stock.toString(),
          ...(enLotes ? { price: formatCLP(actualizado.price, false) } : {}),
        }));
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

  // `editingProduct` puede quedar desactualizado sin que este componente se
  // desmonte: cerrar la capa de receta (cerrarReceta) refresca `products` vía
  // loadProducts(true) pero deliberadamente NO toca `editingProduct` (conserva
  // lo que el usuario no guardó). Cualquier cálculo que dependa de datos que
  // cambian por fuera del formulario —ingredients, price— tiene que mirar la
  // versión fresca en `products`, no `editingProduct` directamente. Sin esto,
  // borrar la receta de un producto (quedando en alcance de lotes) seguía
  // viendo `enLotes` en false hasta reabrir el diálogo, y el campo de precio
  // mandaba `price` para un producto que el backend ya trata como en alcance.
  const productoEditado = editingProduct
    ? (products.find(p => p.id === editingProduct.id) ?? editingProduct)
    : null;

  // El contador sale de `productoEditado` y no de `formData`: así el
  // loadProducts(true) que corre al cerrar la capa de receta lo refresca solo,
  // sin cablear nada más.
  const recetaCount = productoEditado?.ingredients?.length ?? 0;

  // Si el producto en edición es de Distribuidora sin receta, el precio lo
  // recalcula el backend según el lote activo: el campo se muestra de solo
  // lectura (ver el bloque de "Precio de Venta" más abajo). `handleSubmit`
  // reutiliza este mismo valor (ver su comentario) en vez de recalcularlo
  // contra `editingProduct`, por la misma razón de frescura.
  const enLotes = productoEditado ? productoUsaLotes(productoEditado, categories) : false;

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

  // Las tarjetas de arriba siguen al filtro de categoría (no al buscador): con
  // "Distribuidora" elegida, mostrar los totales de todo el catálogo no decía
  // nada de lo que se está mirando.
  const productosDeLaCategoria = idsDelFiltro === null
    ? products
    : products.filter(p => !!p.categoryId && idsDelFiltro.has(p.categoryId));

  // Bajo = sobre 0 pero en o bajo su mínimo (10 si no tiene uno cargado, igual
  // que Distribuidora). Antes era `stock < 10` fijo e incluía los agotados, así
  // que un producto sin stock contaba dos veces.
  const conStock = (p: Product) => !p.unlimitedStock && p.stock !== -1;
  const stats = {
    total: productosDeLaCategoria.length,
    lowStock: productosDeLaCategoria.filter(p => conStock(p) && p.stock > 0 && p.stock <= (p.minStock ?? 10)).length,
    outOfStock: productosDeLaCategoria.filter(p => conStock(p) && p.stock <= 0).length,
    totalValue: productosDeLaCategoria.reduce((sum, p) => sum + (p.price * (p.unlimitedStock || p.stock === -1 ? 0 : p.stock)), 0)
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
    <div className="min-h-screen" style={{ background: IOS_PM.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-7xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" style={botonRedondoPM}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Productos</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                {loading ? 'Cargando catálogo…' : `${products.length} en el catálogo`}
              </p>
            </div>
            <button type="button" onClick={onManageCategories} aria-label="Categorías" style={botonRedondoPM}>
              <Folder style={{ width: 18, height: 18, color: '#fff' }} />
            </button>
            <button type="button" onClick={() => handleOpenDialog()} aria-label="Nuevo producto" style={{ ...botonRedondoPM, background: '#fff' }}>
              <Plus style={{ width: 20, height: 20, color: '#0047BA' }} />
            </button>
          </div>

          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'rgba(255,255,255,0.75)' }} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o SKU"
              className="buscador-sobre-azul"
              style={{ width: '100%', height: 36, borderRadius: 10, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 16, padding: '0 40px 0 34px' }}
            />
            <button
              type="button"
              onClick={() => setSearchScannerOpen(true)}
              aria-label="Buscar escaneando un código de barras"
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Camera style={{ width: 18, height: 18, color: '#fff' }} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {/* Resumen de la categoría elegida + selector de categoría. Los números
            siguen al filtro de categoría (no al buscador), como antes. */}
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '12px 0' }}>
            {[
              { titulo: 'Productos', valor: stats.total, color: IOS_PM.texto },
              { titulo: 'Stock bajo', valor: stats.lowStock, color: stats.lowStock ? '#C93400' : IOS_PM.texto },
              { titulo: 'Sin stock', valor: stats.outOfStock, color: stats.outOfStock ? IOS_PM.rojo : IOS_PM.texto },
            ].map((m, i) => (
              <div key={m.titulo} style={{ textAlign: 'center', borderLeft: i ? `0.5px solid ${IOS_PM.separador}` : undefined }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : m.valor}</p>
                <p style={{ fontSize: 12, color: IOS_PM.secundario }}>{m.titulo}</p>
              </div>
            ))}
          </div>
          <div style={{ height: 0.5, background: IOS_PM.separador, marginLeft: 16 }} />
          <label className="fila-ios" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '0 16px', cursor: 'pointer' }}>
            <span style={{ fontSize: 16, color: IOS_PM.texto }}>Categoría</span>
            <span className="truncate" style={{ flex: 1, textAlign: 'right', fontSize: 15, color: IOS_PM.secundario }}>{nombreDelFiltro}</span>
            <ChevronsUpDown style={{ width: 15, height: 15, color: IOS_PM.secundario, flexShrink: 0 }} />
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              aria-label="Categoría"
              style={{ position: 'absolute', inset: 0, opacity: 0, fontSize: 16 }}
            >
              <option value="all">Todas las categorías</option>
              {agruparPorPadre(categories).map(({ categoria, hijas }) => (
                <optgroup key={categoria.id} label={categoria.name}>
                  <option value={categoria.id}>{categoria.name} (todo)</option>
                  {hijas.map((hija) => <option key={hija.id} value={hija.id}>{hija.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div style={{ height: 0.5, background: IOS_PM.separador, marginLeft: 16 }} />
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 16px' }}>
            <span style={{ flex: 1, fontSize: 16, color: IOS_PM.texto }}>Valor en stock</span>
            <span style={{ fontSize: 15, color: IOS_PM.secundario, fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : formatCLP(stats.totalValue)}</span>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="animate-spin" style={{ width: 24, height: 24, borderRadius: 12, border: '2.5px solid #C7C7CC', borderTopColor: 'transparent' }} />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: '40px 16px', textAlign: 'center' }}>
            <Package style={{ width: 36, height: 36, color: '#C7C7CC', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: IOS_PM.texto }}>
              {hayFiltroActivo ? 'No se encontraron productos' : 'No hay productos aún'}
            </p>
            <p style={{ fontSize: 14, color: IOS_PM.secundario, marginTop: 2 }}>
              {hayFiltroActivo ? 'Prueba con otra búsqueda o categoría' : 'Crea tu primer producto para comenzar'}
            </p>
            {!hayFiltroActivo && (
              <button type="button" onClick={() => handleOpenDialog()} style={{ marginTop: 14, height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: IOS_PM.azul, color: '#fff', fontSize: 15, fontWeight: 600 }}>
                Crear producto
              </button>
            )}
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: IOS_PM.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', padding: '0 16px 6px' }}>
              {filteredProducts.length === products.length ? `${filteredProducts.length} productos` : `${filteredProducts.length} de ${products.length} productos`}
            </p>
            {/* Desde 1024px la imagen y el texto crecen y aparece el botón de
                Stock: necesita @media, que el Tailwind precompilado no trae. */}
            <style>{`
              .tarjeta-producto-img { height: 120px; }
              .tarjeta-producto-stock-btn { display: none; }
              @media (min-width: 1024px) {
                .tarjeta-producto-img { height: 200px; }
                .tarjeta-producto-stock-btn { display: flex; }
              }
            `}</style>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4" style={{ gap: 10 }}>
              {filteredProducts.map((product) => {
                const esIlimitado = product.unlimitedStock || product.stock === -1;
                const minimo = product.minStock ?? 10;
                const estado = esIlimitado ? 'ilimitado' : product.stock <= 0 ? 'agotado' : product.stock <= minimo ? 'bajo' : 'ok';
                const colorEstado = estado === 'agotado' ? IOS_PM.rojo : estado === 'bajo' ? '#FF9500' : estado === 'ok' ? '#34C759' : IOS_PM.secundario;
                const textoStock = esIlimitado ? 'Sin límite' : product.stock <= 0 ? 'Sin stock' : `${product.stock.toLocaleString('es-CL', { maximumFractionDigits: 2 })} en stock`;
                return (
                  // Toda la tarjeta abre la ficha (editar, ajustar stock y archivar
                  // viven ahí). Botón real para teclado y lectores de pantalla.
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetalleProduct(product)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetalleProduct(product);
                      }
                    }}
                    className="fila-ios"
                    style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                  >
                    <div className="tarjeta-producto-img" style={{ width: '100%', background: '#F7F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <Package style={{ width: 30, height: 30, color: '#C7C7CC' }} />
                      )}
                    </div>
                    <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: IOS_PM.texto, lineHeight: 1.25, minHeight: 32, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {product.name}
                      </p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: IOS_PM.texto, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCLP(product.price)}
                      </p>
                      <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: estado === 'agotado' ? IOS_PM.rojo : IOS_PM.secundario, marginTop: 2 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: colorEstado, flexShrink: 0 }} />
                        {textoStock}
                      </p>
                      {!esIlimitado && (
                        <button
                          type="button"
                          onClick={(e) => {
                            // Sin esto el click también abriría la ficha.
                            e.stopPropagation();
                            setStockProduct(product);
                          }}
                          className="tarjeta-producto-stock-btn"
                          style={{ marginTop: 8, height: 30, borderRadius: 8, border: 'none', background: IOS_PM.relleno, color: IOS_PM.azul, fontSize: 13, fontWeight: 600, alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          <BoxIcon style={{ width: 15, height: 15 }} />
                          Ajustar stock
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {/* Radix, al desmontar el diálogo, devuelve el foco al elemento que lo abrió: la
            tarjeta de la grilla. Cuando salimos por "Configurar receta" eso ocurre ~200ms
            después, ya con la capa de receta montada, y le roba el foco que le dimos: el
            usuario queda tecleando sobre una grilla que no ve, donde Enter abre el diálogo
            de OTRO producto y se lleva puesto lo que estaba editando sin guardar. */}
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
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
                <Label htmlFor={enLotes ? undefined : 'price'}>Precio de Venta {!enLotes && '*'}</Label>
                {enLotes ? (
                  // Mismo patrón visual que ya usa el bloque de stock al editar: el
                  // precio de estos productos lo calcula el backend según el lote
                  // activo, no se edita a mano.
                  <div className="rounded-lg bg-blue-50 px-4 py-3">
                    <span className="text-lg font-mono text-gray-900">{formatCLP(parseCLP(formData.price))}</span>
                    <p className="text-xs text-gray-600 mt-1">
                      Se actualiza solo según el costo del lote de compra activo.
                    </p>
                  </div>
                ) : (
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
                )}
              </div>

              <div>
                {/* htmlFor solo cuando el input existe (rama de creación, id="stock"
                    más abajo): al editar no hay ningún elemento con ese id, y un
                    htmlFor huérfano no anuncia nada al lector de pantalla ni hace
                    nada al clickear (Hallazgo 2). */}
                <Label htmlFor={editingProduct ? undefined : 'stock'}>Stock {!editingProduct && '*'}</Label>
                {editingProduct ? (
                  // Al editar, el stock NO es un campo de este formulario. Era la
                  // causa del bug reportado: quien lo tipeaba y cerraba el diálogo
                  // sin llegar a "Guardar Cambios" (que queda debajo del scroll en
                  // teléfono) perdía el número sin ningún aviso. Ahora se muestra y
                  // se cambia por el diálogo de ajuste, que confirma en el acto.
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
                    <span className="text-lg font-mono text-gray-900">
                      {formData.unlimitedStock ? '∞' : formData.stock}
                    </span>
                    {!formData.unlimitedStock && (
                      <Button
                        type="button"
                        variant="outline"
                        // `productoEditado` y no `editingProduct`: ver su comentario
                        // más arriba. Abrir el diálogo de ajuste con datos viejos (p.ej.
                        // ingredients desactualizados) le haría calcular mal `enLotes`
                        // en StockAdjustDialog.
                        onClick={() => setStockProduct(productoEditado)}
                        disabled={submitting}
                        className="border-[#0059FF] text-[#0059FF] hover:bg-blue-50"
                      >
                        <BoxIcon className="w-4 h-4 mr-1" />
                        Ajustar
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <BoxIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="stock"
                      type="number"
                      min="0"
                      // Sin step el navegador asume 1 y rechaza "6.8" con su
                      // propio tooltip, aunque el producto se venda por fracción.
                      step={formData.allowDecimal ? 'any' : '1'}
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      placeholder="0"
                      className="pl-9"
                      required
                      disabled={formData.unlimitedStock}
                    />
                  </div>
                )}
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

              {/* Opciones de stock: mismo patrón de interruptores que UserProfile,
                  en un solo bloque neutro para que no compitan con el resto del form. */}
              <div className="col-span-2 rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <Label htmlFor="unlimited-stock" className="cursor-pointer flex-1 min-w-0">
                    <div>
                      <p className="text-sm text-gray-800" style={{ fontWeight: 500 }}>Stock ilimitado</p>
                      <p className="text-xs text-gray-500 mt-0.5">No descuenta stock al vender</p>
                    </div>
                  </Label>
                  <Switch
                    id="unlimited-stock"
                    checked={formData.unlimitedStock}
                    onCheckedChange={(checked) =>
                      setFormData(prev => alternarStockIlimitado(prev, checked))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-gray-200">
                  <Label htmlFor="allow-decimal" className="cursor-pointer flex-1 min-w-0">
                    <div>
                      <p className="text-sm text-gray-800" style={{ fontWeight: 500 }}>Venta por fracción</p>
                      <p className="text-xs text-gray-500 mt-0.5">Permite cantidades como 0.5 o 1.5</p>
                    </div>
                  </Label>
                  <Switch
                    id="allow-decimal"
                    checked={formData.allowDecimal}
                    onCheckedChange={(checked) => setFormData({ ...formData, allowDecimal: checked })}
                  />
                </div>
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
              {/* Esta acción vivía en la tarjeta del listado. Con la grilla compacta
                  ya no entra ahí, así que se movió acá (Ajustar Stock, que vivía al
                  lado de Eliminar, se fue en cambio a la ficha de solo lectura).
                  `type="button"` es obligatorio: el contenido del diálogo es un
                  <form> y sin eso dispararía un submit. */}
              {editingProduct && (
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
        enLotes={stockProduct ? productoUsaLotes(stockProduct, categories) : false}
        onConfirm={handleAjustarStock}
        saving={savingStock}
      />

      <ProductDetailDialog
        product={detalleProduct}
        accessToken={accessToken}
        onOpenChange={(abierto) => { if (!abierto) setDetalleProduct(null); }}
        esAdmin={esAdmin}
        onEditar={(p) => { setDetalleProduct(null); handleOpenDialog(p); }}
        onAjustarStock={(p) => { setDetalleProduct(null); setStockProduct(p); }}
        onReceta={(p) => { setDetalleProduct(null); setRecetaDe(p); setRecetaOrigen('ficha'); }}
        onEliminar={(p) => { setDetalleProduct(null); setIsDeleting(p); }}
      />

      {/* z-50 y no más: el CSS de Tailwind está precompilado y z-50 es el máximo
          que existe. No queda detrás del diálogo de forma permanente (abrirReceta
          lo cierra), pero sí se solapan unos 200ms: animate-out/fade-out-0/
          zoom-out-95/duration-200 SÍ están compiladas en src/index.css, así que
          Radix mantiene montado el DialogContent durante su animación de salida
          y ese frame pinta sobre la capa recién montada. Es un crossfade visual,
          inofensivo — no una carrera de estado. */}
      {recetaDe && (
        // overscrollBehavior va inline porque `overscroll-*` no está compilada en
        // src/index.css (no existe como clase). Sin esto, al llegar al final del
        // scroll de la capa el gesto encadena al document, que Radix ya dejó
        // scrolleable al cerrar el diálogo, y mueve la grilla de atrás en silencio.
        // tabIndex={-1} + el useEffect de más arriba: sin foco EN la capa, el
        // teclado (espacio/PageDown/flechas) scrollea el document de atrás, y Tab
        // alcanza la grilla tapada (ver comentario de recetaLayerRef).
        <div
          ref={recetaLayerRef}
          tabIndex={-1}
          onKeyDown={(e) => {
            // Cerrar con Escape es seguro: la receta se guarda contra la API al
            // toque, no hay borrador en memoria que se pueda perder al salir.
            if (e.key === 'Escape') cerrarReceta();
          }}
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