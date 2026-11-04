import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import {
  ArrowLeft,
  TrendingUp,
  Package,
  Package2,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Calendar,
  Clock,
  Award,
  AlertCircle,
  ChevronRight,
  ShoppingBag,
  Layers,
  Activity,
  DollarSign
} from 'lucide-react';
import { motion } from 'motion/react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { formatCLP } from '../utils/format';

interface ProductionDashboardProps {
  onBack: () => void;
  accessToken: string;
  userName: string;
  onNavigateToOrders: () => void;
  onNavigateToIngredients: () => void;
  onNavigateToRecipes: () => void;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  stock: number;
  price: number;
  categoryId?: string;
  categoryName?: string;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  maxStock?: number;
  costPerUnit?: number;
}

interface Order {
  id: string;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
    producedQuantity?: number;
    wasteQuantity?: number;
  }>;
  status: string;
  createdAt: string;
  total: number;
}

interface ProductStats {
  productId: string;
  productName: string;
  totalOrdered: number;
  orderCount: number;
  revenue: number;
}

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-6d979413`;

export function ProductionDashboard({
  onBack,
  accessToken,
  userName,
  onNavigateToOrders,
  onNavigateToIngredients,
  onNavigateToRecipes
}: ProductionDashboardProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Cargar productos, ingredientes y órdenes en paralelo
      const [productsRes, ingredientsRes, ordersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/products`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${API_BASE_URL}/ingredients`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${API_BASE_URL}/orders?page=1&limit=100`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      ]);

      if (productsRes.ok) {
        const productsData = await productsRes.json();
        setProducts(productsData.data || []);
      }

      if (ingredientsRes.ok) {
        const ingredientsData = await ingredientsRes.json();
        setIngredients(ingredientsData.data || []);
      }

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(ordersData.data || []);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calcular productos más pedidos
  const topProducts = useMemo(() => {
    const productMap = new Map<string, ProductStats>();

    orders.forEach(order => {
      order.products?.forEach(item => {
        const existing = productMap.get(item.productId);
        if (existing) {
          existing.totalOrdered += item.quantity;
          existing.orderCount += 1;
          existing.revenue += item.quantity * item.price;
        } else {
          productMap.set(item.productId, {
            productId: item.productId,
            productName: item.name,
            totalOrdered: item.quantity,
            orderCount: 1,
            revenue: item.quantity * item.price
          });
        }
      });
    });

    return Array.from(productMap.values())
      .sort((a, b) => b.totalOrdered - a.totalOrdered)
      .slice(0, 5);
  }, [orders]);

  // Calcular estadísticas de merma (Waste Stats)
  const wasteStats = useMemo(() => {
    let totalProduced = 0;
    let totalWaste = 0;
    const wasteByProduct = new Map<string, { name: string; waste: number; produced: number }>();

    orders.filter(o => o.status === 'TERMINADA').forEach(order => {
      order.products?.forEach(item => {
        const produced = item.producedQuantity !== undefined ? item.producedQuantity : item.quantity;
        const waste = item.wasteQuantity || 0;

        totalProduced += produced;
        totalWaste += waste;

        if (waste > 0) {
          const existing = wasteByProduct.get(item.productId);
          if (existing) {
            existing.waste += waste;
            existing.produced += produced;
          } else {
            wasteByProduct.set(item.productId, {
              name: item.name,
              waste,
              produced
            });
          }
        }
      });
    });

    const topWasteProducts = Array.from(wasteByProduct.values())
      .sort((a, b) => b.waste - a.waste)
      .slice(0, 3);

    const wasteRate = totalProduced + totalWaste > 0
      ? (totalWaste / (totalProduced + totalWaste)) * 100
      : 0;

    return {
      totalProduced,
      totalWaste,
      wasteRate,
      topWasteProducts
    };
  }, [orders]);

  // Alertas de stock bajo
  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.stock < 20 && p.stock > 0);
  }, [products]);

  const outOfStockProducts = useMemo(() => {
    return products.filter(p => p.stock === 0);
  }, [products]);

  // Alertas de ingredientes bajo stock
  const lowStockIngredients = useMemo(() => {
    return ingredients.filter(i => i.currentStock <= i.minStock);
  }, [ingredients]);

  // Estadísticas generales
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter(o => {
      const orderDate = new Date(o.createdAt);
      orderDate.setHours(0, 0, 0, 0);
      return orderDate.getTime() === today.getTime();
    });

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);

    const weekOrders = orders.filter(o =>
      new Date(o.createdAt) >= thisWeek
    );

    const completedOrders = orders.filter(o => o.status === 'completed');
    const pendingOrders = orders.filter(o => o.status === 'pending');
    const inProgressOrders = orders.filter(o => o.status === 'in_progress');

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // Calculate Inventory Value & Cost
    const totalInventoryValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
    const totalInventoryCost = products.reduce((sum, p) => {
      // Safe check for ingredients
      const productIngredients = (p as any).ingredients || [];
      const productUnitCost = productIngredients.reduce((c: number, pi: any) => {
        const ing = ingredients.find(i => i.id === pi.ingredientId);
        const cost = ing?.costPerUnit || pi.costPerUnit || 0;
        return c + (cost * pi.quantity);
      }, 0);
      return sum + (productUnitCost * p.stock);
    }, 0);

    return {
      totalProducts: products.length,
      totalIngredients: ingredients.length,
      totalOrders: orders.length,
      todayOrders: todayOrders.length,
      weekOrders: weekOrders.length,
      completedOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
      inProgressOrders: inProgressOrders.length,
      lowStockAlerts: lowStockProducts.length + lowStockIngredients.length,
      outOfStockAlerts: outOfStockProducts.length,
      totalRevenue,
      todayRevenue,
      totalInventoryCost,
      totalInventoryValue
    };
  }, [products, ingredients, orders, lowStockProducts, lowStockIngredients, outOfStockProducts]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 pb-24" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="hover:bg-white/50"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard de Producción</h1>
              <p className="text-sm text-gray-600">Bienvenido, {userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-white/50">
              <Clock className="w-3 h-3 mr-1" />
              {new Date().toLocaleDateString('es-CL', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
              })}
            </Badge>
          </div>
        </div>

        {/* Alertas Críticas */}
        {(stats.outOfStockAlerts > 0 || lowStockIngredients.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-500 rounded-lg p-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Alertas Críticas de Stock</h3>
                <div className="space-y-1 text-sm text-red-800">
                  {stats.outOfStockAlerts > 0 && (
                    <p>• {stats.outOfStockAlerts} producto{stats.outOfStockAlerts > 1 ? 's' : ''} sin stock</p>
                  )}
                  {lowStockIngredients.length > 0 && (
                    <p>• {lowStockIngredients.length} ingrediente{lowStockIngredients.length > 1 ? 's' : ''} bajo stock mínimo</p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="bg-white"
                onClick={onNavigateToIngredients}
              >
                Ver Detalles
              </Button>
            </div>
          </motion.div>
        )}

        {/* Acciones Rápidas */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
            <CardDescription>Accede a las herramientas principales</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-blue-50 hover:border-blue-300"
                onClick={onNavigateToOrders}
              >
                <Package2 className="w-6 h-6 text-blue-600" />
                <div className="text-center">
                  <p className="font-semibold">Órdenes de Producción</p>
                  <p className="text-xs text-gray-500">Crear y gestionar órdenes</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-purple-50 hover:border-purple-300"
                onClick={onNavigateToIngredients}
              >
                <Layers className="w-6 h-6 text-purple-600" />
                <div className="text-center">
                  <p className="font-semibold">Gestión de Ingredientes</p>
                  <p className="text-xs text-gray-500">Stock y materias primas</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-green-50 hover:border-green-300"
                onClick={onNavigateToRecipes}
              >
                <BarChart3 className="w-6 h-6 text-green-600" />
                <div className="text-center">
                  <p className="font-semibold">Recetas de Productos</p>
                  <p className="text-xs text-gray-500">Configurar ingredientes</p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pedidos de Hoy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-blue-100">Pedidos Hoy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">{stats.todayOrders}</p>
                    <p className="text-xs text-blue-100 mt-1">
                      {stats.weekOrders} esta semana
                    </p>
                  </div>
                  <ShoppingBag className="w-8 h-8 text-blue-300" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* En Proceso */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-amber-100">En Proceso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">{stats.inProgressOrders}</p>
                    <p className="text-xs text-amber-100 mt-1">
                      {stats.pendingOrders} pendientes
                    </p>
                  </div>
                  <Activity className="w-8 h-8 text-amber-300" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Completados */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-green-100">Completados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">{stats.completedOrders}</p>
                    <p className="text-xs text-green-100 mt-1">
                      {((stats.completedOrders / stats.totalOrders) * 100 || 0).toFixed(0)}% del total
                    </p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-green-300" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Alertas */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className={`bg-gradient-to-br ${stats.lowStockAlerts > 0
              ? 'from-red-500 to-red-600'
              : 'from-gray-500 to-gray-600'
              } text-white border-0 shadow-lg`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-red-100">
                  Alertas de Stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">{stats.lowStockAlerts}</p>
                    <p className="text-xs text-red-100 mt-1">
                      Requieren atención
                    </p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-300" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Financial Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Inventory Value */}
          <Card className="bg-gradient-to-br from-slate-50 to-white shadow-lg border-l-4 border-indigo-500">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-indigo-900">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                Valorización de Inventario
              </CardTitle>
              <CardDescription>Costo de productos terminados en stock</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Costo de Producción</p>
                    <p className="text-xs text-slate-400">Materia prima acumulada</p>
                  </div>
                  <p className="text-lg font-bold text-slate-700">{formatCLP(stats.totalInventoryCost)}</p>
                </div>

                <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Valor de Venta</p>
                    <p className="text-xs text-slate-400">Ingreso potencial total</p>
                  </div>
                  <p className="text-lg font-bold text-indigo-600">{formatCLP(stats.totalInventoryValue)}</p>
                </div>

                <div className="pt-3 border-t border-indigo-100 flex justify-between items-center">
                  <p className="text-sm font-bold text-indigo-900">Margen Potencial</p>
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 px-3 py-1 text-sm">
                    {formatCLP(stats.totalInventoryValue - stats.totalInventoryCost)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Revenue Stats (derived from orders) */}
          <Card className="bg-gradient-to-br from-emerald-50 to-white shadow-lg border-l-4 border-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-emerald-900">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Ingresos por Ventas
              </CardTitle>
              <CardDescription>Resumen de ventas realizadas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-emerald-100 shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Ventas Totales</p>
                    <p className="text-xs text-slate-400">Todas las órdenes</p>
                  </div>
                  <p className="text-lg font-bold text-emerald-600">{formatCLP(stats.totalRevenue)}</p>
                </div>

                <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-emerald-100 shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Ventas Hoy</p>
                    <p className="text-xs text-slate-400">{stats.todayOrders} órdenes</p>
                  </div>
                  <p className="text-lg font-bold text-emerald-600">{formatCLP(stats.todayRevenue)}</p>
                </div>

                <div className="pt-3 border-t border-emerald-100 flex justify-between items-center">
                  <p className="text-sm font-bold text-emerald-900">Ticket Promedio</p>
                  <span className="text-emerald-700 font-semibold">{formatCLP(stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Productos Más Pedidos */}
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <div>
                  <CardTitle>Top 5 Productos Más Pedidos</CardTitle>
                  <CardDescription>Últimos {orders.length} pedidos registrados</CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onNavigateToOrders}
              >
                Ver Órdenes
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No hay datos de pedidos aún</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, index) => {
                  const maxQuantity = topProducts[0].totalOrdered;
                  const percentage = (product.totalOrdered / maxQuantity) * 100;

                  return (
                    <motion.div
                      key={product.productId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="relative"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                            index === 1 ? 'bg-gray-100 text-gray-700' :
                              index === 2 ? 'bg-orange-100 text-orange-700' :
                                'bg-blue-100 text-blue-700'
                            }`}>
                            {index === 0 && <Award className="w-4 h-4" />}
                            {index > 0 && <span className="text-xs font-bold">#{index + 1}</span>}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{product.productName}</p>
                            <p className="text-xs text-gray-500">
                              {product.orderCount} pedido{product.orderCount > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-blue-600">
                            {product.totalOrdered}
                          </p>
                          <p className="text-xs text-gray-500">unidades</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                          className={`h-full rounded-full ${index === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
                            index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                              index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                                'bg-gradient-to-r from-blue-400 to-blue-500'
                            }`}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Waste Control Analysis */}
        <Card className="shadow-lg border-l-4 border-amber-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <div>
                <CardTitle>Control de Mermas</CardTitle>
                <CardDescription>Análisis de desperdicios en producción</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Global Rate */}
              <div className="flex flex-col justify-center items-center p-4 bg-amber-50 rounded-lg">
                <p className="text-sm font-medium text-amber-800 mb-1">Tasa de Merma Global</p>
                <p className="text-3xl font-bold text-amber-600">{wasteStats.wasteRate.toFixed(1)}%</p>
                <p className="text-xs text-amber-600 mt-1">
                  {wasteStats.totalWaste} mermas / {wasteStats.totalProduced} OK
                </p>
              </div>

              {/* Top Waste Products */}
              <div className="md:col-span-2 space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Productos con mayor merma:</h4>
                {wasteStats.topWasteProducts.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No hay registros de merma.</p>
                ) : (
                  <div className="space-y-2">
                    {wasteStats.topWasteProducts.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                        <span className="text-gray-700">{item.name}</span>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            {item.waste} mermas
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {((item.waste / (item.produced + item.waste)) * 100).toFixed(0)}% tasa
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grid de 2 columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock de Productos */}
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <div>
                  <CardTitle>Estado de Stock - Productos</CardTitle>
                  <CardDescription>{products.length} productos en catálogo</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Productos sin stock */}
                {outOfStockProducts.length > 0 && (
                  <div className="border-l-4 border-red-500 bg-red-50 rounded-r-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-red-900">Sin Stock</span>
                      <Badge variant="destructive">{outOfStockProducts.length}</Badge>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {outOfStockProducts.slice(0, 3).map(product => (
                        <p key={product.id} className="text-sm text-red-800">
                          • {product.name}
                        </p>
                      ))}
                      {outOfStockProducts.length > 3 && (
                        <p className="text-xs text-red-600 italic">
                          +{outOfStockProducts.length - 3} más...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Productos con bajo stock */}
                {lowStockProducts.length > 0 && (
                  <div className="border-l-4 border-amber-500 bg-amber-50 rounded-r-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-amber-900">Stock Bajo</span>
                      <Badge className="bg-amber-500">{lowStockProducts.length}</Badge>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {lowStockProducts.slice(0, 3).map(product => (
                        <div key={product.id} className="flex items-center justify-between text-sm text-amber-800">
                          <span>• {product.name}</span>
                          <span className="font-medium">{product.stock} unid.</span>
                        </div>
                      ))}
                      {lowStockProducts.length > 3 && (
                        <p className="text-xs text-amber-600 italic">
                          +{lowStockProducts.length - 3} más...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Stock OK */}
                {outOfStockProducts.length === 0 && lowStockProducts.length === 0 && (
                  <div className="border-l-4 border-green-500 bg-green-50 rounded-r-lg p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-900">
                        Stock en buen estado
                      </span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      Todos los productos tienen stock suficiente
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stock de Ingredientes */}
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-600" />
                  <div>
                    <CardTitle>Estado de Stock - Ingredientes</CardTitle>
                    <CardDescription>{ingredients.length} ingredientes</CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNavigateToIngredients}
                >
                  Gestionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {lowStockIngredients.length > 0 ? (
                  <div className="space-y-2">
                    {lowStockIngredients.slice(0, 5).map(ingredient => {
                      const percentage = (ingredient.currentStock / ingredient.minStock) * 100;
                      const isVeryLow = percentage < 50;

                      return (
                        <div key={ingredient.id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-900">{ingredient.name}</span>
                            <span className={`font-semibold ${isVeryLow ? 'text-red-600' : 'text-amber-600'
                              }`}>
                              {ingredient.currentStock} {ingredient.unit}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isVeryLow
                                  ? 'bg-gradient-to-r from-red-500 to-red-600'
                                  : 'bg-gradient-to-r from-amber-500 to-amber-600'
                                  }`}
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 min-w-[60px] text-right">
                              Min: {ingredient.minStock}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {lowStockIngredients.length > 5 && (
                      <p className="text-xs text-gray-500 italic pt-2">
                        +{lowStockIngredients.length - 5} ingredientes más con stock bajo
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="border-l-4 border-green-500 bg-green-50 rounded-r-lg p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-900">
                        Ingredientes OK
                      </span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      Todos los ingredientes sobre stock mínimo
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}