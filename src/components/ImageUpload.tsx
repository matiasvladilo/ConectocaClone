import { useState, useRef, lazy, Suspense } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { projectId } from '../utils/supabase/info';

// Carga diferida: react-easy-crop no hace falta hasta que alguien elige una
// foto nueva. Con import estático entraría en el bundle inicial del formulario
// de producto para todo el mundo, incluso quien nunca sube una imagen.
const ImageCropDialog = lazy(() =>
  import('./ImageCropDialog').then((m) => ({ default: m.ImageCropDialog }))
);

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  accessToken: string;
}

export function ImageUpload({ value, onChange, label = "Imagen del producto", accessToken }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>(value || '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    try {
      setUploading(true);

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor selecciona una imagen válida');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La imagen no debe superar los 5MB');
        return;
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Upload to server
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-6d979413/upload-product-image`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al subir la imagen');
      }

      const data = await response.json();

      if (data.url) {
        setPreviewUrl(data.url);
        onChange(data.url);
        toast.success('Imagen subida exitosamente');
      } else {
        throw new Error('No se recibió la URL de la imagen');
      }
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error(error.message || 'Error al subir la imagen');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Resetear el input inmediatamente: si el usuario cancela el editor y vuelve
    // a elegir EL MISMO archivo, sin esto el navegador no dispara onChange
    // (el value no cambió) y no pasaría nada.
    e.target.value = '';
    if (!file) return;

    // Misma validación que hacía uploadImage, pero antes de abrir el editor
    // (no tiene sentido dejar recortar un archivo que se va a rechazar después).
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 5MB');
      return;
    }

    setPendingFile(file);
    setCropDialogOpen(true);
  };

  const handleCropComplete = (croppedFile: File) => {
    uploadImage(croppedFile);
  };

  const handleRemoveImage = () => {
    setPreviewUrl('');
    onChange('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2 text-[#0047BA]" style={{ fontSize: '14px', fontWeight: 500 }}>
        <ImageIcon className="w-4 h-4" />
        {label}
      </Label>

      <AnimatePresence mode="wait">
        {previewUrl ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative group"
          >
            {/* El cuadro se ajusta a la proporción real de la foto (sin recortar ni
                forzarla a un cuadrado) — solo se limita la altura máxima para que
                una foto muy vertical no domine el formulario. */}
            <div className="relative max-w-[150px] max-h-64 mx-auto bg-gray-50 rounded-lg overflow-hidden border-2 border-blue-200 shadow-sm">
              <img
                src={previewUrl}
                alt="Preview"
                className="block w-full h-auto max-h-64 object-contain"
              />
              <motion.button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />

            {/* Upload buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-all"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {uploading ? 'Subiendo...' : 'Tomar Foto'}
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-all"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {uploading ? 'Subiendo...' : 'Cargar Imagen'}
                </span>
              </Button>
            </div>

            <p className="text-xs text-gray-500 text-center mt-2">
              📸 Formatos: JPG, PNG, GIF • Máximo 5MB
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor de recorte: se renderiza solo mientras está abierto para que la
          carga diferida sirva de algo (el chunk de react-easy-crop se baja
          recién al elegir una foto). */}
      {cropDialogOpen && (
        <Suspense fallback={null}>
          <ImageCropDialog
            open
            onOpenChange={setCropDialogOpen}
            file={pendingFile}
            onCropComplete={handleCropComplete}
            title="Encuadrar imagen del producto"
          />
        </Suspense>
      )}
    </div>
  );
}