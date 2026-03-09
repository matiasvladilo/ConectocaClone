import { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Package,
  CheckCircle2,
  Clock,
  BarChart3,
  PieChart,
  Download,
  Calendar as CalendarIcon,
  Warehouse,
  AlertTriangle,
  Factory
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import type { User, Order } from '../App';
import { ingredientsAPI, productIngredientsAPI, ordersAPI, type Ingredient, type ProductIngredient } from '../utils/api';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { productsAPI, type Product } from '../utils/api';
import { createClient } from '../utils/supabase/client';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface AnalyticsProps {
  user: User;
  orders: Order[];
  onBack: () => void;
  accessToken?: string;
}

interface DailyStats {
  date: string;
  pedidos: number;
  ingresos: number;
}

interface ProductStats {
  name: string;
  cantidad: number;
  ingresos: number;
  ventasTotales?: number;
}

interface StatusDistribution {
  name: string;
  value: number;
  color: string;
}

interface ProductionOrder {
  id: string;
  productName: string;
  quantity: number;
  status: 'BORRADOR' | 'EN_PROCESO' | 'TERMINADA';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
    currentStock?: number;
  }>;
  notes?: string;
}

export function Analytics({ user, orders, onBack, accessToken }: AnalyticsProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'custom'>('90d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 90)),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [productIngredients, setProductIngredients] = useState<ProductIngredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProduction, setLoadingProduction] = useState(false);
  const [allOrders, setAllOrders] = useState<Order[]>(orders);

  // Fetch all orders for comprehensive analytics processing
  useEffect(() => {
    const fetchAllOrders = async () => {
      if (!accessToken) return;
      try {
        // Fetch up to 1000 orders to ensure we have enough historical data
        const response = await ordersAPI.getAll(accessToken, 1, 1000);
        if (response && response.data) {
          setAllOrders(response.data);
        }
      } catch (error) {
        console.error('Error fetching comprehensive orders for analytics:', error);
      }
    };

    fetchAllOrders();
  }, [accessToken]);

  // Color palette matching La Oca brand
  const COLORS = {
    primary: '#1e40af', // blue-800
    secondary: '#eab308', // yellow-500
    success: '#22c55e', // green-500
    danger: '#ef4444', // red-500
    warning: '#f59e0b', // amber-500
    info: '#3b82f6', // blue-500
  };

  const PIE_COLORS = ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'];

  // Calculate date range
  const dateRangeInDays = useMemo(() => {
    switch (timeRange) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case 'custom':
        if (dateRange?.from && dateRange?.to) {
          const diffTime = Math.abs(dateRange.to.getTime() - dateRange.from.getTime());
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }
        return 30; // Fallback
      default: return 30;
    }
  }, [timeRange, dateRange]);

  const startDate = useMemo(() => {
    if (timeRange === 'custom' && dateRange?.from) {
      return dateRange.from;
    }
    const date = new Date();
    date.setDate(date.getDate() - dateRangeInDays);
    return date;
  }, [dateRangeInDays, timeRange, dateRange]);

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    const filtered = allOrders.filter(order => {
      // Use createdAt as primary date (when the order was placed), not deadline (when it's due)
      const dateString = order.createdAt || order.date || (order.deadline ? `${order.deadline}T12:00:00` : null);
      if (!dateString) return false;
      const orderDate = new Date(dateString);
      if (timeRange === 'custom') {
        if (dateRange?.to) {
          // End of day for the end date
          const endDate = new Date(dateRange.to);
          endDate.setHours(23, 59, 59, 999);
          return orderDate >= startDate && orderDate <= endDate;
        } else if (dateRange?.from) {
          // If only 'from' is selected, filter for that specific day
          const endDate = new Date(dateRange.from);
          endDate.setHours(23, 59, 59, 999);
          return orderDate >= startDate && orderDate <= endDate;
        }
      }
      return orderDate >= startDate;
    }).map(order => ({
      ...order,
      // Ensure all products have id field set from productId
      products: order.products?.map(product => {
        // Log the product structure to debug
        if (!product.id && !product.productId) {
          console.log('⚠️ Product without id or productId:', product);
        }
        return {
          ...product,
          id: product.id || product.productId || undefined
        };
      })
    }));

    console.log('📋 Filtered orders with products:', filtered.map(o => ({
      orderId: o.id.substring(0, 8),
      products: o.products?.map(p => ({ name: p.name, id: p.id, productId: (p as any).productId }))
    })));

    return filtered;
  }, [allOrders, startDate, timeRange, dateRange]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const completedOrders = filteredOrders.filter(o => o.status === 'completed' || o.status === 'cancelled').length;
    const totalOrders = filteredOrders.length;
    const successRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

    // Average production time (in hours) - simplified calculation
    const avgProductionTime = filteredOrders
      .filter(o => o.status === 'completed' || o.status === 'cancelled')
      .reduce((sum, order) => {
        const created = new Date(order.createdAt || order.date);
        const now = new Date();
        const hours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }, 0) / (completedOrders || 1);

    return {
      totalRevenue,
      totalOrders,
      completedOrders,
      successRate,
      avgProductionTime: Math.round(avgProductionTime)
    };
  }, [filteredOrders]);

  // Daily statistics for line chart
  const dailyStats = useMemo((): DailyStats[] => {
    const statsMap = new Map<string, { pedidos: number; ingresos: number }>();

    // Initialize all days in range
    for (let i = 0; i < dateRangeInDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (dateRangeInDays - 1 - i));
      const dateStr = date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
      statsMap.set(dateStr, { pedidos: 0, ingresos: 0 });
    }

    // Fill with actual data
    filteredOrders.forEach(order => {
      const dateString = order.createdAt || order.date || (order.deadline ? `${order.deadline}T12:00:00` : null);
      if (!dateString) return;
      const orderDate = new Date(dateString);
      const dateStr = orderDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });

      const current = statsMap.get(dateStr);
      if (current) {
        current.pedidos += 1;
        current.ingresos += order.total || 0;
      }
    });

    return Array.from(statsMap.entries()).map(([date, stats]) => ({
      date,
      pedidos: stats.pedidos,
      ingresos: stats.ingresos
    }));
  }, [filteredOrders, dateRangeInDays]);

  // Product statistics (All products)
  const allProductStats = useMemo((): ProductStats[] => {
    const statsMap = new Map<string, { cantidad: number; ingresos: number; pedidos: Set<string> }>();

    filteredOrders.forEach(order => {
      order.products?.forEach(product => {
        const current = statsMap.get(product.name) || { cantidad: 0, ingresos: 0, pedidos: new Set<string>() };
        current.cantidad += product.quantity;
        current.ingresos += product.price * product.quantity;
        if (order.id) current.pedidos.add(order.id);
        statsMap.set(product.name, current);
      });
    });

    return Array.from(statsMap.entries())
      .map(([name, stats]) => ({
        name,
        cantidad: stats.cantidad,
        ingresos: stats.ingresos,
        ventasTotales: stats.pedidos.size
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [filteredOrders]);

  // Top 10 products for the bar chart
  const topProductStats = useMemo(() => allProductStats.slice(0, 10), [allProductStats]);

  // Status distribution for pie chart
  const statusDistribution = useMemo((): StatusDistribution[] => {
    const distribution = {
      pending: { count: 0, label: 'Pendientes', color: COLORS.warning },
      in_progress: { count: 0, label: 'En Preparación', color: COLORS.info },
      completed: { count: 0, label: 'Listos', color: COLORS.success },
      cancelled: { count: 0, label: 'Despachados', color: COLORS.primary }
    };

    filteredOrders.forEach(order => {
      if (distribution[order.status]) {
        distribution[order.status].count++;
      }
    });

    return Object.entries(distribution)
      .filter(([_, data]) => data.count > 0)
      .map(([_, data]) => ({
        name: data.label,
        value: data.count,
        color: data.color
      }));
  }, [filteredOrders]);

  // Load production data (ingredients and production orders)
  useEffect(() => {
    if (accessToken && (user.role === 'admin' || user.role === 'production')) {
      console.log('✓ Access token available, loading production data for admin/production user');
      loadProductionData();
    } else if (!accessToken && (user.role === 'admin' || user.role === 'production')) {
      console.warn('⚠️ Admin/Production user but no access token available');
    } else if (user.role !== 'admin' && user.role !== 'production') {
      console.log('ℹ️ Non-admin/production user, skipping production data load');
    }
  }, [accessToken, user.role]);

  const loadProductionData = async () => {
    setLoadingProduction(true);
    try {
      // Get fresh access token from Supabase session
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        console.error('⚠️ No valid session for loading production data:', sessionError);
        toast.error('No se pudo obtener sesión válida. Por favor, vuelva a iniciar sesión.');
        setLoadingProduction(false);
        return;
      }

      const token = session.access_token;
      console.log('✓ Using fresh access token from Supabase session');
      console.log('🔑 Token length:', token.length, 'First 30 chars:', token.substring(0, 30));

      // Load ingredients
      console.log('📦 Loading ingredients...');
      const ingredientsData = await ingredientsAPI.getAll(token);
      setIngredients(ingredientsData);
      console.log(`✓ Loaded ${ingredientsData.length} ingredients`);

      // Load production orders from server (using accessToken for authentication)
      console.log('📦 Loading production orders...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/production-orders`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Error loading production orders:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to load production orders');
      }

      const data = await response.json();
      // Handle both { orders: [...] } and direct array responses
      const ordersData = data.orders || data;
      setProductionOrders(Array.isArray(ordersData) ? ordersData : []);
      console.log(`✓ Loaded ${ordersData.length} production orders`);

      // Load all products to get their ingredients
      console.log('📦 Loading products for recipe analysis...');
      const productsData = await productsAPI.getAll(token);
      setProducts(productsData);

      // Load ingredients for each product
      const allProductIngredients: ProductIngredient[] = [];
      for (const product of productsData) {
        if (product.id) {
          try {
            const productIngs = await productIngredientsAPI.getByProduct(token, product.id);
            if (productIngs && productIngs.length > 0) {
              console.log(`✓ Loaded ${productIngs.length} ingredients for product "${product.name}":`, productIngs);
              allProductIngredients.push(...productIngs);
            } else {
              console.log(`ℹ️ No ingredients found for product "${product.name}"`);
            }
          } catch (error) {
            console.error(`Error loading ingredients for product ${product.name}:`, error);
          }
        }
      }
      setProductIngredients(allProductIngredients);
      console.log(`✓ Loaded ${allProductIngredients.length} product-ingredient relationships`);
      console.log('📋 All product ingredients:', allProductIngredients);

      toast.success('Datos de producción cargados exitosamente');
    } catch (error: any) {
      console.error('❌ Error loading production data:', error);
      toast.error(error.message || 'Error al cargar datos de producción');
    } finally {
      setLoadingProduction(false);
    }
  };

  // Production cost analytics
  const productionCosts = useMemo(() => {
    if (!ingredients.length) return null;

    const totalInventoryValue = ingredients.reduce((sum, ing) => {
      return sum + (ing.currentStock * (ing.costPerUnit || 0));
    }, 0);

    const lowStockItems = ingredients.filter(ing => ing.currentStock <= ing.minStock);

    const ingredientsByValue = ingredients
      .map(ing => ({
        name: ing.name,
        value: ing.currentStock * (ing.costPerUnit || 0),
        stock: ing.currentStock,
        unit: ing.unit,
        costPerUnit: ing.costPerUnit || 0
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return {
      totalInventoryValue,
      lowStockItems,
      ingredientsByValue,
      totalIngredients: ingredients.length
    };
  }, [ingredients]);

  // Profitability analysis: Calculate production cost vs sale price
  const profitabilityAnalysis = useMemo(() => {
    if (!productIngredients.length || !ingredients.length || !filteredOrders.length || !products.length) {
      console.log('⚠️ Profitability analysis skipped:', {
        productIngredients: productIngredients.length,
        ingredients: ingredients.length,
        filteredOrders: filteredOrders.length,
        products: products.length
      });
      return [];
    }

    console.log('📊 Starting profitability analysis...');
    console.log('Product ingredients:', productIngredients);
    console.log('Ingredients:', ingredients);
    console.log('Products:', products);

    // Create a map of product names to their IDs (for reverse lookup)
    const productNameToIdMap = new Map<string, string>();
    products.forEach(product => {
      if (product.name && product.id) {
        productNameToIdMap.set(product.name, product.id);
      }
    });

    console.log('Product name to ID map:', Array.from(productNameToIdMap.entries()));

    // Create a map of product names AND IDs to their recipes
    const recipeMapByName = new Map<string, ProductIngredient[]>();
    const recipeMapById = new Map<string, ProductIngredient[]>();

    productIngredients.forEach(pi => {
      // Map by product name
      if (pi.productName) {
        const existingByName = recipeMapByName.get(pi.productName) || [];
        existingByName.push(pi);
        recipeMapByName.set(pi.productName, existingByName);
      }

      // Map by product ID
      if (pi.productId) {
        const existingById = recipeMapById.get(pi.productId) || [];
        existingById.push(pi);
        recipeMapById.set(pi.productId, existingById);
      }
    });

    console.log('Recipe maps created:', {
      byName: Array.from(recipeMapByName.keys()),
      byId: Array.from(recipeMapById.keys())
    });

    // Create an ingredient map for quick lookup (by name and ID)
    const ingredientMapByName = new Map(ingredients.map(ing => [ing.name, ing]));
    const ingredientMapById = new Map(ingredients.map(ing => [ing.id, ing]));

    // Calculate profitability for each product sold
    const profitMap = new Map<string, {
      totalRevenue: number;
      totalCost: number;
      unitsSold: number;
      avgPrice: number;
      productId?: string;
    }>();

    filteredOrders.forEach(order => {
      order.products?.forEach(product => {
        // Try to find product ID from name if not already set
        let productId = product.id;
        if (!productId && product.name) {
          productId = productNameToIdMap.get(product.name);
          if (productId) {
            console.log(`✓ Found product ID for "${product.name}": ${productId}`);
          }
        }

        // Try to find recipe by product ID first, then by name
        let recipe = productId ? recipeMapById.get(productId) : undefined;
        if (!recipe) {
          recipe = recipeMapByName.get(product.name);
        }

        let productionCost = 0;

        if (recipe && recipe.length > 0) {
          console.log(`📦 Calculating cost for ${product.name} (ID: ${productId}):`, recipe);

          // Calculate cost based on recipe
          recipe.forEach(recipeItem => {
            // Try to find ingredient by name first, then by ID
            let ing = ingredientMapByName.get(recipeItem.ingredientName);
            if (!ing && recipeItem.ingredientId) {
              ing = ingredientMapById.get(recipeItem.ingredientId);
            }

            if (ing && ing.costPerUnit) {
              const itemCost = recipeItem.quantity * ing.costPerUnit;
              productionCost += itemCost;
              console.log(`  - ${recipeItem.ingredientName}: ${recipeItem.quantity} x $${ing.costPerUnit} = $${itemCost}`);
            } else {
              console.warn(`  ⚠️ Ingredient not found or no cost: ${recipeItem.ingredientName}`);
            }
          });

          console.log(`  ✓ Total production cost per unit: $${productionCost}`);
        } else {
          // Product doesn't have a recipe configured yet - this is normal for new products
          console.log(`ℹ️ No recipe configured for product: ${product.name} (ID: ${productId}) - Using price as revenue only`);
        }

        const current = profitMap.get(product.name) || {
          totalRevenue: 0,
          totalCost: 0,
          unitsSold: 0,
          avgPrice: 0,
          productId: productId
        };

        current.totalRevenue += product.price * product.quantity;
        current.totalCost += productionCost * product.quantity;
        current.unitsSold += product.quantity;
        current.avgPrice = product.price;

        profitMap.set(product.name, current);
      });
    });

    const result = Array.from(profitMap.entries())
      .map(([name, data]) => ({
        name,
        revenue: data.totalRevenue,
        cost: data.totalCost,
        profit: data.totalRevenue - data.totalCost,
        margin: data.totalRevenue > 0 ? ((data.totalRevenue - data.totalCost) / data.totalRevenue) * 100 : 0,
        unitsSold: data.unitsSold,
        avgPrice: data.avgPrice,
        costPerUnit: data.unitsSold > 0 ? data.totalCost / data.unitsSold : 0
      }))
      .sort((a, b) => b.profit - a.profit);

    console.log('📊 Profitability analysis results:', result);
    return result;
  }, [productIngredients, ingredients, filteredOrders, products]);

  // Production orders trend
  const productionTrend = useMemo(() => {
    if (!productionOrders.length) return [];

    const trendMap = new Map<string, { ordenes: number; terminadas: number }>();

    // Initialize all days in range
    for (let i = 0; i < dateRangeInDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (dateRangeInDays - 1 - i));
      const dateStr = date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
      trendMap.set(dateStr, { ordenes: 0, terminadas: 0 });
    }

    // Fill with production order data
    productionOrders.forEach(order => {
      const orderDate = new Date(order.createdAt);
      if (orderDate >= startDate) {
        const dateStr = orderDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
        const current = trendMap.get(dateStr);
        if (current) {
          current.ordenes += 1;
          if (order.status === 'TERMINADA') {
            current.terminadas += 1;
          }
        }
      }
    });

    return Array.from(trendMap.entries()).map(([date, stats]) => ({
      date,
      ordenes: stats.ordenes,
      terminadas: stats.terminadas
    }));
  }, [productionOrders, dateRangeInDays, startDate]);

  // Export data as Excel
  const handleExport = async () => {
    try {
      // Import the xlsx library dynamically
      const XLSX = await import('xlsx');

      // 1. Sheet: Resumen General
      const resumenData = [
        ['Resumen de Gestión', ''],
        ['Periodo', timeRange === 'custom' && dateRange?.from && dateRange?.to
          ? `${dateRange.from.toLocaleDateString('es-CL')} - ${dateRange.to.toLocaleDateString('es-CL')}`
          : `Últimos ${dateRangeInDays} días`],
        ['Fecha Generación', new Date().toLocaleDateString('es-CL')],
        ['', ''],
        ['Métricas Clave', 'Valor'],
        ['Ingresos Totales', allProductStats.reduce((sum, p) => sum + p.ingresos, 0)],
        ['Pedidos Totales', kpis.totalOrders],
        ['Pedidos Completados', kpis.completedOrders],
        ['Tasa de Éxito', `${kpis.successRate.toFixed(1)}%`],
      ];

      // Add Profitability if available
      if ((user.role === 'admin' || user.role === 'production') && profitabilityAnalysis.length > 0) {
        const totalProfit = profitabilityAnalysis.reduce((sum, p) => sum + p.profit, 0);
        const totalIngresos = allProductStats.reduce((sum, p) => sum + p.ingresos, 0);
        const margin = totalIngresos > 0 ? (totalProfit / totalIngresos) * 100 : 0;

        resumenData.push(
          ['Utilidad Estimada', totalProfit],
          ['Margen Global Estimado', `${margin.toFixed(1)}%`]
        );
      }

      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);

      // 2. Sheet: Detalle Ventas
      const ventasData = filteredOrders.map(order => {
        const createDate = new Date(order.createdAt || order.date || order.deadline || new Date());
        const deadlineDate = order.deadline ? new Date(`${order.deadline}T12:00:00`) : createDate;

        return {
          'Fecha Creación': createDate.toLocaleDateString('es-CL'),
          'Hora Creación': createDate.toLocaleTimeString('es-CL'),
          'Fecha Entrega (Deadline)': deadlineDate.toLocaleDateString('es-CL'),
          'ID Pedido': order.id.slice(0, 8),
          'Cliente/Local': order.customerName || 'N/A',
          'Estado': order.status === 'pending' ? 'Pendiente' :
            order.status === 'in_progress' ? 'En Preparación' :
              order.status === 'completed' ? 'Completado' : 'Despachado',
          'Total ($)': order.total || 0,
          'Productos': order.products?.map(p => `${p.name} (x${p.quantity})`).join('; ') || '',
          'Notas': order.notes || ''
        };
      });
      const wsVentas = XLSX.utils.json_to_sheet(ventasData);

      // 3. Sheet: Productos (Aggregated, All products)
      const productosData = allProductStats.map(p => {
        const prof = profitabilityAnalysis.find(x => x.name === p.name);

        const rowData: any = {
          'Producto': p.name,
          'Unidades Vendidas': p.cantidad,
          'Ventas Totales (N° de Pedidos)': p.ventasTotales || 0,
          'Ingresos Totales': p.ingresos,
        };

        if (prof) {
          rowData['Precio Promedio'] = prof.avgPrice;
          rowData['Costo Unitario (Est.)'] = prof.costPerUnit;
          rowData['Costo Total (Est.)'] = prof.cost;
          rowData['Utilidad (Est.)'] = prof.profit;
          rowData['Margen (%)'] = `${prof.margin.toFixed(1)}%`;
        }

        return rowData;
      });

      const wsProductos = XLSX.utils.json_to_sheet(productosData);

      // 4. Sheet: Por Local (Matrix)
      // Group products by Local
      const localProductsMap = new Map<string, Map<string, number>>();
      const allProductNames = new Set<string>();

      filteredOrders.forEach(order => {
        const localName = order.customerName || 'Desconocido';
        if (!localProductsMap.has(localName)) {
          localProductsMap.set(localName, new Map());
        }
        const productMap = localProductsMap.get(localName)!;

        order.products?.forEach(p => {
          productMap.set(p.name, (productMap.get(p.name) || 0) + p.quantity);
          allProductNames.add(p.name);
        });
      });

      const sortedProductNames = Array.from(allProductNames).sort();
      const sortedLocalNames = Array.from(localProductsMap.keys()).sort();

      const matrizLocales = [];

      // Header row
      matrizLocales.push(['Producto', ...sortedLocalNames, 'Total Unidades']);

      // Data rows (Products)
      let totalGlobalUnits = 0;

      sortedProductNames.forEach(pName => {
        const row: any[] = [pName];
        let totalUnitsProduct = 0;

        sortedLocalNames.forEach(localName => {
          const productMap = localProductsMap.get(localName);
          const qty = productMap?.get(pName) || 0;
          row.push(qty > 0 ? qty : '');
          totalUnitsProduct += qty;
        });

        row.push(totalUnitsProduct);
        totalGlobalUnits += totalUnitsProduct;
        matrizLocales.push(row);
      });

      // Totals rows at the bottom
      const totalUnitsRow: any[] = ['Total Unidades'];
      const gastoTotalRow: any[] = ['Gasto Total'];
      let gastoGlobal = 0;

      sortedLocalNames.forEach(localName => {
        // Calculate units
        let localUnits = 0;
        const productMap = localProductsMap.get(localName);
        if (productMap) {
          productMap.forEach(qty => localUnits += qty);
        }
        totalUnitsRow.push(localUnits);

        // Calculate total spent
        const localOrders = filteredOrders.filter(o => (o.customerName || 'Desconocido') === localName);
        const totalSpent = localOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        gastoTotalRow.push(totalSpent);
        gastoGlobal += totalSpent;
      });

      totalUnitsRow.push(totalGlobalUnits);
      gastoTotalRow.push(gastoGlobal);

      matrizLocales.push([]); // Empty row
      matrizLocales.push(totalUnitsRow);
      matrizLocales.push(gastoTotalRow);

      const wsLocales = XLSX.utils.aoa_to_sheet(matrizLocales);

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen');
      XLSX.utils.book_append_sheet(workbook, wsVentas, 'Detalle Ventas');
      XLSX.utils.book_append_sheet(workbook, wsProductos, 'Productos');
      XLSX.utils.book_append_sheet(workbook, wsLocales, 'Por Local');

      // File name with date range
      const rangeStr = timeRange === 'custom' && dateRange?.from
        ? (dateRange.to
          ? `${format(dateRange.from, 'dd-MM-yyyy')}_al_${format(dateRange.to, 'dd-MM-yyyy')}`
          : format(dateRange.from, 'dd-MM-yyyy'))
        : `ultimos_${dateRangeInDays}_dias`;

      const fileName = `Reporte_ConectOca_${rangeStr}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success('Reporte Excel generado exitosamente');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Error al exportar datos');
    }
  };

  // Exportar formato Google Drive (XLSX completo)
  const handleExportDrive = async () => {
    try {
      // Import the xlsx library dynamically
      const XLSX = await import('xlsx');

      // 1. Sheet: Resumen General
      const resumenData = [
        ['Resumen de Gestión', ''],
        ['Periodo', timeRange === 'custom' && dateRange?.from && dateRange?.to
          ? `${dateRange.from.toLocaleDateString('es-CL')} - ${dateRange.to.toLocaleDateString('es-CL')}`
          : `Últimos ${dateRangeInDays} días`],
        ['Fecha Generación', new Date().toLocaleDateString('es-CL')],
        ['', ''],
        ['Métricas Clave', 'Valor'],
        ['Ingresos Totales', allProductStats.reduce((sum, p) => sum + p.ingresos, 0)],
        ['Pedidos Totales', kpis.totalOrders],
        ['Pedidos Completados', kpis.completedOrders],
        ['Tasa de Éxito', `${kpis.successRate.toFixed(1)}%`],
      ];

      if ((user.role === 'admin' || user.role === 'production') && profitabilityAnalysis.length > 0) {
        const totalProfit = profitabilityAnalysis.reduce((sum, p) => sum + p.profit, 0);
        const totalIngresos = allProductStats.reduce((sum, p) => sum + p.ingresos, 0);
        const margin = totalIngresos > 0 ? (totalProfit / totalIngresos) * 100 : 0;
        resumenData.push(
          ['Utilidad Estimada', totalProfit],
          ['Margen Global Estimado', `${margin.toFixed(1)}%`]
        );
      }
      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);

      // 2. Sheet: Detalle Ventas (Con fecha de entrega vs creación para aclarar filtrado)
      const ventasData = filteredOrders.map(order => {
        const createDate = new Date(order.createdAt || order.date || order.deadline || new Date());
        const deadlineDate = order.deadline ? new Date(`${order.deadline}T12:00:00`) : createDate;

        return {
          'Fecha Creación': createDate.toLocaleDateString('es-CL'),
          'Hora Creación': createDate.toLocaleTimeString('es-CL'),
          'Fecha Entrega (Deadline)': deadlineDate.toLocaleDateString('es-CL'),
          'ID Pedido': order.id.slice(0, 8),
          'Cliente/Local': order.customerName || 'N/A',
          'Estado': order.status === 'pending' ? 'Pendiente' :
            order.status === 'in_progress' ? 'En Preparación' :
              order.status === 'completed' ? 'Completado' : 'Despachado',
          'Total ($)': order.total || 0,
          'Productos': order.products?.map(p => `${p.name} (x${p.quantity})`).join('; ') || '',
          'Notas': order.notes || ''
        };
      });
      const wsVentas = XLSX.utils.json_to_sheet(ventasData);

      // 3. Sheet: Productos
      const productosData = allProductStats.map(p => {
        const prof = profitabilityAnalysis.find(x => x.name === p.name);
        const rowData: any = {
          'Producto': p.name,
          'Unidades Vendidas': p.cantidad,
          'Ventas Totales (N° de Pedidos)': p.ventasTotales || 0,
          'Ingresos Totales': p.ingresos,
        };
        if (prof) {
          rowData['Precio Promedio'] = prof.avgPrice;
          rowData['Costo Unitario (Est.)'] = prof.costPerUnit;
          rowData['Costo Total (Est.)'] = prof.cost;
          rowData['Utilidad (Est.)'] = prof.profit;
          rowData['Margen (%)'] = `${prof.margin.toFixed(1)}%`;
        }
        return rowData;
      });
      const wsProductos = XLSX.utils.json_to_sheet(productosData);

      // 4. Sheet: Por Local (Matrix)
      const localProductsMap = new Map<string, Map<string, number>>();
      const allProductNames = new Set<string>();

      filteredOrders.forEach(order => {
        const localName = order.customerName || 'Desconocido';
        if (!localProductsMap.has(localName)) {
          localProductsMap.set(localName, new Map());
        }
        const productMap = localProductsMap.get(localName)!;

        order.products?.forEach(p => {
          productMap.set(p.name, (productMap.get(p.name) || 0) + p.quantity);
          allProductNames.add(p.name);
        });
      });

      const sortedProductNames = Array.from(allProductNames).sort();
      const sortedLocalNames = Array.from(localProductsMap.keys()).sort();

      const matrizLocales = [];
      matrizLocales.push(['Producto', ...sortedLocalNames, 'Total Unidades']);

      let totalGlobalUnits = 0;
      sortedProductNames.forEach(pName => {
        const row: any[] = [pName];
        let totalUnitsProduct = 0;

        sortedLocalNames.forEach(localName => {
          const productMap = localProductsMap.get(localName);
          const qty = productMap?.get(pName) || 0;
          row.push(qty > 0 ? qty : '');
          totalUnitsProduct += qty;
        });

        row.push(totalUnitsProduct);
        totalGlobalUnits += totalUnitsProduct;
        matrizLocales.push(row);
      });

      const totalUnitsRow: any[] = ['Total Unidades'];
      const gastoTotalRow: any[] = ['Gasto Total'];
      let gastoGlobal = 0;

      sortedLocalNames.forEach(localName => {
        let localUnits = 0;
        const productMap = localProductsMap.get(localName);
        if (productMap) {
          productMap.forEach(qty => localUnits += qty);
        }
        totalUnitsRow.push(localUnits);

        const localOrders = filteredOrders.filter(o => (o.customerName || 'Desconocido') === localName);
        const totalSpent = localOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        gastoTotalRow.push(totalSpent);
        gastoGlobal += totalSpent;
      });

      totalUnitsRow.push(totalGlobalUnits);
      gastoTotalRow.push(gastoGlobal);

      matrizLocales.push([]);
      matrizLocales.push(totalUnitsRow);
      matrizLocales.push(gastoTotalRow);

      const wsLocales = XLSX.utils.aoa_to_sheet(matrizLocales);

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen');
      XLSX.utils.book_append_sheet(workbook, wsVentas, 'Detalle Ventas');
      XLSX.utils.book_append_sheet(workbook, wsProductos, 'Productos');
      XLSX.utils.book_append_sheet(workbook, wsLocales, 'Por Local');

      // File name with date range
      const rangeStr = timeRange === 'custom' && dateRange?.from
        ? (dateRange.to
          ? `${format(dateRange.from, 'dd-MM-yyyy')}_al_${format(dateRange.to, 'dd-MM-yyyy')}`
          : format(dateRange.from, 'dd-MM-yyyy'))
        : `ultimos_${dateRangeInDays}_dias`;

      const fileName = `GoogleDrive_ConectOca_${rangeStr}.xlsx`;

      XLSX.writeFile(workbook, fileName);

      toast.success('Reporte compatible con Google Drive generado');
    } catch (error) {
      console.error('Error exporting data for Google Drive:', error);
      toast.error('Error al exportar datos para Google Drive');
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-6">
            <motion.button
              onClick={onBack}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>

            <div className="flex items-center gap-3">
              <motion.div
                className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
                whileHover={{ rotate: [0, -10, 10, -10, 0], transition: { duration: 0.5 } }}
              >
                <Factory className="w-6 h-6 text-white" />
              </motion.div>
              <div>
                <span className="tracking-wider">CONECTOCA</span>
                <p className="text-xs text-blue-200 opacity-80">Gestión de Pedidos La Oca</p>
              </div>
            </div>

            <div className="flex gap-2">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={handleExportDrive}
                  variant="outline"
                  size="sm"
                  className="bg-emerald-600 border-emerald-500 hover:bg-emerald-700 text-white lg:mr-2"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Google Drive
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={handleExport}
                  variant="outline"
                  size="sm"
                  className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Excel
                </Button>
              </motion.div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl mb-2">📊 Dashboard de Analíticas</h1>
              {(user.role === 'admin' || user.role === 'production') && (
                <Badge
                  className="mb-2 border px-2.5 py-1"
                  style={{
                    background: 'linear-gradient(90deg, #FFD43B 0%, #FFC700 100%)',
                    color: '#0047BA',
                    fontSize: '11px',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(255, 212, 59, 0.3)'
                  }}
                >
                  🌐 VISTA GLOBAL
                </Badge>
              )}
            </div>
            <p className="text-blue-100 text-sm">
              {(user.role === 'admin' || user.role === 'production')
                ? 'Métricas de rendimiento de todos los usuarios'
                : 'Insights y métricas de rendimiento de CONECTOCA'}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Time Range Selector */}
        <div className="flex items-center gap-3 justify-between flex-wrap">
          <div className="flex gap-2">
            {/* Standard Ranges */}
            {(['7d', '30d', '90d'] as const).map((range) => (
              <Button
                key={range}
                onClick={() => setTimeRange(range)}
                variant={timeRange === range ? 'default' : 'outline'}
                size="sm"
                className={timeRange === range ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                {range === '7d' && 'Últimos 7 días'}
                {range === '30d' && 'Últimos 30 días'}
                {range === '90d' && 'Últimos 90 días'}
              </Button>
            ))}

            {/* Custom Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={timeRange === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('custom')}
                  className={timeRange === 'custom' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/yyyy")} -{" "}
                        {format(dateRange.to, "dd/MM/yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy")
                    )
                  ) : (
                    <span>Personalizado</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          <Badge variant="outline" className="text-sm">
            <CalendarIcon className="w-4 h-4 mr-2" />
            {filteredOrders.length} pedidos en este período
          </Badge>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Revenue */}
          <Card className="border-l-4 border-l-green-500 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <DollarSign className="w-4 h-4" />
                Ingresos Totales
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl text-green-600">
                ${kpis.totalRevenue.toLocaleString('es-CL')}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                De {kpis.totalOrders} pedidos
              </p>
            </CardContent>
          </Card>

          {/* Completed Orders */}
          <Card className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <CheckCircle2 className="w-4 h-4" />
                Pedidos Completados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl text-blue-600">
                {kpis.completedOrders}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Tasa de éxito: {kpis.successRate.toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          {/* Total Orders */}
          <Card className="border-l-4 border-l-yellow-500 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <Package className="w-4 h-4" />
                Total de Pedidos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl text-yellow-600">
                {kpis.totalOrders}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                En los últimos {dateRangeInDays} días
              </p>
            </CardContent>
          </Card>

          {/* Avg Production Time */}
          <Card className="border-l-4 border-l-purple-500 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <Clock className="w-4 h-4" />
                Tiempo Promedio
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl text-purple-600">
                {kpis.avgProductionTime}h
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Por pedido completado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
            <TabsTrigger value="overview" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Productos
            </TabsTrigger>
            <TabsTrigger value="status" className="gap-2">
              <PieChart className="w-4 h-4" />
              Estados
            </TabsTrigger>
            <TabsTrigger value="revenue" className="gap-2">
              <DollarSign className="w-4 h-4" />
              Ingresos
            </TabsTrigger>
            {user.role === 'admin' && (
              <TabsTrigger value="costs" className="gap-2">
                <Factory className="w-4 h-4" />
                Costos
              </TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  Pedidos por Día
                </CardTitle>
                <CardDescription>
                  Visualización de pedidos en los últimos {dateRangeInDays} días
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="pedidos"
                      stroke={COLORS.primary}
                      strokeWidth={3}
                      dot={{ fill: COLORS.primary, r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Pedidos"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-yellow-600" />
                  Productos Más Vendidos
                </CardTitle>
                <CardDescription>
                  Top 10 productos por cantidad vendida
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={topProductStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" stroke="#6b7280" style={{ fontSize: '12px' }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      stroke="#6b7280"
                      style={{ fontSize: '11px' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                      formatter={(value, name) => {
                        if (name === 'cantidad') return [value, 'Cantidad'];
                        if (name === 'ingresos') return [`$${value.toLocaleString('es-CL')}`, 'Ingresos'];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="cantidad" fill={COLORS.secondary} name="Cantidad" />
                    <Bar dataKey="ingresos" fill={COLORS.primary} name="Ingresos ($)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Status Tab */}
          <TabsContent value="status" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-green-600" />
                  Distribución por Estado
                </CardTitle>
                <CardDescription>
                  Porcentaje de pedidos por estado actual
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RePieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                  </RePieChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="grid grid-cols-2 gap-3 mt-6">
                  {statusDistribution.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-gray-600">
                        {item.name}: {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Revenue Tab */}
          <TabsContent value="revenue" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  Ingresos Diarios
                </CardTitle>
                <CardDescription>
                  Evolución de ingresos en el período seleccionado
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyStats}>
                    <defs>
                      <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={COLORS.success} stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                      formatter={(value) => [`$${value.toLocaleString('es-CL')}`, 'Ingresos']}
                    />
                    <Area
                      type="monotone"
                      dataKey="ingresos"
                      stroke={COLORS.success}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorIngresos)"
                      name="Ingresos"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Costs Tab */}
          <TabsContent value="costs" className="space-y-6">
            {/* KPIs de Costos */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="border-l-4 border-l-green-500 shadow-md">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2 text-gray-600">
                    <Warehouse className="w-4 h-4" />
                    Valor Inventario
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl text-green-600">
                    ${productionCosts?.totalInventoryValue.toLocaleString('es-CL') || 0}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {productionCosts?.totalIngredients || 0} ingredientes
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-red-500 shadow-md">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2 text-gray-600">
                    <AlertTriangle className="w-4 h-4" />
                    Stock Bajo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl text-red-600">
                    {productionCosts?.lowStockItems.length || 0}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Requieren atención
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500 shadow-md">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2 text-gray-600">
                    <Factory className="w-4 h-4" />
                    Órdenes Producción
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl text-blue-600">
                    {productionOrders.length}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Total registradas
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500 shadow-md">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2 text-gray-600">
                    <TrendingUp className="w-4 h-4" />
                    Margen Promedio
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl text-purple-600">
                    {profitabilityAnalysis.length > 0
                      ? (profitabilityAnalysis.reduce((sum, p) => sum + p.margin, 0) / profitabilityAnalysis.length).toFixed(1)
                      : 0}%
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    De {profitabilityAnalysis.length} productos
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Valor de Inventario por Ingrediente */}
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Warehouse className="w-5 h-5 text-blue-600" />
                  Top 10 Ingredientes por Valor de Inventario
                </CardTitle>
                <CardDescription>
                  Materias primas con mayor valor monetario en stock
                </CardDescription>
              </CardHeader>
              <CardContent>
                {productionCosts?.ingredientsByValue && productionCosts.ingredientsByValue.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={productionCosts.ingredientsByValue} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" stroke="#6b7280" style={{ fontSize: '12px' }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        stroke="#6b7280"
                        style={{ fontSize: '11px' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                        formatter={(value: any, name: string) => {
                          if (name === 'value') return [`$${value.toLocaleString('es-CL')}`, 'Valor'];
                          return [value, name];
                        }}
                      />
                      <Legend />
                      <Bar dataKey="value" fill="#8B5CF6" name="Valor ($)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    <div className="text-center">
                      <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No hay datos de inventario disponibles</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Análisis de Rentabilidad */}
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Análisis de Rentabilidad por Producto
                </CardTitle>
                <CardDescription>
                  Comparación de ingresos vs costos de producción
                </CardDescription>
              </CardHeader>
              <CardContent>
                {profitabilityAnalysis && profitabilityAnalysis.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={profitabilityAnalysis.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="name"
                          angle={-45}
                          textAnchor="end"
                          height={100}
                          stroke="#6b7280"
                          style={{ fontSize: '10px' }}
                        />
                        <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                          }}
                          formatter={(value: any) => `$${value.toLocaleString('es-CL')}`}
                        />
                        <Legend />
                        <Bar dataKey="revenue" fill="#22c55e" name="Ingresos" />
                        <Bar dataKey="cost" fill="#ef4444" name="Costo" />
                        <Bar dataKey="profit" fill="#3b82f6" name="Utilidad" />
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Tabla detallada */}
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-gray-200 bg-gray-50">
                            <th className="text-left p-3">Producto</th>
                            <th className="text-right p-3">Unidades</th>
                            <th className="text-right p-3">Costo Unit.</th>
                            <th className="text-right p-3">Precio Venta</th>
                            <th className="text-right p-3">Ingresos</th>
                            <th className="text-right p-3">Costos</th>
                            <th className="text-right p-3">Utilidad</th>
                            <th className="text-right p-3">Margen %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitabilityAnalysis.slice(0, 10).map((item, index) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="p-3">{item.name}</td>
                              <td className="text-right p-3">{item.unitsSold}</td>
                              <td className="text-right p-3">${item.costPerUnit.toFixed(0)}</td>
                              <td className="text-right p-3">${item.avgPrice.toLocaleString('es-CL')}</td>
                              <td className="text-right p-3 text-green-600">
                                ${item.revenue.toLocaleString('es-CL')}
                              </td>
                              <td className="text-right p-3 text-red-600">
                                ${item.cost.toLocaleString('es-CL')}
                              </td>
                              <td className="text-right p-3 text-blue-600">
                                ${item.profit.toLocaleString('es-CL')}
                              </td>
                              <td className="text-right p-3">
                                <Badge
                                  className={item.margin > 50 ? 'bg-green-500' : item.margin > 30 ? 'bg-yellow-500' : 'bg-red-500'}
                                  style={{ fontSize: '10px' }}
                                >
                                  {item.margin.toFixed(1)}%
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    <div className="text-center">
                      <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No hay datos suficientes para análisis de rentabilidad</p>
                      <p className="text-xs mt-1">Configure recetas de productos para ver este análisis</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tendencia de Órdenes de Producción */}
            {productionTrend.length > 0 && (
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Factory className="w-5 h-5 text-orange-600" />
                    Tendencia de Órdenes de Producción
                  </CardTitle>
                  <CardDescription>
                    Evolución de órdenes creadas y terminadas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={productionTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="ordenes"
                        stroke="#fb923c"
                        strokeWidth={3}
                        dot={{ fill: '#fb923c', r: 4 }}
                        name="Órdenes Creadas"
                      />
                      <Line
                        type="monotone"
                        dataKey="terminadas"
                        stroke="#22c55e"
                        strokeWidth={3}
                        dot={{ fill: '#22c55e', r: 4 }}
                        name="Órdenes Terminadas"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Alertas de Stock Bajo */}
            {productionCosts && productionCosts.lowStockItems.length > 0 && (
              <Card className="shadow-md border-l-4 border-l-red-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="w-5 h-5" />
                    ⚠️ Alertas de Stock Bajo
                  </CardTitle>
                  <CardDescription>
                    Ingredientes que requieren reposición urgente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {productionCosts.lowStockItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            <span className="text-sm">{item.name}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            Stock actual: {item.currentStock} {item.unit} | Mínimo: {item.minStock} {item.unit}
                          </div>
                        </div>
                        <Badge className="bg-red-500 text-white">
                          URGENTE
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ticket Promedio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl text-blue-600">
                ${kpis.totalOrders > 0
                  ? Math.round(kpis.totalRevenue / kpis.totalOrders).toLocaleString('es-CL')
                  : 0
                }
              </div>
              <p className="text-xs text-gray-500 mt-1">Por pedido</p>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pedidos por Día</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl text-yellow-600">
                {(kpis.totalOrders / dateRangeInDays).toFixed(1)}
              </div>
              <p className="text-xs text-gray-500 mt-1">Promedio diario</p>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Productos Únicos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl text-green-600">
                {allProductStats.length}
              </div>
              <p className="text-xs text-gray-500 mt-1">Diferentes productos vendidos</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}