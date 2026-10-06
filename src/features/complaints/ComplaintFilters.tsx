import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { applyComplaintFilter, hasActiveComplaintFilters } from './adminPanelState';
import type { ComplaintFilters as ComplaintFiltersValue } from './types';

export interface ComplaintFiltersProps {
  value: ComplaintFiltersValue;
  branches: Array<{ id: string; name: string }>;
  onChange: (next: ComplaintFiltersValue) => void;
  disabled?: boolean;
}

const selectClassName = 'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';

export function ComplaintFilters({ value, branches, onChange, disabled = false }: ComplaintFiltersProps) {
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
    onChange(applyComplaintFilter(value, {
      search: '',
      status: '',
      originType: '',
      branchId: '',
      dateFrom: '',
      dateTo: '',
    }));
  }

  return (
    <fieldset disabled={disabled} aria-labelledby="complaint-filters-title" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <legend id="complaint-filters-title" className="text-base font-bold text-gray-900">Buscar y filtrar</legend>
      <div className="flex justify-end">
        {hasActiveComplaintFilters({ ...value, search }) && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            <RotateCcw aria-hidden="true" />
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-4">
          <Label htmlFor="complaints-search">Número, cliente o descripción</Label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input
              id="complaints-search"
              type="search"
              value={search}
              onChange={event => handleSearchChange(event.target.value)}
              placeholder="Ej.: REC-2026, correo o palabras clave"
              autoComplete="off"
              className="h-10 pl-9"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="complaints-status">Estado</Label>
          <select
            id="complaints-status"
            value={value.status}
            onChange={event => updateFilter({ status: event.target.value as ComplaintFiltersValue['status'] })}
            className={`${selectClassName} mt-2`}
          >
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="attended">Atendido</option>
          </select>
        </div>

        <div>
          <Label htmlFor="complaints-origin">Origen</Label>
          <select
            id="complaints-origin"
            value={value.originType}
            onChange={event => updateFilter({ originType: event.target.value as ComplaintFiltersValue['originType'] })}
            className={`${selectClassName} mt-2`}
          >
            <option value="">Todos</option>
            <option value="branch">Sucursal</option>
            <option value="production">Producción / producto</option>
            <option value="other">Otro / no sabe</option>
          </select>
        </div>

        <div>
          <Label htmlFor="complaints-branch">Sucursal</Label>
          <select
            id="complaints-branch"
            value={value.branchId}
            onChange={event => updateFilter({ branchId: event.target.value })}
            className={`${selectClassName} mt-2`}
          >
            <option value="">Todas</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="complaints-date-from">Desde</Label>
            <Input
              id="complaints-date-from"
              type="date"
              value={value.dateFrom}
              onChange={event => updateFilter({ dateFrom: event.target.value })}
              className="mt-2 h-10"
            />
          </div>
          <div>
            <Label htmlFor="complaints-date-to">Hasta</Label>
            <Input
              id="complaints-date-to"
              type="date"
              value={value.dateTo}
              onChange={event => updateFilter({ dateTo: event.target.value })}
              className="mt-2 h-10"
            />
          </div>
        </div>
      </div>
    </fieldset>
  );
}
