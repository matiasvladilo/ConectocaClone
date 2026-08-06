import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ScanBarcode, CameraOff } from 'lucide-react';

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
  title?: string;
}

// Solo formatos de código de barras de retail. Restringir la lista acelera la
// decodificación y reduce falsos positivos. QR queda afuera a propósito.
const BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
];

function cameraErrorMessage(err: unknown): string {
  // getUserMedia solo funciona en contexto seguro. Esto pasa al abrir la app
  // por IP de red local (http://192.168.x.x) para probar desde el celular.
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'El escaneo requiere una conexión segura (HTTPS).';
  }
  const name = (err as { name?: string } | undefined)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Necesitamos permiso para usar la cámara. Habilitalo en los ajustes del navegador.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
    return 'No se encontró ninguna cámara disponible en este dispositivo.';
  }
  return 'No se pudo iniciar la cámara.';
}

/**
 * Vista con la cámara en vivo. Va en un componente aparte para que el <video>
 * esté garantizadamente montado cuando corre el efecto: se monta y desmonta
 * junto con el diálogo, así el cleanup siempre apaga la cámara.
 */
function ScannerView({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannedRef = useRef(false); // evita disparar onScan más de una vez
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS);
    const reader = new BrowserMultiFormatReader(hints);

    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } }, // cámara trasera
        videoEl,
        (result, _err, controls) => {
          if (!result || scannedRef.current) return;
          scannedRef.current = true;
          controls.stop();
          controlsRef.current = null;
          onScan(result.getText().trim());
        }
      )
      .then((controls) => {
        // Si el diálogo se cerró mientras la cámara arrancaba, apagarla ya mismo.
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[BarcodeScanner] Error iniciando la cámara:', err);
        setError(cameraErrorMessage(err));
      });

    return () => {
      cancelled = true;
      // Sin esto la cámara queda encendida consumiendo batería.
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onScan]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
          <CameraOff className="w-7 h-7 text-red-500" />
        </div>
        <p className="text-sm text-gray-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '4 / 3' }}>
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      {/* Marco guía para apuntar el código */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-4/5 h-1/3 border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
    </div>
  );
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = 'Escanear código de barras',
}: BarcodeScannerDialogProps) {
  const handleScan = (code: string) => {
    onScan(code);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-blue-600" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Apuntá la cámara al código de barras del producto.
          </DialogDescription>
        </DialogHeader>

        <ScannerView onScan={handleScan} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
