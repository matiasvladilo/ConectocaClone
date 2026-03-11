import { useState, useMemo } from 'react';
import { Order } from '../App';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
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
  Filter,
  Calendar,
  FileText,
  Grid3x3,
  List,
  X,
  DollarSign,
  User,
  ChevronRight,
  Edit
} from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import logo from '../assets/logo.png';
import { EditOrderDialog } from './EditOrderDialog';

interface OrderHistoryProps {
  orders: Order[];
  onBack: () => void;
  onViewOrder: (order: Order) => void;
  userName: string;
  accessToken: string;
  onRefresh: () => void;
}

type FilterStatus = 'all' | 'pending' | 'in_progress' | 'completed' | 'dispatched' | 'delivered' | 'cancelled';
type ViewMode = 'grid' | 'list';
type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

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

function truncateProducts(productName: string, max = 2): string {
  const parts = productName.split(', ');
  if (parts.length <= max) return productName;
  return parts.slice(0, max).join(', ') + ` y ${parts.length - max} más...`;
}

export function OrderHistory({ orders, onBack, onViewOrder, userName, accessToken, onRefresh }: OrderHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const itemsPerPage = 10;

  // Filter and search orders
  const filteredOrders = useMemo(() => {
    let filtered = [...orders];

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(order => order.status === filterStatus);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.productName.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query)
      );
    }

    // Filter by date range — only filter orders that have a real createdAt from the API
    if (dateFrom || dateTo) {
      filtered = filtered.filter(order => {
        // If no real API createdAt, we can't determine the date → include the order
        if (!order.createdAt) return true;
        const d = new Date(order.createdAt);
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
  }, [orders, filterStatus, searchQuery, sortBy, dateFrom, dateTo]);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Statistics
  const stats = useMemo(() => {
    const total = filteredOrders.length;
    const pending = filteredOrders.filter((o: Order) => o.status === 'pending').length;
    const inProgress = filteredOrders.filter((o: Order) => o.status === 'in_progress').length;
    const completed = filteredOrders.filter((o: Order) => o.status === 'completed').length;
    const dispatched = filteredOrders.filter((o: Order) => o.status === 'dispatched').length;
    const delivered = filteredOrders.filter((o: Order) => o.status === 'delivered').length;
    const cancelled = filteredOrders.filter((o: Order) => o.status === 'cancelled').length;
    const totalAmount = filteredOrders.reduce((sum: number, o: Order) => sum + (o.total || 0), 0);

    return { total, pending, inProgress, completed, dispatched, delivered, cancelled, totalAmount };
  }, [filteredOrders]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('date-desc');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || filterStatus !== 'all' || dateFrom || dateTo || sortBy !== 'date-desc';

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
          <div className="flex items-center justify-between mb-6">
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
                  <div className="absolute w-12 h-12 bg-yellow-400/30 rounded-full blur-lg" />
                  <img
                    src={logo}
                    alt="La Oca Logo"
                    className="w-12 h-12 object-contain relative z-10"
                    style={{ imageRendering: 'crisp-edges' }}
                  />
                </motion.div>
                <div>
                  <h1 className="text-white tracking-wide flex items-center gap-2" style={{ fontSize: '24px', fontWeight: 600 }}>
                    <FileText className="w-6 h-6" />
                    Historial de Pedidos
                  </h1>
                  <p className="text-blue-100 text-sm">
                    Consulta todos tus pedidos de {userName}
                  </p>
                </div>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => setViewMode('list')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${viewMode === 'list'
                  ? 'bg-white text-[#0047BA]'
                  : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
              >
                <List className="w-5 h-5" />
              </motion.button>
              <motion.button
                onClick={() => setViewMode('grid')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${viewMode === 'grid'
                  ? 'bg-white text-[#0047BA]'
                  : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
              >
                <Grid3x3 className="w-5 h-5" />
              </motion.button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                <span className="text-xs text-blue-100">Total</span>
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
                <Clock className="w-4 h-4 text-yellow-200" />
                <span className="text-xs text-yellow-100">Pendientes</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.pending}
              </p>
            </motion.div>

            <motion.div
              className="p-4 rounded-xl backdrop-blur-md"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-blue-100" />
                <span className="text-xs text-blue-100">En Proceso</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.inProgress}
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
                <CheckCircle2 className="w-4 h-4 text-green-200" />
                <span className="text-xs text-green-100">Listos</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.completed}
              </p>
            </motion.div>

            <motion.div
              className="p-4 rounded-xl backdrop-blur-md"
              style={{
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-4 h-4 text-indigo-100" />
                <span className="text-xs text-indigo-100">Despachados</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.dispatched}
              </p>
            </motion.div>

            <motion.div
              className="p-4 rounded-xl backdrop-blur-md"
              style={{
                background: 'rgba(20, 184, 166, 0.2)',
                border: '1px solid rgba(20, 184, 166, 0.3)'
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-teal-100" />
                <span className="text-xs text-teal-100">Recibidos</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.delivered}
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
              transition={{ delay: 0.4 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <X className="w-4 h-4 text-red-100" />
                <span className="text-xs text-red-100">Cancelados</span>
              </div>
              <p className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                {stats.cancelled}
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
              transition={{ delay: 0.45 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-yellow-200" />
                <span className="text-xs text-yellow-100">Total</span>
              </div>
              <p className="text-white" style={{ fontSize: '20px', fontWeight: 600 }}>
                {formatCLP(stats.totalAmount)}
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5 relative z-10">
        {/* Filters Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card
            className="border-2 shadow-lg"
            style={{ borderRadius: '16px', borderColor: '#E0EDFF' }}
          >
            <CardContent className="p-5">
              <div className="space-y-4">
                {/* Search and Quick Filters */}
                <div className="flex flex-col md:flex-row gap-3">
                  {/* Search */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      placeholder="Buscar por producto, cliente o ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-11 h-11 bg-white border-[#CBD5E1] focus:border-[#2563EB]"
                      style={{ borderRadius: '10px' }}
                    />
                    {searchQuery && (
                      <motion.button
                        onClick={() => setSearchQuery('')}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </motion.button>
                    )}
                  </div>

                  {/* Status Filter */}
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
                    <SelectTrigger
                      className="w-full md:w-48 h-11 bg-white border-[#CBD5E1]"
                      style={{ borderRadius: '10px' }}
                    >
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="pending">Pendientes</SelectItem>
                      <SelectItem value="in_progress">En Preparación</SelectItem>
                      <SelectItem value="completed">Listos</SelectItem>
                      <SelectItem value="dispatched">Despachados</SelectItem>
                      <SelectItem value="delivered">Recibidos</SelectItem>
                      <SelectItem value="cancelled">Cancelados</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Sort */}
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                    <SelectTrigger
                      className="w-full md:w-48 h-11 bg-white border-[#CBD5E1]"
                      style={{ borderRadius: '10px' }}
                    >
                      <SelectValue placeholder="Ordenar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-desc">Más recientes</SelectItem>
                      <SelectItem value="date-asc">Más antiguos</SelectItem>
                      <SelectItem value="amount-desc">Mayor monto</SelectItem>
                      <SelectItem value="amount-asc">Menor monto</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Advanced Filters Toggle */}
                  <motion.button
                    onClick={() => setShowFilters(!showFilters)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full md:w-11 h-11 rounded-lg flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: showFilters ? 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)' : 'rgba(0, 89, 255, 0.1)',
                      color: showFilters ? 'white' : '#0059FF'
                    }}
                  >
                    <Filter className="w-5 h-5" />
                    <span className="md:hidden">Filtros avanzados</span>
                  </motion.button>
                </div>

                {/* Advanced Filters */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <Separator className="my-4" />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm text-gray-700 mb-2 block" style={{ fontWeight: 500 }}>
                            Desde
                          </label>
                          <div className="relative h-10">
                            <div className="h-10 bg-white border border-[#CBD5E1] flex items-center px-3 pointer-events-none" style={{ borderRadius: '10px' }}>
                              <span className="text-sm" style={{ color: dateFrom ? '#111827' : '#9CA3AF' }}>
                                {dateFrom ? dateFrom.split('-').reverse().join('/') : 'DD/MM/AAAA'}
                              </span>
                              <Calendar className="w-4 h-4 ml-auto text-gray-400" />
                            </div>
                            <input
                              type="date"
                              value={dateFrom}
                              onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm text-gray-700 mb-2 block" style={{ fontWeight: 500 }}>
                            Hasta
                          </label>
                          <div className="relative h-10">
                            <div className="h-10 bg-white border border-[#CBD5E1] flex items-center px-3 pointer-events-none" style={{ borderRadius: '10px' }}>
                              <span className="text-sm" style={{ color: dateTo ? '#111827' : '#9CA3AF' }}>
                                {dateTo ? dateTo.split('-').reverse().join('/') : 'DD/MM/AAAA'}
                              </span>
                              <Calendar className="w-4 h-4 ml-auto text-gray-400" />
                            </div>
                            <input
                              type="date"
                              value={dateTo}
                              onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Active Filters */}
                {hasActiveFilters && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-600" style={{ fontWeight: 500 }}>Filtros activos:</span>
                    {searchQuery && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                        Búsqueda: {searchQuery}
                      </Badge>
                    )}
                    {filterStatus !== 'all' && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                        Estado: {statusConfig[filterStatus]?.label}
                      </Badge>
                    )}
                    {(dateFrom || dateTo) && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                        Fecha: {dateFrom || '...'} - {dateTo || '...'}
                      </Badge>
                    )}
                    <motion.button
                      onClick={clearFilters}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="text-xs text-[#0059FF] hover:text-[#0047BA] flex items-center gap-1"
                      style={{ fontWeight: 500 }}
                    >
                      <X className="w-3 h-3" />
                      Limpiar todo
                    </motion.button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-gray-700" style={{ fontSize: '14px', fontWeight: 500 }}>
            Mostrando {paginatedOrders.length} de {filteredOrders.length} pedidos
          </p>
        </div>

        {/* Orders List/Grid */}
        {paginatedOrders.length === 0 ? (
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
                  <FileText className="w-10 h-10 text-blue-300" />
                </div>
                <p className="text-gray-600 mb-2" style={{ fontSize: '16px', fontWeight: 500 }}>
                  No se encontraron pedidos
                </p>
                <p className="text-gray-400 text-sm">
                  Intenta ajustar los filtros de búsqueda
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : viewMode === 'list' ? (
          // List View
          <div className="space-y-3">
            {paginatedOrders.map((order, index) => {
              const config = statusConfig[order.status] || statusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + (index * 0.05) }}
                >
                  <Card
                    className="cursor-pointer hover:shadow-xl transition-all duration-300 border-2 group"
                    onClick={() => onViewOrder(order)}
                    style={{
                      borderRadius: '16px',
                      borderLeftWidth: '4px',
                      borderLeftColor: order.status === 'pending' ? '#F59E0B' :
                        order.status === 'in_progress' ? '#0059FF' :
                          order.status === 'completed' ? '#10B981' : '#6B7280',
                      borderTopColor: '#E0EDFF',
                      borderRightColor: '#E0EDFF',
                      borderBottomColor: '#E0EDFF'
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center gap-4">
                        {/* Icon */}
                        <div
                          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{
                            background: order.status === 'pending' ? 'rgba(245, 158, 11, 0.1)' :
                              order.status === 'in_progress' ? 'rgba(0, 89, 255, 0.1)' :
                                order.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)'
                          }}
                        >
                          <StatusIcon
                            className="w-7 h-7"
                            style={{
                              color: order.status === 'pending' ? '#F59E0B' :
                                order.status === 'in_progress' ? '#0059FF' :
                                  order.status === 'completed' ? '#10B981' : '#6B7280'
                            }}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h3
                              className="text-[#0047BA] group-hover:text-[#0059FF] transition-colors"
                              style={{ fontSize: '16px', fontWeight: 600 }}
                            >
                              {truncateProducts(order.productName)}
                            </h3>
                            <Badge
                              className={`${config.bgColor} ${config.color} border px-2.5 py-1 flex items-center gap-1.5`}
                              style={{ fontSize: '11px', fontWeight: 500 }}
                            >
                              <StatusIcon className="w-3.5 h-3.5" />
                              {config.label}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                            <span className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5" />
                              {order.customerName}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5" />
                              {order.quantity} unid.
                            </span>
                            <span className="flex items-center gap-1.5" title="Fecha de Creación">
                              <Calendar className="w-3.5 h-3.5" />
                              Creado: {new Date(order.createdAt || order.date).toLocaleDateString('es-CL')}
                            </span>
                            <span className="flex items-center gap-1.5 text-green-600" style={{ fontWeight: 500 }} title="Fecha de Entrega">
                              <Clock className="w-3.5 h-3.5" />
                              Entrega: {order.deadline ? new Date(order.deadline + 'T00:00:00').toLocaleDateString('es-CL') : '?'}
                            </span>
                            <span className="flex items-center gap-1.5 text-[#0047BA]" style={{ fontWeight: 600 }}>
                              <DollarSign className="w-3.5 h-3.5" />
                              {formatCLP(order.total || 0)}
                            </span>
                          </div>

                          {/* Progress */}
                          <div className="mt-3">
                            <div
                              className="w-full rounded-full h-1.5 overflow-hidden"
                              style={{ background: 'rgba(0, 71, 186, 0.1)' }}
                            >
                              <div
                                className="h-1.5 rounded-full transition-all duration-500"
                                style={{
                                  background: order.status === 'completed' || order.status === 'cancelled'
                                    ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
                                    : order.status === 'in_progress'
                                      ? 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)'
                                      : 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
                                  width: `${order.progress}%`
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Edit Button */}
                        {['pending', 'in_progress', 'completed'].includes(order.status) && (
                          <div className="mx-4">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingOrder(order);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        )}

                        {/* Arrow */}
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#0059FF] transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          // Grid View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedOrders.map((order, index) => {
              const config = statusConfig[order.status] || statusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + (index * 0.05) }}
                >
                  <Card
                    className="cursor-pointer hover:shadow-xl transition-all duration-300 border-2 group h-full"
                    onClick={() => onViewOrder(order)}
                    style={{
                      borderRadius: '16px',
                      borderTopWidth: '4px',
                      borderTopColor: order.status === 'pending' ? '#F59E0B' :
                        order.status === 'in_progress' ? '#0059FF' :
                          order.status === 'completed' ? '#10B981' : '#6B7280',
                      borderLeftColor: '#E0EDFF',
                      borderRightColor: '#E0EDFF',
                      borderBottomColor: '#E0EDFF'
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{
                            background: order.status === 'pending' ? 'rgba(245, 158, 11, 0.1)' :
                              order.status === 'in_progress' ? 'rgba(0, 89, 255, 0.1)' :
                                order.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)'
                          }}
                        >
                          <StatusIcon
                            className="w-6 h-6"
                            style={{
                              color: order.status === 'pending' ? '#F59E0B' :
                                order.status === 'in_progress' ? '#0059FF' :
                                  order.status === 'completed' ? '#10B981' : '#6B7280'
                            }}
                          />
                        </div>
                        <Badge
                          className={`${config.bgColor} ${config.color} border px-2 py-1`}
                          style={{ fontSize: '10px', fontWeight: 500 }}
                        >
                          {config.label}
                        </Badge>
                      </div>

                      <h3
                        className="text-[#0047BA] group-hover:text-[#0059FF] transition-colors mb-3 line-clamp-2"
                        style={{ fontSize: '15px', fontWeight: 600 }}
                      >
                        {truncateProducts(order.productName)}
                      </h3>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <User className="w-3.5 h-3.5" />
                          <span className="truncate">{order.customerName}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5" />
                            {order.quantity} unid.
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(order.createdAt || order.date).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div
                        className="w-full rounded-full h-1.5 overflow-hidden mb-3"
                        style={{ background: 'rgba(0, 71, 186, 0.1)' }}
                      >
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            background: order.status === 'completed' || order.status === 'cancelled'
                              ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
                              : order.status === 'in_progress'
                                ? 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)'
                                : 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
                            width: `${order.progress}%`
                          }}
                        />
                      </div>

                      <div
                        className="flex items-center justify-between p-3 rounded-xl"
                        style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)' }}
                      >
                        <span className="text-xs text-gray-600" style={{ fontWeight: 500 }}>Total</span>
                        <span className="text-[#0047BA]" style={{ fontSize: '16px', fontWeight: 600 }}>
                          {formatCLP(order.total || 0)}
                        </span>
                      </div>

                      {/* Edit Button */}
                      {['pending', 'in_progress', 'completed'].includes(order.status) && (
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingOrder(order);
                            }}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </Button>
                        </div>
                      )}

                    </CardContent>
                  </Card>
                </motion.div>
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
                limit: 9, // Hardcoded as itemsPerPage is 9 in the component
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
            onOrderUpdated={() => {
              onRefresh();
              setEditingOrder(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
