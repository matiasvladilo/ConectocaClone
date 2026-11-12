import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Package2,
  Layers,
  BookOpen,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { productsAPI, ingredientsAPI, ordersAPI, type Product, type Ingredient } from '../utils/api';
import { formatCLP } from '../utils/format';

interface ProductionDashboardProps {
  onBack: () => void;
  accessToken: string;
  userName: string;
  onNavigateToOrders: () => void;
  onNavigateToIngredients: () => void;
  onNavigateToRecipes: () => void;
}

interface OrderLite {
  id: string;
  products?: Array<{ productId: string; name: string; quantity: number; price: number }>;
  status: string;
  createdAt: string;
  deadline?: string;
  total: number;
}

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
  rojo: '#FF3B30',
  naranja: '#FF9500',
  verde: '#34C759',
};

// Cuántos pedidos recientes se miran para "Más pedidos" y los contadores.
const PEDIDOS_RECIENTES = 100;

const formatoCantidad = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n || 0);

export function ProductionDashboard({
  onBack,
  accessToken,
  userName,
  onNavigateToOrders,
  onNavigateToIngredients,
  onNavigateToRecipes,
}: ProductionDashboardProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [verAgotados, setVerAgotados] = useState(false);
  const [verBajos, setVerBajos] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    // Antes se pedía /products sin límite y el servidor devolvía solo 20:
    // las alertas de stock no veían el resto del catálogo.
    const [p, i, o] = await Promise.allSettled([
      productsAPI.getAll(accessToken),
      ingredientsAPI.getAll(accessToken),
      ordersAPI.getAll(accessToken, 1, PEDIDOS_RECIENTES),
    ]);
    if (p.status === 'fulfilled') setProducts(p.value);
    if (i.status === 'fulfilled') setIngredients(i.value);
    if (o.status === 'fulfilled') setOrders((o.value?.data || []) as unknown as OrderLite[]);
    if (p.status === 'rejected' || i.status === 'rejected' || o.status === 'rejected') setError(true);
  }, [accessToken]);

  useEffect(() => {
    void cargar().finally(() => setLoading(false));
  }, [cargar]);

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  };

  // Stock de productos: mismo criterio que Productos y Distribuidora (mínimo
  // del producto, 10 si no tiene; los de stock ilimitado no cuentan).
  const controlaStock = (p: Product) => !p.unlimitedStock && p.stock !== -1;
  const agotados = useMemo(() => products.filter(p => controlaStock(p) && p.stock <= 0), [products]);
  const bajos = useMemo(
    () => products
      .filter(p => controlaStock(p) && p.stock > 0 && p.stock <= (p.minStock ?? 10))
      .sort((a, b) => a.stock - b.stock),
    [products],
  );
  const materiaBaja = useMemo(
    () => ingredients
      .filter(i => i.currentStock < i.minStock) // mismo criterio que Materia prima
      .sort((a, b) => (a.currentStock / (a.minStock || 1)) - (b.currentStock / (b.minStock || 1))),
    [ingredients],
  );

  const activos = useMemo(() => orders.filter(o => o.status !== 'cancelled'), [orders]);

  // Día de cada pedido: el de entrega (o el de creación si no tiene), igual que
  // la pestaña "Hoy" del Inicio, para que los dos números coincidan.
  const diaDelPedido = (o: OrderLite) => {
    if (o.deadline) {
      const [y, m, d] = o.deadline.split('T')[0].split('-').map(Number);
      return new Date(y, m - 1, d).getTime();
    }
    const c = new Date(o.createdAt);
    c.setHours(0, 0, 0, 0);
    return c.getTime();
  };

  const resumen = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const semana = new Date(hoy);
    semana.setDate(semana.getDate() - 6);
    const deHoy = activos.filter(o => diaDelPedido(o) === hoy.getTime());
    const enSemana = activos.filter(o => new Date(o.createdAt) >= semana).length;
    // Si se cargó el tope de pedidos y el más viejo es de esta semana, hay más.
    const masViejo = orders.length ? Math.min(...orders.map(o => new Date(o.createdAt).getTime())) : Infinity;
    const truncado = orders.length >= PEDIDOS_RECIENTES && masViejo >= semana.getTime();
    return {
      hoy: deHoy.length,
      semana: truncado ? `más de ${enSemana}` : String(enSemana),
      ventasHoy: deHoy.reduce((s, o) => s + (o.total || 0), 0),
      pendientes: activos.filter(o => o.status === 'pending').length,
      enPreparacion: activos.filter(o => o.status === 'in_progress').length,
      listos: activos.filter(o => o.status === 'completed').length,
    };
  }, [activos, orders]);

  const masPedidos = useMemo(() => {
    const mapa = new Map<string, { nombre: string; unidades: number; pedidos: number }>();
    for (const o of activos) {
      for (const item of o.products || []) {
        const actual = mapa.get(item.productId);
        if (actual) {
          actual.unidades += item.quantity;
          actual.pedidos += 1;
        } else {
          mapa.set(item.productId, { nombre: item.name, unidades: item.quantity, pedidos: 1 });
        }
      }
    }
    return Array.from(mapa.values()).sort((a, b) => b.unidades - a.unidades).slice(0, 5);
  }, [activos]);

  const valorStock = useMemo(
    () => products.reduce((s, p) => s + (controlaStock(p) && p.stock > 0 ? p.price * p.stock : 0), 0),
    [products],
  );

  const hayAlertas = agotados.length > 0 || materiaBaja.length > 0;
  const fechaHoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const primerNombre = (userName || '').trim().split(/\s+/)[0] || userName;

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-3xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" className="boton-ios" style={botonRedondo}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Producción</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                Hola, {primerNombre} · {fechaHoy}
              </p>
            </div>
            <button type="button" onClick={() => void refrescar()} disabled={refrescando || loading} aria-label="Actualizar" className="boton-ios" style={botonRedondo}>
              <RefreshCw className={refrescando ? 'animate-spin' : ''} style={{ width: 18, height: 18, color: '#fff' }} />
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: IOS.secundario }} />
          </div>
        ) : (
          <>
            {error && (
              <button type="button" onClick={() => void refrescar()}
                style={{ ...tarjeta, width: '100%', border: 'none', padding: '12px 16px', marginBottom: 12, textAlign: 'left', fontSize: 15, color: IOS.secundario, cursor: 'pointer' }}>
                Algunos datos no se pudieron cargar. <span style={{ color: IOS.azul }}>Reintentar</span>
              </button>
            )}

            {/* Pedidos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Tile titulo="Para hoy" valor={resumen.hoy} detalle={`${resumen.semana} en 7 días`} color={IOS.azul} />
              <Tile titulo="Pendientes" valor={resumen.pendientes} detalle="por empezar" color={IOS.naranja} />
              <Tile titulo="En preparación" valor={resumen.enPreparacion} detalle="en curso" color={IOS.azul} />
              <Tile titulo="Listos" valor={resumen.listos} detalle="para despacho" color={IOS.verde} />
            </div>

            {/* Alertas */}
            <h2 style={tituloSeccion}>Stock</h2>
            <div style={tarjeta}>
              {!hayAlertas && bajos.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                  <CheckCircle2 style={{ width: 22, height: 22, color: IOS.verde, flexShrink: 0 }} />
                  <span style={{ fontSize: 16, color: IOS.texto }}>Todo el stock está sobre su mínimo</span>
                </div>
              ) : (
                <>
                  <FilaPlegable
                    color={IOS.rojo}
                    titulo="Productos agotados"
                    cantidad={agotados.length}
                    abierto={verAgotados}
                    onToggle={() => setVerAgotados(v => !v)}
                  >
                    {agotados.map(p => (
                      <FilaDetalle key={p.id} nombre={p.name} valor="0" colorValor={IOS.rojo} />
                    ))}
                  </FilaPlegable>
                  <Separador />
                  <FilaPlegable
                    color={IOS.naranja}
                    titulo="Productos con stock bajo"
                    cantidad={bajos.length}
                    abierto={verBajos}
                    onToggle={() => setVerBajos(v => !v)}
                  >
                    {bajos.map(p => (
                      <FilaDetalle key={p.id} nombre={p.name} valor={`${formatoCantidad(p.stock)} / mín. ${p.minStock ?? 10}`} colorValor={IOS.naranja} />
                    ))}
                  </FilaPlegable>
                </>
              )}
            </div>

            {/* Materia prima bajo mínimo */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '22px 16px 7px' }}>
              <h2 style={{ ...tituloSeccion, margin: 0 }}>Materia prima bajo mínimo</h2>
              <button type="button" onClick={onNavigateToIngredients} style={{ background: 'none', border: 'none', padding: 0, fontSize: 15, color: IOS.azul, cursor: 'pointer' }}>
                Ver todo
              </button>
            </div>
            <div style={tarjeta}>
              {materiaBaja.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                  <CheckCircle2 style={{ width: 22, height: 22, color: IOS.verde, flexShrink: 0 }} />
                  <span style={{ fontSize: 16, color: IOS.texto }}>Toda la materia prima está sobre su mínimo</span>
                </div>
              ) : (
                <>
                  {materiaBaja.slice(0, 6).map((ing, idx) => {
                    const pct = ing.minStock > 0 ? Math.max(0, Math.min(100, (ing.currentStock / ing.minStock) * 100)) : 0;
                    const color = pct < 50 ? IOS.rojo : IOS.naranja;
                    return (
                      <div key={ing.id}>
                        {idx > 0 && <Separador />}
                        <div style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 16, color: IOS.texto }}>{ing.name}</span>
                            <span style={{ fontSize: 15, fontWeight: 600, color, flexShrink: 0 }}>
                              {formatoCantidad(ing.currentStock)} {ing.unit}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <div style={{ flex: 1, height: 4, borderRadius: 2, background: IOS.relleno, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 12, color: IOS.secundario, flexShrink: 0 }}>mín. {formatoCantidad(ing.minStock)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {materiaBaja.length > 6 && (
                    <>
                      <Separador />
                      <button type="button" onClick={onNavigateToIngredients} className="fila-ios"
                        style={{ width: '100%', height: 44, border: 'none', background: 'transparent', fontSize: 16, color: IOS.azul, cursor: 'pointer' }}>
                        Ver {materiaBaja.length - 6} más
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Más pedidos */}
            <h2 style={tituloSeccion}>Más pedidos · últimos {orders.length} pedidos</h2>
            <div style={tarjeta}>
              {masPedidos.length === 0 ? (
                <p style={{ fontSize: 15, color: IOS.secundario, padding: '12px 16px', margin: 0 }}>Todavía no hay pedidos.</p>
              ) : masPedidos.map((p, idx) => {
                const pct = (p.unidades / masPedidos[0].unidades) * 100;
                return (
                  <div key={p.nombre + idx}>
                    {idx > 0 && <Separador inset={52} />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, background: idx === 0 ? IOS.naranja : IOS.relleno, color: idx === 0 ? '#fff' : '#3C3C43',
                      }}>
                        {idx + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 16, color: IOS.texto }}>{p.nombre}</span>
                          <span style={{ fontSize: 15, fontWeight: 600, color: IOS.texto, flexShrink: 0 }}>{formatoCantidad(p.unidades)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                          <div style={{ flex: 1, height: 4, borderRadius: 2, background: IOS.relleno, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: IOS.azul, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 12, color: IOS.secundario, flexShrink: 0 }}>
                            {p.pedidos} {p.pedidos === 1 ? 'pedido' : 'pedidos'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Valores */}
            <h2 style={tituloSeccion}>Valores</h2>
            <div style={tarjeta}>
              <FilaValor etiqueta="Pedidos para hoy" valor={formatCLP(resumen.ventasHoy)} />
              <Separador />
              <FilaValor etiqueta="Stock a precio de venta" valor={formatCLP(valorStock)} />
            </div>

            {/* Herramientas */}
            <h2 style={tituloSeccion}>Herramientas</h2>
            <div style={tarjeta}>
              <FilaAcceso icono={Package2} color="#5856D6" titulo="Órdenes de producción" onClick={onNavigateToOrders} />
              <Separador inset={56} />
              <FilaAcceso icono={Layers} color="#AF52DE" titulo="Materia prima" onClick={onNavigateToIngredients} />
              <Separador inset={56} />
              <FilaAcceso icono={BookOpen} color={IOS.verde} titulo="Recetas" onClick={onNavigateToRecipes} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };

const tituloSeccion: React.CSSProperties = {
  fontSize: 13, fontWeight: 400, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '22px 16px 7px',
};

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
};

function Separador({ inset = 16 }: { inset?: number }) {
  return <div style={{ height: 0.5, background: IOS.separador, marginLeft: inset }} />;
}

function Tile({ titulo, valor, detalle, color }: { titulo: string; valor: number; detalle: string; color: string }) {
  return (
    <div style={{ ...tarjeta, padding: '12px 14px' }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: IOS.secundario }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
        {titulo}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, color: IOS.texto, lineHeight: 1.2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{valor}</p>
      <p style={{ fontSize: 13, color: IOS.secundario }}>{detalle}</p>
    </div>
  );
}

function FilaPlegable({ color, titulo, cantidad, abierto, onToggle, children }: {
  color: string; titulo: string; cantidad: number; abierto: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const activo = cantidad > 0;
  return (
    <>
      <button type="button" onClick={activo ? onToggle : undefined} aria-expanded={activo ? abierto : undefined} className={activo ? 'fila-ios' : undefined}
        style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px 0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: activo ? 'pointer' : 'default' }}>
        <span style={{ width: 29, height: 29, borderRadius: 7, background: activo ? color : IOS.relleno, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {activo
            ? <AlertTriangle style={{ width: 16, height: 16, color: '#fff' }} />
            : <CheckCircle2 style={{ width: 16, height: 16, color: IOS.verde }} />}
        </span>
        <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>{titulo}</span>
        <span style={{ fontSize: 16, fontWeight: activo ? 600 : 400, color: activo ? color : IOS.secundario }}>{cantidad}</span>
        {activo && (
          <ChevronDown style={{ width: 18, height: 18, color: '#C7C7CC', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        )}
      </button>
      {activo && abierto && <div style={{ background: '#FAFAFC' }}>{children}</div>}
    </>
  );
}

function FilaDetalle({ nombre, valor, colorValor }: { nombre: string; valor: string; colorValor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 57px', borderTop: `0.5px solid ${IOS.separador}` }}>
      <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 15, color: '#3C3C43' }}>{nombre}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: colorValor, flexShrink: 0 }}>{valor}</span>
    </div>
  );
}

function FilaValor({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
      <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>{etiqueta}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: IOS.texto }}>{valor}</span>
    </div>
  );
}

function FilaAcceso({ icono: Icono, color, titulo, onClick }: { icono: any; color: string; titulo: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="fila-ios"
      style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px 0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ width: 29, height: 29, borderRadius: 7, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icono style={{ width: 17, height: 17, color: '#fff' }} />
      </span>
      <span style={{ flex: 1, fontSize: 17, color: IOS.texto }}>{titulo}</span>
      <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC' }} />
    </button>
  );
}
