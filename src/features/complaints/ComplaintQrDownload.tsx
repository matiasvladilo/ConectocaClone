import { useRef, useState } from 'react';
import QRCode from 'qrcode';

import { Button } from '../../components/ui/button';
import {
  ComplaintQrDownloadGate,
  downloadComplaintQrFile,
} from './complaintQr';

export interface ComplaintQrDownloadProps {
  publicUrl: string;
}

export async function downloadComplaintQr(publicUrl: string): Promise<void> {
  await downloadComplaintQrFile(publicUrl, {
    toDataURL: (value, options) => QRCode.toDataURL(value, options),
    triggerDownload: (dataUrl, filename) => {
      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = filename;
      anchor.click();
    },
  });
}

export function ComplaintQrDownload({ publicUrl }: ComplaintQrDownloadProps) {
  const gateRef = useRef(new ComplaintQrDownloadGate());
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    const attempt = gateRef.current.start(() => downloadComplaintQr(publicUrl));
    if (!attempt.started) return;

    setIsDownloading(true);
    setError(null);
    try {
      await attempt.promise;
    } catch {
      setError('No pudimos generar el QR. Inténtalo nuevamente.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={isDownloading}
        aria-busy={isDownloading}
        aria-describedby={error ? 'complaint-qr-download-error' : undefined}
        onClick={() => void handleDownload()}
      >
        {isDownloading ? 'Generando QR…' : 'Descargar QR'}
      </Button>
      {error && (
        <p id="complaint-qr-download-error" role="alert" className="max-w-56 text-right text-xs text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
