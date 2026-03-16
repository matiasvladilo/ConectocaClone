import { useState, useEffect } from 'react';
import { Order } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { DeliveryGuide } from './DeliveryGuide';
import { Separator } from './ui/separator';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Package,
  Clock,
  User,
  CheckCircle2,
  PlayCircle,
  XCircle,
  Printer,
  MapPin,
  Calendar,
  Hash,
  AlertCircle,
  Search,
  Filter,
  SlidersHorizontal,
  ArrowUpDown,
  Star,
  Grid3x3,
  List,
  X as XIcon,
  DollarSign,
  MessageSquare,
  Factory,
  Layers,
  ChefHat,
  Cake,
  Utensils,
  Coffee,
  Pizza,
  IceCream,
  Soup,
  Salad,
  Sandwich,
  Wine,
  CookingPot,
  Beef,
  Fish,
  Apple,
  Truck
} from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { PaginationInfo, ProductionArea as ProductionAreaType, productionAreasAPI } from '../utils/api';
import logo from '../assets/logo.png';
const logoFull = logo;
import { toast } from 'sonner';
import { formatCLP } from '../utils/format';
import { parseDate } from '../utils/dateUtils';

interface ProductionAreaProps {
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

export function ProductionArea({ orders, onBack, onUpdateOrderStatus, accessToken, lastSync, pagination, onPageChange, onGoToKDS, isLoading = false }: ProductionAreaProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showDeliveryGuide, setShowDeliveryGuide] = useState(false);

  // Production Areas state
  const [productionAreas, setProductionAreas] = useState<ProductionAreaType[]>([]);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('all'); // 'all' or area ID

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

  // Load production areas on mount
  useEffect(() => {
    if (accessToken) {
      loadProductionAreas();
    }
  }, [accessToken]);

  const loadProductionAreas = async () => {
    if (!accessToken) return;

    try {
      const areas = await productionAreasAPI.getAll(accessToken);
      setProductionAreas(areas);
    } catch (error: any) {
      console.error('Error loading production areas:', error);
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

  // Get icon component for production area
  const getAreaIcon = (iconName?: string) => {
    const icons: Record<string, any> = {
      ChefHat,
      Cake,
      Utensils,
      Coffee,
      Pizza,
      IceCream,
      Soup,
      Salad,
      Sandwich,
      Wine,
      CookingPot,
      Beef,
      Fish,
      Apple
    };
    const IconComponent = (iconName && icons[iconName]) || Factory;
    return <IconComponent className="w-4 h-4" />;
  };

  // Get unique production areas from order
  const getOrderAreas = (order: Order) => {
    if (!order.products) return [];

    const areaIds = new Set<string>();
    order.products.forEach(product => {
      if (product.productionAreaId) {
        areaIds.add(product.productionAreaId);
      }
    });

    return Array.from(areaIds)
      .map(id => productionAreas.find(a => a.id === id))
      .filter((area): area is ProductionAreaType => area !== undefined);
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
    toast.success('Filtros limpiados');
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

    // Apply production area filter
    if (selectedAreaFilter !== 'all') {
      console.log('🔍 Filtrando por área:', selectedAreaFilter);
      console.log('📦 Total de pedidos antes del filtro:', filtered.length);

      filtered = filtered.filter(order => {
        // Check if any product in the order belongs to the selected area
        const hasProductInArea = order.products?.some(product => {
          console.log(`  - Producto "${product.name}": areaId=${product.productionAreaId}`);
          return product.productionAreaId === selectedAreaFilter;
        });

        console.log(`  Pedido ${order.id.substring(0, 8)}: ${hasProductInArea ? '✅ INCLUIDO' : '❌ EXCLUIDO'}`);
        return hasProductInArea;
      });

      console.log('📦 Total de pedidos después del filtro:', filtered.length);
    }

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
    toast.success(`Estado actualizado a: ${getStatusLabel(newStatus)}`);
    setSelectedOrder(null);
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
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = /^\d{4}-\d{2}-\d{2}/.test(dateString) ? parseDate(dateString) : new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const handlePrintGuide = () => {
    if (!selectedOrder) return;

    // Create printable content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('No se pudo abrir la ventana de impresión');
      return;
    }

    const guideContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Guía de Despacho - Pedido #${selectedOrder.id.slice(0, 8)}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #1e40af;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header-logo {
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 15px;
            }
            .header-logo img {
              width: 180px;
              height: auto;
              object-fit: contain;
            }
            .header h1 {
              color: #1e40af;
              margin: 10px 0 0 0;
              font-size: 1.8em;
              letter-spacing: 2px;
            }
            .header h2 {
              color: #1e40af;
              margin: 10px 0 0 0;
              font-size: 1.3em;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 10px;
            }
            .label {
              font-weight: bold;
            }
            .products-table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            .products-table th,
            .products-table td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: left;
            }
            .products-table th {
              background-color: #1e40af;
              color: white;
            }
            .total {
              text-align: right;
              font-size: 1.2em;
              font-weight: bold;
              margin-top: 20px;
            }
            .signature {
              margin-top: 60px;
              border-top: 2px solid #000;
              padding-top: 10px;
              width: 300px;
            }
            @media print {
              body {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-logo">
              <img src="${logoFull}" alt="Logo La Oca" onload="console.log('Logo loaded')" onerror="console.error('Logo failed to load'); this.style.display='none';" />
            </div>
            <h1>CONECTOCA</h1>
            <h2>Guía de Despacho</h2>
          </div>
          
          <div class="info-row">
            <span><span class="label">Pedido #:</span> ${selectedOrder.id.slice(0, 8).toUpperCase()}</span>
            <span><span class="label">Fecha:</span> ${formatDate(selectedOrder.createdAt || selectedOrder.date)}</span>
          </div>
          
          <div class="info-row">
            <span><span class="label">Cliente:</span> ${selectedOrder.customerName || 'Cliente'}</span>
            <span><span class="label">Hora:</span> ${formatTime(selectedOrder.createdAt || selectedOrder.date)}</span>
          </div>
          
          <div class="info-row">
            <span><span class="label">Dirección de Despacho:</span> ${selectedOrder.deliveryAddress || 'Sin dirección registrada'}</span>
          </div>
          
          <div class="info-row">
            <span><span class="label">Fecha límite:</span> ${formatDate(selectedOrder.deadline)}</span>
          </div>
          
          <table class="products-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio Unit.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${selectedOrder.products?.map(p => `
                <tr>
                  <td>${p.name}</td>
                  <td>${p.quantity}</td>
                  <td>$${p.price.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                  <td>$${(p.price * p.quantity).toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('') || ''}
            </tbody>
          </table>
          
          <div class="total">
            Total: $${(selectedOrder.total || 0).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
          </div>
          
          <div style="margin-top: 40px;">
            <p><span class="label">Despachado por:</span> _______________________</p>
          </div>
          
          <div class="signature">
            <p style="margin: 0;">Firma del receptor</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(guideContent);
    printWindow.document.close();
    printWindow.print();

    toast.success('Guía de despacho generada');
    setShowDeliveryGuide(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 shadow-2xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3">
          {/* Top row with logo and controls */}
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </motion.button>

              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <motion.img
                  src={logo}
                  alt="La Oca Logo"
                  className="w-8 h-8 sm:w-10 sm:h-10 object-contain flex-shrink-0"
                  style={{ imageRendering: 'crisp-edges' }}
                  whileHover={{ rotate: [0, -10, 10, -10, 0], transition: { duration: 0.5 } }}
                />
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl tracking-wider truncate">CONECTOCA - Despacho</h1>
                  <p className="text-[10px] sm:text-xs text-blue-200 opacity-80 truncate">Panel de Despacho</p>
                </div>
              </div>
            </div>

            {/* KDS Button */}
            {onGoToKDS && (
              <Button
                onClick={onGoToKDS}
                className="bg-yellow-500 hover:bg-yellow-600 text-yellow-900 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4 h-9 sm:h-10 flex-shrink-0"
              >
                <Grid3x3 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Vista KDS</span>
                <span className="sm:hidden">KDS</span>
              </Button>
            )}
          </div>

          {/* Triangular Navigation Buttons */}
          <motion.div
            className="flex items-center justify-between gap-2"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(event, info) => {
              if (Math.abs(info.offset.x) > 50) {
                handleSwipe(info.offset.x);
              }
            }}
          >
            {/* Left Triangle Button */}
            <motion.button
              onClick={handlePreviousFilter}
              disabled={filterStatusIndex === 0}
              whileHover={{ scale: filterStatusIndex === 0 ? 1 : 1.15 }}
              whileTap={{ scale: filterStatusIndex === 0 ? 1 : 0.9 }}
              className={`
                flex-shrink-0 touch-manipulation
                ${filterStatusIndex === 0
                  ? 'opacity-30 cursor-not-allowed'
                  : 'cursor-pointer opacity-80 hover:opacity-100'
                }
              `}
              style={{
                clipPath: 'polygon(100% 0%, 100% 100%, 0% 50%)',
                backgroundColor: filterStatusIndex === 0 ? '#1e3a8a' : '#60a5fa',
                width: '32px',
                height: '32px',
                minWidth: '32px',
                minHeight: '32px'
              }}
              aria-label="Filtro anterior"
            />

            {/* Current Status Display */}
            <motion.div
              key={filterStatus}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25
              }}
              className={`
                flex-1 px-4 py-2 rounded-lg text-center
                ${getFilterStatusColor(filterStatus)}
                shadow-md
              `}
            >
              <div className="flex items-center justify-center gap-2">
                {getFilterStatusIcon(filterStatus)}
                <div>
                  <p className="text-xs opacity-60 leading-tight">Mostrando</p>
                  <p className="text-sm leading-tight">{getFilterStatusLabel(filterStatus)}</p>
                </div>
                <span className={`
                  px-2 py-0.5 rounded-full text-xs
                  ${filterStatus === 'all' ? 'bg-white/20' : 'bg-black/20'}
                `}>
                  {getStatusCount(filterStatus)}
                </span>
              </div>
            </motion.div>

            {/* Right Triangle Button */}
            <motion.button
              onClick={handleNextFilter}
              disabled={filterStatusIndex === filterStatusOptions.length - 1}
              whileHover={{ scale: filterStatusIndex === filterStatusOptions.length - 1 ? 1 : 1.15 }}
              whileTap={{ scale: filterStatusIndex === filterStatusOptions.length - 1 ? 1 : 0.9 }}
              className={`
                flex-shrink-0 touch-manipulation
                ${filterStatusIndex === filterStatusOptions.length - 1
                  ? 'opacity-30 cursor-not-allowed'
                  : 'cursor-pointer opacity-80 hover:opacity-100'
                }
              `}
              style={{
                clipPath: 'polygon(0% 0%, 0% 100%, 100% 50%)',
                backgroundColor: filterStatusIndex === filterStatusOptions.length - 1 ? '#1e3a8a' : '#60a5fa',
                width: '32px',
                height: '32px',
                minWidth: '32px',
                minHeight: '32px'
              }}
              aria-label="Filtro siguiente"
            />
          </motion.div>

          {/* Search and Advanced Filters */}
          <div className="mt-3 space-y-2">
            {/* Search Bar and Quick Actions */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Buscar por ID, cliente, producto, dirección..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-gray-300"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Sort Selector */}
              <Select value={sortBy} onValueChange={(value: string) => setSortBy(value as SortOption)}>
                <SelectTrigger className="w-[200px] bg-white/10 border-white/20 text-white">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Más reciente</SelectItem>
                  <SelectItem value="date-asc">Más antiguo</SelectItem>
                  <SelectItem value="amount-desc">Mayor monto</SelectItem>
                  <SelectItem value="amount-asc">Menor monto</SelectItem>
                  <SelectItem value="customer-asc">Cliente A-Z</SelectItem>
                  <SelectItem value="customer-desc">Cliente Z-A</SelectItem>
                </SelectContent>
              </Select>

              {/* View Mode Toggle */}
              <div className="flex gap-1 bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'bg-white/20' : 'hover:bg-white/10'
                    }`}
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'bg-white/20' : 'hover:bg-white/10'
                    }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Advanced Filters Toggle */}
              <Popover open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Filtros
                    {hasActiveFilters && (
                      <Badge className="ml-2 bg-yellow-500 text-blue-900">
                        {[dateFrom, dateTo, minAmount, maxAmount, customerFilter].filter(Boolean).length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 bg-gray-800 border-gray-700 text-white">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Filtros Avanzados</h4>
                      {hasActiveFilters && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={clearAllFilters}
                          className="text-yellow-400 hover:text-yellow-300 h-auto p-1"
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>

                    <Separator className="bg-gray-700" />

                    {/* Date Range */}
                    <div className="space-y-2">
                      <label className="text-sm text-gray-300">Rango de Fechas</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                            placeholder="Desde"
                          />
                        </div>
                        <div>
                          <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                            placeholder="Hasta"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Amount Range */}
                    <div className="space-y-2">
                      <label className="text-sm text-gray-300">Rango de Monto</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Input
                            type="number"
                            value={minAmount}
                            onChange={(e) => setMinAmount(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                            placeholder="Mínimo"
                          />
                        </div>
                        <div>
                          <Input
                            type="number"
                            value={maxAmount}
                            onChange={(e) => setMaxAmount(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                            placeholder="Máximo"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Customer Filter */}
                    <div className="space-y-2">
                      <label className="text-sm text-gray-300">Cliente</label>
                      <Input
                        type="text"
                        value={customerFilter}
                        onChange={(e) => setCustomerFilter(e.target.value)}
                        className="bg-gray-700 border-gray-600 text-white"
                        placeholder="Nombre del cliente..."
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Production Areas Filter - Only show if areas exist */}
            {productionAreas.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-2"
              >
                <Factory className="w-4 h-4 text-blue-300" />
                <span className="text-sm text-blue-200">Área:</span>
                <Select value={selectedAreaFilter} onValueChange={(value: string) => {
                  setSelectedAreaFilter(value);
                  toast.success(value === 'all' ? 'Mostrando todas las áreas' : `Filtrando por: ${productionAreas.find(a => a.id === value)?.name}`);
                }}>
                  <SelectTrigger className="w-[220px] bg-white/10 border-white/20 text-white">
                    <Layers className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="all" className="text-white hover:bg-white/10">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        <span>Todas las áreas</span>
                      </div>
                    </SelectItem>
                    {productionAreas.map((area) => (
                      <SelectItem
                        key={area.id}
                        value={area.id}
                        className="text-white hover:bg-white/10"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: area.color }}
                          />
                          {getAreaIcon(area.icon)}
                          <span>{area.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}

            {/* Filter Summary */}
            {(searchQuery || hasActiveFilters || selectedAreaFilter !== 'all') && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-xs text-blue-200"
              >
                <Filter className="w-3 h-3" />
                <span>
                  Mostrando {filteredOrders.length} de {orders.length} pedidos
                </span>
                {priorityOrders.size > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400">
                    <Star className="w-3 h-3 fill-current" />
                    {priorityOrders.size} prioritario{priorityOrders.size !== 1 ? 's' : ''}
                  </span>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="max-w-7xl mx-auto px-6 pt-4">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-xl">No hay pedidos en esta categoría</p>
          </div>
        ) : (
          <>
            <div className={`${viewMode === 'grid'
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "space-y-3"
              } ${isLoading ? 'opacity-50 transition-opacity duration-300' : ''}`}>
              <AnimatePresence>
                {filteredOrders.map((order) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    layout
                    className="relative"
                  >
                    {/* Priority Star Button */}
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePriority(order.id);
                      }}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className={`absolute -top-2 -right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${priorityOrders.has(order.id)
                        ? 'bg-yellow-500 text-yellow-900 shadow-lg'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                    >
                      <Star className={`w-4 h-4 ${priorityOrders.has(order.id) ? 'fill-current' : ''}`} />
                    </motion.button>

                    <Card
                      className={`
                        cursor-pointer
                        border-l-8 ${getStatusColor(order.status)} 
                        bg-gray-800 border-gray-700 text-white 
                        hover:shadow-2xl hover:scale-105 transition-all
                        ${order.status === 'pending' ? 'animate-pulse' : ''}
                        ${priorityOrders.has(order.id) ? 'ring-2 ring-yellow-500' : ''}
                      `}
                      onClick={() => setSelectedOrder(order)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Hash className="w-4 h-4 text-gray-400" />
                            <CardTitle className="text-lg">
                              {order.id.slice(0, 8).toUpperCase()}
                            </CardTitle>
                            {order.notes && order.notes.trim() && (
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center bg-gradient-to-br from-yellow-500 to-amber-600 shadow-lg"
                                title="Tiene observaciones"
                              >
                                <MessageSquare className="w-3 h-3 text-yellow-900" />
                              </div>
                            )}
                          </div>
                          <Badge className={`${getStatusColor(order.status)} text-white border-0`}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(order.status)}
                              <span className="text-xs">{getStatusLabel(order.status)}</span>
                            </div>
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        {/* Production Areas Badges - Show if order has areas */}
                        {getOrderAreas(order).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 -mt-1">
                            {getOrderAreas(order).map((area) => (
                              <Badge
                                key={area.id}
                                className="text-xs border-0 shadow-sm"
                                style={{
                                  backgroundColor: `${area.color}20`,
                                  color: area.color,
                                  borderLeft: `3px solid ${area.color}`
                                }}
                              >
                                <div className="flex items-center gap-1">
                                  {getAreaIcon(area.icon)}
                                  <span>{area.name}</span>
                                </div>
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className={`${viewMode === 'list' ? 'grid grid-cols-2 md:grid-cols-4 gap-4' : 'space-y-3'}`}>
                          <div className="flex items-center gap-2 text-sm text-gray-300">
                            <User className="w-4 h-4 text-blue-400" />
                            <span>{order.customerName}</span>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-gray-300">
                            <Clock className="w-4 h-4 text-yellow-400" />
                            <span>{formatTime(order.createdAt || order.date)}</span>
                          </div>

                          {viewMode === 'list' && (
                            <>
                              <div className="flex items-center gap-2 text-sm text-gray-300">
                                <DollarSign className="w-4 h-4 text-green-400" />
                                <span className="text-green-400">${(order.total || 0).toLocaleString('es-CL')}</span>
                              </div>

                              <div className="flex items-center gap-2 text-sm text-gray-300">
                                <Package className="w-4 h-4 text-purple-400" />
                                <span>{order.products?.length || 0} producto{(order.products?.length || 0) !== 1 ? 's' : ''}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {viewMode === 'grid' && (
                          <>
                            <Separator className="bg-gray-700" />

                            <div className="space-y-2">
                              <p className="text-xs text-gray-400">Productos:</p>
                              {order.products?.slice(0, 3).map((product, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span className="text-gray-300">{product.name}</span>
                                  <span className="text-yellow-400">×{product.quantity}</span>
                                </div>
                              ))}
                              {(order.products?.length || 0) > 3 && (
                                <p className="text-xs text-gray-500">
                                  +{(order.products?.length || 0) - 3} más...
                                </p>
                              )}
                            </div>

                            <Separator className="bg-gray-700" />

                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-400">Total:</span>
                              <span className="text-xl text-green-400">
                                ${(order.total || 0).toLocaleString('es-CL')}
                              </span>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Pagination Controls */}
            {pagination && onPageChange && (
              <div className="mt-6">
                <PaginationControls
                  pagination={pagination}
                  onPageChange={onPageChange}
                  isLoading={isLoading}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Order Detail Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-800 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Package className="w-6 h-6 text-blue-400" />
              Pedido #{selectedOrder?.id.slice(0, 8).toUpperCase()}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Detalles completos y opciones de gestión
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Status Badge */}
              <div className="flex items-center gap-3">
                <Badge className={`${getStatusColor(selectedOrder.status)} text-white text-base px-4 py-2`}>
                  {getStatusIcon(selectedOrder.status)}
                  <span className="ml-2">{getStatusLabel(selectedOrder.status)}</span>
                </Badge>
              </div>

              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-xs text-gray-400">Cliente</p>
                    <p className="text-sm">{selectedOrder.customerName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  <div>
                    <p className="text-xs text-gray-400">Fecha y hora de ingreso</p>
                    <p className="text-sm">{new Date(selectedOrder.createdAt || selectedOrder.date).toLocaleString('es-CL', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-400" />
                  <div>
                    <p className="text-xs text-gray-400">Fecha límite</p>
                    <p className="text-sm">{formatDate(selectedOrder.deadline)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-400" />
                  <div>
                    <p className="text-xs text-gray-400">Progreso</p>
                    <p className="text-sm">{selectedOrder.progress}%</p>
                  </div>
                </div>
              </div>

              {/* Products List */}
              <div>
                <h3 className="text-sm text-gray-400 mb-3">Productos solicitados:</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedOrder.products?.map((product, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-3 bg-gray-900 rounded-lg"
                    >
                      <div>
                        <p className="text-sm">{product.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatCLP(product.price)} × {product.quantity}
                        </p>
                      </div>
                      <p className="text-lg text-yellow-400">
                        {formatCLP(product.price * product.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator className="bg-gray-700" />

              {/* Total */}
              <div className="flex justify-between items-center p-4 bg-gray-900 rounded-lg">
                <span className="text-lg">Total del pedido:</span>
                <span className="text-2xl text-green-400">
                  ${(selectedOrder.total || 0).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Notes Section - Always visible for debugging */}
              <Separator className="bg-gray-700" />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-yellow-400" />
                  <h3 className="text-sm text-gray-400">Observaciones del Cliente:</h3>
                </div>
                {selectedOrder.notes && selectedOrder.notes.trim() ? (
                  <div className="p-4 bg-gradient-to-br from-yellow-900/30 to-amber-900/20 border-2 border-yellow-600/40 rounded-lg">
                    <p className="text-sm text-gray-200" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                      {selectedOrder.notes}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-900/50 border border-gray-700 rounded-lg">
                    <p className="text-sm text-gray-500 italic">
                      Sin observaciones
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <p className="text-sm text-gray-400">Cambiar estado:</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => handleStatusChange(selectedOrder.id, 'pending')}
                    disabled={selectedOrder.status === 'pending'}
                    className="bg-yellow-500 hover:bg-yellow-600 text-yellow-900"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Pendiente
                  </Button>

                  <Button
                    onClick={() => handleStatusChange(selectedOrder.id, 'in_progress')}
                    disabled={selectedOrder.status === 'in_progress'}
                    className="bg-blue-500 hover:bg-blue-600 text-blue-900"
                  >
                    <PlayCircle className="w-4 h-4 mr-2" />
                    En Preparación
                  </Button>

                  <Button
                    onClick={() => handleStatusChange(selectedOrder.id, 'completed')}
                    disabled={selectedOrder.status === 'completed'}
                    className="bg-green-500 hover:bg-green-600 text-green-900"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Listo
                  </Button>

                  <Button
                    onClick={() => handleStatusChange(selectedOrder.id, 'dispatched')}
                    disabled={selectedOrder.status === 'dispatched'}
                    className="bg-indigo-500 hover:bg-indigo-600 text-indigo-900"
                  >
                    <Package className="w-4 h-4 mr-2" />
                    Despachado
                  </Button>
                </div>

                {/* Secondary Actions Row */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => handleStatusChange(selectedOrder.id, 'delivered')}
                    disabled={selectedOrder.status === 'delivered'}
                    className="bg-teal-500 hover:bg-teal-600 text-teal-900"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Recibido
                  </Button>

                  <Button
                    onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                    disabled={selectedOrder.status === 'cancelled'}
                    className="bg-red-500 hover:bg-red-600 text-red-900"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                </div>

                {/* Print Guide Button */}
                {(selectedOrder.status === 'completed' || selectedOrder.status === 'cancelled') && (
                  <Button
                    onClick={() => setShowDeliveryGuide(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir Guía de Despacho
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delivery Guide Dialog */}
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