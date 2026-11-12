import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
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

export function StockAdjustDialog({
  open,
  onOpenChange,
  product,
  enLotes = false,
  onConfirm,
  saving = false,
}: StockAdjustDialogProps) {
  const [modo, setModo] = useState<ModoAjuste>('sumar');
  const [valor, setValor] = useState('');
  const [costo, setCosto] = useState('');

  const stockActual = product?.stock ?? 0;

  // Resetear al abrir/cambiar de producto: arrastrar el valor de un producto
  // anterior es la clase de error que deja stock mal cargado sin que se note.
  // Con el costo es todavía más importante: un costo viejo de OTRO producto
  // se vería como una sugerencia legítima y se confirmaría sin mirarlo.
  useEffect(() => {
    if (open) {
      setModo('sumar');
      setValor('');
      // Se sugiere el último costo conocido (el precio actual, que en un
      // producto con lotes YA ES el costo del lote activo) para no obligar
      // a retipear el mismo número cuando no cambió. Sigue siendo editable:
      // si compró a otro precio, lo pisa.
      setCosto(product && product.price > 0 ? String(product.price) : '');
    }
  }, [open, product?.id]);

  // Se acepta el signo menos para poder restar en modo "sumar" (mermas o
  // roturas) sin necesitar un modo aparte. Decimales solo si el producto se
  // vende por fracción; se acepta coma o punto porque en el teclado de un
  // celular en español lo natural es la coma.
  const permiteDecimal = product?.allowDecimal === true;
  const texto = valor.trim().replace(',', '.');
  const formatoValido = permiteDecimal ? /^-?(\d+(\.\d+)?|\.\d+)$/ : /^-?\d+$/;
  const cantidad = formatoValido.test(texto) ? Number(texto) : null;
  const hayNumero = cantidad !== null;
  // Redondeo a 3 decimales: 6.8 + 0.1 en JS da 6.8999999999999995, y eso
  // terminaría guardado tal cual en products.stock (numeric).
  const nuevoStock = !hayNumero
    ? null
    : Math.round((modo === 'sumar' ? stockActual + cantidad : cantidad) * 1000) / 1000;
  const quedaNegativo = nuevoStock !== null && nuevoStock < 0;

  // El costo solo es obligatorio cuando esto va a ser una reposición real
  // (modo sumar, cantidad positiva) de un producto en alcance.
  const esReposicion = modo === 'sumar' && hayNumero && cantidad! > 0;
  const requiereCosto = enLotes && esReposicion;
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

  // Atajos de cantidad (solo al sumar): suman sobre lo ya escrito.
  const sumarAtajo = (n: number) => {
    const base = hayNumero ? cantidad! : 0;
    setValor(String(Math.round((base + n) * 1000) / 1000));
  };

  const textoBoton: React.CSSProperties = { background: 'none', border: 'none', padding: '6px 0', fontSize: 17, color: '#007AFF', cursor: 'pointer' };

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
          <DialogTitle style={{ flex: 2, textAlign: 'center', fontSize: 17, fontWeight: 600, color: '#000' }}>Ajustar stock</DialogTitle>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={!puedeConfirmar}
            style={{ ...textoBoton, flex: 1, textAlign: 'right', fontWeight: 600, color: puedeConfirmar ? '#007AFF' : '#C7C7CC', cursor: puedeConfirmar ? 'pointer' : 'default' }}
          >
            {saving ? 'Guardando' : 'Confirmar'}
          </button>
        </div>
        <DialogDescription className="truncate" style={{ textAlign: 'center', fontSize: 13, color: '#8E8E93', padding: '0 16px 12px' }}>
          {product?.name}
        </DialogDescription>

        <div style={{ overflowY: 'auto', padding: '0 16px max(env(safe-area-inset-bottom), 24px)' }}>
          {/* Modo */}
          <div role="group" style={{ display: 'flex', padding: 2, borderRadius: 9, background: 'rgba(118,118,128,0.12)', marginBottom: 16 }}>
            {([['sumar', 'Sumar o restar'], ['total', 'Corregir total']] as const).map(([m, t]) => {
              const activo = modo === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setModo(m)}
                  disabled={saving}
                  style={{
                    flex: 1, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 14,
                    fontWeight: activo ? 600 : 500, color: '#000',
                    background: activo ? '#fff' : 'transparent',
                    boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Antes → después */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 16px 14px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 14 }}>
              <div>
                <p style={{ fontSize: 12, color: '#8E8E93' }}>Ahora</p>
                <p style={{ fontSize: 26, fontWeight: 600, color: '#8E8E93', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>{fmt(stockActual)}</p>
              </div>
              <span style={{ fontSize: 22, color: '#C7C7CC', paddingBottom: 8 }}>→</span>
              <div>
                <p style={{ fontSize: 12, color: '#8E8E93' }}>Queda</p>
                <p style={{ fontSize: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: quedaNegativo ? '#FF3B30' : nuevoStock === null ? '#C7C7CC' : '#000' }}>
                  {nuevoStock === null ? '—' : fmt(nuevoStock)}
                </p>
              </div>
            </div>
            <p style={{ fontSize: 13, marginTop: 4, color: quedaNegativo || (requiereCosto && !costoValido && hayNumero) ? '#FF3B30' : '#8E8E93' }}>
              {!hayNumero
                ? (modo === 'sumar' ? 'Escribe cuánto entra (o resta con −)' : 'Escribe el stock real contado')
                : quedaNegativo
                  ? 'El stock no puede quedar negativo'
                  : requiereCosto && !costoValido
                    ? 'Falta el costo de esta compra'
                    : modo === 'sumar'
                      ? `${cantidad! < 0 ? 'Sale' : 'Entra'} ${fmt(Math.abs(cantidad!))}`
                      : 'Reemplaza el stock actual'}
            </p>
          </div>

          {/* Cantidad */}
          <p style={{ fontSize: 13, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.02em', padding: '20px 16px 6px' }}>
            {modo === 'sumar' ? 'Cantidad' : 'Stock contado'}
          </p>
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56 }}>
              {modo === 'sumar' && (
                <button
                  type="button"
                  onClick={() => setValor((v) => (v.trim().startsWith('-') ? v.trim().slice(1) : `-${v.trim()}`))}
                  disabled={saving}
                  aria-label="Cambiar entre sumar y restar"
                  style={{ width: 44, height: 34, borderRadius: 8, border: 'none', background: 'rgba(118,118,128,0.12)', fontSize: 18, fontWeight: 600, color: hayNumero && cantidad! < 0 ? '#FF3B30' : '#34C759', flexShrink: 0 }}
                >
                  {hayNumero && cantidad! < 0 ? '−' : '+'}
                </button>
              )}
              <input
                id="stock-valor"
                aria-label={modo === 'sumar' ? 'Cuánto sumar' : 'Stock real contado'}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && puedeConfirmar) {
                    e.preventDefault();
                    handleConfirmar();
                  }
                }}
                placeholder="0"
                inputMode={permiteDecimal ? 'decimal' : 'numeric'}
                autoFocus
                autoComplete="off"
                disabled={saving}
                style={{ flex: 1, minWidth: 0, height: 56, border: 'none', outline: 'none', background: 'transparent', fontSize: 28, fontWeight: 600, textAlign: 'right', color: '#000', fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
            {modo === 'sumar' && (
              <>
                <div style={{ height: 0.5, background: 'rgba(60,60,67,0.18)', marginLeft: 16 }} />
                <div style={{ display: 'flex', gap: 8, padding: '10px 16px' }}>
                  {[1, 6, 12, 24].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => sumarAtajo(n)}
                      disabled={saving}
                      style={{ flex: 1, height: 34, borderRadius: 17, border: 'none', background: 'rgba(0,122,255,0.1)', color: '#007AFF', fontSize: 15, fontWeight: 600 }}
                    >
                      +{n}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#8E8E93', padding: '6px 16px 0', lineHeight: 1.35 }}>
            {modo === 'sumar'
              ? 'Usa el botón +/− para restar mermas o roturas.'
              : 'Úsalo después de contar: el stock queda en este número.'}
          </p>

          {requiereCosto && (
            <>
              <p style={{ fontSize: 13, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.02em', padding: '20px 16px 6px' }}>Costo por unidad</p>
              <div style={{ background: '#fff', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', minHeight: 48 }}>
                <label htmlFor="stock-costo" style={{ fontSize: 16, color: '#000', flex: 1 }}>Costo de esta compra</label>
                <span style={{ fontSize: 16, color: costo ? '#000' : '#C7C7CC' }}>$</span>
                <input
                  id="stock-costo"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="0"
                  inputMode="decimal"
                  disabled={saving}
                  style={{ width: 90, height: 44, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, textAlign: 'left', color: '#000' }}
                />
              </div>
              <p style={{ fontSize: 13, color: '#8E8E93', padding: '6px 16px 0', lineHeight: 1.35 }}>
                {product && product.price > 0
                  ? 'Se sugiere el último costo. Déjalo así si no cambió, o escribe el nuevo si compraste más caro o más barato.'
                  : 'Producto de Distribuidora: el precio de venta se actualiza solo según el costo de cada compra.'}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
