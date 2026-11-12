import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';

import {
  applyComplaintFilter,
  applyComplaintOriginFilter,
  complaintOriginFilterValue,
} from './adminPanelState';
import { COMPLAINT_KIND_OPTIONS, complaintKindLabel } from './complaintKinds';
import type { ComplaintFilters as ComplaintFiltersValue } from './types';

const IOS = {
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
};

/* ------------------------------------------------------------------ */
/* Buscador (va dentro del encabezado azul)                            */
/* ------------------------------------------------------------------ */

export function BuscadorReclamos({ value, onChange }: {
  value: ComplaintFiltersValue;
  onChange: (next: ComplaintFiltersValue) => void;
}) {
  const [search, setSearch] = useState(value.search);
  const latestValueRef = useRef(value);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestValueRef.current = value;

  useEffect(() => {
    setSearch(value.search);
  }, [value.search]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  function handleSearchChange(nextSearch: string, immediate = false) {
    setSearch(nextSearch);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    const apply = () => onChange(applyComplaintFilter(latestValueRef.current, { search: nextSearch }));
    if (immediate) { apply(); return; }
    searchTimerRef.current = setTimeout(() => {
      apply();
      searchTimerRef.current = null;
    }, 300);
  }

  return (
    <div style={{ position: 'relative' }}>
      <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'rgba(255,255,255,0.75)' }} aria-hidden="true" />
      <input
        type="search"
        value={search}
        onChange={event => handleSearchChange(event.target.value)}
        placeholder="Buscar por número, correo o palabra"
        aria-label="Buscar por número, cliente o descripción"
        autoComplete="off"
        className="buscador-sobre-azul"
        style={{ width: '100%', height: 36, borderRadius: 10, border: 'none', outline: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 16, padding: search ? '0 34px' : '0 12px 0 34px' }}
      />
      {search && (
        <button type="button" onClick={() => handleSearchChange('', true)} aria-label="Borrar búsqueda"
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X style={{ width: 14, height: 14, color: '#fff' }} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filtros: tipo, origen y fechas (el estado va en las píldoras)       */
/* ------------------------------------------------------------------ */

export interface ComplaintFiltersProps {
  value: ComplaintFiltersValue;
  branches: Array<{ id: string; name: string }>;
  onChange: (next: ComplaintFiltersValue) => void;
  disabled?: boolean;
}

function originText(value: ComplaintFiltersValue, branches: Array<{ id: string; name: string }>): string {
  if (value.originType === 'branch') {
    if (!value.branchId) return 'Cualquier sucursal';
    return branches.find(branch => branch.id === value.branchId)?.name.trim() || 'Sucursal';
  }
  if (value.originType === 'production') return 'Producción / producto';
  if (value.originType === 'other') return 'Otro / no sabe';
  return 'Todos';
}

function formatShortDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}` : value;
}

export function activeComplaintExtraFilters(value: ComplaintFiltersValue): number {
  return (value.kind ? 1 : 0) + (value.originType ? 1 : 0) + (value.dateFrom || value.dateTo ? 1 : 0);
}

export function ComplaintFilters({ value, branches, onChange, disabled = false }: ComplaintFiltersProps) {
  const activos = activeComplaintExtraFilters(value);
  const [open, setOpen] = useState(activos > 0);

  function updateFilter(patch: Partial<Omit<ComplaintFiltersValue, 'page' | 'limit'>>) {
    onChange(applyComplaintFilter(value, patch));
  }

  function clearFilters() {
    onChange(applyComplaintFilter(value, { kind: '', originType: '', branchId: '', dateFrom: '', dateTo: '' }));
  }

  const originValue = complaintOriginFilterValue(value);
  const resumen = [
    value.kind ? complaintKindLabel(value.kind) : null,
    value.originType ? originText(value, branches) : null,
    value.dateFrom || value.dateTo
      ? `${value.dateFrom ? formatShortDate(value.dateFrom) : '…'} – ${value.dateTo ? formatShortDate(value.dateTo) : 'hoy'}`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <fieldset disabled={disabled} aria-label="Filtrar mensajes" style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
      <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="fila-ios"
          style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <SlidersHorizontal style={{ width: 18, height: 18, color: IOS.azul, flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: 17, color: IOS.texto }}>Filtros</span>
          <span className="truncate" style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 15, color: activos ? IOS.azul : IOS.secundario }}>
            {activos ? resumen : 'Ninguno'}
          </span>
          <ChevronDown style={{ width: 18, height: 18, color: 'rgba(60,60,67,0.3)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} aria-hidden="true" />
        </button>

        {open && (
          <>
            <Separador />
            <FilaSelect etiqueta="Tipo" valor={value.kind ? complaintKindLabel(value.kind) : 'Todos'}>
              <select
                aria-label="Tipo"
                value={value.kind}
                onChange={event => updateFilter({ kind: event.target.value as ComplaintFiltersValue['kind'] })}
                style={selectOculto}
              >
                <option value="">Todos</option>
                {COMPLAINT_KIND_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FilaSelect>
            <Separador />
            <FilaSelect etiqueta="Origen" valor={originText(value, branches)}>
              <select
                aria-label="Origen o sucursal"
                value={originValue}
                onChange={event => onChange(applyComplaintOriginFilter(value, event.target.value))}
                style={selectOculto}
              >
                <option value="">Todos</option>
                {branches.length > 0 && (
                  <optgroup label="Sucursales">
                    {branches.map(branch => <option key={branch.id} value={`branch:${branch.id}`}>{branch.name.trim()}</option>)}
                  </optgroup>
                )}
                {originValue === 'branch' && <option value="branch">Cualquier sucursal</option>}
                <option value="production">Producción / producto</option>
                <option value="other">Otro / no sabe</option>
              </select>
            </FilaSelect>
            <Separador />
            <div style={{ padding: '10px 16px' }}>
              <p style={{ fontSize: 13, color: IOS.secundario, margin: '0 0 6px' }}>Fechas</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <CampoFecha etiqueta="Desde" valor={value.dateFrom} onCambio={v => updateFilter({ dateFrom: v })} />
                <CampoFecha etiqueta="Hasta" valor={value.dateTo} onCambio={v => updateFilter({ dateTo: v })} />
              </div>
            </div>
            {activos > 0 && (
              <>
                <Separador />
                <button type="button" onClick={clearFilters} className="fila-ios"
                  style={{ width: '100%', height: 44, border: 'none', background: 'transparent', fontSize: 17, color: IOS.azul, cursor: 'pointer' }}>
                  Quitar filtros
                </button>
              </>
            )}
          </>
        )}
      </div>
    </fieldset>
  );
}

const selectOculto: React.CSSProperties = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 16,
};

function Separador() {
  return <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />;
}

function FilaSelect({ etiqueta, valor, children }: { etiqueta: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="fila-ios" style={{ position: 'relative', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
      <span style={{ fontSize: 17, color: IOS.texto }}>{etiqueta}</span>
      <span className="truncate" style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 17, color: IOS.secundario }}>{valor}</span>
      <ChevronDown style={{ width: 16, height: 16, color: 'rgba(60,60,67,0.3)', flexShrink: 0 }} aria-hidden="true" />
      {children}
    </div>
  );
}

/** Fecha nativa con su etiqueta visible: iOS no muestra placeholder en type=date. */
function CampoFecha({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRadius: 9, overflow: 'hidden', background: IOS.relleno }}>
      {/* appearance:none + display:block: sin esto el date de iOS impone su ancho mínimo y se sale de la tarjeta. */}
      <input
        type="date"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-label={etiqueta}
        style={{
          display: 'block', width: '100%', boxSizing: 'border-box', height: 36, border: 'none', padding: '0 10px',
          WebkitAppearance: 'none', appearance: 'none', background: 'transparent', fontSize: 15,
          color: valor ? IOS.texto : 'transparent',
        }}
      />
      {!valor && (
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: IOS.secundario, pointerEvents: 'none' }}>
          {etiqueta}
        </span>
      )}
    </div>
  );
}
