import { useState, useEffect } from 'react';
import { ProductionOrder, ProductionOrderStatus } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  ArrowLeft,
  Plus,
  Package,
  Package2,
  CheckCircle2,
  Clock,
  FileText,
  Trash2,
  Search,
  Filter,
  AlertCircle
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

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
  trackStock?: boolean; // Si es false, stock ilimitado
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
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/products`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Error al cargar productos');
      }

      const result = await response.json();
      console.log('📦 Products loaded:', result);
      setProducts(result.data || []);
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

      toast.success('✅ Orden de producción creada exitosamente');

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
        toast.success('✅ Producción iniciada - Stock de materias primas descontado');
      } else if (newStatus === 'TERMINADA') {
        toast.success('✅ Producción completada - Stock de productos actualizado');
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

  const handleDeleteOrder = async (orderId: string, orderName: string) => {
    if (!confirm(`¿Estás seguro de eliminar la orden "${orderName}"?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

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

      toast.success('✅ Orden eliminada correctamente');
      await loadProductionOrders();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast.error(error.message || 'Error al eliminar orden');
    }
  };

  const getStatusColor = (status: ProductionOrderStatus) => {
    switch (status) {
      case 'BORRADOR':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'EN_PROCESO':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'TERMINADA':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: ProductionOrderStatus) => {
    switch (status) {
      case 'BORRADOR':
        return <FileText className="w-4 h-4" />;
      case 'EN_PROCESO':
        return <Clock className="w-4 h-4" />;
      case 'TERMINADA':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: ProductionOrderStatus) => {
    switch (status) {
      case 'BORRADOR':
        return 'Borrador';
      case 'EN_PROCESO':
        return 'En Proceso';
      case 'TERMINADA':
        return 'Terminada';
      default:
        return status;
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando órdenes de producción...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-yellow-50 p-4 md:p-6 lg:p-8" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={onBack}
                className="shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl md:text-3xl text-gray-900">
                  🏭 Órdenes de Producción
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Usuario: {userName}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                {/* Only show create button for production and admin roles */}
                {(userRole === 'production' || userRole === 'admin') && (
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg">
                      <Plus className="w-5 h-5 mr-2" />
                      Nueva Orden de Producción
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>📦 Nueva Orden de Producción</DialogTitle>
                    <DialogDescription>
                      Agrega los productos que deseas producir y su cantidad
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 py-4">
                    {/* Add Products */}
                    <div className="space-y-4">
                      <Label>Productos a Producir</Label>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <Select value={currentProductId} onValueChange={setCurrentProductId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar producto" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(product => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name} (Stock: {product.trackStock === false || product.stock === -1 ? '∞ Ilimitado' : product.stock})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min="1"
                            value={currentQuantity}
                            onChange={(e) => setCurrentQuantity(parseInt(e.target.value) || '')}
                            placeholder="Cantidad"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            onClick={handleAddProduct}
                            size="icon"
                            className="shrink-0"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Selected Products */}
                      {selectedProducts.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">Productos agregados:</Label>
                          {selectedProducts.map((item) => (
                            <div
                              key={item.productId}
                              className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <Package className="w-5 h-5 text-blue-600" />
                                <div>
                                  <p className="font-medium text-gray-900">{item.name}</p>
                                  <p className="text-sm text-gray-600">Cantidad: {item.quantity}</p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveProduct(item.productId)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notas / Observaciones (opcional)</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ej: Producción urgente para evento especial..."
                        rows={3}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsCreateDialogOpen(false);
                          setSelectedProducts([]);
                          setNotes('');
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleCreateOrder}
                        disabled={selectedProducts.length === 0 && (!currentProductId || !currentQuantity)}
                        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                      >
                        Crear Orden de Producción
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Stock de Materia Prima Button */}
              {onNavigateToIngredients && (userRole === 'production' || userRole === 'admin') && (
                <Button
                  variant="outline"
                  onClick={onNavigateToIngredients}
                  className="border-yellow-300 text-yellow-700 hover:bg-yellow-50 hover:text-yellow-800 shadow"
                >
                  <Package2 className="w-5 h-5 mr-2" />
                  Stock de Materia Prima
                </Button>
              )}

              {/* Recetas Button */}
              {onNavigateToRecipes && (userRole === 'production' || userRole === 'admin') && (
                <Button
                  variant="outline"
                  onClick={onNavigateToRecipes}
                  className="border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 shadow"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Recetas
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Buscar por ID, producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-500 shrink-0" />
                <Select
                  value={statusFilter}
                  onValueChange={(value: string) => setStatusFilter(value as ProductionOrderStatus | 'ALL')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos los estados</SelectItem>
                    <SelectItem value="BORRADOR">Borrador</SelectItem>
                    <SelectItem value="EN_PROCESO">En Proceso</SelectItem>
                    <SelectItem value="TERMINADA">Terminada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFilterFrom}
                  onChange={(e) => setDateFilterFrom(e.target.value)}
                  className="flex-1"
                  placeholder="Desde"
                />
                <Input
                  type="date"
                  value={dateFilterTo}
                  onChange={(e) => setDateFilterTo(e.target.value)}
                  className="flex-1"
                  placeholder="Hasta"
                />
                {(dateFilterFrom || dateFilterTo) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDateFilterFrom('');
                      setDateFilterTo('');
                    }}
                    className="shrink-0"
                  >
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders Grid */}
        {filteredOrders.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg text-gray-600 mb-2">
              {searchTerm || statusFilter !== 'ALL'
                ? 'No se encontraron órdenes con estos filtros'
                : 'No hay órdenes de producción'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchTerm || statusFilter !== 'ALL'
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Crea tu primera orden de producción para comenzar'}
            </p>
            {!searchTerm && statusFilter === 'ALL' && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                Nueva Orden de Producción
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((order) => (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="hover:shadow-xl transition-shadow duration-300 border-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">
                            {order.productName}
                          </CardTitle>
                          <p className="text-xs text-gray-500 mt-1">
                            ID: {order.id.substring(0, 8).toUpperCase()}
                          </p>
                        </div>
                        <Badge className={`${getStatusColor(order.status)} border shrink-0`}>
                          <span className="flex items-center gap-1.5">
                            {getStatusIcon(order.status)}
                            {getStatusLabel(order.status)}
                          </span>
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Products */}
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-600">Productos:</Label>
                        <div className="space-y-1.5">
                          {order.products.map((product, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm"
                            >
                              <span className="text-gray-700 font-medium">{product.name}</span>
                              <div className="flex gap-1.5">
                                {order.status === 'TERMINADA' && product.producedQuantity !== undefined ? (
                                  <>
                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                      OK: {product.producedQuantity}
                                    </Badge>
                                    {(product.wasteQuantity || 0) > 0 && (
                                      <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                        Merma: {product.wasteQuantity}
                                      </Badge>
                                    )}
                                  </>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    {product.quantity} unidades
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-gray-500">Creada</p>
                          <p className="font-medium text-gray-900">
                            {new Date(order.createdAt).toLocaleDateString('es-CL')}
                          </p>
                        </div>
                        {order.completedAt && (
                          <div>
                            <p className="text-gray-500">Completada</p>
                            <p className="font-medium text-gray-900">
                              {new Date(order.completedAt).toLocaleDateString('es-CL')}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      {order.notes && (
                        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                          <p className="text-xs text-gray-600 mb-1">Notas:</p>
                          <p className="text-sm text-gray-800">{order.notes}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        {order.status === 'BORRADOR' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleUpdateStatus(order.id, 'EN_PROCESO')}
                              className="flex-1 bg-blue-600 hover:bg-blue-700"
                            >
                              <Clock className="w-4 h-4 mr-1" />
                              Iniciar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteOrder(order.id, order.productName)}
                              className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Eliminar
                            </Button>
                          </>
                        )}

                        {order.status === 'EN_PROCESO' && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenCompleteDialog(order)}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Completar
                          </Button>
                        )}

                        {order.status === 'TERMINADA' && (
                          <div className="flex-1 text-center py-2 bg-green-50 rounded-md">
                            <p className="text-sm text-green-700 font-medium">
                              ✅ Orden Completada
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Summary */}
        {productionOrders.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-200 rounded-lg">
                    <FileText className="w-6 h-6 text-gray-700" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Borradores</p>
                    <p className="text-2xl text-gray-900">
                      {productionOrders.filter(o => o.status === 'BORRADOR').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-200 rounded-lg">
                    <Clock className="w-6 h-6 text-blue-700" />
                  </div>
                  <div>
                    <p className="text-sm text-blue-600">En Proceso</p>
                    <p className="text-2xl text-blue-900">
                      {productionOrders.filter(o => o.status === 'EN_PROCESO').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-200 rounded-lg">
                    <CheckCircle2 className="w-6 h-6 text-green-700" />
                  </div>
                  <div>
                    <p className="text-sm text-green-600">Terminadas</p>
                    <p className="text-2xl text-green-900">
                      {productionOrders.filter(o => o.status === 'TERMINADA').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      {/* Confirmation Dialog for Completion */}
      <Dialog open={isCompleteDialogOpen} onOpenChange={setIsCompleteDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Completar Orden de Producción</DialogTitle>
            <DialogDescription>
              Confirma las cantidades reales producidas y registra mermas si las hubo.
              El stock de productos terminados se incrementará según la "Cantidad Producida".
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            {completionData.map((item) => (
              <div key={item.productId} className="bg-slate-50 p-4 rounded-lg space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-slate-800">{item.name}</h4>
                  <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                    Objetivo: {item.targetQuantity}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-green-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Cantidad Producida (OK)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.producedQuantity}
                      onChange={(e) => handleUpdateCompletionData(item.productId, 'producedQuantity', e.target.value)}
                      className="border-green-200 focus-visible:ring-green-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-red-700 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Merma (Descarte)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.wasteQuantity}
                      onChange={(e) => handleUpdateCompletionData(item.productId, 'wasteQuantity', e.target.value)}
                      className="border-red-200 focus-visible:ring-red-500"
                    />
                  </div>
                </div>

                {/* Validation/Info Message */}
                {(item.producedQuantity + item.wasteQuantity) !== item.targetQuantity && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Total ({item.producedQuantity + item.wasteQuantity}) difiere del objetivo ({item.targetQuantity})
                  </p>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmComplete} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirmar y Finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}