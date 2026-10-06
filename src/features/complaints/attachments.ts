const MAX_COMPLAINT_FILES = 5;
const MAX_COMPLAINT_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_COMPLAINT_FILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export function appendComplaintFiles(
  currentFiles: File[],
  selectedFiles: Iterable<File>,
): { files: File[]; rejectedCount: number } {
  const selected = Array.from(selectedFiles);
  const availableSlots = Math.max(0, MAX_COMPLAINT_FILES - currentFiles.length);
  if (availableSlots === 0) {
    return { files: currentFiles, rejectedCount: selected.length };
  }

  return {
    files: [...currentFiles, ...selected.slice(0, availableSlots)],
    rejectedCount: Math.max(0, selected.length - availableSlots),
  };
}

export function selectComplaintFiles(
  currentFiles: File[],
  selectedFiles: Iterable<File>,
): { files: File[]; errors: string[] } {
  const errors: string[] = [];
  const accepted: File[] = [];

  for (const file of selectedFiles) {
    if (!ALLOWED_COMPLAINT_FILE_TYPES.has(file.type)) {
      if (!errors.includes('Solo puedes adjuntar archivos JPG, PNG, WebP o PDF.')) {
        errors.push('Solo puedes adjuntar archivos JPG, PNG, WebP o PDF.');
      }
      continue;
    }
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_COMPLAINT_FILE_SIZE) {
      if (!errors.includes('Cada archivo debe pesar como máximo 10 MB.')) {
        errors.push('Cada archivo debe pesar como máximo 10 MB.');
      }
      continue;
    }
    accepted.push(file);
  }

  const appended = appendComplaintFiles(currentFiles, accepted);
  if (appended.rejectedCount > 0) errors.push('Puedes adjuntar hasta cinco archivos.');
  return { files: appended.files, errors };
}

export function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) {
    return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(sizeInBytes / 1024)} KB`;
  }
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(sizeInBytes / (1024 * 1024))} MB`;
}
