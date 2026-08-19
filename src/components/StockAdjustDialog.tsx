import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { BoxIcon } from 'lucide-react';
import type { Product } from '../utils/api';

// Se exporta porque el backend necesita saber con qué modo se hizo el ajuste
// para clasificar el movimiento en el kardex (reposición vs corrección).
export type ModoAjuste = 'sumar' | 'total';

interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onConfirm: (nuevoStock: number, modo: ModoAjuste) => Promise<void>;
  saving?: boolean;
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  product,
  onConfirm,
  saving = false,
}: StockAdjustDialogProps) {
  const [modo, setModo] = useState<ModoAjuste>('sumar');
  const [valor, setValor] = useState('');

  const stockActual = product?.stock ?? 0;

  // Resetear al abrir/cambiar de producto: arrastrar el valor de un producto
  // anterior es la clase de error que deja stock mal cargado sin que se note.
  useEffect(() => {
    if (open) {
      setModo('sumar');
      setValor('');
    }
  }, [open, product?.id]);

  // Se acepta el signo menos para poder restar en modo "sumar" (mermas).
  const cantidad = /^-?\d+$/.test(valor.trim()) ? parseInt(valor.trim(), 10) : null;
  const hayNumero = cantidad !== null;
  const nuevoStock = !hayNumero ? null : modo === 'sumar' ? stockActual + cantidad : cantidad;
  const quedaNegativo = nuevoStock !== null && nuevoStock < 0;
  const puedeConfirmar = hayNumero && !quedaNegativo && !saving;

  const handleConfirmar = async () => {
    if (!puedeConfirmar || nuevoStock === null) return;
    await onConfirm(nuevoStock, modo);
  };

  // No se puede cerrar mientras guarda, para no perder la operación a mitad.
  const handleOpenChange = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BoxIcon className="w-5 h-5 text-blue-600" />
            Ajustar stock
          </DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={modo === 'sumar' ? 'default' : 'outline'}
            onClick={() => setModo('sumar')}
            disabled={saving}
          >
            Sumar
          </Button>
          <Button
            type="button"
            variant={modo === 'total' ? 'default' : 'outline'}
            onClick={() => setModo('total')}
            disabled={saving}
          >
            Corregir total
          </Button>
        </div>

        <div className="text-sm text-gray-600">
          Stock actual: <span className="font-mono text-gray-900">{stockActual}</span>
        </div>

        <div>
          <Label htmlFor="stock-valor">
            {modo === 'sumar' ? 'Cuánto sumar' : 'Stock real contado'}
          </Label>
          <Input
            id="stock-valor"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && puedeConfirmar) {
                e.preventDefault();
                handleConfirmar();
              }
            }}
            placeholder={modo === 'sumar' ? 'Ej: 20' : 'Ej: 47'}
            inputMode="numeric"
            autoFocus
            autoComplete="off"
            disabled={saving}
          />
          <p className="text-xs text-gray-500 mt-1">
            {modo === 'sumar'
              ? 'Podés poner un número negativo para restar (mermas o roturas).'
              : 'Reemplaza el stock actual por este número.'}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-300 rounded-lg py-2 px-3 text-center">
          {!hayNumero ? (
            <span className="text-sm text-gray-500">Ingresá una cantidad</span>
          ) : quedaNegativo ? (
            <span className="text-sm text-red-600">
              El stock no puede quedar negativo
            </span>
          ) : (
            <span className="text-blue-700">
              {modo === 'sumar' ? (
                <>
                  {stockActual} {cantidad! < 0 ? '−' : '+'} {Math.abs(cantidad!)} ={' '}
                  <span className="text-2xl font-mono">{nuevoStock}</span> unidades
                </>
              ) : (
                <>
                  {stockActual} → <span className="text-2xl font-mono">{nuevoStock}</span> unidades
                </>
              )}
            </span>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmar}
            disabled={!puedeConfirmar}
            style={{ background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)', color: 'white' }}
          >
            {saving ? 'Guardando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
