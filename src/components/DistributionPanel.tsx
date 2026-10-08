import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft, PackageX, AlertTriangle, Boxes, Search, History, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { productsAPI, categoriesAPI, stockEventsAPI } from '../utils/api';
import type { Product, Category, StockEvent } from '../utils/api';
import { formatCLP } from '../utils/format';
import { formatDateCL } from '../utils/dateUtils';
import { idsDeCategoriaConHijas } from '../utils/categoryTree';
import { ETIQUETA_MOVIMIENTO, SIGNO_MOVIMIENTO, COLOR_MOVIMIENTO } from '../utils/stockEventDisplay';

interface DistributionPanelProps {
  onBack: () => void;
  accessToken: string;
}

export type EstadoStock = 'agotado' | 'bajo' | 'ok';

// Umbral por defecto para los productos que todavía no tienen min_stock cargado.
// Replica el 10 que hasta ahora estaba hardcodeado en ProductManagement.
export const MIN_STOCK_POR_DEFECTO = 10;

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

export function DistributionPanel({ onBack, accessToken }: DistributionPanelProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriaId, setCategoriaId] = useState<string>('all');
  // Evita que un refresco de fondo (automático o del botón) pise el filtro
  // de categoría que el usuario haya elegido a mano: el valor por defecto
  // (Distribuidora) solo se aplica una vez, en la primera carga.
  const categoriaInicializada = useRef(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoStock>('todos');

  // Un error de carga NO puede caer en el empty-state: "no hay productos que
  // controlen stock" se lee como "no hay nada que reponer", que es exactamente
  // la conclusión opuesta a la verdadera cuando la consulta falló.
  const [errorCarga, setErrorCarga] = useState(false);

  const [productoMovimientos, setProductoMovimientos] = useState<Product | null>(null);
  const [movimientos, setMovimientos] = useState<StockEvent[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);
  const [errorMovimientos, setErrorMovimientos] = useState(false);

  // Separado de `loading`: ese es para la carga inicial (toda la pantalla en
  // "Cargando…"), este es solo para que el botón de refrescar gire mientras
  // espera, sin tapar la tabla que ya está mostrando datos.
  const [refrescando, setRefrescando] = useState(false);

  // `silent` evita el spinner y el toast de error en los refrescos de fondo:
  // el usuario no pidió recargar, así que un refresco automático no debería
  // interrumpirlo ni asustarlo si falla una vez (reintenta solo en el
  // próximo ciclo). Ver los dos useEffect de abajo para quién llama con
  // silent=true. Siempre relanza el error (más allá de silent) para que el
  // botón de refrescar manual pueda distinguir éxito de fallo y no mienta
  // con un toast de "actualizado" cuando en realidad no trajo nada nuevo.
  const cargar = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setErrorCarga(false);
      const [respProductos, respCategorias] = await Promise.all([
        productsAPI.getAll(accessToken),
        categoriesAPI.getAll(accessToken),
      ]);
      const listaProductos = Array.isArray(respProductos)
        ? respProductos
        : (respProductos as any).data || [];
      setProducts(listaProductos);
      setCategories(respCategorias);

      // Categoría por defecto: SIEMPRE Distribuidora al entrar al panel (es
      // literalmente para lo que existe esta pantalla) — solo la primera vez
      // que llegan las categorías, para no pisar un cambio de filtro que el
      // usuario haya hecho a mano durante la sesión cuando llega un refresco
      // de fondo. Antes esto se guardaba en localStorage y "recordaba" la
      // última categoría elegida entre visitas, lo que terminó confundiendo:
      // una sesión que había quedado en otra categoría (o en "Todas") mostraba
      // números que no calzaban con los de Distribuidora y se leía como un bug.
      if (!categoriaInicializada.current) {
        categoriaInicializada.current = true;
        setCategoriaId(elegirCategoriaInicial(respCategorias));
      }
    } catch (error: any) {
      console.error('Error cargando el panel de distribución:', error);
      if (!silent) {
        setErrorCarga(true);
        toast.error('Error al cargar el panel');
      }
      throw error;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    cargar().catch(() => {}); // el error ya se maneja adentro (setErrorCarga + toast)
  }, [cargar]);

  // Refresco automático: sin esto, "Valor del inventario" y el resto de los
  // números quedan congelados en lo que había al entrar, aunque la pestaña
  // se deje abierta horas — se vio en vivo: una pestaña vieja mostraba
  // $10.019.963 cuando el valor real ya había bajado a $9.628.993. El
  // intervalo es la red de seguridad; el refresco al volver a la pestaña
  // (visibilitychange) cubre el caso más común, que es dejarla abierta de
  // fondo y volver más tarde.
  useEffect(() => {
    const intervalId = setInterval(() => { cargar(true).catch(() => {}); }, 60000);
    const alVolverVisible = () => {
      if (document.visibilityState === 'visible') cargar(true).catch(() => {});
    };
    document.addEventListener('visibilitychange', alVolverVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', alVolverVisible);
    };
  }, [cargar]);

  // Refresco manual (botón del header): usa silent=true para no tapar la
  // tabla con el "Cargando…" de la carga inicial —los datos viejos siguen
  // visibles hasta que llegan los nuevos—, pero sí confirma con un toast
  // porque acá el usuario pidió la acción explícitamente.
  const handleRefrescarManual = async () => {
    setRefrescando(true);
    try {
      await cargar(true);
      toast.success('Datos actualizados');
    } catch {
      toast.error('No se pudo actualizar. Probá de nuevo.');
    } finally {
      setRefrescando(false);
    }
  };

  // No se persiste en localStorage a propósito: el filtro vuelve a
  // Distribuidora en cada visita (ver categoriaInicializada), un cambio acá
  // dura lo que dura la sesión del panel y nada más.
  const handleCambiarCategoria = (valor: string) => {
    setCategoriaId(valor);
  };

  // Productos del ámbito del panel: los de la categoría elegida —incluidas sus
  // subcategorías— que además controlan stock (los ilimitados devuelven estado
  // null y se descartan).
  //
  // El filtro NO puede ser `categoryId === categoriaId`: con subcategorías, un
  // producto etiquetado "Bebidas" quedaría fuera del ámbito de "Distribuidora" y
  // el panel mostraría un total que se lee como completo sin serlo.
  const productosDelAmbito = useMemo(() => {
    const idsValidos = categoriaId === 'all'
      ? null
      : idsDeCategoriaConHijas(categories, categoriaId);

    return products
      .map(p => ({ producto: p, estado: calcularEstadoStock(p) }))
      .filter((x): x is { producto: Product; estado: EstadoStock } => x.estado !== null)
      .filter(x => idsValidos === null || (!!x.producto.categoryId && idsValidos.has(x.producto.categoryId)));
  }, [products, categories, categoriaId]);

  const stats = useMemo(() => ({
    total: productosDelAmbito.length,
    agotados: productosDelAmbito.filter(x => x.estado === 'agotado').length,
    bajos: productosDelAmbito.filter(x => x.estado === 'bajo').length,
    valor: productosDelAmbito.reduce(
      (sum, x) => sum + (x.producto.lotsValue ?? x.producto.price * x.producto.stock),
      0
    ),
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
    setErrorMovimientos(false);
    try {
      setCargandoMovimientos(true);
      setMovimientos(await stockEventsAPI.getByProduct(accessToken, producto.id));
    } catch (error: any) {
      console.error('Error cargando movimientos:', error);
      setErrorMovimientos(true);
      toast.error('Error al cargar los movimientos');
    } finally {
      setCargandoMovimientos(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onBack} aria-label="Volver">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Distribuidora</h1>
              <p className="text-sm text-gray-600">Stock actual y productos a reponer</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleRefrescarManual}
            disabled={refrescando}
            className="gap-2"
            aria-label="Refrescar"
          >
            <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{refrescando ? 'Actualizando…' : 'Refrescar'}</span>
          </Button>
        </div>

        {/* Mismo criterio que la tabla: si la carga falló, las tarjetas muestran
            "—" en vez de 0. Un "0 agotados" con los datos rotos se lee como
            "está todo bien", que es la conclusión más cara de equivocar acá. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-red-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <PackageX className="w-4 h-4" />
                Agotados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-red-600">{errorCarga ? '—' : stats.agotados}</div>
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
              <div className="text-3xl font-semibold text-amber-600">{errorCarga ? '—' : stats.bajos}</div>
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
              <div className="text-3xl font-semibold text-gray-900">{errorCarga ? '—' : stats.total}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="text-gray-600">Valor del inventario</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-green-600">{errorCarga ? '—' : formatCLP(stats.valor)}</div>
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
            ) : errorCarga ? (
              <div className="p-4 text-sm text-red-600">
                No se pudieron cargar los productos. Esta lista está vacía porque falló la
                consulta, no porque no haya stock que reponer. Recargá la página para
                reintentar.
              </div>
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
          ) : errorMovimientos ? (
            // Explícitamente distinto del empty-state: "todavía no hay
            // movimientos" cuando en realidad la consulta falló haría pasar un
            // kardex roto por un kardex vacío, y nadie lo investigaría.
            <div className="text-sm text-red-600">
              No se pudieron cargar los movimientos. Esto es un error de consulta, no
              quiere decir que el producto no tenga movimientos. Cerrá y volvé a abrir
              para reintentar.
            </div>
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
                  {m.type === 'ajuste' ? (
                    // En un ajuste el signo no está en los datos (quantity es
                    // siempre positiva y la tabla no guarda la dirección), así
                    // que se muestra al frente el stock resultante —que sí es un
                    // dato real— y la magnitud queda abajo, aclarada como tal.
                    <div className="text-right">
                      <div className="font-mono text-gray-900">
                        {m.stockAfter !== undefined ? `quedó en ${m.stockAfter}` : `corrección de ${m.quantity}`}
                      </div>
                      {m.stockAfter !== undefined && (
                        <div className="text-xs text-gray-500">corrección de {m.quantity}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-right">
                      <div className={`font-mono ${COLOR_MOVIMIENTO[m.type]}`}>
                        {SIGNO_MOVIMIENTO[m.type]}{m.quantity}
                      </div>
                      {m.stockAfter !== undefined && (
                        <div className="text-xs text-gray-500">queda {m.stockAfter}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
