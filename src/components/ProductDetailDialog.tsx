import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Package, Pencil, ChevronRight, ChevronDown, ListChecks, History, X, Loader2 } from 'lucide-react';
import { stockEventsAPI, type Product, type StockEvent } from '../utils/api';
import { formatCLP } from '../utils/format';
import { etiquetaMovimiento, SIGNO_MOVIMIENTO } from '../utils/stockEventDisplay';
import { toast } from 'sonner';

interface ProductDetailDialogProps {
  product: Product | null;
  accessToken: string;
  onOpenChange: (open: boolean) => void;
  onEditar: (product: Product) => void;
  onAjustarStock: (product: Product) => void;
  onReceta: (product: Product) => void;
  onEliminar: (product: Product) => void;
  /** El endpoint de movimientos de stock es admin-only; la fila se oculta para el resto. */
  esAdmin: boolean;
}

type ContenidoProps = Omit<ProductDetailDialogProps, 'product' | 'onOpenChange'> & {
  product: Product;
};

/**
 * Ficha de producto: lo que se abre al tocar una tarjeta.
 *
 * Es de SOLO LECTURA a propósito. Antes, tocar una tarjeta abría el formulario
 * de edición con el nombre seleccionado, y ahí el stock era un input más de un
 * formulario largo cuyo botón de guardar queda debajo del scroll en teléfono:
 * quien tipeaba el stock y cerraba con la X, con Escape o tocando afuera perdía
 * el número sin que nada se lo dijera. Acá no hay nada que perder al cerrar, y
 * cambiar el stock exige pasar por el diálogo de ajuste, que tiene su Confirmar
 * a la vista.
 */
export function ProductDetailDialog({ product, onOpenChange, ...resto }: ProductDetailDialogProps) {
  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      {/* Hoja iOS desde abajo (la clase hoja-ios oculta la ✕ de shadcn: la
          hoja trae la suya, sobre la foto). */}
      <DialogContent
        className="hoja-ios"
        style={{
          top: 'auto', bottom: 0, left: 0, right: 0, translate: 'none', margin: '0 auto',
          width: '100%', maxWidth: 560, maxHeight: '92dvh', padding: 0, gap: 0, border: 'none',
          borderRadius: '14px 14px 0 0', background: IOS.fondo, overflowY: 'auto', display: 'block',
        }}
      >
        {product && <FichaContenido product={product} onCerrar={() => onOpenChange(false)} {...resto} />}
      </DialogContent>
    </Dialog>
  );
}

const IOS = {
  fondo: '#F2F2F7',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
  rojo: '#FF3B30',
};

const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

function FichaContenido({
  product,
  accessToken,
  onEditar,
  onAjustarStock,
  onReceta,
  onEliminar,
  esAdmin,
  onCerrar,
}: ContenidoProps & { onCerrar: () => void }) {
  const esIlimitado = product.unlimitedStock === true || product.stock === -1;
  const recetaCount = product.ingredients?.length ?? 0;
  const minimo = product.minStock ?? 10;
  const estado = esIlimitado ? null : product.stock <= 0 ? 'agotado' : product.stock <= minimo ? 'bajo' : 'ok';
  const colorEstado = estado === 'agotado' ? IOS.rojo : estado === 'bajo' ? '#FF9500' : '#34C759';
  const textoEstado = estado === 'agotado' ? 'Agotado' : estado === 'bajo' ? 'Stock bajo' : 'Disponible';

  const [movimientos, setMovimientos] = useState<StockEvent[] | null>(null);
  const [cargandoMov, setCargandoMov] = useState(false);

  const verMovimientos = async () => {
    // Segundo toque: colapsa. Evita que la ficha crezca sin forma de volver.
    if (movimientos) { setMovimientos(null); return; }
    try {
      setCargandoMov(true);
      setMovimientos(await stockEventsAPI.getByProduct(accessToken, product.id));
    } catch {
      // No se deja `movimientos` en [] ante un error: "todavía no hay
      // movimientos" disfrazaría una consulta rota de producto sin historial.
      toast.error('No se pudieron cargar los movimientos. Es un error de consulta, no quiere decir que el producto no tenga historial.');
    } finally {
      setCargandoMov(false);
    }
  };

  const separador = (izq = 16) => <div style={{ height: 0.5, background: IOS.separador, marginLeft: izq }} />;
  const fila: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '0 16px', textAlign: 'left', border: 'none' };

  return (
    <>
      {/* Foto grande, como en una tienda */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <Package style={{ width: 48, height: 48, color: '#C7C7CC' }} />
        )}
        <span style={{ position: 'absolute', top: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.8)' }} />
        </span>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 16, border: 'none', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <X style={{ width: 17, height: 17, color: '#fff' }} />
        </button>
      </div>

      <div style={{ padding: '14px 16px max(env(safe-area-inset-bottom), 24px)' }}>
        <DialogTitle style={{ fontSize: 22, fontWeight: 700, color: IOS.texto, lineHeight: 1.25 }}>{product.name}</DialogTitle>
        {/* Sin descripción Radix avisa en consola (aria-describedby). */}
        <DialogDescription style={{ fontSize: 15, color: IOS.secundario, marginTop: 2 }}>
          {product.category || 'General'}{product.sku ? ` · ${product.sku}` : ''}
        </DialogDescription>
        <p style={{ fontSize: 24, fontWeight: 700, color: IOS.texto, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{formatCLP(product.price)}</p>
        {product.description && (
          <p style={{ fontSize: 15, color: '#3C3C43', marginTop: 6, lineHeight: 1.4 }}>{product.description}</p>
        )}

        {/* Stock: lo que la gente viene a ver, con un único botón. En ilimitados
            no hay nada que ajustar y ofrecerlo invita a un error. */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: IOS.secundario }}>Stock</p>
            {esIlimitado ? (
              <p style={{ fontSize: 22, fontWeight: 700, color: IOS.texto }}>Sin límite</p>
            ) : (
              <>
                <p style={{ fontSize: 26, fontWeight: 700, color: estado === 'agotado' ? IOS.rojo : IOS.texto, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{fmt(product.stock)}</p>
                <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: IOS.secundario, marginTop: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: colorEstado }} />
                  {textoEstado} · mínimo {fmt(minimo)}
                </p>
              </>
            )}
          </div>
          {!esIlimitado && (
            <button
              type="button"
              onClick={() => onAjustarStock(product)}
              className="boton-ios"
              style={{ height: 40, padding: '0 18px', borderRadius: 20, border: 'none', background: IOS.azul, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              Ajustar
            </button>
          )}
        </div>

        {/* Acciones */}
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', marginTop: 20 }}>
          <button type="button" className="fila-ios" style={fila} onClick={() => onEditar(product)}>
            <Pencil style={{ width: 18, height: 18, color: IOS.azul }} />
            <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>Editar producto</span>
            <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC' }} />
          </button>
          {separador(46)}
          <button type="button" className="fila-ios" style={fila} onClick={() => onReceta(product)}>
            <ListChecks style={{ width: 18, height: 18, color: IOS.azul }} />
            <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>Receta</span>
            <span style={{ fontSize: 15, color: IOS.secundario }}>{recetaCount} ingrediente{recetaCount !== 1 ? 's' : ''}</span>
            <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC' }} />
          </button>
          {esAdmin && (
            <>
              {separador(46)}
              <button type="button" className="fila-ios" style={fila} onClick={verMovimientos} aria-expanded={!!movimientos}>
                <History style={{ width: 18, height: 18, color: IOS.azul }} />
                <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>Movimientos de stock</span>
                {cargandoMov
                  ? <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: IOS.secundario }} />
                  : <ChevronDown style={{ width: 18, height: 18, color: '#C7C7CC', transform: movimientos ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />}
              </button>
              {movimientos && movimientos.length === 0 && (
                <>
                  {separador()}
                  <p style={{ padding: '12px 16px', fontSize: 14, color: IOS.secundario }}>Todavía no hay movimientos registrados.</p>
                </>
              )}
              {movimientos && movimientos.map((m) => {
                const signo = SIGNO_MOVIMIENTO[m.type];
                return (
                  <div key={m.id}>
                    {separador()}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 15, color: IOS.texto }}>{etiquetaMovimiento(m)}</p>
                        {/* new Date y no formatDateCL: ese corta a YYYY-MM-DD y perdería la hora. */}
                        <p style={{ fontSize: 12, color: IOS.secundario }}>
                          {new Date(m.createdAt).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
                        </p>
                      </div>
                      {m.type === 'ajuste' ? (
                        // En un ajuste el signo no está en los datos: al frente va el
                        // stock resultante (dato real) y la magnitud abajo.
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>
                            {m.stockAfter !== undefined ? `quedó en ${fmt(m.stockAfter)}` : `corrección de ${fmt(m.quantity)}`}
                          </p>
                          {m.stockAfter !== undefined && <p style={{ fontSize: 12, color: IOS.secundario }}>corrección de {fmt(m.quantity)}</p>}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: signo === '+' ? '#248A3D' : signo === '−' ? IOS.rojo : IOS.texto, fontVariantNumeric: 'tabular-nums' }}>
                            {signo}{fmt(m.quantity)}
                          </p>
                          {m.stockAfter !== undefined && <p style={{ fontSize: 12, color: IOS.secundario }}>queda {fmt(m.stockAfter)}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', marginTop: 20 }}>
          <button
            type="button"
            className="fila-ios"
            style={{ ...fila, justifyContent: 'center', color: IOS.rojo, fontSize: 16 }}
            onClick={() => onEliminar(product)}
          >
            Eliminar producto
          </button>
        </div>
      </div>
    </>
  );
}
