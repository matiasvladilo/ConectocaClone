import { useEffect, useRef, useState } from 'react';
import { CalendarDays, RotateCcw, Search } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  applyComplaintFilter,
  applyComplaintOriginFilter,
  complaintOriginFilterValue,
  hasActiveComplaintFilters,
} from './adminPanelState';
import { COMPLAINT_KIND_OPTIONS } from './complaintKinds';
import type { ComplaintFilters as ComplaintFiltersValue } from './types';

export interface ComplaintFiltersProps {
  value: ComplaintFiltersValue;
  branches: Array<{ id: string; name: string }>;
  onChange: (next: ComplaintFiltersValue) => void;
  disabled?: boolean;
}

const selectClassName = 'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50';

export function ComplaintFilters({ value, branches, onChange, disabled = false }: ComplaintFiltersProps) {
  const [search, setSearch] = useState(value.search);
  const [datesOpen, setDatesOpen] = useState(false);
  const latestValueRef = useRef(value);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestValueRef.current = value;

  useEffect(() => {
    setSearch(value.search);
  }, [value.search]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      onChange(applyComplaintFilter(latestValueRef.current, { search: nextSearch }));
      searchTimerRef.current = null;
    }, 300);
  }

  function updateFilter(patch: Partial<Omit<ComplaintFiltersValue, 'page' | 'limit'>>) {
    onChange(applyComplaintFilter(value, patch));
  }

  function clearFilters() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    setSearch('');
    setDatesOpen(false);
    onChange(applyComplaintFilter(value, {
      search: '',
      kind: '',
      status: '',
      originType: '',
      branchId: '',
      dateFrom: '',
      dateTo: '',
    }));
  }

  const originValue = complaintOriginFilterValue(value);
  const hasDates = Boolean(value.dateFrom || value.dateTo);
  const showDates = datesOpen || hasDates;

  return (
    <fieldset disabled={disabled} aria-label="Buscar y filtrar mensajes" className="space-y-3">
      <div className="relative">
        <Label htmlFor="complaints-search" className="sr-only">Número, cliente o descripción</Label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <Input
          id="complaints-search"
          type="search"
          value={search}
          onChange={event => handleSearchChange(event.target.value)}
          placeholder="Buscar por número, correo o palabras clave"
          autoComplete="off"
          className="h-10 bg-white pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="complaints-kind" className="sr-only">Tipo</Label>
          <select
            id="complaints-kind"
            value={value.kind}
            onChange={event => updateFilter({ kind: event.target.value as ComplaintFiltersValue['kind'] })}
            className={selectClassName}
          >
            <option value="">Tipo: todos</option>
            {COMPLAINT_KIND_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="complaints-status" className="sr-only">Estado</Label>
          <select
            id="complaints-status"
            value={value.status}
            onChange={event => updateFilter({ status: event.target.value as ComplaintFiltersValue['status'] })}
            className={selectClassName}
          >
            <option value="">Estado: todos</option>
            <option value="pending">Pendientes</option>
            <option value="attended">Atendidos</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="complaints-origin" className="sr-only">Origen o sucursal</Label>
        <select
          id="complaints-origin"
          value={originValue}
          onChange={event => onChange(applyComplaintOriginFilter(value, event.target.value))}
          className={selectClassName}
        >
          <option value="">Origen: todos</option>
          {branches.length > 0 && (
            <optgroup label="Sucursales">
              {branches.map(branch => <option key={branch.id} value={`branch:${branch.id}`}>{branch.name.trim()}</option>)}
            </optgroup>
          )}
          {originValue === 'branch' && <option value="branch">Cualquier sucursal</option>}
          <option value="production">Producción / producto</option>
          <option value="other">Otro / no sabe</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDatesOpen(open => !open)}
          aria-expanded={showDates}
          aria-controls="complaints-dates"
        >
          <CalendarDays aria-hidden="true" />
          Fechas
        </Button>
        {hasActiveComplaintFilters({ ...value, search }) && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            <RotateCcw aria-hidden="true" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {showDates && (
        <div id="complaints-dates" className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="complaints-date-from">Desde</Label>
            <Input
              id="complaints-date-from"
              type="date"
              value={value.dateFrom}
              onChange={event => updateFilter({ dateFrom: event.target.value })}
              className="mt-2 h-10 bg-white"
            />
          </div>
          <div>
            <Label htmlFor="complaints-date-to">Hasta</Label>
            <Input
              id="complaints-date-to"
              type="date"
              value={value.dateTo}
              onChange={event => updateFilter({ dateTo: event.target.value })}
              className="mt-2 h-10 bg-white"
            />
          </div>
        </div>
      )}
    </fieldset>
  );
}
