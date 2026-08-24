import { useMemo } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AlertTriangle } from 'lucide-react';
import type { Product } from '../utils/api';
import { componerNombre, UNIDADES_PRESENTACION, type ProductNameParts } from '../utils/productName';
import { buscarSimilares } from '../utils/productSimilarity';

interface ProductNameFieldsProps {
  value: ProductNameParts;
  onChange: (value: ProductNameParts) => void;
  productosExistentes: Product[];
}

/**
 * Campos fijos para el nombre de un producto NUEVO. Reemplazan al input de texto
 * libre solo en el alta: al editar, el nombre sigue siendo libre.
 */
export function ProductNameFields({ value, onChange, productosExistentes }: ProductNameFieldsProps) {
  const set = (cambios: Partial<ProductNameParts>) => onChange({ ...value, ...cambios });

  const nombreCompuesto = componerNombre(value);
  const similares = useMemo(
    () => buscarSimilares(value.marca, productosExistentes),
    [value.marca, productosExistentes],
  );

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="marca">Marca / producto *</Label>
        <Input
          id="marca"
          value={value.marca}
          onChange={(e) => set({ marca: e.target.value })}
          placeholder="Ej: Coca Cola"
          autoComplete="off"
        />
      </div>

      {/* `grid-cols-3` a secas NO existe en el CSS precompilado: solo
          sm/md/lg:grid-cols-3. Se usa grid-cols-1 + sm:grid-cols-3, que además
          apila bien en pantallas angostas. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <Label htmlFor="cantidad">Presentación</Label>
          <Input
            id="cantidad"
            value={value.cantidad}
            onChange={(e) => set({ cantidad: e.target.value })}
            placeholder="591"
            inputMode="decimal"
            autoComplete="off"
          />
        </div>

        <div>
          <Label htmlFor="unidad">Unidad</Label>
          <Select
            value={value.unidad || 'none'}
            onValueChange={(v) => set({ unidad: v === 'none' ? '' : v, unidadOtro: '' })}
          >
            <SelectTrigger id="unidad">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {UNIDADES_PRESENTACION.map((u) => (
                <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="unidades">Unidades</Label>
          <Input
            id="unidades"
            value={value.unidades}
            onChange={(e) => set({ unidades: e.target.value })}
            placeholder="1"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
      </div>

      {value.unidad === 'otro' && (
        <div>
          <Label htmlFor="unidadOtro">¿Qué unidad?</Label>
          <Input
            id="unidadOtro"
            value={value.unidadOtro}
            onChange={(e) => set({ unidadOtro: e.target.value })}
            placeholder="Ej: pack"
            autoComplete="off"
          />
        </div>
      )}

      {/* Vista previa: el nombre que se va a guardar, tal cual. */}
      <div
        className="rounded-lg py-2 px-3"
        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
      >
        {nombreCompuesto ? (
          <span className="text-blue-700 text-sm">
            Se va a guardar como: <strong>{nombreCompuesto}</strong>
          </span>
        ) : (
          <span className="text-gray-500 text-sm">Completá la marca para ver el nombre</span>
        )}
      </div>

      {/* Aviso, NO bloqueo: dos presentaciones distintas del mismo producto son
          un caso normal en una distribuidora, y bloquear lo haría imposible. */}
      {similares.length > 0 && (
        <div
          className="rounded-lg py-2 px-3"
          style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}
        >
          <div className="flex items-center gap-2 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Ya existen productos parecidos:
          </div>
          <ul className="mt-1">
            {similares.map((p) => (
              <li key={p.id} className="text-xs text-amber-700">
                • {p.name}
                {(p.unlimitedStock || p.stock === -1) ? ' (stock ilimitado)' : ` (stock ${p.stock})`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-1">
            Si es alguno de estos, cancelá y ajustá el que ya existe en vez de crear otro.
          </p>
        </div>
      )}
    </div>
  );
}
