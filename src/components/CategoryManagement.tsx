import { useState, useEffect } from 'react';
import { Category, categoriesAPI } from '../utils/api';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Plus,
  Tag,
  Edit,
  Trash2,
  Folder,
  Sparkles,
  Palette
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '../assets/logo-icon.png';
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
      loadCategories();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast.error(error.message || 'Error al eliminar categoría');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-yellow-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </Button>
              <div className="flex items-center gap-3">
                <img src={logo} alt="La Oca" className="w-10 h-10" />
                <div>
                  <h1 className="text-gray-900">Gestión de Categorías</h1>
                  <p className="text-xs text-gray-500">Organiza tus productos por categoría</p>
                </div>
              </div>
            </div>
            <Button
              onClick={() => handleOpenDialog()}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Nueva Categoría
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-20 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 mb-4">
              <Folder className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-gray-900 mb-2">No hay categorías</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Crea tu primera categoría para organizar tus productos
            </p>
            <Button
              onClick={() => handleOpenDialog()}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Crear Categoría
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {agruparPorPadre(categories).map(({ categoria, hijas }) => (
              <div key={categoria.id}>
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${categoria.color}20` }}
                      >
                        <Tag className="w-6 h-6" style={{ color: categoria.color }} />
                      </div>
                      <div>
                        <h3 className="text-gray-900">{categoria.name}</h3>
                        {categoria.description && (
                          <p className="text-xs text-gray-500 mt-1">{categoria.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleOpenDialog(categoria)} variant="outline" size="sm" className="flex-1 gap-2">
                        <Edit className="w-3 h-3" />
                        Editar
                      </Button>
                      <Button
                        onClick={() => setIsDeleting(categoria)}
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* OJO: la indentación va por estilo inline. `pl-6`/`ml-4` NO existen
                    en el CSS precompilado de este proyecto y no harían nada. */}
                {hijas.length > 0 && (
                  <div className="mt-2 space-y-2" style={{ paddingLeft: '2rem' }}>
                    {hijas.map((hija) => (
                      <Card key={hija.id}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Tag className="w-4 h-4" style={{ color: hija.color }} />
                              <span className="text-sm text-gray-900">{hija.name}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={() => handleOpenDialog(hija)} variant="outline" size="sm">
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                onClick={() => setIsDeleting(hija)}
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? 'Actualiza la información de la categoría'
                  : 'Crea una nueva categoría para organizar tus productos'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Electrónica"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe esta categoría..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="parentId">Categoría padre</Label>
                <Select
                  value={formData.parentId || 'none'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, parentId: value === 'none' ? '' : value })
                  }
                  disabled={!puedeTenerPadre(categories, editingCategory?.id)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ninguna (categoría principal)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguna (categoría principal)</SelectItem>
                    {posiblesPadres(categories, editingCategory?.id).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {!puedeTenerPadre(categories, editingCategory?.id)
                    ? 'Esta categoría ya tiene subcategorías, así que no puede ser subcategoría de otra.'
                    : 'Elegí una categoría padre para convertirla en subcategoría (ej: Distribuidora → Bebidas).'}
                </p>
              </div>

              <div>
                <Label htmlFor="color">Color</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {colorOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: option.value })}
                      className={`
                        h-12 rounded-lg border-2 transition-all flex items-center justify-center
                        ${formData.color === option.value
                          ? 'border-gray-900 ring-2 ring-offset-2 ring-gray-900'
                          : 'border-gray-200 hover:border-gray-300'
                        }
                      `}
                      style={{ backgroundColor: option.value }}
                      title={option.label}
                    >
                      {formData.color === option.value && (
                        <Palette className="w-5 h-5 text-white drop-shadow" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {submitting ? 'Guardando...' : editingCategory ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!isDeleting} onOpenChange={() => setIsDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La categoría "{isDeleting?.name}" será eliminada permanentemente.
              {' '}No se puede eliminar si tiene productos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
