import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { RotateCcw, RotateCw, ZoomIn } from 'lucide-react';
import { getCroppedImageFile } from '../utils/cropImage';
import { toast } from 'sonner';

interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onCropComplete: (result: File) => void;
  title?: string;
}

export function ImageCropDialog({
  open,
  onOpenChange,
  file,
  onCropComplete,
  title = 'Encuadrar foto del producto',
}: ImageCropDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  // El marco arranca con la proporción de la foto (no una relación fija global).
  // 1 es solo el valor inicial antes de que onMediaLoaded informe el tamaño real.
  const [aspect, setAspect] = useState(1);
  const [saving, setSaving] = useState(false);
  const croppedAreaPixelsRef = useRef<Area | null>(null);
  // Bandera de reentrancia sincrónica: `saving` (estado) recién se refleja en
  // el próximo render, así que un doble click/tap rápido podría colarse antes
  // de que el botón se deshabilite. Este ref se lee y escribe en el mismo tick.
  const confirmingRef = useRef(false);

  // Genera un object URL solo mientras el diálogo está realmente abierto y lo
  // libera al cerrarse (Cancelar, Escape, clic afuera o confirmar), al
  // desmontar, o al cambiar de archivo — sin depender de que el padre anule
  // `file` para liberar memoria.
  useEffect(() => {
    if (!open || !file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    // Resetear el editor para el archivo nuevo (o para una apertura nueva).
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspect(1);
    croppedAreaPixelsRef.current = null;
    return () => URL.revokeObjectURL(url);
  }, [file, open]);

  const handleMediaLoaded = useCallback((mediaSize: { naturalWidth: number; naturalHeight: number }) => {
    // Marco = proporción real de la foto. Si la rotación actual es de 90/270,
    // ancho y alto lógicos están intercambiados respecto a la imagen fuente.
    const isSideways = rotation === 90 || rotation === 270;
    const w = isSideways ? mediaSize.naturalHeight : mediaSize.naturalWidth;
    const h = isSideways ? mediaSize.naturalWidth : mediaSize.naturalHeight;
    setAspect(w / h);
  }, [rotation]);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    croppedAreaPixelsRef.current = croppedAreaPixels;
  }, []);

  const handleRotate = (direction: 1 | -1) => {
    setRotation((prev) => {
      const next = (prev + direction * 90 + 360) % 360;
      return next;
    });
    // Intercambiar el marco también, para que el pan/zoom siga teniendo sentido
    // apenas se gira (sin esperar a un recálculo de onMediaLoaded, que no se
    // vuelve a disparar al rotar).
    setAspect((prev) => 1 / prev);
  };

  const handleConfirm = async () => {
    // Guardia de reentrancia sincrónica: evita que un doble click/tap dispare
    // dos recortes en paralelo antes de que `disabled={saving}` surta efecto.
    if (confirmingRef.current) return;
    if (!file || !imageUrl) return;
    if (!croppedAreaPixelsRef.current) {
      // La librería todavía no emitió onCropComplete (p. ej. el usuario
      // confirmó antes de que el cropper terminara de montar la imagen).
      // No hay recorte para aplicar todavía: avisamos en vez de fallar mudo.
      console.warn('[ImageCropDialog] Se intentó confirmar antes de que el recorte esté listo.');
      toast.error('Todavía se está preparando la imagen. Esperá un segundo y probá de nuevo.');
      return;
    }
    confirmingRef.current = true;
    try {
      setSaving(true);
      const result = await getCroppedImageFile(imageUrl, croppedAreaPixelsRef.current, rotation, file.name);
      onCropComplete(result);
      onOpenChange(false);
    } catch (err) {
      console.error('[ImageCropDialog] Error al recortar la imagen:', err);
      toast.error('No se pudo procesar la imagen. Probá de nuevo.');
    } finally {
      setSaving(false);
      confirmingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Arrastrá y hacé zoom para encuadrar la foto. Usá los botones para rotarla si hace falta.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full h-72 bg-gray-900 rounded-lg overflow-hidden">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={handleCropComplete}
              onMediaLoaded={handleMediaLoaded}
            />
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <ZoomIn className="w-4 h-4 text-gray-500 shrink-0" />
          <Slider
            value={[zoom]}
            onValueChange={([z]) => setZoom(z)}
            min={1}
            max={3}
            step={0.01}
            className="flex-1"
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => handleRotate(-1)} aria-label="Rotar a la izquierda">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => handleRotate(1)} aria-label="Rotar a la derecha">
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            style={{ background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)', color: 'white' }}
          >
            {saving ? 'Procesando...' : 'Usar esta foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
