import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ProductionOrder, ProductionOrderStatus } from '../App';
import {
  ArrowLeft,
  Plus,
  Minus,
  Package,
  CheckCircle2,
  Clock,
  FileText,
  Search,
  X,
  ChevronDown,
  AlertCircle,
  Loader2,
  Layers,
  BookOpen,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { projectId } from '../utils/supabase/info';
import { productsAPI } from '../utils/api';

interface ProductionOrdersProps {
  onBack: () => void;
  accessToken: string;
  userName: string;
  userRole: string;
  onNavigateToIngredients?: () => void;
  onNavigateToRecipes?: () => void;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  stock: number;
  price: number;
  unlimitedStock?: boolean;
}

export function ProductionOrders({ onBack, accessToken, userName, userRole, onNavigateToIngredients, onNavigateToRecipes }: ProductionOrdersProps) {
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionOrderStatus | 'ALL'>('ALL');
  const [dateFilterFrom, setDateFilterFrom] = useState<string>('');
  const [dateFilterTo, setDateFilterTo] = useState<string>('');

  // Form state
  const [selectedProducts, setSelectedProducts] = useState<Array<{ productId: string; name: string; quantity: number }>>([]);
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentQuantity, setCurrentQuantity] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  // Completion Dialog State
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [orderToComplete, setOrderToComplete] = useState<ProductionOrder | null>(null);
  const [completionData, setCompletionData] = useState<Array<{
    productId: string;
    name: string;
    targetQuantity: number;
    producedQuantity: number;
    wasteQuantity: number;
  }>>([]);

  useEffect(() => {
    loadProductionOrders();
    loadProducts();
  }, []);

  const loadProductionOrders = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/production-orders`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Error al cargar órdenes de producción');
      }

      const data = await response.json();
      setProductionOrders(data.orders || []);
    } catch (error: any) {
      console.error('Error loading production orders:', error);
      toast.error(error.message || 'Error al cargar órdenes de producción');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      // Antes era /products sin límite y el servidor devolvía solo 20.
      const lista = await productsAPI.getAll(accessToken);
      setProducts(lista as unknown as Product[]);
    } catch (error: any) {
      console.error('Error loading products:', error);
      toast.error(error.message || 'Error al cargar productos');
    }
  };

  const handleAddProduct = () => {
    if (!currentProductId) {
      toast.error('Selecciona un producto');
      return;
    }

    if (!currentQuantity || currentQuantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }

    const product = products.find(p => p.id === currentProductId);
    if (!product) return;

    // Check if product already added
    const existingIndex = selectedProducts.findIndex(p => p.productId === currentProductId);
    if (existingIndex >= 0) {
      // Update quantity
      const updated = [...selectedProducts];
      updated[existingIndex].quantity += Number(currentQuantity);
      setSelectedProducts(updated);
    } else {
      // Add new product
      setSelectedProducts([
        ...selectedProducts,
        {
          productId: product.id,
          name: product.name,
          quantity: Number(currentQuantity)
        }
      ]);
    }

    // Reset form
    setCurrentProductId('');
    setCurrentQuantity('');
    toast.success(`${product.name} agregado`);
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(p => p.productId !== productId));
  };

  const handleCreateOrder = async () => {
    // If user has input pending in the fields but list is empty, try to use it
    let finalProducts = [...selectedProducts];

    // Auto-add pending product if list is empty and inputs are filled
    if (finalProducts.length === 0 && currentProductId && currentQuantity && Number(currentQuantity) > 0) {
      const product = products.find(p => p.id === currentProductId);
      if (product) {
        finalProducts.push({
          productId: product.id,
          name: product.name,
          quantity: Number(currentQuantity)
        });
      }
    }

    if (finalProducts.length === 0) {
      toast.error('Agrega al menos un producto');
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/production-orders`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            products: finalProducts,
            notes: notes || undefined,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al crear orden de producción');
      }

      const data = await response.json();

      toast.success('Orden de producción creada');

      // Reset form
      setSelectedProducts([]);
      setNotes('');
      setIsCreateDialogOpen(false);

      // Reload orders
      await loadProductionOrders();
    } catch (error: any) {
      console.error('Error creating production order:', error);
      toast.error(error.message || 'Error al crear orden de producción');
    }
  };

  const handleOpenCompleteDialog = (order: ProductionOrder) => {
    setOrderToComplete(order);

    // Initialize completion data with defaults (assume perfect production)
    const initialData = order.products.map(p => ({
      productId: p.productId,
      name: p.name,
      targetQuantity: p.quantity,
      producedQuantity: p.quantity,
      wasteQuantity: 0
    }));

    setCompletionData(initialData);
    setIsCompleteDialogOpen(true);
  };

  const handleUpdateCompletionData = (productId: string, field: 'producedQuantity' | 'wasteQuantity', value: string) => {
    const numValue = value === '' ? 0 : Number(value);

    setCompletionData(prev => prev.map(item => {
      if (item.productId === productId) {
        return { ...item, [field]: numValue };
      }
      return item;
    }));
  };

  const handleConfirmComplete = async () => {
    if (!orderToComplete) return;

    // Validate data
    const hasInvalidData = completionData.some(item =>
      item.producedQuantity < 0 || item.wasteQuantity < 0
    );

    if (hasInvalidData) {
      toast.error('Las cantidades no pueden ser negativas');
      return;
    }

    await handleUpdateStatus(orderToComplete.id, 'TERMINADA', completionData);
    setIsCompleteDialogOpen(false);
    setOrderToComplete(null);
  };

  const handleUpdateStatus = async (orderId: string, newStatus: ProductionOrderStatus, updatedProducts?: any[]) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/production-orders/${orderId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            status: newStatus,
            products: updatedProducts
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();

        // Special handling for insufficient stock errors
        if (error.details && Array.isArray(error.details)) {
          const detailsMessage = error.details.join('\n');
          toast.error(`${error.error}:\n\n${detailsMessage}`, {
            duration: 8000,
            style: {
              maxWidth: '500px',
              whiteSpace: 'pre-line'
            }
          });
          throw new Error(error.error);
        }

        throw new Error(error.error || 'Error al actualizar estado');
      }

      // Show different success messages based on status
      if (newStatus === 'EN_PROCESO') {
        toast.success('Producción iniciada · se descontó la materia prima');
      } else if (newStatus === 'TERMINADA') {
        toast.success('Producción terminada · stock de productos actualizado');
      } else {
        toast.success('Estado actualizado correctamente');
      }

      await loadProductionOrders();
    } catch (error: any) {
      console.error('Error updating status:', error);
      // Only show error if it wasn't already shown above
      if (!error.message.includes('Stock insuficiente')) {
        toast.error(error.message || 'Error al actualizar estado');
      }
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/production-orders/${orderId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al eliminar orden');
      }

      toast.success('Orden eliminada');
      await loadProductionOrders();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast.error(error.message || 'Error al eliminar orden');
    }
  };

  // Filter orders
  const filteredOrders = productionOrders.filter(order => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.products.some(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

    // Date range filter logic
    let matchesDate = true;
    if (dateFilterFrom || dateFilterTo) {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0); // Reset time to compare only dates

      if (dateFilterFrom && dateFilterTo) {
        // Both dates selected - check if order is within range
        const fromDate = new Date(dateFilterFrom);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = new Date(dateFilterTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        matchesDate = orderDate >= fromDate && orderDate <= toDate;
      } else if (dateFilterFrom) {
        // Only "from" date - show orders from this date onwards
        const fromDate = new Date(dateFilterFrom);
        fromDate.setHours(0, 0, 0, 0);
        matchesDate = orderDate >= fromDate;
      } else if (dateFilterTo) {
        // Only "to" date - show orders up to this date
        const toDate = new Date(dateFilterTo);
        toDate.setHours(23, 59, 59, 999);
        matchesDate = orderDate <= toDate;
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  // ---- UI de la hoja "Nueva orden" ----------------------------------------
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [creando, setCreando] = useState(false);
  const [completando, setCompletando] = useState(false);
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);
  const [verFechas, setVerFechas] = useState(false);

  const puedeCrear = userRole === 'production' || userRole === 'admin';

  const agregarProducto = (product: Product) => {
    setSelectedProducts(prev => prev.some(p => p.productId === product.id)
      ? prev.map(p => p.productId === product.id ? { ...p, quantity: p.quantity + 1 } : p)
      : [...prev, { productId: product.id, name: product.name, quantity: 1 }]);
    setBusquedaProducto('');
  };

  const cambiarCantidad = (productId: string, cantidad: number) => {
    setSelectedProducts(prev => prev.map(p => p.productId === productId ? { ...p, quantity: Math.max(1, cantidad || 1) } : p));
  };

  const resultadosProducto = useMemo(() => {
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [busquedaProducto, products]);

  const abrirNueva = () => {
    setSelectedProducts([]);
    setNotes('');
    setBusquedaProducto('');
    setIsCreateDialogOpen(true);
  };

  const cerrarNueva = () => {
    if (creando) return;
    setIsCreateDialogOpen(false);
  };

  const crear = async () => {
    setCreando(true);
    await handleCreateOrder();
    setCreando(false);
  };

  const cambiarEstado = async (orderId: string, estado: ProductionOrderStatus) => {
    setAccionEnCurso(orderId);
    await handleUpdateStatus(orderId, estado);
    setAccionEnCurso(null);
  };

  const borrar = async (orderId: string) => {
    setAccionEnCurso(orderId);
    await handleDeleteOrder(orderId);
    setAccionEnCurso(null);
    setConfirmarBorrar(null);
  };

  const terminar = async () => {
    setCompletando(true);
    await handleConfirmComplete();
    setCompletando(false);
  };

  const conteo = {
    ALL: productionOrders.length,
    BORRADOR: productionOrders.filter(o => o.status === 'BORRADOR').length,
    EN_PROCESO: productionOrders.filter(o => o.status === 'EN_PROCESO').length,
    TERMINADA: productionOrders.filter(o => o.status === 'TERMINADA').length,
  };

  const ordenadas = [...filteredOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-3xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" className="boton-ios" style={botonRedondo}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Órdenes de producción</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Lo que se produce para reponer stock</p>
            </div>
            {puedeCrear && (
              <button type="button" onClick={abrirNueva} aria-label="Nueva orden de producción" className="boton-ios" style={botonRedondo}>
                <Plus style={{ width: 20, height: 20, color: '#fff' }} />
              </button>
            )}
          </div>
          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'rgba(255,255,255,0.75)' }} />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por producto o código"
              aria-label="Buscar órdenes"
              className="buscador-sobre-azul"
              style={{ width: '100%', height: 36, borderRadius: 10, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 16, padding: searchTerm ? '0 34px' : '0 12px 0 34px' }}
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} aria-label="Borrar búsqueda" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X style={{ width: 14, height: 14, color: '#fff' }} />
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {/* Estado */}
        <div className="sin-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px 12px', padding: '0 16px' }}>
          {ESTADOS.map(e => {
            const activo = statusFilter === e.key;
            return (
              <button key={e.key} type="button" aria-pressed={activo} onClick={() => setStatusFilter(e.key)}
                style={{
                  flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: activo ? 600 : 500,
                  background: activo ? e.color : IOS.tarjeta, color: activo ? '#fff' : IOS.texto,
                  boxShadow: activo ? 'none' : '0 0 0 0.5px rgba(0,0,0,0.08)',
                }}>
                {!activo && e.key !== 'ALL' && <span style={{ width: 8, height: 8, borderRadius: 4, background: e.color }} />}
                {e.label}
                <span style={{ fontSize: 12, fontWeight: 600, opacity: activo ? 0.9 : 0.5 }}>{conteo[e.key]}</span>
              </button>
            );
          })}
        </div>

        {/* Fechas */}
        <div style={tarjeta}>
          <button type="button" onClick={() => setVerFechas(v => !v)} aria-expanded={verFechas} className="fila-ios"
            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ fontSize: 17, color: IOS.texto }}>Fechas</span>
            <span className="truncate" style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 15, color: dateFilterFrom || dateFilterTo ? IOS.azul : IOS.secundario }}>
              {dateFilterFrom || dateFilterTo ? `${dateFilterFrom ? fechaCorta(dateFilterFrom) : '…'} – ${dateFilterTo ? fechaCorta(dateFilterTo) : 'hoy'}` : 'Todas'}
            </span>
            <ChevronDown style={{ width: 18, height: 18, color: 'rgba(60,60,67,0.3)', transform: verFechas ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {verFechas && (
            <>
              <Separador />
              <div style={{ display: 'flex', gap: 8, padding: '10px 16px' }}>
                <CampoFecha etiqueta="Desde" valor={dateFilterFrom} onCambio={setDateFilterFrom} />
                <CampoFecha etiqueta="Hasta" valor={dateFilterTo} onCambio={setDateFilterTo} />
              </div>
              {(dateFilterFrom || dateFilterTo) && (
                <>
                  <Separador />
                  <button type="button" onClick={() => { setDateFilterFrom(''); setDateFilterTo(''); }} className="fila-ios"
                    style={{ width: '100%', height: 44, border: 'none', background: 'transparent', fontSize: 17, color: IOS.azul, cursor: 'pointer' }}>
                    Quitar fechas
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: IOS.secundario }} />
          </div>
        ) : ordenadas.length === 0 ? (
          <div style={{ ...tarjeta, marginTop: 20, padding: '36px 24px', textAlign: 'center' }}>
            <Package style={{ width: 40, height: 40, color: '#C7C7CC', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 17, fontWeight: 600, color: IOS.texto }}>
              {productionOrders.length === 0 ? 'Todavía no hay órdenes' : 'Ninguna orden coincide'}
            </p>
            <p style={{ fontSize: 15, color: IOS.secundario, marginTop: 4, lineHeight: 1.4 }}>
              {productionOrders.length === 0
                ? 'Una orden registra lo que se produce: al iniciarla se descuenta la materia prima y al terminarla sube el stock del producto.'
                : 'Prueba con otro estado, fecha o búsqueda.'}
            </p>
            {productionOrders.length === 0 && puedeCrear && (
              <button type="button" onClick={abrirNueva} className="boton-ios"
                style={{ marginTop: 16, height: 44, padding: '0 20px', borderRadius: 22, border: 'none', background: IOS.azul, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
                Crear orden
              </button>
            )}
          </div>
        ) : (
          <>
            <h2 style={tituloSeccion}>{ordenadas.length} {ordenadas.length === 1 ? 'orden' : 'órdenes'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ordenadas.map(order => {
                const est = ESTADO_DE[order.status] ?? ESTADO_DE.BORRADOR;
                const Icono = est.icono;
                const ocupado = accionEnCurso === order.id;
                return (
                  <div key={order.id} style={tarjeta}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: est.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icono style={{ width: 18, height: 18, color: '#fff' }} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="truncate" style={{ fontSize: 16, fontWeight: 600, color: IOS.texto }}>{order.productName}</p>
                        <p className="truncate" style={{ fontSize: 13, color: IOS.secundario }}>
                          <span style={{ color: est.color, fontWeight: 600 }}>{est.label}</span>
                          {' · '}#{order.id.substring(0, 8).toUpperCase()}
                          {' · '}{fechaLarga(order.createdAt)}
                        </p>
                      </div>
                    </div>

                    {order.products.map((p, idx) => (
                      <div key={p.productId + idx}>
                        <Separador inset={60} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px 9px 60px' }}>
                          <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 15, color: '#3C3C43' }}>{p.name}</span>
                          {order.status === 'TERMINADA' && p.producedQuantity !== undefined ? (
                            <span style={{ fontSize: 14, flexShrink: 0 }}>
                              <span style={{ color: IOS.verde, fontWeight: 600 }}>{p.producedQuantity} ok</span>
                              {(p.wasteQuantity || 0) > 0 && <span style={{ color: IOS.rojo, fontWeight: 600 }}> · {p.wasteQuantity} merma</span>}
                            </span>
                          ) : (
                            <span style={{ fontSize: 15, fontWeight: 600, color: IOS.texto, flexShrink: 0 }}>{p.quantity}</span>
                          )}
                        </div>
                      </div>
                    ))}

                    {order.notes && (
                      <>
                        <Separador inset={60} />
                        <p style={{ fontSize: 14, color: IOS.secundario, padding: '9px 16px 9px 60px', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{order.notes}</p>
                      </>
                    )}

                    {/* Acciones */}
                    {order.status === 'TERMINADA' ? (
                      order.completedAt && (
                        <>
                          <Separador />
                          <p style={{ fontSize: 13, color: IOS.secundario, padding: '10px 16px' }}>Terminada el {fechaLarga(order.completedAt)}</p>
                        </>
                      )
                    ) : puedeCrear && (
                      <>
                        <Separador />
                        {confirmarBorrar === order.id ? (
                          <div style={{ padding: 12 }}>
                            <p style={{ fontSize: 14, color: IOS.secundario, textAlign: 'center', margin: '0 0 10px' }}>¿Eliminar esta orden? No se puede deshacer.</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <button type="button" onClick={() => setConfirmarBorrar(null)} disabled={ocupado} className="boton-ios" style={{ ...botonAccion, background: '#E3E3E8', color: IOS.texto }}>Cancelar</button>
                              <button type="button" onClick={() => void borrar(order.id)} disabled={ocupado} className="boton-ios" style={{ ...botonAccion, background: IOS.rojo, color: '#fff' }}>
                                {ocupado && <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />}Eliminar
                              </button>
                            </div>
                          </div>
                        ) : order.status === 'BORRADOR' ? (
                          <div style={{ display: 'flex', gap: 10, padding: 12 }}>
                            <button type="button" onClick={() => setConfirmarBorrar(order.id)} disabled={ocupado} className="boton-ios"
                              style={{ ...botonAccion, flex: '0 0 auto', padding: '0 16px', background: 'rgba(255,59,48,0.1)', color: IOS.rojo }}>
                              Eliminar
                            </button>
                            <button type="button" onClick={() => void cambiarEstado(order.id, 'EN_PROCESO')} disabled={ocupado} className="boton-ios"
                              style={{ ...botonAccion, background: IOS.azul, color: '#fff' }}>
                              {ocupado ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Clock style={{ width: 17, height: 17 }} />}
                              Iniciar producción
                            </button>
                          </div>
                        ) : (
                          <div style={{ padding: 12 }}>
                            <button type="button" onClick={() => handleOpenCompleteDialog(order)} disabled={ocupado} className="boton-ios"
                              style={{ ...botonAccion, width: '100%', background: IOS.verde, color: '#fff' }}>
                              <CheckCircle2 style={{ width: 17, height: 17 }} />
                              Terminar y registrar lo producido
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Herramientas */}
        {(onNavigateToIngredients || onNavigateToRecipes) && puedeCrear && (
          <>
            <h2 style={tituloSeccion}>Herramientas</h2>
            <div style={tarjeta}>
              {onNavigateToIngredients && (
                <FilaAcceso icono={Layers} color="#AF52DE" titulo="Materia prima" onClick={onNavigateToIngredients} />
              )}
              {onNavigateToIngredients && onNavigateToRecipes && <Separador inset={56} />}
              {onNavigateToRecipes && (
                <FilaAcceso icono={BookOpen} color={IOS.verde} titulo="Recetas" onClick={onNavigateToRecipes} />
              )}
            </div>
          </>
        )}
      </main>

      {/* Hoja: nueva orden */}
      <Hoja abierta={isCreateDialogOpen} onCerrar={cerrarNueva} titulo="Nueva orden"
        izquierda={<button type="button" onClick={cerrarNueva} disabled={creando} style={textoBoton}>Cancelar</button>}
        derecha={
          <button type="button" onClick={() => void crear()} disabled={creando || selectedProducts.length === 0}
            style={{ ...textoBoton, fontWeight: 600, opacity: selectedProducts.length === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {creando && <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />}
            {creando ? 'Creando' : 'Crear'}
          </button>
        }>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: IOS.secundario }} />
          <input
            type="search"
            value={busquedaProducto}
            onChange={(e) => setBusquedaProducto(e.target.value)}
            placeholder="Buscar producto para agregar"
            aria-label="Buscar producto"
            style={{ width: '100%', height: 36, borderRadius: 10, border: 'none', outline: 'none', background: IOS.relleno, fontSize: 16, padding: '0 12px 0 34px', color: IOS.texto }}
          />
        </div>

        {busquedaProducto.trim() && (
          <div style={{ ...tarjeta, marginTop: 8 }}>
            {resultadosProducto.length === 0 ? (
              <p style={{ fontSize: 15, color: IOS.secundario, padding: '12px 16px' }}>Ningún producto coincide.</p>
            ) : resultadosProducto.map((p, idx) => (
              <div key={p.id}>
                {idx > 0 && <Separador />}
                <button type="button" onClick={() => agregarProducto(p)} className="fila-ios"
                  style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                  <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 16, color: IOS.texto }}>{p.name}</span>
                  <span style={{ fontSize: 13, color: IOS.secundario, flexShrink: 0 }}>
                    {p.unlimitedStock || p.stock === -1 ? 'sin control' : `stock ${p.stock}`}
                  </span>
                  <Plus style={{ width: 18, height: 18, color: IOS.azul, flexShrink: 0 }} />
                </button>
              </div>
            ))}
          </div>
        )}

        <h3 style={tituloSeccion}>A producir</h3>
        <div style={tarjeta}>
          {selectedProducts.length === 0 ? (
            <p style={{ fontSize: 15, color: IOS.secundario, padding: '12px 16px', lineHeight: 1.4 }}>Busca un producto arriba para agregarlo.</p>
          ) : selectedProducts.map((item, idx) => (
            <div key={item.productId}>
              {idx > 0 && <Separador />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 16px' }}>
                <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 16, color: IOS.texto }}>{item.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', background: IOS.relleno, borderRadius: 9, flexShrink: 0 }}>
                  <button type="button" aria-label={`Restar ${item.name}`} onClick={() => item.quantity <= 1 ? handleRemoveProduct(item.productId) : cambiarCantidad(item.productId, item.quantity - 1)}
                    style={botonPaso}>
                    {item.quantity <= 1 ? <X style={{ width: 15, height: 15, color: IOS.rojo }} /> : <Minus style={{ width: 15, height: 15 }} />}
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => cambiarCantidad(item.productId, parseInt(e.target.value, 10))}
                    aria-label={`Cantidad de ${item.name}`}
                    style={{ width: 52, height: 32, border: 'none', background: 'transparent', textAlign: 'center', fontSize: 16, fontWeight: 600, color: IOS.texto, outline: 'none' }}
                  />
                  <button type="button" aria-label={`Sumar ${item.name}`} onClick={() => cambiarCantidad(item.productId, item.quantity + 1)} style={botonPaso}>
                    <Plus style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <h3 style={tituloSeccion}>Notas</h3>
        <div style={tarjeta}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional. Ej.: para el evento del sábado"
            rows={3}
            aria-label="Notas"
            style={{ display: 'block', width: '100%', border: 'none', outline: 'none', resize: 'none', padding: '11px 16px', fontSize: 16, lineHeight: 1.4, fontFamily: 'inherit', background: 'transparent', color: IOS.texto }}
          />
        </div>
        <p style={{ fontSize: 13, color: IOS.secundario, margin: '8px 16px 0', lineHeight: 1.4 }}>
          La orden queda como borrador. Al iniciarla se descuenta la materia prima según las recetas.
        </p>
      </Hoja>

      {/* Hoja: terminar */}
      <Hoja abierta={isCompleteDialogOpen} onCerrar={() => !completando && setIsCompleteDialogOpen(false)} titulo="Terminar orden"
        izquierda={<button type="button" onClick={() => setIsCompleteDialogOpen(false)} disabled={completando} style={textoBoton}>Cancelar</button>}
        derecha={
          <button type="button" onClick={() => void terminar()} disabled={completando}
            style={{ ...textoBoton, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {completando && <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />}
            {completando ? 'Guardando' : 'Terminar'}
          </button>
        }>
        <p style={{ fontSize: 14, color: IOS.secundario, margin: '0 16px 4px', lineHeight: 1.4 }}>
          Anota cuánto salió bien y cuánto se perdió. El stock del producto sube con lo producido.
        </p>
        {completionData.map(item => {
          const difiere = item.producedQuantity + item.wasteQuantity !== item.targetQuantity;
          return (
            <div key={item.productId}>
              <h3 style={tituloSeccion}>{item.name} · objetivo {item.targetQuantity}</h3>
              <div style={tarjeta}>
                <FilaNumero etiqueta="Producido" color={IOS.verde} valor={item.producedQuantity}
                  onCambio={(v) => handleUpdateCompletionData(item.productId, 'producedQuantity', v)} />
                <Separador />
                <FilaNumero etiqueta="Merma" color={IOS.rojo} valor={item.wasteQuantity}
                  onCambio={(v) => handleUpdateCompletionData(item.productId, 'wasteQuantity', v)} />
              </div>
              {difiere && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: IOS.naranja, margin: '6px 16px 0' }}>
                  <AlertCircle style={{ width: 14, height: 14 }} />
                  Suma {item.producedQuantity + item.wasteQuantity}, distinto del objetivo ({item.targetQuantity})
                </p>
              )}
            </div>
          );
        })}
      </Hoja>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
  rojo: '#FF3B30',
  naranja: '#FF9500',
  verde: '#34C759',
};

const ESTADOS: { key: ProductionOrderStatus | 'ALL'; label: string; color: string }[] = [
  { key: 'ALL', label: 'Todas', color: IOS.azul },
  { key: 'BORRADOR', label: 'Borradores', color: '#8E8E93' },
  { key: 'EN_PROCESO', label: 'En proceso', color: IOS.azul },
  { key: 'TERMINADA', label: 'Terminadas', color: IOS.verde },
];

const ESTADO_DE: Record<ProductionOrderStatus, { label: string; color: string; icono: any }> = {
  BORRADOR: { label: 'Borrador', color: '#8E8E93', icono: FileText },
  EN_PROCESO: { label: 'En proceso', color: IOS.azul, icono: Clock },
  TERMINADA: { label: 'Terminada', color: IOS.verde, icono: CheckCircle2 },
};

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');

const fechaCorta = (yyyyMmDd: string) => {
  const [y, m, d] = yyyyMmDd.split('-');
  return y && m && d ? `${d}/${m}` : yyyyMmDd;
};

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };

const tituloSeccion: React.CSSProperties = {
  fontSize: 13, fontWeight: 400, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '22px 16px 7px',
};

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
};

const botonAccion: React.CSSProperties = {
  flex: 1, height: 44, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
};

const botonPaso: React.CSSProperties = {
  width: 34, height: 32, border: 'none', background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: IOS.azul,
};

const textoBoton: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, fontSize: 17, color: IOS.azul, cursor: 'pointer',
};

function Separador({ inset = 16 }: { inset?: number }) {
  return <div style={{ height: 0.5, background: IOS.separador, marginLeft: inset }} />;
}

function FilaAcceso({ icono: Icono, color, titulo, onClick }: { icono: any; color: string; titulo: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="fila-ios"
      style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px 0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ width: 29, height: 29, borderRadius: 7, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icono style={{ width: 17, height: 17, color: '#fff' }} />
      </span>
      <span style={{ flex: 1, fontSize: 17, color: IOS.texto }}>{titulo}</span>
      <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC' }} />
    </button>
  );
}

function FilaNumero({ etiqueta, color, valor, onCambio }: { etiqueta: string; color: string; valor: number; onCambio: (v: string) => void }) {
  return (
    <label style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', cursor: 'text' }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 17, color: IOS.texto }}>{etiqueta}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-label={etiqueta}
        style={{ width: 90, height: 36, border: 'none', outline: 'none', borderRadius: 8, background: IOS.relleno, textAlign: 'right', padding: '0 10px', fontSize: 17, fontWeight: 600, color: IOS.texto }}
      />
    </label>
  );
}

/** Fecha nativa con su etiqueta visible: iOS no muestra placeholder en type=date. */
function CampoFecha({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRadius: 9, overflow: 'hidden', background: IOS.relleno }}>
      <input
        type="date"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-label={etiqueta}
        style={{
          display: 'block', width: '100%', boxSizing: 'border-box', height: 36, border: 'none', padding: '0 10px',
          WebkitAppearance: 'none', appearance: 'none', background: 'transparent', fontSize: 15,
          color: valor ? IOS.texto : 'transparent',
        }}
      />
      {!valor && (
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: IOS.secundario, pointerEvents: 'none' }}>
          {etiqueta}
        </span>
      )}
    </div>
  );
}

/** Hoja inferior estilo iOS (Cancelar / título / acción). */
function Hoja({ abierta, onCerrar, titulo, izquierda, derecha, children }: {
  abierta: boolean; onCerrar: () => void; titulo: string; izquierda: React.ReactNode; derecha: React.ReactNode; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!abierta) return;
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', t);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', t); document.body.style.overflow = prev; };
  }, [abierta, onCerrar]);

  return createPortal(
    <AnimatePresence>
      {abierta && (
        <>
          <motion.div key="fondo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCerrar}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60 }} />
          <motion.div key="hoja" role="dialog" aria-modal="true" aria-label={titulo}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61, margin: '0 auto', maxWidth: 640, height: '92dvh',
              background: IOS.fondo, borderRadius: '14px 14px 0 0', display: 'flex', flexDirection: 'column',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 10px', gap: 8 }}>
              <div style={{ flex: 1, textAlign: 'left' }}>{izquierda}</div>
              <span className="truncate" style={{ flex: 2, textAlign: 'center', fontSize: 17, fontWeight: 600, color: IOS.texto }}>{titulo}</span>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{derecha}</div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 16px max(env(safe-area-inset-bottom), 24px)' }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
