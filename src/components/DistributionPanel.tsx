import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Search, RefreshCw, Share, X, ChevronRight, ChevronsUpDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { productsAPI, categoriesAPI, stockEventsAPI } from '../utils/api';
import type { Product, Category, StockEvent } from '../utils/api';
import { formatCLP } from '../utils/format';
import { formatDateCL } from '../utils/dateUtils';
import { idsDeCategoriaConHijas } from '../utils/categoryTree';
import { etiquetaMovimiento, SIGNO_MOVIMIENTO } from '../utils/stockEventDisplay';
import { exportarLibroExcel } from '../utils/descargarArchivo';

/**
 * Panel de la Distribuidora: stock actual y qué reponer. Estilo iOS como el
 * resto (encabezado azul con buscador, píldoras de estado, lista agrupada y
 * hojas inferiores). Tailwind está precompilado: el estilo va inline.
 */

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  azul: '#007AFF',
  rojo: '#FF3B30',
};

const ESTADOS_STOCK: { key: 'todos' | 'agotado' | 'bajo' | 'ok'; label: string; color: string }[] = [
  { key: 'todos', label: 'Todos', color: '#007AFF' },
  { key: 'agotado', label: 'Agotados', color: '#FF3B30' },
  { key: 'bajo', label: 'Stock bajo', color: '#FF9500' },
  { key: 'ok', label: 'OK', color: '#34C759' },
];

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
  const [exportando, setExportando] = useState(false);
  // Banner de confirmación antes de descargar: el usuario pidió aceptar la
  // descarga en vez de que el Excel baje solo al tocar el botón.
  const [confirmandoDescarga, setConfirmandoDescarga] = useState(false);

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

  // Exporta lo que está viendo en la tabla, no todo el ámbito: si filtró por
  // "Agotados" o buscó algo puntual, el Excel tiene que coincidir con lo que
  // tiene en pantalla, no sorprenderlo con filas que no pidió.
  // El botón del header solo abre el banner de confirmación; la descarga real
  // ocurre cuando el usuario toca "Descargar" en el banner.
  const handlePedirDescarga = () => {
    if (filas.length === 0) {
      toast.error('No hay productos para exportar con estos filtros');
      return;
    }
    setConfirmandoDescarga(true);
  };

  const handleExportarExcel = async () => {
    if (filas.length === 0) {
      toast.error('No hay productos para exportar con estos filtros');
      return;
    }
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const etiquetaEstado: Record<EstadoStock, string> = { agotado: 'Agotado', bajo: 'Bajo', ok: 'OK' };
      const filasExcel = filas.map(({ producto, estado }) => ({
        'Producto': producto.name,
        'Estado': etiquetaEstado[estado],
        'Stock': producto.stock,
        'Valor ($)': producto.lotsValue ?? producto.price * producto.stock,
      }));
      const hoja = XLSX.utils.json_to_sheet(filasExcel);
      hoja['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Distribuidora');
      const fecha = new Date().toISOString().split('T')[0];
      // XLSX.write(...,{type:'array'}) + helper en vez de XLSX.writeFile: este
      // último hace el <a download> que no funciona en el WebView de Capacitor.
      await exportarLibroExcel(libro, `Distribuidora_${fecha}.xlsx`);
      setConfirmandoDescarga(false);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
      toast.error('No se pudo generar el Excel');
    } finally {
      setExportando(false);
    }
  };

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

  const conteoEstado = {
    todos: productosDelAmbito.length,
    agotado: stats.agotados,
    bajo: stats.bajos,
    ok: productosDelAmbito.length - stats.agotados - stats.bajos,
  };
  const categoriaActual = categoriaId === 'all'
    ? 'Todas las categorías'
    : categories.find((c) => c.id === categoriaId)?.name ?? 'Categoría';
  // Si la carga falló, "—" en vez de 0: un "0 agotados" con los datos rotos se
  // lee como "está todo bien", que es la conclusión más cara de equivocar acá.
  const v = (texto: string) => (errorCarga ? '—' : texto);

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-7xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" style={botonRedondo}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Distribuidora</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Stock actual y productos a reponer</p>
            </div>
            <button type="button" onClick={handleRefrescarManual} disabled={refrescando} aria-label="Refrescar" style={botonRedondo}>
              <RefreshCw className={refrescando ? 'animate-spin' : ''} style={{ width: 18, height: 18, color: '#fff' }} />
            </button>
            <button type="button" onClick={handlePedirDescarga} disabled={exportando || loading} aria-label="Descargar Excel" style={{ ...botonRedondo, opacity: loading ? 0.5 : 1 }}>
              <Share style={{ width: 18, height: 18, color: '#fff' }} />
            </button>
          </div>

          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'rgba(255,255,255,0.75)' }} />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o SKU"
              className="buscador-sobre-azul"
              style={{ width: '100%', height: 36, borderRadius: 10, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 16, padding: busqueda ? '0 34px' : '0 12px 0 34px' }}
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X style={{ width: 14, height: 14, color: '#fff' }} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {/* Resumen + categoría */}
        <div style={{ ...tarjeta, marginBottom: 12 }}>
          <div style={{ padding: '14px 16px 12px' }}>
            <p style={{ fontSize: 13, color: IOS.secundario }}>Valor del inventario</p>
            <p style={{ fontSize: 30, fontWeight: 700, color: IOS.texto, letterSpacing: -0.4, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
              {loading ? '…' : v(formatCLP(stats.valor))}
            </p>
            <p style={{ fontSize: 13, color: IOS.secundario, marginTop: 2 }}>
              {loading ? 'Cargando…' : v(`${stats.total} productos con control de stock`)}
            </p>
          </div>
          <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />
          <label className="fila-ios" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '0 16px', cursor: 'pointer' }}>
            <span style={{ fontSize: 16, color: IOS.texto }}>Categoría</span>
            <span className="truncate" style={{ flex: 1, textAlign: 'right', fontSize: 15, color: IOS.secundario }}>{categoriaActual}</span>
            <ChevronsUpDown style={{ width: 15, height: 15, color: IOS.secundario, flexShrink: 0 }} />
            <select
              value={categoriaId}
              onChange={(e) => handleCambiarCategoria(e.target.value)}
              aria-label="Categoría"
              style={{ position: 'absolute', inset: 0, opacity: 0, fontSize: 16 }}
            >
              <option value="all">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        {/* Estado de stock */}
        <div className="sin-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px 16px', padding: '0 16px' }}>
          {ESTADOS_STOCK.map((e) => {
            const activo = filtroEstado === e.key;
            return (
              <button
                key={e.key}
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltroEstado(e.key)}
                style={{
                  flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: activo ? 600 : 500,
                  background: activo ? e.color : IOS.tarjeta, color: activo ? '#fff' : IOS.texto,
                  boxShadow: activo ? 'none' : '0 0 0 0.5px rgba(0,0,0,0.08)',
                }}
              >
                {!activo && e.key !== 'todos' && <span style={{ width: 8, height: 8, borderRadius: 4, background: e.color }} />}
                {e.label}
                <span style={{ fontSize: 12, fontWeight: 600, opacity: activo ? 0.9 : 0.5 }}>{errorCarga || loading ? '—' : conteoEstado[e.key]}</span>
              </button>
            );
          })}
        </div>

        {/* Lista */}
        <section>
          <h3 style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', padding: '0 16px 6px', fontWeight: 400 }}>
            {loading || errorCarga ? 'Productos' : `${filas.length} productos · lo más urgente primero`}
          </h3>
          <div style={tarjeta}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: IOS.secundario }} />
              </div>
            ) : errorCarga ? (
              <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 15, color: IOS.rojo }}>No se pudieron cargar los productos.</p>
                <p style={{ fontSize: 13, color: IOS.secundario, marginTop: 4 }}>
                  La lista está vacía porque falló la consulta, no porque no haya stock que reponer.
                </p>
                <button type="button" onClick={() => { cargar().catch(() => {}); }} style={{ marginTop: 10, color: IOS.azul, fontSize: 16, background: 'none', border: 'none' }}>
                  Reintentar
                </button>
              </div>
            ) : filas.length === 0 ? (
              <p style={{ padding: '28px 16px', textAlign: 'center', fontSize: 15, color: IOS.secundario }}>
                {busqueda || filtroEstado !== 'todos' ? 'Ningún producto coincide con el filtro' : 'No hay productos que controlen stock en esta categoría'}
              </p>
            ) : (
              filas.map(({ producto, estado }, i) => {
                const info = ESTADOS_STOCK.find((e) => e.key === estado)!;
                const minimo = producto.minStock ?? MIN_STOCK_POR_DEFECTO;
                return (
                  <div key={producto.id}>
                    {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 34 }} />}
                    <button
                      type="button"
                      onClick={() => abrirMovimientos(producto)}
                      className="fila-ios"
                      aria-label={`Ver movimientos de ${producto.name}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '8px 12px 8px 16px', textAlign: 'left' }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: info.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="truncate" style={{ display: 'block', fontSize: 15, color: IOS.texto }}>{producto.name}</span>
                        <span style={{ display: 'block', fontSize: 12, color: IOS.secundario }}>
                          {estado === 'agotado' ? 'Agotado' : estado === 'bajo' ? 'Stock bajo' : 'OK'}
                          {producto.sku ? ` · ${producto.sku}` : ''}
                        </span>
                      </span>
                      <span style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: estado === 'agotado' ? IOS.rojo : IOS.texto, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtNumero(producto.stock)}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: IOS.secundario, fontVariantNumeric: 'tabular-nums' }}>mín. {fmtNumero(minimo)}</span>
                      </span>
                      <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC', flexShrink: 0 }} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          {/* Se deja explícito para que quede claro que está planeado y no olvidado:
              calcular una sugerencia hoy sería inventar un número, porque el
              historial de reposiciones recién empieza a acumularse. */}
          <p style={{ fontSize: 13, color: IOS.secundario, padding: '8px 16px 0', lineHeight: 1.35 }}>
            Toca un producto para ver sus movimientos. La sugerencia de cuánto y cada cuánto reponer
            llegará cuando haya más historial.
          </p>
        </section>
      </div>

      {createPortal(
        <AnimatePresence>
          {/* Confirmación de descarga: el usuario pidió aceptar la descarga en
              vez de que el Excel baje solo al tocar el botón. */}
          {confirmandoDescarga && (
            <Hoja key="descarga" onClose={() => !exportando && setConfirmandoDescarga(false)} etiqueta="Descargar inventario">
              <div style={{ padding: '4px 16px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 17, fontWeight: 600, color: IOS.texto }}>Descargar inventario en Excel</p>
                <p style={{ fontSize: 14, color: IOS.secundario, marginTop: 4 }}>
                  {filas.length} {filas.length === 1 ? 'producto' : 'productos'} · {categoriaActual}
                  {filtroEstado !== 'todos' ? ` · ${ESTADOS_STOCK.find((e) => e.key === filtroEstado)?.label}` : ''}
                </p>
              </div>
              <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleExportarExcel}
                  disabled={exportando}
                  className="boton-ios"
                  style={{ height: 50, borderRadius: 12, border: 'none', background: IOS.azul, color: '#fff', fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: exportando ? 0.6 : undefined }}
                >
                  {exportando && <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} />}
                  {exportando ? 'Generando…' : 'Descargar'}
                </button>
                <button type="button" onClick={() => setConfirmandoDescarga(false)} disabled={exportando} style={{ height: 50, borderRadius: 12, border: 'none', background: '#fff', color: IOS.azul, fontSize: 17, fontWeight: 600 }}>
                  Cancelar
                </button>
              </div>
            </Hoja>
          )}

          {productoMovimientos && (
            <Hoja key="movs" onClose={() => setProductoMovimientos(null)} etiqueta={`Movimientos de ${productoMovimientos.name}`} alto>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="truncate" style={{ fontSize: 20, fontWeight: 700, color: IOS.texto }}>{productoMovimientos.name}</p>
                  <p style={{ fontSize: 13, color: IOS.secundario }}>
                    Stock {fmtNumero(productoMovimientos.stock)} · mín. {fmtNumero(productoMovimientos.minStock ?? MIN_STOCK_POR_DEFECTO)}
                  </p>
                </div>
                <button type="button" onClick={() => setProductoMovimientos(null)} aria-label="Cerrar" style={botonGris}>
                  <X style={{ width: 17, height: 17, color: '#3C3C43' }} />
                </button>
              </div>
              <div style={{ overflowY: 'auto', padding: '0 16px' }}>
                <h3 style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', padding: '0 16px 6px', fontWeight: 400 }}>Movimientos</h3>
                <div style={tarjeta}>
                  {cargandoMovimientos ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
                      <Loader2 className="animate-spin" style={{ width: 20, height: 20, color: IOS.secundario }} />
                    </div>
                  ) : errorMovimientos ? (
                    // Distinto del vacío: "todavía no hay movimientos" cuando la
                    // consulta falló haría pasar un kardex roto por uno vacío.
                    <p style={{ padding: 16, fontSize: 14, color: IOS.rojo }}>
                      No se pudieron cargar los movimientos. Es un error de consulta, no que el producto no tenga movimientos. Cierra y vuelve a abrir para reintentar.
                    </p>
                  ) : movimientos.length === 0 ? (
                    <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: IOS.secundario }}>
                      Todavía no hay movimientos registrados.
                    </p>
                  ) : (
                    movimientos.map((m, i) => (
                      <div key={m.id}>
                        {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 15, color: IOS.texto }}>{etiquetaMovimiento(m)}</p>
                            <p style={{ fontSize: 12, color: IOS.secundario }}>{formatDateCL(m.createdAt)}</p>
                          </div>
                          {m.type === 'ajuste' ? (
                            // En un ajuste el signo no está en los datos (quantity es
                            // siempre positiva), así que al frente va el stock
                            // resultante —que sí es un dato real— y la magnitud abajo.
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: 15, fontWeight: 600, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>
                                {m.stockAfter !== undefined ? `quedó en ${fmtNumero(m.stockAfter)}` : `corrección de ${fmtNumero(m.quantity)}`}
                              </p>
                              {m.stockAfter !== undefined && <p style={{ fontSize: 12, color: IOS.secundario }}>corrección de {fmtNumero(m.quantity)}</p>}
                            </div>
                          ) : (
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: 15, fontWeight: 600, color: SIGNO_MOVIMIENTO[m.type] === '+' ? '#248A3D' : SIGNO_MOVIMIENTO[m.type] === '−' ? IOS.rojo : IOS.texto, fontVariantNumeric: 'tabular-nums' }}>
                                {SIGNO_MOVIMIENTO[m.type]}{fmtNumero(m.quantity)}
                              </p>
                              {m.stockAfter !== undefined && <p style={{ fontSize: 12, color: IOS.secundario }}>queda {fmtNumero(m.stockAfter)}</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Hoja>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/** Hoja inferior estilo iOS (se desliza hacia abajo para cerrar). */
function Hoja({ children, onClose, etiqueta, alto }: { children: React.ReactNode; onClose: () => void; etiqueta: string; alto?: boolean }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50 }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        drag="y"
        dragDirectionLock
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 51, margin: '0 auto', maxWidth: 640,
          background: IOS.fondo, borderRadius: '14px 14px 0 0', maxHeight: alto ? '85vh' : undefined,
          display: 'flex', flexDirection: 'column', paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 10px' }}>
          <span style={{ width: 36, height: 5, borderRadius: 3, background: '#C7C7CC' }} />
        </div>
        {children}
      </motion.div>
    </>
  );
}

const fmtNumero = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
};

const botonGris: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 16, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E3E3E8',
};

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };
