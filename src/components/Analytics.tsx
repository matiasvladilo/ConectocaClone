import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import {
  ArrowLeft,
  Share,
  Calendar as CalendarIcon,
  AlertTriangle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import type { User, Order } from '../App';
import { ingredientsAPI, productIngredientsAPI, ordersAPI, type Ingredient, type ProductIngredient } from '../utils/api';
import { projectId } from '../utils/supabase/info';
import { productsAPI, categoriesAPI, type Product, type Category } from '../utils/api';
import { indexarCategorias, construirMatrizPorLocal, construirDetalleVentas } from '../utils/reporteAnaliticas';
import { createClient } from '../utils/supabase/client';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { exportarLibroExcel } from "../utils/descargarArchivo";
import { formatCLP } from '../utils/format';

/**
 * Analíticas (admin y producción). Estilo iOS como el resto de las pantallas
 * rediseñadas: encabezado azul compacto, control segmentado para el período,
 * cifra principal grande, mosaicos y listas agrupadas en vez de tarjetas con
 * borde de color y gráficos de torta.
 *
 * Nota: Tailwind está precompilado (src/index.css); el estilo va inline.
 */

interface AnalyticsProps {
  user: User;
  orders: Order[];
  onBack: () => void;
  accessToken?: string;
}

interface ProductStats {
  name: string;
  cantidad: number;
  ingresos: number;
  ventasTotales?: number;
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

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  terciario: 'rgba(60, 60, 67, 0.3)',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
  rojo: '#FF3B30',
  verde: '#34C759',
  naranja: '#FF9500',
};

// Colores de estado: los mismos de Historial y Detalle del pedido.
const ESTADOS = [
  { key: 'pending', label: 'Pendientes', color: '#FF9500' },
  { key: 'in_progress', label: 'En preparación', color: '#007AFF' },
  { key: 'completed', label: 'Listos', color: '#34C759' },
  { key: 'dispatched', label: 'Despachados', color: '#5856D6' },
  { key: 'delivered', label: 'Recibidos', color: '#30B0C7' },
  { key: 'cancelled', label: 'Cancelados', color: '#FF3B30' },
] as const;

// Pedidos por página al traer el período completo. PostgREST corta en 1000
// filas por consulta, así que no tiene sentido pedir más por página.
const PAGINA = 1000;

/** $1,2 M / $850 mil / $12.300: montos legibles en mosaicos y ejes. */
function montoCorto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `$${(n / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`;
  }
  if (abs >= 10_000) return `$${Math.round(n / 1000).toLocaleString('es-CL')} mil`;
  return formatCLP(n);
}

/** Marcas del eje Y en pasos "redondos" (1, 2, 2,5 o 5 × 10^k), ~4 tramos. */
function marcasEje(max: number): number[] {
  if (max <= 0) return [0, 1];
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot;
  const marcas: number[] = [];
  for (let v = 0; v < max + paso; v += paso) marcas.push(v);
  return marcas;
}

const numero = (n: number, decimales = 0) =>
  n.toLocaleString('es-CL', { maximumFractionDigits: decimales });

const claveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fechaDePedido = (order: Order): Date | null => {
  const s = (order as any).createdAt || order.date || (order.deadline ? `${order.deadline}T12:00:00` : null);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export function Analytics({ user, orders, onBack, accessToken }: AnalyticsProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState<'resumen' | 'productos' | 'estados' | 'costos'>('resumen');
  const [metricaDiaria, setMetricaDiaria] = useState<'ingresos' | 'pedidos'>('ingresos');
  const [ordenProductos, setOrdenProductos] = useState<'ingresos' | 'cantidad'>('ingresos');
  const [verTodosProductos, setVerTodosProductos] = useState(false);
  const [exportando, setExportando] = useState(false);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [productIngredients, setProductIngredients] = useState<ProductIngredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProduction, setLoadingProduction] = useState(false);
  const produccionPedida = useRef(false);

  // Arranca vacío: los ~50 pedidos que trae Inicio daban cifras parciales
  // ("50 pedidos") durante el primer segundo de carga.
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  // Hasta qué fecha hacia atrás están cargados los pedidos, y si ya no hay más.
  const [cargadoDesde, setCargadoDesde] = useState<Date | null>(null);
  const [sinMas, setSinMas] = useState(false);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);
  const [progreso, setProgreso] = useState<{ cargados: number; total: number } | null>(null);
  const paginaSiguiente = useRef(1);

  // Catálogo propio del export, independiente de loadProductionData: si la carga
  // de producción falla, la planilla igual sale categorizada.
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<Category[]>([]);
  // Señal explícita de si el catálogo cargó: sin esto, una carga que falla o que
  // todavía no resolvió es indistinguible de un catálogo vacío, y el export sale
  // sin agrupar por categoría sin ningún aviso (grave en el build nativo, donde
  // el usuario nunca ve el console.error).
  const [catalogoListo, setCatalogoListo] = useState(false);

  const puedeVerCostos = user.role === 'admin';

  // ── Período ──────────────────────────────────────────────────────────────
  const { startDate, endDate } = useMemo(() => {
    const fin = new Date();
    fin.setHours(23, 59, 59, 999);
    if (timeRange === 'custom' && dateRange?.from) {
      const ini = new Date(dateRange.from);
      ini.setHours(0, 0, 0, 0);
      const f = new Date(dateRange.to ?? dateRange.from);
      f.setHours(23, 59, 59, 999);
      return { startDate: ini, endDate: f };
    }
    const dias = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;
    const ini = new Date();
    ini.setHours(0, 0, 0, 0);
    ini.setDate(ini.getDate() - (dias - 1));
    return { startDate: ini, endDate: fin };
  }, [timeRange, dateRange]);

  const dateRangeInDays = useMemo(
    () => Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000)),
    [startDate, endDate],
  );

  const etiquetaPeriodo =
    timeRange === 'custom' && dateRange?.from
      ? dateRange.to && claveDia(dateRange.to) !== claveDia(dateRange.from)
        ? `${format(dateRange.from, 'd MMM', { locale: es })} – ${format(dateRange.to, 'd MMM yyyy', { locale: es })}`
        : format(dateRange.from, "d 'de' MMMM yyyy", { locale: es })
      : `Últimos ${dateRangeInDays} días`;

  // ── Pedidos: traer TODO el período ───────────────────────────────────────
  // Antes se pedía una sola página de 1000 y el resto quedaba fuera: con
  // 2.600 pedidos en 90 días, los ingresos salían a menos de la mitad. Ahora se
  // pagina (más recientes primero) hasta cubrir el inicio del período; si
  // después se elige un rango más antiguo, se siguen trayendo páginas.
  // Un solo cargador a la vez: el bucle relee `objetivo` en cada vuelta, así
  // que si el período cambia a mitad de la carga simplemente sigue (o para)
  // según el nuevo inicio, sin carreras entre dos cargas.
  const objetivo = useRef(startDate);
  objetivo.current = startDate;
  const acumulados = useRef<Order[]>([]);
  const masAntiguo = useRef<Date | null>(null);
  const hayMas = useRef(true);
  const corriendo = useRef(false);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  useEffect(() => {
    if (!accessToken || corriendo.current) return;
    if (!hayMas.current || (masAntiguo.current && masAntiguo.current <= objetivo.current)) return;

    corriendo.current = true;
    setCargandoPedidos(true);
    (async () => {
      try {
        while (hayMas.current && (!masAntiguo.current || masAntiguo.current > objetivo.current)) {
          const resp = await ordersAPI.getAll(accessToken, paginaSiguiente.current, PAGINA);
          if (!montado.current) return;
          const pagina = (resp?.data || []).map((order: any) => ({
            ...order,
            deadline: order.deadline ? order.deadline.slice(0, 10) : order.deadline,
          }));
          acumulados.current = acumulados.current.concat(pagina);
          paginaSiguiente.current += 1;
          hayMas.current = !!resp?.pagination?.hasNext && pagina.length > 0;
          const ultimo = pagina.length ? fechaDePedido(pagina[pagina.length - 1]) : null;
          if (ultimo) masAntiguo.current = ultimo;
          setProgreso({ cargados: acumulados.current.length, total: resp?.pagination?.total ?? acumulados.current.length });
          // Se publica cada página: las cifras se van completando a la vista.
          setAllOrders(acumulados.current);
          setCargadoDesde(masAntiguo.current);
        }
      } catch (error) {
        console.error('Error fetching orders for analytics:', error);
        if (montado.current) toast.error('No se pudieron cargar todos los pedidos');
        hayMas.current = false;
      } finally {
        corriendo.current = false;
        if (montado.current) {
          setSinMas(!hayMas.current);
          setCargandoPedidos(false);
        }
      }
    })();
  }, [accessToken, startDate]);

  // Catálogo para agrupar la planilla por categoría. Si falla, el export sigue
  // funcionando: indexarCategorias con listas vacías manda todo a "Sin categoría".
  useEffect(() => {
    const fetchCatalogo = async () => {
      if (!accessToken) return;
      try {
        const [productos, categorias] = await Promise.all([
          productsAPI.getAll(accessToken),
          categoriesAPI.getAll(accessToken),
        ]);
        setCatalogProducts(productos);
        setCatalogCategories(categorias);
        setCatalogoListo(true);
      } catch (error) {
        console.error('Error cargando catálogo para el reporte:', error);
        setCatalogoListo(false);
      }
    };
    fetchCatalogo();
  }, [accessToken]);

  const datosCompletos = sinMas || (!!cargadoDesde && cargadoDesde <= startDate);

  const filteredOrders = useMemo(() => {
    return allOrders
      .filter((order) => {
        const d = fechaDePedido(order);
        return !!d && d >= startDate && d <= endDate;
      })
      .map((order) => ({
        ...order,
        products: order.products?.map((product) => ({
          ...product,
          id: (product as any).id || product.productId || undefined,
        })),
      }));
  }, [allOrders, startDate, endDate]);

  const mapaCategorias = useMemo(
    () => indexarCategorias(catalogProducts, catalogCategories),
    [catalogProducts, catalogCategories]
  );

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    // Ingresos por precio×cantidad de cada ítem (no order.total, que en datos
    // viejos del KV store puede venir mal). Los cancelados no suman ingresos.
    const vigentes = filteredOrders.filter((o) => o.status !== 'cancelled');
    const totalRevenue = vigentes.reduce(
      (sum, order) => sum + (order.products?.reduce((s, p) => s + p.price * p.quantity, 0) || order.total || 0),
      0,
    );
    const totalOrders = filteredOrders.length;
    const cancelados = totalOrders - vigentes.length;
    // "Completado" = salió de producción. Antes contaba también los cancelados
    // como completados, inflando la tasa.
    const completedOrders = filteredOrders.filter(
      (o) => o.status === 'completed' || o.status === 'dispatched' || o.status === 'delivered',
    ).length;
    const successRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
    return {
      totalRevenue,
      totalOrders,
      vigentes: vigentes.length,
      cancelados,
      completedOrders,
      successRate,
      ticket: vigentes.length > 0 ? totalRevenue / vigentes.length : 0,
      porDia: totalOrders / dateRangeInDays,
    };
  }, [filteredOrders, dateRangeInDays]);

  // Serie diaria del período (incluye días sin pedidos, con 0).
  const dailyStats = useMemo(() => {
    const mapa = new Map<string, { label: string; pedidos: number; ingresos: number }>();
    const d = new Date(startDate);
    while (d <= endDate) {
      mapa.set(claveDia(d), {
        label: d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }),
        pedidos: 0,
        ingresos: 0,
      });
      d.setDate(d.getDate() + 1);
    }
    filteredOrders.forEach((order) => {
      const f = fechaDePedido(order);
      if (!f) return;
      const actual = mapa.get(claveDia(f));
      if (!actual) return;
      actual.pedidos += 1;
      if (order.status !== 'cancelled') {
        actual.ingresos += order.products?.reduce((s, p) => s + p.price * p.quantity, 0) || order.total || 0;
      }
    });
    return Array.from(mapa.values());
  }, [filteredOrders, startDate, endDate]);

  // ── Productos ────────────────────────────────────────────────────────────
  const allProductStats = useMemo((): ProductStats[] => {
    const statsMap = new Map<string, { cantidad: number; ingresos: number; pedidos: Set<string> }>();
    filteredOrders.forEach((order) => {
      if (order.status === 'cancelled') return;
      order.products?.forEach((product) => {
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
        ventasTotales: stats.pedidos.size,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [filteredOrders]);

  const productosOrdenados = useMemo(
    () => [...allProductStats].sort((a, b) => (ordenProductos === 'ingresos' ? b.ingresos - a.ingresos : b.cantidad - a.cantidad)),
    [allProductStats, ordenProductos],
  );

  // ── Estados ──────────────────────────────────────────────────────────────
  const statusDistribution = useMemo(() => {
    const conteo: Record<string, number> = {};
    filteredOrders.forEach((o) => { conteo[o.status] = (conteo[o.status] || 0) + 1; });
    return ESTADOS.map((e) => ({ ...e, value: conteo[e.key] || 0 }));
  }, [filteredOrders]);

  // ── Costos (solo admin, se cargan al abrir la pestaña) ───────────────────
  useEffect(() => {
    if (activeTab !== 'costos' || !puedeVerCostos || produccionPedida.current) return;
    produccionPedida.current = true;
    void loadProductionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, puedeVerCostos]);

  const loadProductionData = async () => {
    setLoadingProduction(true);
    try {
      // Token fresco de la sesión: esta carga puede ocurrir minutos después de
      // abrir la pantalla y el accessToken del prop puede haber vencido.
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        toast.error('No se pudo obtener una sesión válida. Vuelve a iniciar sesión.');
        return;
      }
      const token = session.access_token;

      const [ingredientsData, productsData, respOrdenes] = await Promise.all([
        ingredientsAPI.getAll(token),
        productsAPI.getAll(token),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-6d979413/production-orders`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
      ]);
      setIngredients(ingredientsData);
      setProducts(productsData);

      if (respOrdenes.ok) {
        const data = await respOrdenes.json();
        const ordersData = data.orders || data;
        setProductionOrders(Array.isArray(ordersData) ? ordersData : []);
      }

      // Recetas: una consulta por producto, en paralelo.
      const recetas = await Promise.all(
        productsData
          .filter((p) => p.id)
          .map((p) => productIngredientsAPI.getByProduct(token, p.id).catch(() => [] as ProductIngredient[])),
      );
      setProductIngredients(recetas.flat());
    } catch (error: any) {
      console.error('Error loading production data:', error);
      toast.error(error.message || 'Error al cargar datos de producción');
    } finally {
      setLoadingProduction(false);
    }
  };

  const productionCosts = useMemo(() => {
    if (!ingredients.length) return null;
    const totalInventoryValue = ingredients.reduce((sum, ing) => sum + ing.currentStock * (ing.costPerUnit || 0), 0);
    // Bajo el mínimo de verdad: con `<=` contaba todo lo que estaba justo en el
    // mínimo (86 de 90 materias primas) y la alerta dejaba de significar algo.
    const lowStockItems = ingredients
      .filter((ing) => ing.minStock > 0 && ing.currentStock < ing.minStock)
      .sort((a, b) => a.currentStock / a.minStock - b.currentStock / b.minStock);
    const ingredientsByValue = ingredients
      .map((ing) => ({
        name: ing.name,
        value: ing.currentStock * (ing.costPerUnit || 0),
        stock: ing.currentStock,
        unit: ing.unit,
      }))
      .filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    return { totalInventoryValue, lowStockItems, ingredientsByValue, totalIngredients: ingredients.length };
  }, [ingredients]);

  // Rentabilidad: costo de receta vs precio de venta, por producto vendido.
  const profitabilityAnalysis = useMemo(() => {
    if (!productIngredients.length || !ingredients.length || !filteredOrders.length || !products.length) return [];

    const idPorNombre = new Map<string, string>();
    products.forEach((p) => { if (p.name && p.id) idPorNombre.set(p.name, p.id); });

    const recetaPorNombre = new Map<string, ProductIngredient[]>();
    const recetaPorId = new Map<string, ProductIngredient[]>();
    productIngredients.forEach((pi) => {
      if (pi.productName) recetaPorNombre.set(pi.productName, [...(recetaPorNombre.get(pi.productName) || []), pi]);
      if (pi.productId) recetaPorId.set(pi.productId, [...(recetaPorId.get(pi.productId) || []), pi]);
    });

    const ingPorNombre = new Map(ingredients.map((ing) => [ing.name, ing]));
    const ingPorId = new Map(ingredients.map((ing) => [ing.id, ing]));

    // Costo unitario por producto (se calcula una vez, no por cada ítem vendido).
    const costoUnitario = new Map<string, number>();
    const costoDe = (nombre: string, id?: string) => {
      const clave = id || nombre;
      if (costoUnitario.has(clave)) return costoUnitario.get(clave)!;
      const receta = (id && recetaPorId.get(id)) || recetaPorNombre.get(nombre) || [];
      const costo = receta.reduce((s, item) => {
        const ing = (item.ingredientName && ingPorNombre.get(item.ingredientName)) || (item.ingredientId && ingPorId.get(item.ingredientId));
        return s + (ing && ing.costPerUnit ? item.quantity * ing.costPerUnit : 0);
      }, 0);
      costoUnitario.set(clave, costo);
      return costo;
    };

    const acumulado = new Map<string, { totalRevenue: number; totalCost: number; unitsSold: number; avgPrice: number }>();
    filteredOrders.forEach((order) => {
      if (order.status === 'cancelled') return;
      order.products?.forEach((product) => {
        const id = (product as any).id || idPorNombre.get(product.name);
        const costo = costoDe(product.name, id);
        const actual = acumulado.get(product.name) || { totalRevenue: 0, totalCost: 0, unitsSold: 0, avgPrice: 0 };
        actual.totalRevenue += product.price * product.quantity;
        actual.totalCost += costo * product.quantity;
        actual.unitsSold += product.quantity;
        actual.avgPrice = product.price;
        acumulado.set(product.name, actual);
      });
    });

    return Array.from(acumulado.entries())
      .map(([name, d]) => ({
        name,
        revenue: d.totalRevenue,
        cost: d.totalCost,
        profit: d.totalRevenue - d.totalCost,
        margin: d.totalRevenue > 0 ? ((d.totalRevenue - d.totalCost) / d.totalRevenue) * 100 : 0,
        unitsSold: d.unitsSold,
        avgPrice: d.avgPrice,
        costPerUnit: d.unitsSold > 0 ? d.totalCost / d.unitsSold : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [productIngredients, ingredients, filteredOrders, products]);

  // Solo productos con receta costeada: el resto tendría margen 100% ficticio.
  const conReceta = profitabilityAnalysis.filter((p) => p.cost > 0);
  const margenGlobal = (() => {
    const ing = conReceta.reduce((s, p) => s + p.revenue, 0);
    const util = conReceta.reduce((s, p) => s + p.profit, 0);
    return ing > 0 ? (util / ing) * 100 : null;
  })();

  const ordenesProduccionPeriodo = productionOrders.filter((o) => {
    const d = new Date(o.createdAt);
    return d >= startDate && d <= endDate;
  });

  // ── Exportar ─────────────────────────────────────────────────────────────
  // Antes había dos botones (Excel y "Google Drive") que generaban el mismo
  // libro con distinto nombre de archivo. Un .xlsx se abre igual en Drive.
  const handleExport = async () => {
    if (!datosCompletos) {
      toast.info('Espera a que terminen de cargar los pedidos del período');
      return;
    }
    setExportando(true);
    try {
      if (!catalogoListo) {
        toast.warning('No se pudo cargar el catálogo: la planilla sale sin agrupar por categoría');
      }
      const XLSX = await import('xlsx');

      const resumenData: (string | number)[][] = [
        ['Resumen de Gestión', ''],
        ['Periodo', etiquetaPeriodo],
        ['Fecha Generación', new Date().toLocaleDateString('es-CL')],
        ['', ''],
        ['Métricas Clave', 'Valor'],
        ['Ingresos Totales (sin cancelados)', kpis.totalRevenue],
        ['Pedidos Totales', kpis.totalOrders],
        ['Pedidos Completados', kpis.completedOrders],
        ['Pedidos Cancelados', kpis.cancelados],
        ['Ticket Promedio', Math.round(kpis.ticket)],
      ];
      if (puedeVerCostos && margenGlobal !== null) {
        resumenData.push(
          ['Utilidad Estimada (productos con receta)', conReceta.reduce((s, p) => s + p.profit, 0)],
          ['Margen Estimado (productos con receta)', `${margenGlobal.toFixed(1)}%`],
        );
      }
      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
      const wsVentas = XLSX.utils.json_to_sheet(construirDetalleVentas(filteredOrders, mapaCategorias));
      const productosData = allProductStats.map((p) => {
        const prof = profitabilityAnalysis.find((x) => x.name === p.name);
        const fila: Record<string, string | number> = {
          'Producto': p.name,
          'Unidades Vendidas': p.cantidad,
          'Ventas Totales (N° de Pedidos)': p.ventasTotales || 0,
          'Ingresos Totales': p.ingresos,
        };
        if (prof && prof.cost > 0) {
          fila['Precio Promedio'] = prof.avgPrice;
          fila['Costo Unitario (Est.)'] = prof.costPerUnit;
          fila['Costo Total (Est.)'] = prof.cost;
          fila['Utilidad (Est.)'] = prof.profit;
          fila['Margen (%)'] = `${prof.margin.toFixed(1)}%`;
        }
        return fila;
      });
      const wsProductos = XLSX.utils.json_to_sheet(productosData);
      const wsLocales = XLSX.utils.aoa_to_sheet(construirMatrizPorLocal(filteredOrders, mapaCategorias));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen');
      XLSX.utils.book_append_sheet(workbook, wsVentas, 'Detalle Ventas');
      XLSX.utils.book_append_sheet(workbook, wsProductos, 'Productos');
      XLSX.utils.book_append_sheet(workbook, wsLocales, 'Por Local');

      const rangeStr = `${format(startDate, 'dd-MM-yyyy')}_al_${format(endDate, 'dd-MM-yyyy')}`;
      await exportarLibroExcel(workbook, `Reporte_ConectOca_${rangeStr}.xlsx`);
      toast.success('Reporte generado');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Error al exportar datos');
    } finally {
      setExportando(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const pestañas: [typeof activeTab, string][] = [
    ['resumen', 'Resumen'],
    ['productos', 'Productos'],
    ['estados', 'Estados'],
    ...(puedeVerCostos ? ([['costos', 'Costos']] as [typeof activeTab, string][]) : []),
  ];

  const maxProducto = productosOrdenados[0]
    ? (ordenProductos === 'ingresos' ? productosOrdenados[0].ingresos : productosOrdenados[0].cantidad) || 1
    : 1;
  // Antes de la primera página no hay cifras: "—" en vez de un $0 que parece real.
  const sinDatos = allOrders.length === 0 && !datosCompletos;
  const v = (texto: string) => (sinDatos ? '—' : texto);
  const marcasDiarias = marcasEje(Math.max(0, ...dailyStats.map((d) => d[metricaDiaria])));
  const productosVisibles = verTodosProductos ? productosOrdenados : productosOrdenados.slice(0, 10);

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado compacto */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          paddingTop: 'max(env(safe-area-inset-top), 16px)',
        }}
      >
        <div className="max-w-3xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" style={botonRedondo}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
                Analíticas
              </h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                {etiquetaPeriodo}
              </p>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exportando}
              aria-label="Exportar a Excel"
              style={{ ...botonRedondo, opacity: exportando ? 0.6 : 1 }}
            >
              {exportando
                ? <Loader2 className="animate-spin" style={{ width: 18, height: 18, color: '#fff' }} />
                : <Share style={{ width: 18, height: 18, color: '#fff' }} />}
            </button>
          </div>

          {/* Período */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <div role="group" aria-label="Período" style={{ display: 'flex', flex: 1, padding: 2, borderRadius: 9, background: 'rgba(255,255,255,0.18)' }}>
              {([['7d', '7 días'], ['30d', '30 días'], ['90d', '90 días']] as const).map(([v, t]) => {
                const activo = timeRange === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setTimeRange(v)}
                    style={{
                      flex: 1, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
                      fontWeight: activo ? 600 : 500,
                      background: activo ? '#fff' : 'transparent',
                      color: activo ? '#0047BA' : '#fff',
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Elegir fechas"
                  aria-pressed={timeRange === 'custom'}
                  style={{
                    height: 34, padding: '0 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                    background: timeRange === 'custom' ? '#fff' : 'rgba(255,255,255,0.18)',
                    color: timeRange === 'custom' ? '#0047BA' : '#fff',
                  }}
                >
                  <CalendarIcon style={{ width: 15, height: 15 }} />
                  Fechas
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={(r) => { setDateRange(r); if (r?.from) setTimeRange('custom'); }}
                  numberOfMonths={1}
                  locale={es}
                  disabled={{ after: new Date() }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {/* Cargando más pedidos */}
        {!datosCompletos && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: IOS.secundario, margin: '0 4px 12px' }}>
            <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
            {progreso
              ? `Cargando pedidos… ${numero(progreso.cargados)} de ${numero(progreso.total)}`
              : 'Cargando pedidos…'}
          </div>
        )}

        {/* Cifra principal */}
        <div style={{ ...tarjeta, padding: '16px 16px 14px', marginBottom: 12, opacity: datosCompletos ? 1 : 0.55 }}>
          <p style={{ fontSize: 13, color: IOS.secundario }}>Ingresos</p>
          <p style={{ fontSize: 34, fontWeight: 700, color: IOS.texto, letterSpacing: -0.5, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
            {v(formatCLP(kpis.totalRevenue))}
          </p>
          <p style={{ fontSize: 13, color: IOS.secundario, marginTop: 2 }}>
            {sinDatos ? 'Cargando…' : `${numero(kpis.vigentes)} pedidos${kpis.cancelados > 0 ? ` · sin ${numero(kpis.cancelados)} cancelados` : ''}`}
          </p>
        </div>

        {/* Mosaicos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, opacity: datosCompletos ? 1 : 0.55 }}>
          <Mosaico titulo="Ticket promedio" valor={v(formatCLP(kpis.ticket))} />
          <Mosaico titulo="Pedidos por día" valor={v(numero(kpis.porDia, 1))} />
          <Mosaico titulo="Completados" valor={v(`${numero(kpis.successRate, 1)}%`)} detalle={sinDatos ? undefined : `${numero(kpis.completedOrders)} de ${numero(kpis.totalOrders)}`} />
          <Mosaico
            titulo="Cancelados"
            valor={v(numero(kpis.cancelados))}
            detalle={kpis.totalOrders > 0 ? `${numero((kpis.cancelados / kpis.totalOrders) * 100, 1)}% del total` : undefined}
          />
        </div>

        {/* Secciones */}
        <div role="tablist" style={{ display: 'flex', padding: 2, borderRadius: 9, background: IOS.relleno, marginBottom: 16 }}>
          {pestañas.map(([v, t]) => {
            const activo = activeTab === v;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => setActiveTab(v)}
                style={{
                  flex: 1, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
                  fontWeight: activo ? 600 : 500, color: IOS.texto,
                  background: activo ? '#fff' : 'transparent',
                  boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)' : 'none',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {activeTab === 'resumen' && (
          <Seccion
            titulo={metricaDiaria === 'ingresos' ? 'Ingresos por día' : 'Pedidos por día'}
            accion={
              <SegmentoChico
                opciones={[['ingresos', '$'], ['pedidos', 'N.º']]}
                valor={metricaDiaria}
                onCambio={(v) => setMetricaDiaria(v as 'ingresos' | 'pedidos')}
              />
            }
          >
            <div style={{ ...tarjeta, padding: '16px 8px 8px 0' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyStats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap={dailyStats.length > 45 ? 1 : 2}>
                  <CartesianGrid vertical={false} stroke="rgba(60,60,67,0.12)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    tick={{ fontSize: 11, fill: IOS.secundario }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={metricaDiaria === 'ingresos' ? 76 : 36}
                    tick={{ fontSize: 11, fill: IOS.secundario }}
                    tickFormatter={(v: number) => (metricaDiaria === 'ingresos' ? montoCorto(v) : numero(v))}
                    allowDecimals={false}
                    ticks={marcasDiarias}
                    domain={[0, marcasDiarias[marcasDiarias.length - 1]]}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,122,255,0.08)' }}
                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: 13 }}
                    labelStyle={{ color: IOS.secundario, marginBottom: 2 }}
                    formatter={(v: number) =>
                      metricaDiaria === 'ingresos' ? [formatCLP(v), 'Ingresos'] : [numero(v), 'Pedidos']
                    }
                  />
                  <Bar dataKey={metricaDiaria} fill={IOS.azul} radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Seccion>
        )}

        {activeTab === 'productos' && (
          <Seccion
            titulo={`${numero(allProductStats.length)} productos vendidos`}
            accion={
              <SegmentoChico
                opciones={[['ingresos', '$'], ['cantidad', 'Unid.']]}
                valor={ordenProductos}
                onCambio={(v) => setOrdenProductos(v as 'ingresos' | 'cantidad')}
              />
            }
            pie="Sin pedidos cancelados."
          >
            <div style={tarjeta}>
              {productosVisibles.length === 0 ? (
                <Vacio texto="No hay ventas en este período" />
              ) : (
                productosVisibles.map((p, i) => {
                  const valor = ordenProductos === 'ingresos' ? p.ingresos : p.cantidad;
                  return (
                    <div key={p.name}>
                      {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 44 }} />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                        <span style={{ width: 16, fontSize: 13, color: IOS.secundario, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {i + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span className="truncate" style={{ flex: 1, fontSize: 15, color: IOS.texto }}>{p.name}</span>
                            <span style={{ fontSize: 15, fontWeight: 600, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>
                              {ordenProductos === 'ingresos' ? montoCorto(p.ingresos) : numero(p.cantidad, 2)}
                            </span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: IOS.relleno, margin: '6px 0 4px' }}>
                            <div style={{ height: 4, borderRadius: 2, background: IOS.azul, width: `${Math.max(2, (valor / maxProducto) * 100)}%` }} />
                          </div>
                          <span style={{ fontSize: 12, color: IOS.secundario }}>
                            {ordenProductos === 'ingresos'
                              ? `${numero(p.cantidad, 2)} unid. · ${numero(p.ventasTotales || 0)} pedidos`
                              : `${formatCLP(p.ingresos)} · ${numero(p.ventasTotales || 0)} pedidos`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {productosOrdenados.length > 10 && (
                <>
                  <div style={{ height: 0.5, background: IOS.separador }} />
                  <button
                    type="button"
                    onClick={() => setVerTodosProductos((v) => !v)}
                    className="fila-ios"
                    style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: IOS.azul, fontSize: 15 }}
                  >
                    {verTodosProductos ? 'Ver menos' : `Ver los ${numero(productosOrdenados.length)}`}
                    <ChevronDown style={{ width: 16, height: 16, transform: verTodosProductos ? 'rotate(180deg)' : undefined }} />
                  </button>
                </>
              )}
            </div>
          </Seccion>
        )}

        {activeTab === 'estados' && (
          <Seccion titulo={`${numero(kpis.totalOrders)} pedidos por estado`} pie="Estado actual de los pedidos hechos en el período.">
            <div style={{ ...tarjeta, padding: 16 }}>
              {kpis.totalOrders === 0 ? (
                <Vacio texto="No hay pedidos en este período" />
              ) : (
                <>
                  {/* Barra apilada: cada tramo separado por 2px de fondo */}
                  <div style={{ display: 'flex', gap: 2, height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
                    {statusDistribution.filter((e) => e.value > 0).map((e) => (
                      <div key={e.key} title={`${e.label}: ${e.value}`} style={{ flex: e.value, background: e.color }} />
                    ))}
                  </div>
                  {statusDistribution.map((e, i) => (
                    <div key={e.key}>
                      {i > 0 && <div style={{ height: 0.5, background: IOS.separador }} />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: e.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 15, color: e.value ? IOS.texto : IOS.secundario }}>{e.label}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: e.value ? IOS.texto : IOS.secundario, fontVariantNumeric: 'tabular-nums' }}>
                          {numero(e.value)}
                        </span>
                        <span style={{ width: 52, textAlign: 'right', fontSize: 13, color: IOS.secundario, fontVariantNumeric: 'tabular-nums' }}>
                          {numero((e.value / kpis.totalOrders) * 100, 1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Seccion>
        )}

        {activeTab === 'costos' && puedeVerCostos && (
          loadingProduction ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 40, color: IOS.secundario, fontSize: 14 }}>
              <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} />
              Cargando costos y recetas…
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                <Mosaico
                  titulo="Margen estimado"
                  valor={margenGlobal === null ? '—' : `${numero(margenGlobal, 1)}%`}
                  detalle={`${numero(conReceta.length)} productos con receta`}
                />
                <Mosaico titulo="Valor inventario" valor={montoCorto(productionCosts?.totalInventoryValue || 0)} detalle={`${numero(productionCosts?.totalIngredients || 0)} materias primas`} />
                <Mosaico
                  titulo="Stock bajo"
                  valor={numero(productionCosts?.lowStockItems.length || 0)}
                  detalle="bajo el mínimo"
                  alerta={(productionCosts?.lowStockItems.length || 0) > 0}
                />
                <Mosaico titulo="Órdenes de producción" valor={numero(ordenesProduccionPeriodo.length)} detalle="en el período" />
              </div>

              {productionCosts && productionCosts.lowStockItems.length > 0 && (
                <Seccion
                  titulo="Reponer"
                  pie={productionCosts.lowStockItems.length > 8
                    ? `Los 8 más críticos de ${numero(productionCosts.lowStockItems.length)}. El detalle completo está en Materia prima.`
                    : undefined}
                >
                  <div style={tarjeta}>
                    {productionCosts.lowStockItems.slice(0, 8).map((item, i) => (
                      <div key={item.id || item.name}>
                        {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 44 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                          <AlertTriangle style={{ width: 18, height: 18, color: IOS.rojo, flexShrink: 0 }} />
                          <span className="truncate" style={{ flex: 1, fontSize: 15, color: IOS.texto }}>{item.name}</span>
                          <span style={{ fontSize: 13, color: IOS.secundario, fontVariantNumeric: 'tabular-nums' }}>
                            {numero(item.currentStock, 2)} / mín. {numero(item.minStock, 2)} {item.unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Seccion>
              )}

              <Seccion titulo="Rentabilidad por producto" pie="Costo según las recetas cargadas. Solo productos con receta.">
                <div style={tarjeta}>
                  {conReceta.length === 0 ? (
                    <Vacio texto="Configura recetas de productos para ver la rentabilidad" />
                  ) : (
                    conReceta.slice(0, 15).map((p, i) => (
                      <div key={p.name}>
                        {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="truncate" style={{ fontSize: 15, color: IOS.texto }}>{p.name}</p>
                            <p style={{ fontSize: 12, color: IOS.secundario, fontVariantNumeric: 'tabular-nums' }}>
                              Vende {montoCorto(p.revenue)} · cuesta {montoCorto(p.cost)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 15, fontWeight: 600, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>{montoCorto(p.profit)}</p>
                            <p style={{ fontSize: 12, fontWeight: 600, color: p.margin >= 30 ? IOS.verde : p.margin >= 0 ? IOS.naranja : IOS.rojo }}>
                              {numero(p.margin, 1)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Seccion>

              {productionCosts && productionCosts.ingredientsByValue.length > 0 && (
                <Seccion titulo="Inventario por valor">
                  <div style={tarjeta}>
                    {productionCosts.ingredientsByValue.map((ing, i) => (
                      <div key={ing.name}>
                        {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="truncate" style={{ fontSize: 15, color: IOS.texto }}>{ing.name}</p>
                            <p style={{ fontSize: 12, color: IOS.secundario }}>{numero(ing.stock, 2)} {ing.unit}</p>
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 600, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>
                            {montoCorto(ing.value)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Seccion>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
};

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };

function Mosaico({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div style={{ ...tarjeta, padding: '12px 14px' }}>
      <p style={{ fontSize: 13, color: IOS.secundario }}>{titulo}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: alerta ? IOS.rojo : IOS.texto, letterSpacing: -0.3, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </p>
      {detalle && <p style={{ fontSize: 12, color: IOS.secundario, marginTop: 1 }}>{detalle}</p>}
    </div>
  );
}

function Seccion({ titulo, accion, pie, children }: { titulo: string; accion?: ReactNode; pie?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 4px 6px 16px', minHeight: 30 }}>
        <h3 style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', fontWeight: 400 }}>
          {titulo}
        </h3>
        {accion}
      </div>
      {children}
      {pie && <p style={{ fontSize: 13, color: IOS.secundario, padding: '6px 16px 0', lineHeight: 1.35 }}>{pie}</p>}
    </section>
  );
}

function SegmentoChico({ opciones, valor, onCambio }: { opciones: [string, string][]; valor: string; onCambio: (v: string) => void }) {
  return (
    <div role="group" style={{ display: 'flex', padding: 2, borderRadius: 8, background: IOS.relleno }}>
      {opciones.map(([v, t]) => {
        const activo = v === valor;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(v)}
            style={{
              minWidth: 44, height: 26, padding: '0 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
              fontWeight: activo ? 600 : 500, color: IOS.texto,
              background: activo ? '#fff' : 'transparent',
              boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p style={{ padding: '28px 16px', textAlign: 'center', fontSize: 14, color: IOS.secundario }}>{texto}</p>;
}
