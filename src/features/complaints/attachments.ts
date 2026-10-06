const MAX_COMPLAINT_FILES = 5;

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

export function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) {
    return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(sizeInBytes / 1024)} KB`;
  }
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(sizeInBytes / (1024 * 1024))} MB`;
}
