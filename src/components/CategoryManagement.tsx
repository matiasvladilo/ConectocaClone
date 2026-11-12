import { useState, useEffect } from 'react';
import { Category, categoriesAPI } from '../utils/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { ArrowLeft, Plus, Tag, Folder, Check, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { agruparPorPadre, posiblesPadres, puedeTenerPadre } from '../utils/categoryTree';

interface CategoryManagementProps {
  accessToken: string;
  onBack: () => void;
}

interface CategoryFormData {
  name: string;
  description: string;
  color: string;
  parentId: string; // '' = categoría raíz
}

const emptyForm: CategoryFormData = {
  name: '',
  description: '',
  color: '#0047BA',
  parentId: ''
};

const colorOptions = [
  { value: '#0047BA', label: 'Azul La Oca' },
  { value: '#FFB800', label: 'Amarillo' },
  { value: '#10B981', label: 'Verde' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#8B5CF6', label: 'Morado' },
  { value: '#F59E0B', label: 'Naranja' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#6366F1', label: 'Índigo' },
];

export function CategoryManagement({ accessToken, onBack }: CategoryManagementProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm);
  const [isDeleting, setIsDeleting] = useState<Category | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await categoriesAPI.getAll(accessToken);
      setCategories(data);
    } catch (error: any) {
      console.error('Error loading categories:', error);
      toast.error('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || '',
        color: category.color || '#0047BA',
        parentId: category.parentId || ''
      });
    } else {
      setEditingCategory(null);
      setFormData(emptyForm);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCategory(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        name: formData.name,
        description: formData.description,
        color: formData.color,
        parentId: formData.parentId || null,
      };

      if (editingCategory) {
        await categoriesAPI.update(accessToken, editingCategory.id, payload);
        toast.success('Categoría actualizada exitosamente');
      } else {
        await categoriesAPI.create(accessToken, payload);
        toast.success('Categoría creada exitosamente');
      }

      handleCloseDialog();
      loadCategories();
    } catch (error: any) {
      console.error('Error saving category:', error);
      toast.error(error.message || 'Error al guardar categoría');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isDeleting) return;

    try {
      await categoriesAPI.delete(accessToken, isDeleting.id);
      toast.success('Categoría eliminada exitosamente');
      setIsDeleting(null);
      handleCloseDialog();
      loadCategories();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast.error(error.message || 'Error al eliminar categoría');
    }
  };

  const separador = (sangria: number) => <div style={{ height: 0.5, background: IOS_C.separador, marginLeft: sangria }} />;

  const filaCategoria = (c: Category, hija: boolean) => (
    <button
      type="button"
      onClick={() => handleOpenDialog(c)}
      className="fila-ios"
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: hija ? 44 : 54, padding: hija ? '6px 16px 6px 52px' : '8px 16px', textAlign: 'left', border: 'none' }}
    >
      {hija ? (
        <span style={{ width: 10, height: 10, borderRadius: 5, background: c.color || IOS_C.secundario, flexShrink: 0 }} />
      ) : (
        <span style={{ width: 30, height: 30, borderRadius: 8, background: c.color || '#0047BA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Tag style={{ width: 16, height: 16, color: '#fff' }} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="truncate" style={{ display: 'block', fontSize: hija ? 15 : 16, color: IOS_C.texto }}>{c.name}</span>
        {!hija && c.description && (
          <span className="truncate" style={{ display: 'block', fontSize: 12, color: IOS_C.secundario }}>{c.description}</span>
        )}
      </span>
      <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC', flexShrink: 0 }} />
    </button>
  );

  // Las categorías con subcategorías van al final: un grupo largo (p. ej.
  // Distribuidora con sus 8 hijas) arriba empujaba al resto fuera de pantalla.
  // Orden estable: dentro de cada bloque se respeta el de agruparPorPadre.
  const grupos = [...agruparPorPadre(categories)].sort(
    (a, b) => Number(a.hijas.length > 0) - Number(b.hijas.length > 0),
  );
  const puedePadre = puedeTenerPadre(categories, editingCategory?.id);

  return (
    <div className="min-h-screen" style={{ background: IOS_C.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-7xl mx-auto" style={{ padding: '8px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={onBack} aria-label="Volver" style={botonRedondoC}>
            <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Categorías</h1>
            <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
              {loading ? 'Cargando…' : `${grupos.length} principales · ${categories.length - grupos.length} subcategorías`}
            </p>
          </div>
          <button type="button" onClick={() => handleOpenDialog()} aria-label="Nueva categoría" style={{ ...botonRedondoC, background: '#fff' }}>
            <Plus style={{ width: 20, height: 20, color: '#0047BA' }} />
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="animate-spin" style={{ width: 24, height: 24, borderRadius: 12, border: '2.5px solid #C7C7CC', borderTopColor: 'transparent' }} />
          </div>
        ) : categories.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: '40px 16px', textAlign: 'center' }}>
            <Folder style={{ width: 36, height: 36, color: '#C7C7CC', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: IOS_C.texto }}>No hay categorías</p>
            <p style={{ fontSize: 14, color: IOS_C.secundario, marginTop: 2 }}>Crea la primera para organizar tus productos</p>
            <button type="button" onClick={() => handleOpenDialog()} style={{ marginTop: 14, height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: IOS_C.azul, color: '#fff', fontSize: 15, fontWeight: 600 }}>
              Crear categoría
            </button>
          </div>
        ) : (
          <>
            {grupos.map(({ categoria, hijas }) => (
              <section key={categoria.id} style={{ marginBottom: 20 }}>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                  {filaCategoria(categoria, false)}
                  {hijas.map((h) => (
                    <div key={h.id}>
                      {separador(52)}
                      {filaCategoria(h, true)}
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <p style={{ fontSize: 13, color: IOS_C.secundario, padding: '0 16px', lineHeight: 1.35 }}>
              Toca una categoría para editarla. Para crear una subcategoría, elige su categoría padre al crearla.
            </p>
          </>
        )}
      </div>

      {/* Crear / editar: hoja iOS (Cancelar / título / Guardar arriba) */}
      <Dialog open={isDialogOpen} onOpenChange={(abierto) => { if (!abierto) handleCloseDialog(); }}>
        <DialogContent
          className="hoja-ios"
          style={{
            top: 'auto', bottom: 0, left: 0, right: 0, translate: 'none', margin: '0 auto',
            width: '100%', maxWidth: 640, maxHeight: '92dvh', padding: 0, gap: 0, border: 'none',
            borderRadius: '14px 14px 0 0', background: IOS_C.fondo, display: 'flex', flexDirection: 'column',
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 10px', gap: 8 }}>
              <button type="button" onClick={handleCloseDialog} disabled={submitting} style={{ ...textoBotonC, flex: 1, textAlign: 'left' }}>Cancelar</button>
              <DialogTitle className="truncate" style={{ flex: 2, textAlign: 'center', fontSize: 17, fontWeight: 600, color: IOS_C.texto }}>
                {editingCategory ? 'Editar categoría' : 'Nueva categoría'}
              </DialogTitle>
              <button type="submit" disabled={submitting} style={{ ...textoBotonC, flex: 1, textAlign: 'right', fontWeight: 600 }}>
                {submitting ? 'Guardando' : editingCategory ? 'Guardar' : 'Crear'}
              </button>
            </div>
            <DialogDescription className="sr-only">
              {editingCategory ? 'Actualiza la información de la categoría' : 'Crea una nueva categoría para organizar tus productos'}
            </DialogDescription>

            <div style={{ overflowY: 'auto', padding: '6px 16px max(env(safe-area-inset-bottom), 24px)' }}>
              {/* Vista previa + nombre */}
              <section style={{ marginBottom: 22 }}>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', minHeight: 52 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: formData.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Tag style={{ width: 16, height: 16, color: '#fff' }} />
                    </span>
                    <input
                      id="name"
                      aria-label="Nombre"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nombre de la categoría"
                      required
                      autoFocus={!editingCategory}
                      style={campoC}
                    />
                  </div>
                  {separador(16)}
                  <textarea
                    id="description"
                    aria-label="Descripción"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descripción (opcional)"
                    rows={2}
                    style={{ display: 'block', width: '100%', border: 'none', outline: 'none', resize: 'none', padding: '12px 16px', fontSize: 16, color: IOS_C.texto, background: 'transparent', fontFamily: 'inherit' }}
                  />
                </div>
              </section>

              {/* Padre */}
              <section style={{ marginBottom: 22 }}>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                  <label className={puedePadre ? 'fila-ios' : undefined} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 16px', cursor: puedePadre ? 'pointer' : 'default' }}>
                    <span style={{ fontSize: 16, color: IOS_C.texto, flexShrink: 0 }}>Dentro de</span>
                    <span className="truncate" style={{ flex: 1, textAlign: 'right', fontSize: 16, color: IOS_C.secundario }}>
                      {formData.parentId ? (categories.find((c) => c.id === formData.parentId)?.name ?? '—') : 'Ninguna (principal)'}
                    </span>
                    {puedePadre && <ChevronsUpDown style={{ width: 15, height: 15, color: IOS_C.secundario, flexShrink: 0 }} />}
                    <select
                      value={formData.parentId || 'none'}
                      onChange={(e) => setFormData({ ...formData, parentId: e.target.value === 'none' ? '' : e.target.value })}
                      disabled={!puedePadre}
                      aria-label="Categoría padre"
                      style={{ position: 'absolute', inset: 0, opacity: 0, fontSize: 16 }}
                    >
                      <option value="none">Ninguna (principal)</option>
                      {posiblesPadres(categories, editingCategory?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                </div>
                <p style={{ fontSize: 13, color: IOS_C.secundario, padding: '6px 16px 0', lineHeight: 1.35 }}>
                  {!puedePadre
                    ? 'Esta categoría ya tiene subcategorías, así que no puede ser subcategoría de otra.'
                    : 'Elige una categoría padre para convertirla en subcategoría (ej.: Distribuidora → Bebidas).'}
                </p>
              </section>

              {/* Color */}
              <section style={{ marginBottom: 22 }}>
                <h3 style={{ fontSize: 13, color: IOS_C.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', padding: '0 16px 6px', fontWeight: 400 }}>Color</h3>
                <div style={{ background: '#fff', borderRadius: 12, padding: '14px 12px', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, justifyItems: 'center' }}>
                  {colorOptions.map((o) => {
                    const activo = formData.color === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, color: o.value })}
                        aria-label={o.label}
                        aria-pressed={activo}
                        style={{
                          width: 32, height: 32, borderRadius: 16, border: 'none', cursor: 'pointer', background: o.value,
                          boxShadow: activo ? `0 0 0 2px #fff, 0 0 0 4px ${o.value}` : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {activo && <Check style={{ width: 16, height: 16, color: '#fff' }} />}
                      </button>
                    );
                  })}
                </div>
              </section>

              {editingCategory && (
                <section>
                  <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setIsDeleting(editingCategory)}
                      disabled={submitting}
                      className="fila-ios"
                      style={{ width: '100%', minHeight: 48, border: 'none', color: IOS_C.rojo, fontSize: 16 }}
                    >
                      Eliminar categoría
                    </button>
                  </div>
                </section>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <AlertDialog open={!!isDeleting} onOpenChange={() => setIsDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{isDeleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              No se puede deshacer. Si la categoría tiene productos asociados, no se podrá eliminar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const IOS_C = {
  fondo: '#F2F2F7',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  azul: '#007AFF',
  rojo: '#FF3B30',
};

const botonRedondoC: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
};

const textoBotonC: React.CSSProperties = { background: 'none', border: 'none', padding: '6px 0', fontSize: 17, color: '#007AFF', cursor: 'pointer' };

const campoC: React.CSSProperties = { flex: 1, minWidth: 0, height: 44, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: '#000', padding: 0 };
