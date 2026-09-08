import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Package, Edit, BoxIcon, Trash2, ChevronRight, ListChecks, History } from 'lucide-react';
import { stockEventsAPI, type Product, type StockEvent } from '../utils/api';
import { formatCLP } from '../utils/format';
import { ETIQUETA_MOVIMIENTO, SIGNO_MOVIMIENTO, COLOR_MOVIMIENTO } from '../utils/stockEventDisplay';
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        {product && <FichaContenido product={product} {...resto} />}
      </DialogContent>
    </Dialog>
  );
}

const filaClase =
  'w-full flex items-center gap-3 px-4 py-3 text-left border-b hover:bg-gray-50';

function FichaContenido({
  product,
  accessToken,
  onEditar,
  onAjustarStock,
  onReceta,
  onEliminar,
  esAdmin,
}: ContenidoProps) {
  const esIlimitado = product.unlimitedStock === true || product.stock === -1;
  const recetaCount = product.ingredients?.length ?? 0;

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
      // movimientos" es el peor mensaje posible acá, porque disfraza una
      // consulta rota de producto sin historial y nadie lo investiga.
      toast.error('No se pudieron cargar los movimientos. Es un error de consulta, no quiere decir que el producto no tenga historial.');
    } finally {
      setCargandoMov(false);
    }
  };

  return (
    <>
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base">{product.name}</DialogTitle>
          {/* Sin esto Radix 1.1.6 tira un warning en consola al abrir el diálogo
              (falta aria-describedby). La categoría es lo más corto y siempre
              disponible; la descripción del producto puede no existir. */}
          <DialogDescription>{product.category || 'General'}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 px-4 py-3">
          <div
            className="w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center"
            style={{ background: 'rgba(243, 244, 246, 0.5)', flexShrink: 0 }}
          >
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <Package className="w-6 h-6 text-blue-300" />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="text-sm text-gray-500">
              {product.description || 'Sin descripción'}
            </p>
            <p className="text-xs text-gray-500 mt-1">{product.category || 'General'}</p>
            <p className="text-lg text-gray-900 mt-1">{formatCLP(product.price)}</p>
          </div>
        </div>

        {/* El stock es lo que la gente viene a ver: va en su propio bloque, con
            un único botón. En productos ilimitados no se muestra: no hay nada
            que ajustar y ofrecerlo invita a un error. */}
        {!esIlimitado && (
          <div className="px-4 mb-2">
            <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
              <div>
                <p className="text-xs text-blue-700">Stock actual</p>
                <p className="text-2xl font-mono text-gray-900">{product.stock}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => onAjustarStock(product)}
                className="border-[#0059FF] text-[#0059FF] hover:bg-blue-50"
              >
                <BoxIcon className="w-4 h-4 mr-1" />
                Ajustar
              </Button>
            </div>
          </div>
        )}

        <div className="border-t">
          <button type="button" className={filaClase} onClick={() => onEditar(product)}>
            <Edit className="w-4 h-4 text-gray-500" />
            <span className="flex-1 text-sm">Editar producto</span>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>

          <button type="button" className={filaClase} onClick={() => onReceta(product)}>
            <ListChecks className="w-4 h-4 text-gray-500" />
            <span className="flex-1 text-sm">
              Receta <span className="text-gray-500">· {recetaCount} ingrediente{recetaCount !== 1 ? 's' : ''}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>

          {esAdmin && (
            <>
              <button type="button" className={filaClase} onClick={verMovimientos}>
                <History className="w-4 h-4 text-gray-500" />
                <span className="flex-1 text-sm">Movimientos de stock</span>
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>

              {cargandoMov && (
                <p className="px-4 py-3 text-sm text-gray-500">Cargando…</p>
              )}

              {movimientos && movimientos.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500">
                  Todavía no hay movimientos registrados para este producto.
                </p>
              )}

              {movimientos && movimientos.map(m => (
                <div key={m.id} className="flex items-center justify-between border-b px-4 py-2">
                  <div>
                    <div className="text-sm text-gray-900">{ETIQUETA_MOVIMIENTO[m.type]}</div>
                    {/* formatDateCL no sirve acá: su parseDate corta el string a los
                        primeros 10 caracteres y arma un Date sin hora (pensado para
                        campos YYYY-MM-DD tipo `deadline`, no para un timestamp real).
                        Pasarle options con hour/minute mostraría 00:00 siempre, sin
                        importar la hora real del evento. m.createdAt es un timestamptz
                        completo (ver stock_events.created_at), así que se parsea
                        directo con `new Date` y se formatea con hora — mismo patrón
                        que ya usa DispatchOrders.tsx para order.createdAt. El criterio
                        de aceptación pide la hora de cada evento (Hallazgo 5). */}
                    <div className="text-xs text-gray-500">
                      {new Date(m.createdAt).toLocaleString('es-CL', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  {m.type === 'ajuste' ? (
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
            </>
          )}

          <button
            type="button"
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
            onClick={() => onEliminar(product)}
          >
            <Trash2 className="w-4 h-4 text-red-600" />
            <span className="flex-1 text-sm text-red-600">Eliminar</span>
          </button>
        </div>
    </>
  );
}
