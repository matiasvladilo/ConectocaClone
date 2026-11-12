import { useState, useEffect } from 'react';
import { Order } from '../App';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { DeliveryGuide } from './DeliveryGuide';
import {
  ArrowLeft,
  Package,
  Clock,
  PlayCircle,
  CheckCircle2,
  Truck,
  XCircle,
  Star,
  MessageSquare,
  Search,
  X,
  ChevronDown,
  SlidersHorizontal,
  Printer,
} from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { PaginationInfo, categoriesAPI, productsAPI, ordersAPI } from '../utils/api';
import { toast } from 'sonner';
import { idsDeCategoriaConHijas } from '../utils/categoryTree';
import { parseDate } from '../utils/dateUtils';

interface BakeryKDSProps {
  orders: Order[];
  onBack: () => void;
  onUpdateOrderStatus: (orderId: string, status: Order['status'], progress: number) => void;
  accessToken: string | null;
  lastSync?: Date | null;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  onGoToKDS?: () => void;
  isLoading?: boolean;
}

type FilterStatus = 'all' | 'pending' | 'in_progress' | 'completed' | 'dispatched' | 'delivered' | 'cancelled';
type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'customer-asc' | 'customer-desc';
type ViewMode = 'grid' | 'list';

export function BakeryKDS({ orders, onBack, onUpdateOrderStatus, accessToken, lastSync, pagination, onPageChange, onGoToKDS, isLoading = false }: BakeryKDSProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showDeliveryGuide, setShowDeliveryGuide] = useState(false);
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Pasteleria Products State
  const [pastryProductIds, setPastryProductIds] = useState<Set<string>>(new Set());

  // New advanced filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [priorityOrders, setPriorityOrders] = useState<Set<string>>(new Set());

  // Advanced filter states
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  // Load pastry products on mount
  useEffect(() => {
    if (accessToken) {
      loadPastryProducts();
    }
  }, [accessToken]);

  const loadPastryProducts = async () => {
    if (!accessToken) return;

    try {
      const categories = await categoriesAPI.getAll(accessToken);
      const pastryCategory = categories.find(c => c.name.toLowerCase().includes('pasteler'));

      // Con subcategorías, comparar contra el id de Pastelería a secas dejaba
      // fuera todo lo que se organizara en "Tortas" o "Galletas": esos pedidos
      // no llegaban nunca a la pantalla de quien los prepara. Se acepta la
      // categoría y sus hijas. Los fallbacks por nombre siguen, porque cubren
      // productos sin categoryId.
      const idsDePasteleria = pastryCategory
        ? idsDeCategoriaConHijas(categories, pastryCategory.id)
        : null;

      const allProducts = await productsAPI.getAll(accessToken);
      const pastryIds = new Set<string>();

      allProducts.forEach(p => {
        // Si ninguna categoría se llama "pasteler...", se conserva tal cual la
        // comparación de antes (`p.categoryId === undefined`): peca de incluir
        // de más, y en una pantalla de cocina mostrar un pedido de sobra es
        // mucho menos grave que perderlo. Cambiarlo acá sería otra decisión.
        const porCategoria = idsDePasteleria !== null
          ? (!!p.categoryId && idsDePasteleria.has(p.categoryId))
          : p.categoryId === undefined;
        if (porCategoria || p.category?.toLowerCase() === 'pastelería' || p.category?.toLowerCase() === 'pasteleria') {
          pastryIds.add(p.id);
        }
      });
      setPastryProductIds(pastryIds);
    } catch (error: any) {
      console.error('Error loading pastry products:', error);
    }
  };

  // Filter options array for navigation
  const filterStatusOptions: FilterStatus[] = ['all', 'pending', 'in_progress', 'completed', 'dispatched', 'delivered', 'cancelled'];
  const filterStatusIndex = filterStatusOptions.indexOf(filterStatus);

  // Navigation handlers
  const handlePreviousFilter = () => {
    if (filterStatusIndex > 0) {
      setFilterStatus(filterStatusOptions[filterStatusIndex - 1]);
    }
  };

  const handleNextFilter = () => {
    if (filterStatusIndex < filterStatusOptions.length - 1) {
      setFilterStatus(filterStatusOptions[filterStatusIndex + 1]);
    }
  };

  const getFilterStatusLabel = (status: FilterStatus) => {
    switch (status) {
      case 'all':
        return 'Todos los Pedidos';
      case 'pending':
        return 'Pendientes';
      case 'in_progress':
        return 'En Preparación';
      case 'completed':
        return 'Listos para Despacho';
      case 'dispatched':
        return 'Despachados';
      case 'delivered':
        return 'Entregados/Recibidos';
      case 'cancelled':
        return 'Cancelados';
      default:
        return 'Todos';
    }
  };

  const getFilterStatusColor = (status: FilterStatus) => {
    switch (status) {
      case 'all':
        return 'bg-white text-blue-900';
      case 'pending':
        return 'bg-yellow-500 text-yellow-900';
      case 'in_progress':
        return 'bg-blue-500 text-blue-900';
      case 'completed':
        return 'bg-green-500 text-green-900';
      case 'dispatched':
        return 'bg-indigo-500 text-indigo-900';
      case 'delivered':
        return 'bg-teal-500 text-teal-900';
      case 'cancelled':
        return 'bg-red-500 text-red-900';
      default:
        return 'bg-white text-blue-900';
    }
  };

  const getFilterStatusIcon = (status: FilterStatus) => {
    switch (status) {
      case 'all':
        return <Package className="w-5 h-5" />;
      case 'pending':
        return <Clock className="w-5 h-5" />;
      case 'in_progress':
        return <PlayCircle className="w-5 h-5" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'dispatched':
        return <Truck className="w-5 h-5" />;
      case 'delivered':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500';
      case 'in_progress':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'dispatched':
        return 'bg-indigo-500';
      case 'delivered':
        return 'bg-teal-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getStatusLabel = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'Pendiente';
      case 'in_progress':
        return 'En Preparación';
      case 'completed':
        return 'Listo para Despacho';
      case 'dispatched':
        return 'Despachado';
      case 'delivered':
        return 'Recibido';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'in_progress':
        return <PlayCircle className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'dispatched':
        return <Truck className="w-4 h-4" />;
      case 'delivered':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusCount = (status: FilterStatus) => {
    if (status === 'all') return orders.length;
    return orders.filter(o => o.status === status).length;
  };



  // Toggle priority
  const togglePriority = (orderId: string) => {
    setPriorityOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
        toast.success('Pedido removido de prioritarios');
      } else {
        newSet.add(orderId);
        toast.success('Pedido marcado como prioritario');
      }
      return newSet;
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
    setCustomerFilter('');
    setSortBy('date-desc');
  };

  // Apply search filter
  const applySearchFilter = (order: Order) => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      order.id.toLowerCase().includes(query) ||
      order.customerName.toLowerCase().includes(query) ||
      order.productName.toLowerCase().includes(query) ||
      (order.deliveryAddress && order.deliveryAddress.toLowerCase().includes(query))
    );
  };

  // Apply advanced filters
  const applyAdvancedFilters = (order: Order) => {
    // Date range filter
    if (dateFrom && order.createdAt) {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      if (orderDate < dateFrom) return false;
    }
    if (dateTo && order.createdAt) {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      if (orderDate > dateTo) return false;
    }

    // Amount filter
    if (minAmount && order.total) {
      if (order.total < parseFloat(minAmount)) return false;
    }
    if (maxAmount && order.total) {
      if (order.total > parseFloat(maxAmount)) return false;
    }

    // Customer filter
    if (customerFilter && !order.customerName.toLowerCase().includes(customerFilter.toLowerCase())) {
      return false;
    }

    return true;
  };

  // Sort orders
  const sortOrders = (ordersToSort: Order[]) => {
    const sorted = [...ordersToSort];

    switch (sortBy) {
      case 'date-desc':
        return sorted.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
      case 'date-asc':
        return sorted.sort((a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());
      case 'amount-desc':
        return sorted.sort((a, b) => (b.total || 0) - (a.total || 0));
      case 'amount-asc':
        return sorted.sort((a, b) => (a.total || 0) - (b.total || 0));
      case 'customer-asc':
        return sorted.sort((a, b) => a.customerName.localeCompare(b.customerName));
      case 'customer-desc':
        return sorted.sort((a, b) => b.customerName.localeCompare(a.customerName));
      default:
        return sorted;
    }
  };

  // Get filtered and sorted orders
  const getFilteredOrders = () => {
    let filtered = orders;

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(o => o.status === filterStatus);
    }

    // Apply pastry category filter

    filtered = filtered.map(order => {
      // Only keep products that are in the Pastelería category
      const pastryProducts = order.products?.filter(product => pastryProductIds.has(product.productId)) || [];
      return { ...order, products: pastryProducts };
    }).filter(order => order.products.length > 0);



    // Apply search filter
    filtered = filtered.filter(applySearchFilter);

    // Apply advanced filters
    filtered = filtered.filter(applyAdvancedFilters);

    // Sort orders
    filtered = sortOrders(filtered);

    // Priority orders first
    filtered.sort((a, b) => {
      const aPriority = priorityOrders.has(a.id) ? 1 : 0;
      const bPriority = priorityOrders.has(b.id) ? 1 : 0;
      return bPriority - aPriority;
    });

    return filtered;
  };

  const filteredOrders = getFilteredOrders();
  const hasActiveFilters = searchQuery || dateFrom || dateTo || minAmount || maxAmount || customerFilter;

  const handleStatusChange = (orderId: string, newStatus: Order['status']) => {
    const progress = (newStatus === 'completed' || newStatus === 'dispatched' || newStatus === 'delivered' || newStatus === 'cancelled')
      ? 100
      : newStatus === 'in_progress' ? 50 : 0;
    onUpdateOrderStatus(orderId, newStatus, progress);
    toast.success(`Pedido: ${getStatusLabel(newStatus).toLowerCase()}`);
    setSelectedOrder(null);
  };

  const handleItemStatusChange = async (orderId: string, productId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    if (!accessToken) return;
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const currentItemStatuses = order.itemStatuses || {};
      const updatedStatuses = {
        ...currentItemStatuses,
        [productId]: newStatus
      };

      // Optimistic visual update
      order.itemStatuses = updatedStatuses;
      setUpdateTrigger(prev => prev + 1);

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...order, itemStatuses: updatedStatuses });
      }

      await ordersAPI.update(accessToken, orderId, { itemStatuses: updatedStatuses });
    } catch (error: any) {
      console.error('Error al actualizar estado del ítem:', error);
      toast.error('Error al actualizar el estado del producto');
    }
  };

  // Touch/Swipe handling for filter navigation
  const handleSwipe = (direction: number) => {
    if (direction > 0) {
      handleNextFilter();
    } else {
      handlePreviousFilter();
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    // Pure YYYY-MM-DD → parse as local calendar date to avoid UTC midnight shift
    const date = /^\d{4}-\d{2}-\d{2}/.test(dateString) ? parseDate(dateString) : new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  // ---- Vista ---------------------------------------------------------------
  const [verFiltros, setVerFiltros] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  // Pedidos con productos de pastelería, sin filtrar por estado: base de los
  // contadores de las píldoras (antes contaban todos los pedidos, incluidos
  // los que no tenían nada de pastelería).
  const pedidosDePasteleria = orders
    .map(order => ({ ...order, products: order.products?.filter(p => pastryProductIds.has(p.productId)) || [] }))
    .filter(order => order.products.length > 0);
  const conteoPorEstado = (estado: FilterStatus) =>
    estado === 'all' ? pedidosDePasteleria.length : pedidosDePasteleria.filter(o => o.status === estado).length;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const esFuturo = (deadline?: string) => {
    if (!deadline) return false;
    const [y, m, d] = deadline.split('T')[0].split('-').map(Number);
    if (!y || !m || !d) return false;
    return new Date(y, m - 1, d).getTime() > hoy.getTime();
  };
  const futuros = filteredOrders.filter(o => esFuturo(o.deadline));
  const deHoy = filteredOrders.filter(o => !esFuturo(o.deadline));

  const abrirPedido = (order: Order) => {
    setConfirmarCancelar(false);
    setSelectedOrder(order);
  };

  // Siguiente paso natural del pedido (botón grande de la hoja).
  const siguiente: Partial<Record<Order['status'], { estado: Order['status']; label: string; color: string }>> = {
    pending: { estado: 'in_progress', label: 'Empezar a preparar', color: KDS.azul },
    in_progress: { estado: 'completed', label: 'Marcar listo para despacho', color: KDS.verde },
    completed: { estado: 'dispatched', label: 'Marcar despachado', color: KDS.indigo },
    dispatched: { estado: 'delivered', label: 'Marcar recibido', color: KDS.turquesa },
  };

  const filtrosActivos = [dateFrom || dateTo, customerFilter, sortBy !== 'date-desc'].filter(Boolean).length;

  const renderTarjeta = (order: Order, futuro: boolean) => {
    const est = ESTADO_KDS[order.status] ?? ESTADO_KDS.pending;
    const Icono = est.icono;
    const prioritario = priorityOrders.has(order.id);
    return (
      <div key={order.id} style={{ ...tarjeta, boxShadow: prioritario ? `0 0 0 2px ${KDS.naranja}` : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <button type="button" onClick={() => abrirPedido(order)} className="fila-ios"
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px 12px 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: est.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icono style={{ width: 18, height: 18, color: '#fff' }} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="truncate" style={{ fontSize: 16, fontWeight: 600, color: KDS.texto }}>{order.customerName}</span>
                {order.notes && order.notes.trim() && <MessageSquare style={{ width: 14, height: 14, color: KDS.naranja, flexShrink: 0 }} aria-label="Tiene observaciones" />}
              </span>
              <span className="truncate" style={{ display: 'block', fontSize: 13, color: KDS.secundario }}>
                <span style={{ color: est.color, fontWeight: 600 }}>{est.label}</span>
                {' · '}{futuro ? `entrega ${formatDate(order.deadline)}` : formatTime(order.createdAt || order.date)}
                {' · '}#{order.id.slice(0, 8).toUpperCase()}
              </span>
            </span>
          </button>
          <button type="button" onClick={() => togglePriority(order.id)} aria-pressed={prioritario}
            aria-label={prioritario ? 'Quitar prioridad' : 'Marcar como prioritario'}
            style={{ width: 48, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Star style={{ width: 20, height: 20, color: prioritario ? KDS.naranja : '#C7C7CC', fill: prioritario ? KDS.naranja : 'none' }} />
          </button>
        </div>
        {(order.products || []).map((product, idx) => {
          const estadoItem = order.itemStatuses?.[product.productId] || 'pending';
          return (
            <div key={product.productId + idx}>
              <Separador inset={60} />
              <button type="button" onClick={() => abrirPedido(order)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 60px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: estadoItem === 'completed' ? KDS.verde : estadoItem === 'in_progress' ? KDS.azul : KDS.naranja }} />
                <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 15, color: '#3C3C43' }}>{product.name}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: KDS.texto, flexShrink: 0 }}>×{product.quantity}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: KDS.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #C2185B 0%, #FF2D55 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-5xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" className="boton-ios" style={botonRedondo}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Pastelería</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                Pedidos con productos de pastelería
                {lastSync ? ` · act. ${lastSync.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : ''}
              </p>
            </div>
          </div>
          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'rgba(255,255,255,0.8)' }} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar local, producto o código"
              aria-label="Buscar pedidos"
              className="buscador-sobre-azul"
              style={{ width: '100%', height: 36, borderRadius: 10, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 16, padding: searchQuery ? '0 34px' : '0 12px 0 34px' }}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="Borrar búsqueda" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X style={{ width: 14, height: 14, color: '#fff' }} />
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {/* Estado */}
        <div className="sin-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px 12px', padding: '0 16px' }}>
          {filterStatusOptions.map(key => {
            const activo = filterStatus === key;
            const color = key === 'all' ? KDS.azul : (ESTADO_KDS[key as Order['status']]?.color ?? KDS.azul);
            return (
              <button key={key} type="button" aria-pressed={activo} onClick={() => setFilterStatus(key)}
                style={{
                  flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: activo ? 600 : 500,
                  background: activo ? color : KDS.tarjeta, color: activo ? '#fff' : KDS.texto,
                  boxShadow: activo ? 'none' : '0 0 0 0.5px rgba(0,0,0,0.08)',
                }}>
                {!activo && key !== 'all' && <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />}
                {PILDORA[key]}
                <span style={{ fontSize: 12, fontWeight: 600, opacity: activo ? 0.9 : 0.5 }}>{conteoPorEstado(key)}</span>
              </button>
            );
          })}
        </div>

        {/* Filtros */}
        <div style={tarjeta}>
          <button type="button" onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros} className="fila-ios"
            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
            <SlidersHorizontal style={{ width: 18, height: 18, color: KDS.azul, flexShrink: 0 }} />
            <span style={{ fontSize: 17, color: KDS.texto }}>Filtros y orden</span>
            <span style={{ flex: 1, textAlign: 'right', fontSize: 15, color: filtrosActivos ? KDS.azul : KDS.secundario }}>
              {filtrosActivos ? `${filtrosActivos} activo${filtrosActivos === 1 ? '' : 's'}` : 'Ninguno'}
            </span>
            <ChevronDown style={{ width: 18, height: 18, color: 'rgba(60,60,67,0.3)', transform: verFiltros ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {verFiltros && (
            <>
              <Separador />
              <div className="fila-ios" style={{ position: 'relative', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
                <span style={{ fontSize: 17, color: KDS.texto }}>Ordenar</span>
                <span className="truncate" style={{ flex: 1, textAlign: 'right', fontSize: 17, color: KDS.secundario }}>{ORDEN[sortBy]}</span>
                <ChevronDown style={{ width: 16, height: 16, color: 'rgba(60,60,67,0.3)' }} />
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} aria-label="Ordenar"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, fontSize: 16 }}>
                  {Object.entries(ORDEN).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                </select>
              </div>
              <Separador />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 44 }}>
                <span style={{ fontSize: 17, color: KDS.texto }}>Local</span>
                <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder="Todos" aria-label="Filtrar por local"
                  style={{ flex: 1, minWidth: 0, height: 44, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: 17, color: KDS.texto }} />
              </div>
              <Separador />
              <div style={{ padding: '10px 16px' }}>
                <p style={{ fontSize: 13, color: KDS.secundario, margin: '0 0 6px' }}>Fecha del pedido</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <CampoFecha etiqueta="Desde" valor={dateFrom} onCambio={setDateFrom} />
                  <CampoFecha etiqueta="Hasta" valor={dateTo} onCambio={setDateTo} />
                </div>
              </div>
              {(hasActiveFilters || sortBy !== 'date-desc') && (
                <>
                  <Separador />
                  <button type="button" onClick={clearAllFilters} className="fila-ios"
                    style={{ width: '100%', height: 44, border: 'none', background: 'transparent', fontSize: 17, color: KDS.azul, cursor: 'pointer' }}>
                    Quitar filtros
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Pedidos */}
        <div style={{ opacity: isLoading ? 0.5 : 1, transition: 'opacity .3s' }}>
          {filteredOrders.length === 0 ? (
            <div style={{ ...tarjeta, marginTop: 20, padding: '36px 24px', textAlign: 'center' }}>
              <Package style={{ width: 40, height: 40, color: '#C7C7CC', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 17, fontWeight: 600, color: KDS.texto }}>No hay pedidos aquí</p>
              <p style={{ fontSize: 15, color: KDS.secundario, marginTop: 4 }}>Prueba con otro estado o búsqueda.</p>
            </div>
          ) : (
            <>
              {deHoy.length > 0 && (
                <>
                  <h2 style={tituloSeccion}>Hoy y atrasados · {deHoy.length}</h2>
                  <div className="kds-grilla">{deHoy.map(o => renderTarjeta(o, false))}</div>
                </>
              )}
              {futuros.length > 0 && (
                <>
                  <h2 style={tituloSeccion}>Programados · {futuros.length}</h2>
                  <div className="kds-grilla">{futuros.map(o => renderTarjeta(o, true))}</div>
                </>
              )}
            </>
          )}
        </div>

        {pagination && onPageChange && (
          <div style={{ marginTop: 16 }}>
            <PaginationControls pagination={pagination} onPageChange={onPageChange} isLoading={isLoading} />
          </div>
        )}
      </main>

      <style>{`
        .kds-grilla { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 768px) { .kds-grilla { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
        @media (min-width: 1200px) { .kds-grilla { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      `}</style>

      {/* Detalle del pedido */}
      <Dialog open={!!selectedOrder} onOpenChange={(abierto) => { if (!abierto) setSelectedOrder(null); }}>
        <DialogContent
          className="hoja-ios"
          onCloseAutoFocus={(e) => e.preventDefault()}
          style={{
            top: 'auto', bottom: 0, left: 0, right: 0, translate: 'none', margin: '0 auto',
            width: '100%', maxWidth: 640, height: '92dvh', padding: 0, gap: 0, border: 'none',
            borderRadius: '14px 14px 0 0', background: KDS.fondo, display: 'flex', flexDirection: 'column',
          }}
        >
          {selectedOrder && (() => {
            const est = ESTADO_KDS[selectedOrder.status] ?? ESTADO_KDS.pending;
            const paso = siguiente[selectedOrder.status];
            const otros = (['pending', 'in_progress', 'completed', 'dispatched', 'delivered'] as Order['status'][])
              .filter(s => s !== selectedOrder.status && s !== paso?.estado);
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <DialogTitle className="truncate" style={{ fontSize: 17, fontWeight: 600, color: KDS.texto }}>{selectedOrder.customerName}</DialogTitle>
                    <DialogDescription style={{ fontSize: 13, color: KDS.secundario }}>
                      Pedido #{selectedOrder.id.slice(0, 8).toUpperCase()}
                    </DialogDescription>
                  </div>
                  <button type="button" onClick={() => setSelectedOrder(null)} aria-label="Cerrar"
                    style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#E3E3E8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X style={{ width: 17, height: 17, color: '#3C3C43' }} />
                  </button>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 16px' }}>
                  <div style={tarjeta}>
                    <FilaInfo etiqueta="Estado" valor={<span style={{ color: est.color, fontWeight: 600 }}>{est.label}</span>} />
                    <Separador />
                    <FilaInfo etiqueta="Entrega" valor={selectedOrder.deadline ? formatDate(selectedOrder.deadline) : '—'} />
                    <Separador />
                    <FilaInfo etiqueta="Ingresó" valor={new Date(selectedOrder.createdAt || selectedOrder.date).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} />
                    {selectedOrder.deliveryAddress && !/sin direcci/i.test(selectedOrder.deliveryAddress) && (
                      <>
                        <Separador />
                        <FilaInfo etiqueta="Dirección" valor={selectedOrder.deliveryAddress} />
                      </>
                    )}
                  </div>

                  {selectedOrder.notes && selectedOrder.notes.trim() && (
                    <>
                      <h3 style={tituloSeccion}>Observaciones</h3>
                      <div style={{ ...tarjeta, padding: '12px 16px', background: '#FFF8E6' }}>
                        <p style={{ fontSize: 16, color: KDS.texto, whiteSpace: 'pre-wrap', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{selectedOrder.notes}</p>
                      </div>
                    </>
                  )}

                  <h3 style={tituloSeccion}>Productos de pastelería</h3>
                  <div style={tarjeta}>
                    {selectedOrder.products?.map((product, idx) => {
                      const estadoItem = selectedOrder.itemStatuses?.[product.productId] || 'pending';
                      return (
                        <div key={product.productId + idx}>
                          {idx > 0 && <Separador />}
                          <div style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: KDS.texto }}>{product.name}</span>
                              <span style={{ fontSize: 18, fontWeight: 700, color: KDS.texto, flexShrink: 0 }}>×{product.quantity}</span>
                            </div>
                            <div style={{ display: 'flex', padding: 2, marginTop: 8, background: KDS.relleno, borderRadius: 9 }}>
                              {([
                                ['pending', 'Pendiente', KDS.naranja],
                                ['in_progress', 'Preparando', KDS.azul],
                                ['completed', 'Listo', KDS.verde],
                              ] as const).map(([valor, etiqueta, color]) => {
                                const activo = estadoItem === valor;
                                return (
                                  <button key={valor} type="button" aria-pressed={activo}
                                    onClick={() => handleItemStatusChange(selectedOrder.id, product.productId, valor)}
                                    style={{
                                      flex: 1, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 14,
                                      fontWeight: activo ? 600 : 500, color: activo ? '#fff' : KDS.texto,
                                      background: activo ? color : 'transparent',
                                    }}>
                                    {etiqueta}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <h3 style={tituloSeccion}>Cambiar estado del pedido</h3>
                  <div style={tarjeta}>
                    {otros.map((s, idx) => {
                      const e = ESTADO_KDS[s];
                      const I = e.icono;
                      return (
                        <div key={s}>
                          {idx > 0 && <Separador inset={56} />}
                          <button type="button" onClick={() => handleStatusChange(selectedOrder.id, s)} className="fila-ios"
                            style={{ width: '100%', height: 46, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                            <span style={{ width: 28, height: 28, borderRadius: 7, background: e.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <I style={{ width: 16, height: 16, color: '#fff' }} />
                            </span>
                            <span style={{ flex: 1, fontSize: 16, color: KDS.texto }}>{e.label}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ ...tarjeta, marginTop: 20 }}>
                    <button type="button" onClick={() => setShowDeliveryGuide(true)} className="fila-ios"
                      style={{ width: '100%', height: 46, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      <Printer style={{ width: 20, height: 20, color: KDS.azul }} />
                      <span style={{ flex: 1, fontSize: 16, color: KDS.azul }}>Guía de despacho</span>
                    </button>
                    {selectedOrder.status !== 'cancelled' && (
                      <>
                        <Separador />
                        {confirmarCancelar ? (
                          <div style={{ padding: 12 }}>
                            <p style={{ fontSize: 14, color: KDS.secundario, textAlign: 'center', margin: '0 0 10px' }}>¿Cancelar este pedido?</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <button type="button" onClick={() => setConfirmarCancelar(false)} className="boton-ios" style={{ ...botonAccion, background: '#E3E3E8', color: KDS.texto }}>No</button>
                              <button type="button" onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')} className="boton-ios" style={{ ...botonAccion, background: KDS.rojo, color: '#fff' }}>Sí, cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmarCancelar(true)} className="fila-ios"
                            style={{ width: '100%', height: 46, border: 'none', background: 'transparent', fontSize: 16, color: KDS.rojo, cursor: 'pointer' }}>
                            Cancelar pedido
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {paso && (
                  <div style={{ flexShrink: 0, padding: '10px 16px max(env(safe-area-inset-bottom), 16px)', borderTop: `0.5px solid ${KDS.separador}`, background: 'rgba(242,242,247,0.94)' }}>
                    <button type="button" onClick={() => handleStatusChange(selectedOrder.id, paso.estado)} className="boton-ios"
                      style={{ ...botonAccion, width: '100%', height: 50, borderRadius: 12, fontSize: 17, background: paso.color, color: '#fff' }}>
                      {paso.label}
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {selectedOrder && (
        <DeliveryGuide
          order={selectedOrder}
          open={showDeliveryGuide}
          onClose={() => setShowDeliveryGuide(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const KDS = {
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
  indigo: '#5856D6',
  turquesa: '#30B0C7',
};

const ESTADO_KDS: Record<Order['status'], { label: string; color: string; icono: any }> = {
  pending: { label: 'Pendiente', color: KDS.naranja, icono: Clock },
  in_progress: { label: 'En preparación', color: KDS.azul, icono: PlayCircle },
  completed: { label: 'Listo para despacho', color: KDS.verde, icono: CheckCircle2 },
  dispatched: { label: 'Despachado', color: KDS.indigo, icono: Truck },
  delivered: { label: 'Recibido', color: KDS.turquesa, icono: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: KDS.rojo, icono: XCircle },
};

const PILDORA: Record<FilterStatus, string> = {
  all: 'Todos',
  pending: 'Pendientes',
  in_progress: 'Preparando',
  completed: 'Listos',
  dispatched: 'Despachados',
  delivered: 'Recibidos',
  cancelled: 'Cancelados',
};

const ORDEN: Record<SortOption, string> = {
  'date-desc': 'Más recientes',
  'date-asc': 'Más antiguos',
  'customer-asc': 'Local (A–Z)',
  'customer-desc': 'Local (Z–A)',
  'amount-desc': 'Monto mayor',
  'amount-asc': 'Monto menor',
};

const tarjeta: React.CSSProperties = { background: KDS.tarjeta, borderRadius: 12, overflow: 'hidden' };

const tituloSeccion: React.CSSProperties = {
  fontSize: 13, fontWeight: 400, color: KDS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '22px 16px 7px',
};

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.2)',
};

const botonAccion: React.CSSProperties = {
  flex: 1, height: 44, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
};

function Separador({ inset = 16 }: { inset?: number }) {
  return <div style={{ height: 0.5, background: KDS.separador, marginLeft: inset }} />;
}

function FilaInfo({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px' }}>
      <span style={{ fontSize: 16, color: KDS.texto, flexShrink: 0 }}>{etiqueta}</span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 16, color: KDS.secundario, overflowWrap: 'anywhere' }}>{valor}</span>
    </div>
  );
}

/** Fecha nativa con su etiqueta visible: iOS no muestra placeholder en type=date. */
function CampoFecha({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRadius: 9, overflow: 'hidden', background: KDS.relleno }}>
      <input
        type="date"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-label={etiqueta}
        style={{
          display: 'block', width: '100%', boxSizing: 'border-box', height: 36, border: 'none', padding: '0 10px',
          WebkitAppearance: 'none', appearance: 'none', background: 'transparent', fontSize: 15,
          color: valor ? KDS.texto : 'transparent',
        }}
      />
      {!valor && (
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: KDS.secundario, pointerEvents: 'none' }}>
          {etiqueta}
        </span>
      )}
    </div>
  );
}
