import { useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, QrCode } from 'lucide-react';
import { toast } from 'sonner';

import { entregarArchivo } from '../../utils/descargarArchivo';
import {
  ComplaintQrDownloadGate,
  downloadComplaintQrFile,
} from './complaintQr';

export interface ComplaintQrDownloadProps {
  publicUrl: string;
}

/**
 * Genera el PNG del QR y lo entrega. Pasa por entregarArchivo: en la web es el
 * `<a download>` de siempre; en la app nativa el WebView ignora las descargas,
 * así que se guarda y se abre la hoja de compartir de iOS.
 */
export async function downloadComplaintQr(publicUrl: string): Promise<void> {
  await downloadComplaintQrFile(publicUrl, {
    toDataURL: (value, options) => QRCode.toDataURL(value, options),
    triggerDownload: async (dataUrl, filename) => {
      const blob = await (await fetch(dataUrl)).blob();
      await entregarArchivo(blob, filename, 'image/png');
    },
  });
}

/** Botón redondo para el encabezado azul. */
export function ComplaintQrDownload({ publicUrl }: ComplaintQrDownloadProps) {
  const gateRef = useRef(new ComplaintQrDownloadGate());
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    const attempt = gateRef.current.start(() => downloadComplaintQr(publicUrl));
    if (!attempt.started) return;

    setIsDownloading(true);
    try {
      await attempt.promise;
    } catch {
      toast.error('No pudimos generar el QR. Inténtalo nuevamente.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={isDownloading}
      aria-busy={isDownloading}
      aria-label={isDownloading ? 'Generando QR…' : 'Descargar QR del formulario'}
      onClick={() => void handleDownload()}
      className="boton-ios"
      style={{
        width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
      }}
    >
      {isDownloading
        ? <Loader2 className="animate-spin" style={{ width: 18, height: 18, color: '#fff' }} aria-hidden="true" />
        : <QrCode style={{ width: 18, height: 18, color: '#fff' }} aria-hidden="true" />}
    </button>
  );
}
