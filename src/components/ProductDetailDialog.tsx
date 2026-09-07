import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Package, Edit, BoxIcon, Trash2, ChevronRight, ListChecks } from 'lucide-react';
import type { Product } from '../utils/api';
import { formatCLP } from '../utils/format';

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
  onEditar,
  onAjustarStock,
  onReceta,
  onEliminar,
  esAdmin,
}: ContenidoProps) {
  const esIlimitado = product.unlimitedStock === true || product.stock === -1;
  const recetaCount = product.ingredients?.length ?? 0;

  return (
    <>
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base">{product.name}</DialogTitle>
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
          <div className="mx-4 mb-2 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
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

          {/* Acá va la fila "Movimientos de stock" (Tarea 2b). */}

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
