import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import { productionAreasAPI, type ProductionArea } from '../utils/api';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
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
  Package
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
  { name: 'Flame', icon: Flame, label: 'Cocina Caliente' },
  { name: 'Snowflake', icon: Snowflake, label: 'Cocina Fría' },
  { name: 'ShoppingBag', icon: ShoppingBag, label: 'Bolsa' },
  { name: 'Package', icon: Package, label: 'Paquete' },
  { name: 'Factory', icon: Factory, label: 'Fábrica' }
];

const COLOR_OPTIONS = [
  { value: '#0059FF', label: 'Azul' },
  { value: '#10B981', label: 'Verde' },
  { value: '#F59E0B', label: 'Amarillo' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#8B5CF6', label: 'Morado' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#F97316', label: 'Naranja' }
];

export function ProductionAreasManagement({ onBack, accessToken }: ProductionAreasManagementProps) {
  const [areas, setAreas] = useState<ProductionArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingArea, setEditingArea] = useState<ProductionArea | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#0059FF',
    icon: 'Briefcase'
  });

  useEffect(() => {
    loadAreas();
  }, []);

  const loadAreas = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await productionAreasAPI.getAll(accessToken);
      setAreas(data);
    } catch (error: any) {
      console.error('Error loading production areas:', error);
      toast.error(error.message || 'Error al cargar las áreas de producción');
    } finally {
      setLoading(false);
    }
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

    try {
      if (editingArea) {
        await productionAreasAPI.update(accessToken, editingArea.id, formData);
        toast.success('Área de producción actualizada correctamente');
      } else {
        await productionAreasAPI.create(accessToken, formData);
        toast.success('Área de producción creada correctamente');
      }

      await loadAreas();
      handleCloseDialog();
    } catch (error: any) {
      console.error('Error saving production area:', error);
      toast.error(error.message || 'Error al guardar el área de producción');
    }
  };

  const handleDelete = async (areaId: string, areaName: string) => {
    if (!accessToken) return;

    try {
      await productionAreasAPI.delete(accessToken, areaId);
      toast.success(`Área "${areaName}" eliminada correctamente`);
      await loadAreas();
    } catch (error: any) {
      console.error('Error deleting production area:', error);
      toast.error(error.message || 'Error al eliminar el área de producción');
    }
  };

  const handleEdit = (area: ProductionArea) => {
    setEditingArea(area);
    setFormData({
      name: area.name,
      description: area.description || '',
      color: area.color || '#0059FF',
      icon: area.icon || 'Briefcase'
    });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingArea(null);
    setFormData({
      name: '',
      description: '',
      color: '#0059FF',
      icon: 'Briefcase'
    });
  };

  const getIconComponent = (iconName: string) => {
    const iconOption = ICON_OPTIONS.find(opt => opt.name === iconName);
    return iconOption ? iconOption.icon : Briefcase;
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #EAF2FF 0%, #CFE0FF 100%)' }}
    >
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </div>

      {/* Header */}
      <div
        className="relative z-10 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          borderBottom: '3px solid #FFD43B',
          paddingTop: 'max(env(safe-area-inset-top), 20px)'
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.1, x: -4 }}
                whileTap={{ scale: 0.95 }}
                className="w-11 h-11 flex items-center justify-center rounded-full"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </motion.button>
              <div>
                <h1 className="text-white tracking-wide flex items-center gap-2" style={{ fontSize: '18px', fontWeight: 600 }}>
                  <Factory className="w-5 h-5" />
                  Áreas de Producción
                </h1>
                <p className="text-blue-100 text-xs">
                  Configura y gestiona las áreas de tu producción
                </p>
              </div>
            </div>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingArea(null);
                    setFormData({ name: '', description: '', color: '#0059FF', icon: 'Briefcase' });
                  }}
                  style={{
                    background: 'linear-gradient(90deg, #FFD43B 0%, #FFC107 100%)',
                    color: '#0047BA'
                  }}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nueva Área
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#0047BA]">
                    {editingArea ? 'Editar Área de Producción' : 'Nueva Área de Producción'}
                  </DialogTitle>
                  <DialogDescription>
                    Define las áreas de producción de tu negocio para organizar mejor los pedidos.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: Panadería, Pastelería, Cocina Caliente..."
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Descripción</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descripción opcional del área"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {COLOR_OPTIONS.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, color: color.value })}
                          className="h-10 rounded-lg border-2 transition-all hover:scale-105"
                          style={{
                            backgroundColor: color.value,
                            borderColor: formData.color === color.value ? '#000' : 'transparent'
                          }}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Ícono</Label>
                    <div className="grid grid-cols-7 gap-2">
                      {ICON_OPTIONS.map((iconOption) => {
                        const IconComponent = iconOption.icon;
                        return (
                          <button
                            key={iconOption.name}
                            type="button"
                            onClick={() => setFormData({ ...formData, icon: iconOption.name })}
                            className="h-10 rounded-lg border-2 flex items-center justify-center transition-all hover:scale-105"
                            style={{
                              borderColor: formData.icon === iconOption.name ? formData.color : '#E5E7EB',
                              backgroundColor: formData.icon === iconOption.name ? `${formData.color}20` : 'transparent'
                            }}
                            title={iconOption.label}
                          >
                            <IconComponent
                              className="w-5 h-5"
                              style={{ color: formData.icon === iconOption.name ? formData.color : '#6B7280' }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      className="flex-1"
                      style={{
                        background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)'
                      }}
                    >
                      {editingArea ? 'Actualizar' : 'Crear'} Área
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseDialog}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 relative z-10">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0059FF]"></div>
          </div>
        ) : areas.length === 0 ? (
          <Card className="border-2 shadow-lg">
            <CardContent className="py-20">
              <div className="text-center space-y-4">
                <Factory className="w-16 h-16 text-gray-400 mx-auto" />
                <h3 className="text-lg font-semibold text-gray-700">
                  No hay áreas de producción configuradas
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  Crea tu primera área de producción para organizar mejor los pedidos de tu negocio.
                  Por ejemplo: Panadería, Pastelería, Cocina Caliente, Cocina Fría, etc.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {areas.map((area, index) => {
                const IconComponent = getIconComponent(area.icon || 'Briefcase');

                return (
                  <motion.div
                    key={area.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card
                      className="border-2 shadow-lg hover:shadow-xl transition-shadow"
                      style={{ borderLeftWidth: '4px', borderLeftColor: area.color }}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center"
                              style={{ backgroundColor: `${area.color}20` }}
                            >
                              <IconComponent
                                className="w-6 h-6"
                                style={{ color: area.color }}
                              />
                            </div>
                            <div>
                              <CardTitle className="text-[#0047BA] text-lg">
                                {area.name}
                              </CardTitle>
                              {area.description && (
                                <CardDescription className="text-sm mt-1">
                                  {area.description}
                                </CardDescription>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>

                      <Separator />

                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(area)}
                            className="flex-1"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" />
                            Editar
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Eliminar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción no se puede deshacer. El área "{area.name}" será eliminada permanentemente.
                                  {' '}Los productos asignados a esta área no se eliminarán, pero perderán su asignación.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(area.id, area.name)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
