import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { PackagePlus, PackageMinus, ClipboardCheck, Minus, Plus } from 'lucide-react';
import type { Product } from '../utils/api';

// Se exporta porque el backend necesita saber con qué modo se hizo el ajuste
// para clasificar el movimiento en el kardex (reposición vs corrección).
export type ModoAjuste = 'sumar' | 'total';

interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  // true si el producto es de Distribuidora sin receta: pide costo al
  // reponer. Lo calcula quien use el diálogo (tiene las categorías a mano).
  enLotes?: boolean;
  onConfirm: (nuevoStock: number, modo: ModoAjuste, costoUnitario?: number) => Promise<void>;
  saving?: boolean;
}

/**
 * Tres acciones con nombre de la vida real en vez de "sumar / corregir" y un
 * signo para restar:
 *  - Llegó mercadería  → modo 'sumar' con cantidad positiva (reposición).
 *  - Salió / merma     → modo 'sumar' con cantidad negativa.
 *  - Conté el stock    → modo 'total' (el número reemplaza al actual).
 * Al backend le llega exactamente lo mismo que antes (nuevoStock + modo).
 */
type Accion = 'entra' | 'sale' | 'conteo';

const ACCIONES: { key: Accion; titulo: string; detalle: string; color: string; Icono: typeof PackagePlus }[] = [
  { key: 'entra', titulo: 'Llegó', detalle: 'mercadería', color: '#34C759', Icono: PackagePlus },
  { key: 'sale', titulo: 'Salió', detalle: 'merma o rotura', color: '#FF3B30', Icono: PackageMinus },
  { key: 'conteo', titulo: 'Conté', detalle: 'el stock real', color: '#007AFF', Icono: ClipboardCheck },
];

export function StockAdjustDialog({
  open,
  onOpenChange,
  product,
  enLotes = false,
  onConfirm,
  saving = false,
}: StockAdjustDialogProps) {
  const [accion, setAccion] = useState<Accion>('entra');
  const [valor, setValor] = useState('');
  const [costo, setCosto] = useState('');

  const stockActual = product?.stock ?? 0;

  // Resetear al abrir/cambiar de producto: arrastrar el valor de un producto
  // anterior es la clase de error que deja stock mal cargado sin que se note.
  // Con el costo es todavía más importante: un costo viejo de OTRO producto
  // se vería como una sugerencia legítima y se confirmaría sin mirarlo.
  useEffect(() => {
    if (open) {
      setAccion('entra');
      setValor('');
      // Se sugiere el último costo conocido (el precio actual, que en un
      // producto con lotes YA ES el costo del lote activo).
      setCosto(product && product.price > 0 ? String(product.price) : '');
    }
  }, [open, product?.id]);

  const cambiarAccion = (a: Accion) => {
    setAccion(a);
    // En conteo, arrancar desde el stock actual es lo natural (se corrige el
    // número); al entrar/salir se parte de cero.
    setValor(a === 'conteo' ? String(stockActual) : '');
  };

  // Decimales solo si el producto se vende por fracción; coma o punto.
  const permiteDecimal = product?.allowDecimal === true;
  const texto = valor.trim().replace(',', '.');
  const formatoValido = permiteDecimal ? /^(\d+(\.\d+)?|\.\d+)$/ : /^\d+$/;
  const cantidad = formatoValido.test(texto) ? Number(texto) : null;
  const hayNumero = cantidad !== null && (accion === 'conteo' || cantidad > 0);

  const modo: ModoAjuste = accion === 'conteo' ? 'total' : 'sumar';
  // Redondeo a 3 decimales: 6.8 + 0.1 en JS da 6.8999999999999995.
  const nuevoStock = !hayNumero
    ? null
    : Math.round(
        (accion === 'entra' ? stockActual + cantidad! : accion === 'sale' ? stockActual - cantidad! : cantidad!) * 1000,
      ) / 1000;
  const quedaNegativo = nuevoStock !== null && nuevoStock < 0;

  // El costo solo es obligatorio en una reposición real de un producto con lotes.
  const requiereCosto = enLotes && accion === 'entra' && hayNumero;
  const costoNumerico = costo.trim() === '' ? null : Number(costo.trim());
  const costoValido = !requiereCosto || (costoNumerico !== null && !isNaN(costoNumerico) && costoNumerico >= 0);

  const puedeConfirmar = hayNumero && !quedaNegativo && costoValido && !saving;

  const handleConfirmar = async () => {
    if (!puedeConfirmar || nuevoStock === null) return;
    await onConfirm(nuevoStock, modo, requiereCosto ? Number(costo.trim()) : undefined);
  };

  // No se puede cerrar mientras guarda, para no perder la operación a mitad.
  const handleOpenChange = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
  };

  const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 3 });

  const paso = (delta: number) => {
    const base = cantidad ?? 0;
    const siguiente = Math.max(0, Math.round((base + delta) * 1000) / 1000);
    setValor(String(siguiente));
  };

  const info = ACCIONES.find((a) => a.key === accion)!;

  const mensaje = !hayNumero
    ? accion === 'conteo' ? '¿Cuántas unidades contaste?' : accion === 'entra' ? '¿Cuántas unidades llegaron?' : '¿Cuántas unidades salieron?'
    : quedaNegativo
      ? `No alcanza: solo hay ${fmt(stockActual)}`
      : requiereCosto && !costoValido
        ? 'Falta el costo de esta compra'
        : `Queda en ${fmt(nuevoStock!)}`;

  const textoBoton: React.CSSProperties = { background: 'none', border: 'none', padding: '6px 0', fontSize: 17, color: '#007AFF', cursor: 'pointer' };
  const botonPaso: React.CSSProperties = {
    width: 52, height: 52, borderRadius: 26, border: 'none', flexShrink: 0, cursor: 'pointer',
    background: 'rgba(118,118,128,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="hoja-ios"
        style={{
          top: 'auto', bottom: 0, left: 0, right: 0, translate: 'none', margin: '0 auto',
          width: '100%', maxWidth: 560, maxHeight: '92dvh', padding: 0, gap: 0, border: 'none',
          borderRadius: '14px 14px 0 0', background: '#F2F2F7', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 4px', gap: 8 }}>
          <button type="button" onClick={() => onOpenChange(false)} disabled={saving} style={{ ...textoBoton, flex: 1, textAlign: 'left' }}>
            Cancelar
          </button>
          <DialogTitle style={{ flex: 2, textAlign: 'center', fontSize: 17, fontWeight: 600, color: '#000' }}>Stock</DialogTitle>
          <span style={{ flex: 1 }} />
        </div>
        <DialogDescription className="truncate" style={{ textAlign: 'center', fontSize: 14, color: '#8E8E93', padding: '0 16px 14px' }}>
          {product?.name} · hay {fmt(stockActual)}
        </DialogDescription>

        <div style={{ overflowY: 'auto', padding: '0 16px max(env(safe-area-inset-bottom), 20px)' }}>
          {/* ¿Qué pasó? */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {ACCIONES.map(({ key, titulo, detalle, color, Icono }) => {
              const activo = accion === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => cambiarAccion(key)}
                  disabled={saving}
                  style={{
                    padding: '12px 6px 10px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
                    border: activo ? `2px solid ${color}` : '2px solid transparent',
                    background: activo ? `${color}14` : '#fff',
                  }}
                >
                  <Icono style={{ width: 24, height: 24, color: activo ? color : '#8E8E93', margin: '0 auto 4px' }} />
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: activo ? color : '#000' }}>{titulo}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#8E8E93', marginTop: 1 }}>{detalle}</span>
                </button>
              );
            })}
          </div>

          {/* Cantidad */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '18px 16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={() => paso(-1)} disabled={saving} aria-label="Uno menos" style={botonPaso}>
                <Minus style={{ width: 22, height: 22, color: '#000' }} />
              </button>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                {accion !== 'conteo' && (
                  <span style={{ fontSize: 36, fontWeight: 700, color: info.color, marginRight: 2, verticalAlign: 'middle' }}>{accion === 'entra' ? '+' : '−'}</span>
                )}
                <input
                  id="stock-valor"
                  className="input-grande"
                  aria-label={accion === 'conteo' ? 'Stock contado' : 'Cantidad'}
                  value={valor}
                  onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && puedeConfirmar) {
                      e.preventDefault();
                      handleConfirmar();
                    }
                  }}
                  placeholder="0"
                  inputMode={permiteDecimal ? 'decimal' : 'numeric'}
                  autoComplete="off"
                  disabled={saving}
                  style={{
                    width: `${Math.max(1, valor.length || 1) + 0.5}ch`, maxWidth: '100%', border: 'none', outline: 'none', background: 'transparent',
                    fontSize: 44, fontWeight: 700, textAlign: 'center', verticalAlign: 'middle', color: '#000', fontVariantNumeric: 'tabular-nums', padding: 0,
                  }}
                />
              </div>
              <button type="button" onClick={() => paso(1)} disabled={saving} aria-label="Uno más" style={botonPaso}>
                <Plus style={{ width: 22, height: 22, color: '#000' }} />
              </button>
            </div>
            <p style={{ textAlign: 'center', fontSize: 15, marginTop: 6, color: quedaNegativo || (requiereCosto && !costoValido) ? '#FF3B30' : '#8E8E93' }}>
              {mensaje}
            </p>
            {accion !== 'conteo' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {[6, 12, 24, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => paso(n)}
                    disabled={saving}
                    style={{ flex: 1, height: 34, borderRadius: 17, border: 'none', background: 'rgba(118,118,128,0.12)', color: '#000', fontSize: 15, fontWeight: 600 }}
                  >
                    +{n}
                  </button>
                ))}
              </div>
            )}
          </div>

          {requiereCosto && (
            <>
              <div style={{ background: '#fff', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', minHeight: 50, marginTop: 14 }}>
                <label htmlFor="stock-costo" style={{ fontSize: 16, color: '#000', flex: 1 }}>Costo por unidad</label>
                <span style={{ fontSize: 16, color: '#000' }}>$</span>
                <input
                  id="stock-costo"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="0"
                  inputMode="decimal"
                  disabled={saving}
                  style={{ width: 90, height: 44, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: '#000' }}
                />
              </div>
              <p style={{ fontSize: 13, color: '#8E8E93', padding: '6px 16px 0', lineHeight: 1.35 }}>
                {product && product.price > 0
                  ? 'Es el último costo. Cámbialo solo si esta compra salió a otro precio.'
                  : 'El precio de venta se actualiza solo según el costo de cada compra.'}
              </p>
            </>
          )}

          {/* Botón grande abajo: lo que hay que tocar queda claro */}
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={!puedeConfirmar}
            className="boton-ios"
            style={{
              width: '100%', height: 54, borderRadius: 14, border: 'none', marginTop: 18,
              background: puedeConfirmar ? info.color : '#D1D1D6', color: '#fff', fontSize: 17, fontWeight: 600,
              cursor: puedeConfirmar ? 'pointer' : 'default',
            }}
          >
            {saving
              ? 'Guardando…'
              : !hayNumero || quedaNegativo
                ? 'Guardar'
                : accion === 'entra'
                  ? `Sumar ${fmt(cantidad!)} · queda ${fmt(nuevoStock!)}`
                  : accion === 'sale'
                    ? `Descontar ${fmt(cantidad!)} · queda ${fmt(nuevoStock!)}`
                    : `Dejar en ${fmt(nuevoStock!)}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
