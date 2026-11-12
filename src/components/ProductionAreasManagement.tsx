import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';
import { productionAreasAPI, productsAPI, type ProductionArea } from '../utils/api';
import {
  ArrowLeft,
  Plus,
  Check,
  ChevronRight,
  Loader2,
  Factory,
  Briefcase,
  ChefHat,
  Utensils,
  Coffee,
  Pizza,
  Cookie,
  IceCream,
  Wheat,
  UtensilsCrossed,
  Flame,
  Snowflake,
  ShoppingBag,
  Package,
} from 'lucide-react';

interface ProductionAreasManagementProps {
  onBack: () => void;
  accessToken: string | null;
}

const ICON_OPTIONS = [
  { name: 'Briefcase', icon: Briefcase, label: 'Negocio' },
  { name: 'ChefHat', icon: ChefHat, label: 'Chef' },
  { name: 'Utensils', icon: Utensils, label: 'Cubiertos' },
  { name: 'Coffee', icon: Coffee, label: 'Café' },
  { name: 'Pizza', icon: Pizza, label: 'Pizza' },
  { name: 'Cookie', icon: Cookie, label: 'Panadería' },
  { name: 'IceCream', icon: IceCream, label: 'Helado' },
  { name: 'Wheat', icon: Wheat, label: 'Trigo' },
  { name: 'UtensilsCrossed', icon: UtensilsCrossed, label: 'Cocina' },
  { name: 'Flame', icon: Flame, label: 'Cocina caliente' },
  { name: 'Snowflake', icon: Snowflake, label: 'Cocina fría' },
  { name: 'ShoppingBag', icon: ShoppingBag, label: 'Bolsa' },
  { name: 'Package', icon: Package, label: 'Paquete' },
  { name: 'Factory', icon: Factory, label: 'Fábrica' },
];

const COLOR_OPTIONS = [
  { value: '#0059FF', label: 'Azul' },
  { value: '#10B981', label: 'Verde' },
  { value: '#F59E0B', label: 'Amarillo' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#8B5CF6', label: 'Morado' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#06B6D4', label: 'Cian' },
  { value: '#F97316', label: 'Naranja' },
];

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  azul: '#007AFF',
  rojo: '#FF3B30',
};

const FORM_VACIO = { name: '', description: '', color: '#0059FF', icon: 'Briefcase' };

function iconoDe(nombre?: string) {
  return ICON_OPTIONS.find((o) => o.name === nombre)?.icon ?? Briefcase;
}

export function ProductionAreasManagement({ onBack, accessToken }: ProductionAreasManagementProps) {
  const [areas, setAreas] = useState<ProductionArea[]>([]);
  const [loading, setLoading] = useState(true);
  // Cuántos productos tiene asignados cada área (informativo; si falla, no se muestra).
  const [productosPorArea, setProductosPorArea] = useState<Record<string, number> | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingArea, setEditingArea] = useState<ProductionArea | null>(null);
  const [formData, setFormData] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const loadAreas = useCallback(async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setAreas(await productionAreasAPI.getAll(accessToken));
    } catch (error: any) {
      console.error('Error loading production areas:', error);
      toast.error(error.message || 'Error al cargar las áreas de producción');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadConteos = useCallback(async () => {
    if (!accessToken) return;
    try {
      const productos = await productsAPI.getAll(accessToken);
      const conteo: Record<string, number> = {};
      for (const p of productos) {
        if (p.productionAreaId) conteo[p.productionAreaId] = (conteo[p.productionAreaId] ?? 0) + 1;
      }
      setProductosPorArea(conteo);
    } catch {
      setProductosPorArea(null);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAreas();
    void loadConteos();
  }, [loadAreas, loadConteos]);

  const abrirNueva = () => {
    setEditingArea(null);
    setFormData(FORM_VACIO);
    setConfirmandoBorrar(false);
    setShowDialog(true);
  };

  const abrirEditar = (area: ProductionArea) => {
    setEditingArea(area);
    setFormData({
      name: area.name,
      description: area.description || '',
      color: area.color || '#0059FF',
      icon: area.icon || 'Briefcase',
    });
    setConfirmandoBorrar(false);
    setShowDialog(true);
  };

  const cerrar = () => {
    if (guardando || borrando) return;
    setShowDialog(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) {
      toast.error('No hay sesión activa');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setGuardando(true);
    try {
      const datos = { ...formData, name: formData.name.trim(), description: formData.description.trim() };
      if (editingArea) {
        await productionAreasAPI.update(accessToken, editingArea.id, datos);
        toast.success('Área actualizada');
      } else {
        await productionAreasAPI.create(accessToken, datos);
        toast.success('Área creada');
      }
      setShowDialog(false);
      await loadAreas();
    } catch (error: any) {
      console.error('Error saving production area:', error);
      toast.error(error.message || 'Error al guardar el área de producción');
    } finally {
      setGuardando(false);
    }
  };

  const handleDelete = async () => {
    if (!accessToken || !editingArea) return;
    setBorrando(true);
    try {
      await productionAreasAPI.delete(accessToken, editingArea.id);
      toast.success(`Área "${editingArea.name}" eliminada`);
      setShowDialog(false);
      await Promise.all([loadAreas(), loadConteos()]);
    } catch (error: any) {
      console.error('Error deleting production area:', error);
      toast.error(error.message || 'Error al eliminar el área de producción');
    } finally {
      setBorrando(false);
      setConfirmandoBorrar(false);
    }
  };

  const IconoForm = iconoDe(formData.icon);
  const productosDelArea = editingArea && productosPorArea ? productosPorArea[editingArea.id] ?? 0 : null;

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-7xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" className="boton-ios" style={botonRedondo}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Áreas de producción</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Dónde se prepara cada producto</p>
            </div>
            <button type="button" onClick={abrirNueva} aria-label="Nueva área" className="boton-ios" style={botonRedondo}>
              <Plus style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto" style={{ padding: '20px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: IOS.secundario }} />
          </div>
        ) : areas.length === 0 ? (
          <div style={{ ...tarjeta, padding: '36px 24px', textAlign: 'center' }}>
            <Factory style={{ width: 44, height: 44, color: '#C7C7CC', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px', color: IOS.texto }}>Todavía no hay áreas</p>
            <p style={{ fontSize: 15, color: IOS.secundario, margin: '0 0 18px', lineHeight: 1.4 }}>
              Crea áreas como Panadería, Pastelería o Cocina para separar los pedidos por quién los prepara.
            </p>
            <button type="button" onClick={abrirNueva} className="boton-ios"
              style={{ height: 44, padding: '0 20px', borderRadius: 22, border: 'none', background: IOS.azul, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
              Crear la primera área
            </button>
          </div>
        ) : (
          <>
            <h2 style={tituloSeccion}>{areas.length} {areas.length === 1 ? 'área' : 'áreas'}</h2>
            <ul style={{ ...tarjeta, listStyle: 'none', margin: 0, padding: 0 }}>
              {areas.map((area, i) => {
                const Icono = iconoDe(area.icon);
                const color = area.color || '#0059FF';
                const n = productosPorArea ? productosPorArea[area.id] ?? 0 : null;
                return (
                  <li key={area.id}>
                    {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 68 }} />}
                    <button type="button" onClick={() => abrirEditar(area)} className="fila-ios"
                      style={{ width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      <span style={{ width: 40, height: 40, borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icono style={{ width: 21, height: 21, color: '#fff' }} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="truncate" style={{ display: 'block', fontSize: 17, color: IOS.texto }}>{area.name}</span>
                        {area.description && (
                          <span className="truncate" style={{ display: 'block', fontSize: 14, color: IOS.secundario }}>{area.description}</span>
                        )}
                      </span>
                      {n !== null && (
                        <span style={{ fontSize: 15, color: IOS.secundario, flexShrink: 0 }}>
                          {n} {n === 1 ? 'producto' : 'productos'}
                        </span>
                      )}
                      <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC', flexShrink: 0 }} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p style={{ fontSize: 13, color: IOS.secundario, margin: '8px 16px 0', lineHeight: 1.4 }}>
              El área de cada producto se elige al editar el producto.
            </p>
          </>
        )}
      </main>

      {/* Hoja: nueva / editar */}
      <Dialog open={showDialog} onOpenChange={(abierto) => { if (!abierto) cerrar(); }}>
        <DialogContent
          className="hoja-ios"
          onCloseAutoFocus={(e) => e.preventDefault()}
          style={{
            top: 'auto', bottom: 0, left: 0, right: 0, translate: 'none', margin: '0 auto',
            width: '100%', maxWidth: 640, height: '92dvh', padding: 0, gap: 0, border: 'none',
            borderRadius: '14px 14px 0 0', background: IOS.fondo, display: 'flex', flexDirection: 'column',
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 10px', gap: 8 }}>
              <button type="button" onClick={cerrar} disabled={guardando || borrando} style={{ ...textoBoton, flex: 1, textAlign: 'left' }}>
                Cancelar
              </button>
              <DialogTitle className="truncate" style={{ fontSize: 17, fontWeight: 600, color: IOS.texto, textAlign: 'center', flex: 2 }}>
                {editingArea ? 'Editar área' : 'Nueva área'}
              </DialogTitle>
              <button type="submit" disabled={guardando || borrando || !formData.name.trim()}
                style={{ ...textoBoton, flex: 1, textAlign: 'right', fontWeight: 600, opacity: formData.name.trim() ? 1 : 0.4, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                {guardando && <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />}
                {guardando ? 'Guardando' : editingArea ? 'Guardar' : 'Crear'}
              </button>
            </div>
            <DialogDescription className="sr-only">Nombre, color e ícono del área de producción.</DialogDescription>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 16px max(env(safe-area-inset-bottom), 24px)' }}>
              {/* Vista previa */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 18px' }}>
                <span style={{ width: 72, height: 72, borderRadius: 18, background: formData.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 18px ${formData.color}55` }}>
                  <IconoForm style={{ width: 36, height: 36, color: '#fff' }} />
                </span>
                <p className="truncate" style={{ maxWidth: '100%', fontSize: 20, fontWeight: 700, margin: '12px 0 0', color: formData.name.trim() ? IOS.texto : '#C7C7CC' }}>
                  {formData.name.trim() || 'Nombre del área'}
                </p>
              </div>

              <div style={tarjeta}>
                <input
                  aria-label="Nombre"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre (ej. Panadería)"
                  autoFocus={!editingArea}
                  style={campo}
                />
                <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />
                <textarea
                  aria-label="Descripción"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción (opcional)"
                  rows={2}
                  style={{ ...campo, height: 'auto', padding: '11px 16px', resize: 'none', lineHeight: 1.4, fontFamily: 'inherit' }}
                />
              </div>

              <h3 style={tituloSeccion}>Color</h3>
              <div style={{ ...tarjeta, padding: '14px 12px', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, justifyItems: 'center' }}>
                {COLOR_OPTIONS.map((c) => {
                  const activo = formData.color === c.value;
                  return (
                    <button key={c.value} type="button" aria-label={c.label} aria-pressed={activo}
                      onClick={() => setFormData({ ...formData, color: c.value })}
                      style={{
                        width: 32, height: 32, borderRadius: 16, border: 'none', cursor: 'pointer', background: c.value,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: activo ? `0 0 0 2px #fff, 0 0 0 4px ${c.value}` : 'none',
                      }}>
                      {activo && <Check style={{ width: 16, height: 16, color: '#fff' }} strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>

              <h3 style={tituloSeccion}>Ícono</h3>
              <div style={{ ...tarjeta, padding: 12, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {ICON_OPTIONS.map((o) => {
                  const activo = formData.icon === o.name;
                  const Icono = o.icon;
                  return (
                    <button key={o.name} type="button" aria-label={o.label} aria-pressed={activo} title={o.label}
                      onClick={() => setFormData({ ...formData, icon: o.name })}
                      style={{
                        aspectRatio: '1 / 1', borderRadius: 10, border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: activo ? formData.color : 'rgba(118,118,128,0.12)',
                      }}>
                      <Icono style={{ width: 20, height: 20, color: activo ? '#fff' : '#3C3C43' }} />
                    </button>
                  );
                })}
              </div>

              {editingArea && (
                <>
                  <div style={{ ...tarjeta, marginTop: 32 }}>
                    {confirmandoBorrar ? (
                      <div style={{ padding: 16 }}>
                        <p style={{ fontSize: 15, color: IOS.texto, margin: '0 0 4px', fontWeight: 600 }}>¿Eliminar "{editingArea.name}"?</p>
                        <p style={{ fontSize: 14, color: IOS.secundario, margin: '0 0 14px', lineHeight: 1.4 }}>
                          {productosDelArea
                            ? `${productosDelArea} ${productosDelArea === 1 ? 'producto queda' : 'productos quedan'} sin área asignada. Los productos no se borran.`
                            : 'Los productos no se borran; solo pierden esta área.'}
                          {' '}No se puede deshacer.
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button type="button" onClick={() => setConfirmandoBorrar(false)} disabled={borrando} className="boton-ios"
                            style={{ ...botonGrande, background: '#E3E3E8', color: IOS.texto }}>
                            Cancelar
                          </button>
                          <button type="button" onClick={() => void handleDelete()} disabled={borrando} className="boton-ios"
                            style={{ ...botonGrande, background: IOS.rojo, color: '#fff' }}>
                            {borrando && <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />}
                            {borrando ? 'Eliminando' : 'Eliminar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmandoBorrar(true)} className="fila-ios"
                        style={{ width: '100%', height: 44, border: 'none', background: 'transparent', fontSize: 17, color: IOS.rojo, cursor: 'pointer' }}>
                        Eliminar área
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };

const tituloSeccion: React.CSSProperties = {
  fontSize: 13, fontWeight: 400, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '22px 16px 7px',
};

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
};

const textoBoton: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, fontSize: 17, color: IOS.azul, cursor: 'pointer',
};

const campo: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box', height: 44, border: 'none', outline: 'none',
  background: 'transparent', fontSize: 17, color: IOS.texto, padding: '0 16px',
};

const botonGrande: React.CSSProperties = {
  flex: 1, height: 44, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
};
