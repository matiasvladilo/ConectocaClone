import { useState, useRef, lazy, Suspense } from 'react';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
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

  // Estilo iOS: miniatura cuadrada + acciones como filas de texto azul. Los
  // inputs de archivo viven siempre montados (antes solo existían sin foto, así
  // que "cambiar" una foto obligaba a quitarla primero), y "Quitar foto" es un
  // botón visible: antes solo aparecía con hover, imposible en un teléfono.
  const fila: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
    padding: '0 16px', background: 'none', border: 'none', textAlign: 'left',
    fontSize: 16, color: '#007AFF', cursor: 'pointer',
  };
  const separador = <div style={{ height: 0.5, background: 'rgba(60,60,67,0.18)', marginLeft: 16 }} />;

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" disabled={uploading} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" disabled={uploading} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px' }}>
        <div style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: '#F2F2F7', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {previewUrl ? (
            <img src={previewUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <ImageIcon style={{ width: 26, height: 26, color: '#C7C7CC' }} />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 16, color: '#000' }}>{label}</p>
          <p style={{ fontSize: 13, color: '#8E8E93' }}>
            {uploading ? 'Subiendo…' : previewUrl ? 'Así se ve en el catálogo' : 'JPG o PNG, hasta 5 MB'}
          </p>
        </div>
      </div>
      {separador}
      <button type="button" className="fila-ios" style={fila} onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
        <Camera style={{ width: 18, height: 18 }} />
        {previewUrl ? 'Tomar otra foto' : 'Tomar foto'}
      </button>
      {separador}
      <button type="button" className="fila-ios" style={fila} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
        <Upload style={{ width: 18, height: 18 }} />
        Elegir de la galería
      </button>
      {previewUrl && (
        <>
          {separador}
          <button type="button" className="fila-ios" style={{ ...fila, color: '#FF3B30' }} onClick={handleRemoveImage} disabled={uploading}>
            <X style={{ width: 18, height: 18 }} />
            Quitar foto
          </button>
        </>
      )}

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