import QRCode from 'qrcode';

import { Button } from '../../components/ui/button';
import { complaintQrUrl } from './complaintQr';

export interface ComplaintQrDownloadProps {
  publicUrl: string;
}

export async function downloadComplaintQr(publicUrl: string): Promise<void> {
  const dataUrl = await QRCode.toDataURL(complaintQrUrl(publicUrl), {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'H',
  });
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = 'qr-reclamos-conectoca.png';
  anchor.click();
}

export function ComplaintQrDownload({ publicUrl }: ComplaintQrDownloadProps) {
  return (
    <Button type="button" variant="outline" onClick={() => void downloadComplaintQr(publicUrl)}>
      Descargar QR
    </Button>
  );
}
