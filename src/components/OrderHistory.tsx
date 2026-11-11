import { useState, useMemo, useEffect } from 'react';
import { Order } from '../App';
import { Separator } from './ui/separator';
import { motion, AnimatePresence } from 'motion/react';
import { formatCLP } from '../utils/format';
import {
  ArrowLeft,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  Search,
  FileText,
  Grid3x3,
  List,
  X,
  ChevronRight,
  Edit,
  SlidersHorizontal
} from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { EditOrderDialog } from './EditOrderDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { productsAPI, Product, categoriesAPI, Category } from '../utils/api';
import { nombreCategoriaRaiz } from '../utils/categoryTree';
import { canEditOrder } from '../utils/orderPermissions';

interface OrderHistoryProps {
  orders: Order[];
  onBack: () => void;
  onViewOrder: (order: Order) => void;
  userName: string;
  userRole: string;
  accessToken: string;
  onRefresh: () => void;
}

type FilterStatus = 'all' | 'pending' | 'in_progress' | 'completed' | 'dispatched' | 'delivered' | 'cancelled';
type ViewMode = 'grid' | 'list';
type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';
type DateFilterType = 'createdAt' | 'deadline';

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  pending: {
    label: 'Pendiente',
    color: 'text-amber-700',
    bgColor: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200',
    icon: Clock
  },
  in_progress: {
    label: 'En Preparación',
    color: 'text-blue-700',
    bgColor: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200',
    icon: Package
  },
  completed: {
    label: 'Listo',
    color: 'text-green-700',
    bgColor: 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200',
    icon: CheckCircle2
  },
  dispatched: {
    label: 'Despachado',
    color: 'text-indigo-700',
    bgColor: 'bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-200',
    icon: Truck
  },
  delivered: {
    label: 'Recibido',
    color: 'text-teal-700',
    bgColor: 'bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200',
    icon: CheckCircle2
  },
  cancelled: {
    label: 'Cancelado',
    color: 'text-red-700',
    bgColor: 'bg-gradient-to-r from-red-50 to-pink-50 border-red-200',
    icon: X
  }
};

// Paleta de sistema de iOS (la misma familia que el panel "Mi cuenta").
const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
};

// Color por estado (colores de sistema de iOS) y orden de las píldoras.
const ESTADOS: { key: FilterStatus; label: string; color: string }[] = [
  { key: 'all', label: 'Todos', color: IOS.azul },
  { key: 'pending', label: 'Pendientes', color: '#FF9500' },
  { key: 'in_progress', label: 'En preparación', color: '#007AFF' },
  { key: 'completed', label: 'Listos', color: '#34C759' },
  { key: 'dispatched', label: 'Despachados', color: '#5856D6' },
  { key: 'delivered', label: 'Recibidos', color: '#30B0C7' },
  { key: 'cancelled', label: 'Cancelados', color: '#FF3B30' },
];
const colorEstado = (status: string) =>
  ESTADOS.find(e => e.key === status)?.color || IOS.secundario;

const fechaCorta = (d: Date) =>
  d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');

function truncateProducts(productName: string, max = 2): string {
  const parts = productName.split(', ');
  if (parts.length <= max) return productName;
  return parts.slice(0, max).join(', ') + ` y ${parts.length - max} más...`;
}

export function OrderHistory({ orders, onBack, onViewOrder, userName, userRole, accessToken, onRefresh }: OrderHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const canEdit = canEditOrder(userRole);
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('createdAt');

  // Catálogo (productos + categorías) para dos usos: la etiqueta de categoría
  // en cada tarjeta de pedido, y el desglose del Total por categoría del modal.
  // Se pide una sola vez al entrar a la pantalla, no al abrir el modal: las
  // etiquetas de las tarjetas lo necesitan apenas se pinta la lista.
  const [catalogProducts, setCatalogProducts] = useState<Product[] | null>(null);
  const [catalogCategories, setCatalogCategories] = useState<Category[] | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [products, categories] = await Promise.all([
          productsAPI.getAll(accessToken),
          categoriesAPI.getAll(accessToken),
        ]);
        setCatalogProducts(products);
        setCatalogCategories(categories);
      } catch (err) {
        console.error('Error cargando catálogo para categorizar pedidos:', err);
        setCatalogProducts([]); // evita reintentar en loop si falla
        setCatalogCategories([]);
      }
    })();
  }, [accessToken]);

  // productId -> nombre de categoría RAÍZ (subcategorías ya resueltas a su padre).
  const categoriaPorProducto = useMemo(() => {
    const mapa = new Map<string, string>();
    if (!catalogProducts || !catalogCategories) return mapa;
    for (const p of catalogProducts) {
      mapa.set(p.id, nombreCategoriaRaiz(catalogCategories, p.categoryId));
    }
    return mapa;
  }, [catalogProducts, catalogCategories]);

  // Categorías distintas de un pedido, en el orden en que aparecen sus items.
  // Un producto borrado del catálogo (ya no está en categoriaPorProducto) no
  // aporta nada: mejor omitirlo que etiquetar todo el pedido "Sin categoría".
  const categoriasDePedido = (order: Order): string[] => {
    const vistas = new Set<string>();
    const resultado: string[] = [];
    for (const item of order.products || []) {
      const categoria = categoriaPorProducto.get(item.productId);
      if (categoria && !vistas.has(categoria)) {
        vistas.add(categoria);
        resultado.push(categoria);
      }
    }
    return resultado;
  };

  const itemsPerPage = 10;

  // Búsqueda + fechas, SIN el filtro de estado. Los conteos de las píldoras de
  // estado salen de acá: si salieran de la lista ya filtrada por estado, al
  // elegir "Despachados" todas las demás píldoras pasarían a mostrar 0.
  const baseOrders = useMemo(() => {
    let filtered = [...orders];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.productName.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query)
      );
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      filtered = filtered.filter(order => {
        let dateStr: string | undefined;
        if (dateFilterType === 'deadline') {
          dateStr = order.deadline;
        } else {
          dateStr = order.createdAt || order.date;
        }
        if (!dateStr) return false;

        const d = dateFilterType === 'deadline'
          ? new Date(dateStr + 'T12:00:00')
          : new Date(dateStr);
        const orderDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

        if (dateFrom) {
          const [y, m, day] = dateFrom.split('-').map(Number);
          const fromDate = new Date(y, m - 1, day);
          if (orderDate < fromDate) return false;
        }

        if (dateTo) {
          const [y, m, day] = dateTo.split('-').map(Number);
          const toDate = new Date(y, m - 1, day);
          if (orderDate > toDate) return false;
        }

        return true;
      });
    }

    return filtered;
  }, [orders, searchQuery, dateFrom, dateTo, dateFilterType]);

  // Lo que se lista: la base + filtro de estado, ordenado.
  const filteredOrders = useMemo(() => {
    const filtered = filterStatus === 'all'
      ? [...baseOrders]
      : baseOrders.filter(order => order.status === filterStatus);

    // Sort
    filtered.sort((a, b) => {
      let dateA, dateB;

      dateA = a.deadline ? new Date(a.deadline + 'T00:00:00').getTime() : new Date(a.createdAt || a.date).getTime();
      dateB = b.deadline ? new Date(b.deadline + 'T00:00:00').getTime() : new Date(b.createdAt || b.date).getTime();

      const totalA = a.total || 0;
      const totalB = b.total || 0;

      switch (sortBy) {
        case 'date-desc':
          return dateB - dateA;
        case 'date-asc':
          return dateA - dateB;
        case 'amount-desc':
          return totalB - totalA;
        case 'amount-asc':
          return totalA - totalB;
        default:
          return dateB - dateA;
      }
    });

    return filtered;
  }, [baseOrders, filterStatus, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Statistics
  // total y totalAmount describen lo que se ve (con el estado elegido);
  // porEstado cuenta sobre la base, para las píldoras.
  const stats = useMemo(() => {
    const porEstado: Record<string, number> = { all: baseOrders.length };
    for (const o of baseOrders) porEstado[o.status] = (porEstado[o.status] || 0) + 1;
    const totalAmount = filteredOrders.reduce((sum: number, o: Order) => sum + (o.total || 0), 0);
    return { total: filteredOrders.length, porEstado, totalAmount };
  }, [baseOrders, filteredOrders]);

  // Desglosa stats.totalAmount por categoría PADRE. Se arma sobre los mismos
  // filteredOrders que ya usa el Total (mismos filtros de búsqueda/estado/fecha
  // activos), sumando precio*cantidad de cada item del pedido en vez de
  // order.total, porque el pedido no guarda la categoría de cada producto:
  // hay que cruzar cada item con el catálogo (categoriaPorProducto) por productId.
  // Un producto que ya no existe en el catálogo (borrado) cae en "Sin categoría".
  const categoryBreakdown = useMemo(() => {
    if (categoriaPorProducto.size === 0) return [];

    const montoPorCategoria = new Map<string, number>();
    for (const order of filteredOrders) {
      for (const item of order.products) {
        const categoria = categoriaPorProducto.get(item.productId) || 'Sin categoría';
        const monto = (item.price || 0) * (item.quantity || 0);
        montoPorCategoria.set(categoria, (montoPorCategoria.get(categoria) || 0) + monto);
      }
    }

    return Array.from(montoPorCategoria.entries())
      .map(([categoria, monto]) => ({ categoria, monto }))
      .sort((a, b) => b.monto - a.monto);
  }, [filteredOrders, categoriaPorProducto]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('date-desc');
    setDateFilterType('createdAt');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || filterStatus !== 'all' || dateFrom || dateTo || sortBy !== 'date-desc';

  const filtrosAvanzadosActivos = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (sortBy !== 'date-desc' ? 1 : 0);

  const elegirEstado = (estado: FilterStatus) => {
    setFilterStatus(estado);
    setCurrentPage(1);
  };

  // Una fila/tarjeta de pedido. Lista: fila agrupada estilo iOS. Grilla: misma
  // información en una tarjeta blanca.
  const renderEditar = (order: Order, compacto: boolean) =>
    canEdit && ['pending', 'in_progress', 'completed'].includes(order.status) ? (
      <button
        type="button"
        aria-label="Editar pedido"
        onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          minWidth: 36, height: 36, padding: compacto ? 0 : '0 12px',
          borderRadius: 18, border: 'none', cursor: 'pointer',
          background: IOS.relleno, color: IOS.azul, fontSize: 15, fontWeight: 500,
          flexShrink: 0,
        }}
      >
        <Edit style={{ width: 16, height: 16 }} />
        {!compacto && 'Editar'}
      </button>
    ) : null;

  // "Local · Entrega 11 nov · Categoría". El local se omite cuando es el propio
  // usuario (cuenta de un local): ya figura en el encabezado y se repetía en
  // cada fila.
  const subtitulo = (order: Order) => {
    const partes: string[] = [];
    if (order.customerName && order.customerName !== userName) partes.push(order.customerName);
    if (order.deadline) partes.push(`Entrega ${fechaCorta(new Date(order.deadline + 'T00:00:00'))}`);
    else partes.push(fechaCorta(new Date(order.createdAt || order.date)));
    const categorias = categoriasDePedido(order);
    if (categorias.length > 0) partes.push(categorias.join(', '));
    return partes.join(' · ');
  };

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado compacto: atrás, título y resumen en una sola tarjeta */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          paddingTop: 'max(env(safe-area-inset-top), 16px)',
        }}
      >
        <div className="max-w-7xl mx-auto" style={{ padding: '8px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver"
              style={{
                width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
              }}
            >
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
                Historial de pedidos
              </h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                {userName}
              </p>
            </div>
            {/* Lista / grilla: control segmentado */}
            <div
              role="group"
              aria-label="Vista"
              style={{ display: 'flex', padding: 2, borderRadius: 9, background: 'rgba(255,255,255,0.18)', flexShrink: 0 }}
            >
              {([['list', List], ['grid', Grid3x3]] as const).map(([modo, Icono]) => (
                <button
                  key={modo}
                  type="button"
                  aria-label={modo === 'list' ? 'Vista de lista' : 'Vista de grilla'}
                  aria-pressed={viewMode === modo}
                  onClick={() => setViewMode(modo)}
                  style={{
                    width: 34, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: viewMode === modo ? '#fff' : 'transparent',
                    color: viewMode === modo ? '#0047BA' : '#fff',
                  }}
                >
                  <Icono style={{ width: 16, height: 16 }} />
                </button>
              ))}
            </div>
          </div>

          {/* Resumen: monto + cantidad, y acceso al desglose por categoría */}
          <button
            type="button"
            onClick={() => setShowBreakdown(true)}
            className="w-full"
            style={{
              marginTop: 14, padding: '12px 14px', borderRadius: 14,
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
              background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.18)',
              cursor: 'pointer',
            }}
          >
            <div className="min-w-0 flex-1">
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                {stats.total} {stats.total === 1 ? 'pedido' : 'pedidos'}
                {filterStatus !== 'all' ? ` · ${ESTADOS.find(e => e.key === filterStatus)?.label.toLowerCase()}` : ''}
              </p>
              <p style={{ color: '#fff', fontSize: 26, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.15 }}>
                {formatCLP(stats.totalAmount)}
              </p>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#fff', fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
              Por categoría
              <ChevronRight style={{ width: 16, height: 16 }} />
            </span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto" style={{ padding: '12px 16px 32px' }}>
        {/* Búsqueda + botón de filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="flex-1" style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 17, height: 17, color: IOS.secundario }} />
            <input
              type="search"
              placeholder="Buscar producto, local o ID"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{
                width: '100%', height: 38, borderRadius: 10, border: 'none', outline: 'none',
                background: IOS.relleno, padding: '0 34px 0 34px', fontSize: 16, color: IOS.texto,
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
                  background: '#AEAEB2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X style={{ width: 12, height: 12, color: '#fff' }} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-label="Ordenar y filtrar por fecha"
            style={{
              position: 'relative', width: 38, height: 38, borderRadius: 10, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: showFilters ? IOS.azul : IOS.relleno,
              color: showFilters ? '#fff' : IOS.azul,
            }}
          >
            <SlidersHorizontal style={{ width: 18, height: 18 }} />
            {filtrosAvanzadosActivos > 0 && !showFilters && (
              <span
                style={{
                  position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
                  background: '#FF3B30', color: '#fff', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                }}
              >
                {filtrosAvanzadosActivos}
              </span>
            )}
          </button>
        </div>

        {/* Píldoras de estado (reemplazan las 8 tarjetas de KPIs y el select de estado) */}
        <div
          className="sin-scrollbar"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '12px -16px 0', padding: '0 16px 2px' }}
        >
          {ESTADOS.filter(e => e.key === 'all' || e.key === filterStatus || (stats.porEstado[e.key] || 0) > 0).map(e => {
            const activo = filterStatus === e.key;
            return (
              <button
                key={e.key}
                type="button"
                aria-pressed={activo}
                onClick={() => elegirEstado(e.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  height: 32, padding: '0 12px', borderRadius: 16, cursor: 'pointer',
                  border: 'none', fontSize: 14, fontWeight: activo ? 600 : 500, whiteSpace: 'nowrap',
                  background: activo ? e.color : IOS.tarjeta,
                  color: activo ? '#fff' : IOS.texto,
                  boxShadow: activo ? 'none' : '0 0 0 0.5px rgba(0,0,0,0.08)',
                }}
              >
                {e.key !== 'all' && !activo && (
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: e.color }} />
                )}
                {e.label}
                <span style={{ opacity: activo ? 0.85 : 1, color: activo ? '#fff' : IOS.secundario, fontWeight: 500 }}>
                  {stats.porEstado[e.key] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Ordenar y fechas (desplegable) */}
        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ marginTop: 12, background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>
                {/* Ordenar */}
                <div style={{ padding: '10px 16px' }}>
                  <p style={{ fontSize: 13, color: IOS.secundario, marginBottom: 6 }}>Ordenar por</p>
                  <SegmentoIOS
                    opciones={[
                      ['date-desc', 'Recientes'],
                      ['date-asc', 'Antiguos'],
                      ['amount-desc', 'Mayor $'],
                      ['amount-asc', 'Menor $'],
                    ]}
                    valor={sortBy}
                    onCambio={(v) => { setSortBy(v as SortOption); setCurrentPage(1); }}
                  />
                </div>
                <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />
                {/* Tipo de fecha */}
                <div style={{ padding: '10px 16px' }}>
                  <p style={{ fontSize: 13, color: IOS.secundario, marginBottom: 6 }}>Filtrar por fecha de</p>
                  <SegmentoIOS
                    opciones={[['createdAt', 'Pedido'], ['deadline', 'Despacho']]}
                    valor={dateFilterType}
                    onCambio={(v) => { setDateFilterType(v as DateFilterType); setCurrentPage(1); }}
                  />
                </div>
                <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />
                <FilaFecha etiqueta="Desde" valor={dateFrom} onCambio={(v) => { setDateFrom(v); setCurrentPage(1); }} />
                <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />
                <FilaFecha etiqueta="Hasta" valor={dateTo} onCambio={(v) => { setDateTo(v); setCurrentPage(1); }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Encabezado de sección */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 16px 6px' }}>
          <p style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2 }}>
            {filteredOrders.length > paginatedOrders.length
              ? `${(currentPage - 1) * itemsPerPage + 1}–${(currentPage - 1) * itemsPerPage + paginatedOrders.length} de ${filteredOrders.length} pedidos`
              : `${filteredOrders.length} ${filteredOrders.length === 1 ? 'pedido' : 'pedidos'}`}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              style={{ fontSize: 15, color: IOS.azul, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Lista / grilla */}
        {paginatedOrders.length === 0 ? (
          <div style={{ background: IOS.tarjeta, borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
            <FileText style={{ width: 36, height: 36, color: '#C7C7CC', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 17, fontWeight: 600, color: IOS.texto }}>Sin pedidos</p>
            <p style={{ fontSize: 15, color: IOS.secundario, marginTop: 4 }}>
              {hasActiveFilters ? 'Probá con otros filtros.' : 'Todavía no hay pedidos.'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>
            {paginatedOrders.map((order, index) => {
              const config = statusConfig[order.status] || statusConfig.pending;
              const StatusIcon = config.icon;
              const color = colorEstado(order.status);
              return (
                <div key={order.id}>
                  {index > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 60 }} />}
                  <div
                    role="button"
                    tabIndex={0}
                    className="fila-ios"
                    onClick={() => onViewOrder(order)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onViewOrder(order); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 16px', cursor: 'pointer' }}
                  >
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <StatusIcon style={{ width: 18, height: 18, color: '#fff' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ fontSize: 16, fontWeight: 600, color: IOS.texto }}>
                        {truncateProducts(order.productName)}
                      </p>
                      <p className="truncate" style={{ fontSize: 13, color: IOS.secundario, marginTop: 1 }}>
                        {subtitulo(order)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: IOS.texto }}>{formatCLP(order.total || 0)}</p>
                      <p style={{ fontSize: 12, fontWeight: 500, color, marginTop: 1 }}>{config.label}</p>
                    </div>
                    {renderEditar(order, true)}
                    <ChevronRight style={{ width: 16, height: 16, color: '#C7C7CC', flexShrink: 0 }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style={{ gap: 12 }}>
            {paginatedOrders.map((order) => {
              const config = statusConfig[order.status] || statusConfig.pending;
              const StatusIcon = config.icon;
              const color = colorEstado(order.status);
              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  className="fila-ios"
                  onClick={() => onViewOrder(order)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onViewOrder(order); }}
                  style={{ borderRadius: 12, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 28, height: 28, borderRadius: 7, background: color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <StatusIcon style={{ width: 16, height: 16, color: '#fff' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color }}>{config.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 13, color: IOS.secundario }}>
                      {fechaCorta(new Date(order.createdAt || order.date))}
                    </span>
                  </div>
                  <div>
                    <p className="line-clamp-2" style={{ fontSize: 16, fontWeight: 600, color: IOS.texto }}>
                      {truncateProducts(order.productName)}
                    </p>
                    <p className="truncate" style={{ fontSize: 13, color: IOS.secundario, marginTop: 2 }}>
                      {subtitulo(order)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: IOS.texto }}>{formatCLP(order.total || 0)}</span>
                    <span style={{ fontSize: 13, color: IOS.secundario }}>· {new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(order.quantity || 0)} unid.</span>
                    <span style={{ marginLeft: 'auto' }}>{renderEditar(order, false)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-center">
            <PaginationControls
              pagination={{
                page: currentPage,
                limit: itemsPerPage,
                total: filteredOrders.length,
                totalPages: totalPages,
                hasNext: currentPage < totalPages,
                hasPrev: currentPage > 1
              }}
              onPageChange={setCurrentPage}
              isLoading={false}
            />
          </div>
        )}

        {/* Edit Order Dialog */}
        {editingOrder && (
          <EditOrderDialog
            isOpen={!!editingOrder}
            onClose={() => setEditingOrder(null)}
            order={editingOrder}
            accessToken={accessToken}
            userRole={userRole}
            onOrderUpdated={() => {
              onRefresh();
              setEditingOrder(null);
            }}
          />
        )}

        {/* Desglose del Total por categoría */}
        <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Total por categoría</DialogTitle>
              <DialogDescription>
                Calculado sobre los {stats.total} pedido(s) que ves ahora en pantalla
                {hasActiveFilters ? ' (con los filtros aplicados)' : ''}.
              </DialogDescription>
            </DialogHeader>

            {catalogProducts === null ? (
              <div className="py-8 text-center text-gray-500 text-sm">Cargando...</div>
            ) : categoryBreakdown.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">No hay productos para desglosar.</div>
            ) : (
              <div className="space-y-2 py-2">
                {categoryBreakdown.map(({ categoria, monto }) => (
                  <div key={categoria} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">{categoria}</span>
                    <span className="text-sm font-semibold text-gray-900">{formatCLP(monto)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm font-semibold text-gray-900">Total</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCLP(categoryBreakdown.reduce((sum, c) => sum + c.monto, 0))}
                  </span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Control segmentado de iOS (UISegmentedControl).
function SegmentoIOS({ opciones, valor, onCambio }: {
  opciones: [string, string][];
  valor: string;
  onCambio: (v: string) => void;
}) {
  return (
    <div role="group" style={{ display: 'flex', padding: 2, borderRadius: 9, background: IOS.relleno }}>
      {opciones.map(([v, etiqueta]) => {
        const activo = v === valor;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(v)}
            className="flex-1"
            style={{
              height: 30, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
              fontWeight: activo ? 600 : 500, color: IOS.texto,
              background: activo ? '#fff' : 'transparent',
              boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)' : 'none',
            }}
          >
            {etiqueta}
          </button>
        );
      })}
    </div>
  );
}

// Fila "Desde"/"Hasta" con el selector de fecha nativo superpuesto (invisible)
// para que en iOS se abra la rueda del sistema.
function FilaFecha({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 16px' }}>
      <span style={{ fontSize: 16, color: IOS.texto }}>{etiqueta}</span>
      <span
        style={{
          marginLeft: 'auto', fontSize: 15, padding: '5px 10px', borderRadius: 7,
          background: IOS.relleno, color: valor ? IOS.azul : IOS.secundario,
        }}
      >
        {valor ? valor.split('-').reverse().join('/') : 'Cualquiera'}
      </span>
      {valor && (
        <button
          type="button"
          aria-label={`Quitar fecha ${etiqueta.toLowerCase()}`}
          onClick={() => onCambio('')}
          style={{
            position: 'relative', zIndex: 2, marginLeft: 8, width: 22, height: 22, borderRadius: 11,
            border: 'none', background: '#AEAEB2', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X style={{ width: 12, height: 12, color: '#fff' }} />
        </button>
      )}
      <input
        type="date"
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 1 }}
      />
    </div>
  );
}
