import { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft, PackageX, AlertTriangle, Boxes, Search, History } from 'lucide-react';
import { toast } from 'sonner';
import { productsAPI, categoriesAPI, stockEventsAPI } from '../utils/api';
import type { Product, Category, StockEvent } from '../utils/api';
import { formatCLP } from '../utils/format';
import { formatDateCL } from '../utils/dateUtils';

interface DistributionPanelProps {
  onBack: () => void;
  accessToken: string;
}

export type EstadoStock = 'agotado' | 'bajo' | 'ok';

// Umbral por defecto para los productos que todavía no tienen min_stock cargado.
// Replica el 10 que hasta ahora estaba hardcodeado en ProductManagement.
export const MIN_STOCK_POR_DEFECTO = 10;

// Clave de localStorage para recordar qué categoría eligió el admin. Se guarda
// porque el panel se usa siempre sobre la misma categoría (la de Distribuidora)
// y volver a elegirla en cada visita sería fricción pura.
const CLAVE_CATEGORIA = 'conectoca:distribucion:categoria';

/**
 * Los productos de stock ilimitado no se reponen, así que no participan del
 * panel: devuelve null para que el llamador los excluya.
 */
export function calcularEstadoStock(product: Product): EstadoStock | null {
  if (product.unlimitedStock === true || product.stock === -1 || product.trackStock === false) {
    return null;
  }
  if (product.stock <= 0) return 'agotado';
  const minimo = product.minStock ?? MIN_STOCK_POR_DEFECTO;
  return product.stock <= minimo ? 'bajo' : 'ok';
}

/**
 * Busca la categoría de la Distribuidora por nombre. Se hace por nombre y no por
 * un id fijo porque la app es multi-tenant: cada negocio tiene sus propias
 * categorías y ninguna id sirve para todos. Si no la encuentra, muestra todas.
 */
export function elegirCategoriaInicial(categories: Category[]): string {
  const distri = categories.find(c => c.name.trim().toLowerCase().includes('distribuidora'));
  return distri ? distri.id : 'all';
}

const ETIQUETA_MOVIMIENTO: Record<StockEvent['type'], string> = {
  despacho: 'Despacho a local',
  reposicion: 'Llegó mercadería',
  merma: 'Merma',
  ajuste: 'Corrección de conteo',
};

export function DistributionPanel({ onBack, accessToken }: DistributionPanelProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriaId, setCategoriaId] = useState<string>('all');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoStock>('todos');

  const [productoMovimientos, setProductoMovimientos] = useState<Product | null>(null);
  const [movimientos, setMovimientos] = useState<StockEvent[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const [respProductos, respCategorias] = await Promise.all([
          productsAPI.getAll(accessToken),
          categoriesAPI.getAll(accessToken),
        ]);
        const listaProductos = Array.isArray(respProductos)
          ? respProductos
          : (respProductos as any).data || [];
        setProducts(listaProductos);
        setCategories(respCategorias);

        // La categoría guardada manda, pero solo si todavía existe (o es el
        // valor especial "todas"): si la borraron, caer en la detección por
        // nombre evita un panel vacío.
        const guardada = localStorage.getItem(CLAVE_CATEGORIA);
        const sigueExistiendo = guardada === 'all' || (guardada && respCategorias.some(c => c.id === guardada));
        setCategoriaId(sigueExistiendo ? guardada! : elegirCategoriaInicial(respCategorias));
      } catch (error: any) {
        console.error('Error cargando el panel de distribución:', error);
        toast.error('Error al cargar el panel');
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [accessToken]);

  const handleCambiarCategoria = (valor: string) => {
    setCategoriaId(valor);
    localStorage.setItem(CLAVE_CATEGORIA, valor);
  };

  // Productos del ámbito del panel: los de la categoría elegida que además
  // controlan stock (los ilimitados devuelven estado null y se descartan).
  const productosDelAmbito = useMemo(() => {
    return products
      .map(p => ({ producto: p, estado: calcularEstadoStock(p) }))
      .filter((x): x is { producto: Product; estado: EstadoStock } => x.estado !== null)
      .filter(x => categoriaId === 'all' || x.producto.categoryId === categoriaId);
  }, [products, categoriaId]);

  const stats = useMemo(() => ({
    total: productosDelAmbito.length,
    agotados: productosDelAmbito.filter(x => x.estado === 'agotado').length,
    bajos: productosDelAmbito.filter(x => x.estado === 'bajo').length,
    valor: productosDelAmbito.reduce((sum, x) => sum + x.producto.price * x.producto.stock, 0),
  }), [productosDelAmbito]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productosDelAmbito
      .filter(x => filtroEstado === 'todos' || x.estado === filtroEstado)
      .filter(x => !q ||
        x.producto.name.toLowerCase().includes(q) ||
        (x.producto.sku || '').toLowerCase().includes(q))
      // Lo más urgente arriba: agotados, después bajos, y dentro de cada grupo
      // el de menos stock primero.
      .sort((a, b) => {
        const peso = { agotado: 0, bajo: 1, ok: 2 };
        if (peso[a.estado] !== peso[b.estado]) return peso[a.estado] - peso[b.estado];
        return a.producto.stock - b.producto.stock;
      });
  }, [productosDelAmbito, filtroEstado, busqueda]);

  const abrirMovimientos = async (producto: Product) => {
    setProductoMovimientos(producto);
    setMovimientos([]);
    try {
      setCargandoMovimientos(true);
      setMovimientos(await stockEventsAPI.getByProduct(accessToken, producto.id));
    } catch (error: any) {
      console.error('Error cargando movimientos:', error);
      toast.error('Error al cargar los movimientos');
    } finally {
      setCargandoMovimientos(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack} aria-label="Volver">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Distribuidora</h1>
            <p className="text-sm text-gray-600">Stock actual y productos a reponer</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-red-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <PackageX className="w-4 h-4" />
                Agotados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-red-600">{stats.agotados}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <AlertTriangle className="w-4 h-4" />
                Stock bajo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-amber-600">{stats.bajos}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <Boxes className="w-4 h-4" />
                Productos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-gray-900">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="text-gray-600">Valor del inventario</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-green-600">{formatCLP(stats.valor)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o SKU"
            />
          </div>

          <Select value={categoriaId} onValueChange={handleCambiarCategoria}>
            <SelectTrigger>
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as any)}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="agotado">Agotados</SelectItem>
              <SelectItem value="bajo">Stock bajo</SelectItem>
              <SelectItem value="ok">Stock OK</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="shadow-md">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 text-sm text-gray-500">Cargando…</div>
            ) : filas.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">
                No hay productos que controlen stock en esta categoría.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-3 py-2 text-gray-600">Producto</th>
                      <th className="text-left px-3 py-2 text-gray-600">Estado</th>
                      <th className="text-right px-3 py-2 text-gray-600">Stock</th>
                      <th className="text-right px-3 py-2 text-gray-600">Mínimo</th>
                      <th className="text-right px-3 py-2 text-gray-600">Movimientos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(({ producto, estado }) => (
                      <tr key={producto.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="text-gray-900">{producto.name}</div>
                          {producto.sku && (
                            <div className="text-xs text-gray-500 font-mono">{producto.sku}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {estado === 'agotado' ? (
                            <Badge className="bg-red-50 text-red-600">Agotado</Badge>
                          ) : estado === 'bajo' ? (
                            <Badge className="bg-amber-50 text-amber-600">Bajo</Badge>
                          ) : (
                            <Badge className="bg-gray-50 text-gray-600">OK</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-900">{producto.stock}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500">
                          {producto.minStock ?? MIN_STOCK_POR_DEFECTO}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="outline" onClick={() => abrirMovimientos(producto)} aria-label={`Ver movimientos de ${producto.name}`}>
                            <History className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Se deja explícito para que quede claro que está planeado y no olvidado:
            calcular una sugerencia hoy sería inventar un número, porque el
            historial de reposiciones recién empieza a acumularse. */}
        <p className="text-xs text-gray-500">
          La sugerencia de cuánto y cada cuánto reponer va a estar disponible cuando se acumule
          más historial de movimientos.
        </p>
      </div>

      <Dialog open={!!productoMovimientos} onOpenChange={(o) => !o && setProductoMovimientos(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimientos</DialogTitle>
            <DialogDescription>{productoMovimientos?.name}</DialogDescription>
          </DialogHeader>

          {cargandoMovimientos ? (
            <div className="text-sm text-gray-500">Cargando…</div>
          ) : movimientos.length === 0 ? (
            <div className="text-sm text-gray-500">
              Todavía no hay movimientos registrados para este producto.
            </div>
          ) : (
            <div className="space-y-2">
              {movimientos.map(m => (
                <div key={m.id} className="flex items-center justify-between border-b py-2">
                  <div>
                    <div className="text-sm text-gray-900">{ETIQUETA_MOVIMIENTO[m.type]}</div>
                    <div className="text-xs text-gray-500">{formatDateCL(m.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono ${m.type === 'reposicion' ? 'text-green-600' : m.type === 'ajuste' ? 'text-gray-600' : 'text-red-600'}`}>
                      {m.type === 'reposicion' ? '+' : m.type === 'ajuste' ? '' : '−'}{m.quantity}
                    </div>
                    {m.stockAfter !== undefined && (
                      <div className="text-xs text-gray-500">queda {m.stockAfter}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
