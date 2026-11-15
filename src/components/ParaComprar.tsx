import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import type { AjustesReposicion, FilaReposicion } from '../utils/api';
import { etiquetaMotivo, textoListaCompra } from '../utils/listaCompra';
import { compartirTexto, exportarLibroExcel } from '../utils/descargarArchivo';

/**
 * Lista «Para comprar» del panel de Distribuidora (solo admin). Recibe las filas ya
 * filtradas por la categoría y la búsqueda del panel. Mismo estilo iOS inline.
 */

const IOS = { tarjeta: '#FFFFFF', texto: '#000000', secundario: '#8E8E93', separador: 'rgba(60, 60, 67, 0.18)', azul: '#007AFF', rojo: '#FF3B30', naranja: '#FF9500' };
const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

interface Props {
  filas: FilaReposicion[];
  ajustes: AjustesReposicion | null;
  cargando: boolean;
  error: boolean;
  onReintentar: () => void;
  onGuardarAjustes: (a: AjustesReposicion) => Promise<void>;
}

export function ParaComprar({ filas, ajustes, cargando, error, onReintentar, onGuardarAjustes }: Props) {
  const [cobertura, setCobertura] = useState(String(ajustes?.coverageDays ?? 7));
  const [aviso, setAviso] = useState(String(ajustes?.alertDays ?? 3));
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (ajustes) {
      setCobertura(String(ajustes.coverageDays));
      setAviso(String(ajustes.alertDays));
    }
  }, [ajustes]);

  const guardar = async () => {
    const nuevo = { coverageDays: Number(cobertura), alertDays: Number(aviso) };
    if (ajustes && nuevo.coverageDays === ajustes.coverageDays && nuevo.alertDays === ajustes.alertDays) return;
    setGuardando(true);
    try {
      await onGuardarAjustes(nuevo);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron guardar los ajustes');
      if (ajustes) {
        setCobertura(String(ajustes.coverageDays));
        setAviso(String(ajustes.alertDays));
      }
    } finally {
      setGuardando(false);
    }
  };

  const compartir = async () => {
    if (filas.length === 0) return;
    try {
      const r = await compartirTexto(textoListaCompra(filas, new Date()), 'Para comprar');
      if (r === 'copiado') toast.success('Lista copiada: pégala en WhatsApp');
    } catch {
      toast.error('No se pudo compartir la lista');
    }
  };

  const exportar = async () => {
    if (filas.length === 0) return;
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const hoja = XLSX.utils.json_to_sheet(filas.map(f => ({
        'Producto': f.name,
        'Stock': f.stock,
        'Sale por día': f.rotacionDiaria,
        'Alcanza (días)': f.diasQueAlcanza ?? '',
        'Comprar': f.comprar,
        'Motivo': etiquetaMotivo(f),
      })));
      hoja['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 30 }];
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Para comprar');
      await exportarLibroExcel(libro, `Para_comprar_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch {
      toast.error('No se pudo generar el Excel');
    } finally {
      setExportando(false);
    }
  };

  const inputDias: React.CSSProperties = { width: 56, height: 32, borderRadius: 8, border: `0.5px solid ${IOS.separador}`, textAlign: 'center', fontSize: 16, fontVariantNumeric: 'tabular-nums' };

  return (
    <section>
      <div style={{ ...tarjeta, marginBottom: 12, padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          Comprar para
          <input type="number" inputMode="numeric" min={1} max={60} value={cobertura} onChange={e => setCobertura(e.target.value)} onBlur={guardar} disabled={guardando} style={inputDias} aria-label="Días de cobertura" />
          días
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          Avisar con menos de
          <input type="number" inputMode="numeric" min={1} max={30} value={aviso} onChange={e => setAviso(e.target.value)} onBlur={guardar} disabled={guardando} style={inputDias} aria-label="Días de aviso" />
          días
        </label>
        {guardando && <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: IOS.secundario }} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 6px' }}>
        <h3 style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', fontWeight: 400 }}>
          {cargando || error ? 'Para comprar' : `${filas.length} productos · lo más urgente primero`}
        </h3>
        <span style={{ display: 'flex', gap: 14 }}>
          <button type="button" onClick={compartir} disabled={filas.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 4, color: IOS.azul, fontSize: 15, background: 'none', border: 'none', opacity: filas.length ? 1 : 0.4 }}>
            <MessageCircle style={{ width: 16, height: 16 }} /> Compartir
          </button>
          <button type="button" onClick={exportar} disabled={filas.length === 0 || exportando} style={{ display: 'flex', alignItems: 'center', gap: 4, color: IOS.azul, fontSize: 15, background: 'none', border: 'none', opacity: filas.length ? 1 : 0.4 }}>
            <FileSpreadsheet style={{ width: 16, height: 16 }} /> Excel
          </button>
        </span>
      </div>

      <div style={tarjeta}>
        {cargando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: IOS.secundario }} />
          </div>
        ) : error ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: IOS.rojo }}>No se pudo calcular la reposición.</p>
            <p style={{ fontSize: 13, color: IOS.secundario, marginTop: 4 }}>La lista está vacía porque falló el cálculo, no porque no haya nada que comprar.</p>
            <button type="button" onClick={onReintentar} style={{ marginTop: 10, color: IOS.azul, fontSize: 16, background: 'none', border: 'none' }}>Reintentar</button>
          </div>
        ) : filas.length === 0 ? (
          <p style={{ padding: '28px 16px', textAlign: 'center', fontSize: 15, color: IOS.secundario }}>
            Nada por comprar: todo alcanza para más de {ajustes?.alertDays ?? 3} días.
          </p>
        ) : (
          filas.map((f, i) => {
            const color = f.motivo === 'agotado' ? IOS.rojo : f.motivo === 'sin_ventas_recientes' ? IOS.secundario : IOS.naranja;
            return (
              <div key={f.productId}>
                {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 34 }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 60, padding: '8px 16px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', fontSize: 15, color: IOS.texto }}>{f.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: IOS.secundario }}>
                      Stock {fmt(f.stock)}{f.rotacionDiaria > 0 ? ` · sale ${fmt(f.rotacionDiaria)}/día` : ''} · {etiquetaMotivo(f)}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, color: IOS.secundario }}>Comprar</span>
                    <span style={{ display: 'block', fontSize: 20, fontWeight: 700, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>{fmt(f.comprar)}</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <p style={{ fontSize: 13, color: IOS.secundario, padding: '8px 16px 0', lineHeight: 1.35 }}>
        Calculado con los despachos de las últimas 4 semanas. Si un producto estuvo agotado parte del mes, la sugerencia puede quedar corta.
      </p>
    </section>
  );
}
