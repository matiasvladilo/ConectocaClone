export function complaintQrUrl(publicUrl: string): string {
  return new URL('/reclamos', publicUrl).toString();
}

export interface ComplaintQrDownloadDependencies {
  toDataURL: (
    value: string,
    options: { width: number; margin: number; errorCorrectionLevel: 'H' },
  ) => Promise<string>;
  triggerDownload: (dataUrl: string, filename: string) => void;
}

export async function downloadComplaintQrFile(
  publicUrl: string,
  dependencies: ComplaintQrDownloadDependencies,
): Promise<void> {
  const dataUrl = await dependencies.toDataURL(complaintQrUrl(publicUrl), {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'H',
  });
  dependencies.triggerDownload(dataUrl, 'qr-reclamos-conectoca.png');
}

export interface ComplaintQrDownloadAttempt {
  started: boolean;
  promise: Promise<void>;
}

export class ComplaintQrDownloadGate {
  private inFlight: Promise<void> | null = null;

  start(download: () => Promise<void>): ComplaintQrDownloadAttempt {
    if (this.inFlight) return { started: false, promise: this.inFlight };

    const promise = download().finally(() => {
      if (this.inFlight === promise) this.inFlight = null;
    });
    this.inFlight = promise;
    return { started: true, promise };
  }
}
