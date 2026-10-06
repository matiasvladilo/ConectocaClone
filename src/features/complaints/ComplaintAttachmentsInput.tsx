import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';

import { formatFileSize, selectComplaintFiles } from './attachments';

interface ComplaintAttachmentsInputProps {
  files: File[];
  onChange: (files: File[]) => void;
  errors?: string[];
  disabled?: boolean;
}

const ACCEPTED_FILES = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

function AttachmentPreview({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [file]);

  if (previewUrl) {
    return <img src={previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />;
  }

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
      {file.type === 'application/pdf'
        ? <FileText className="h-6 w-6" aria-hidden="true" />
        : <ImageIcon className="h-6 w-6" aria-hidden="true" />}
    </span>
  );
}

export function ComplaintAttachmentsInput({
  files,
  onChange,
  errors = [],
  disabled = false,
}: ComplaintAttachmentsInputProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectionErrors, setSelectionErrors] = useState<string[]>([]);
  const visibleErrors = [...selectionErrors, ...errors];
  const errorDescriptionId = visibleErrors.length > 0 ? 'complaint-files-error' : undefined;
  const describedBy = [
    'complaint-files-help',
    errorDescriptionId,
  ].filter(Boolean).join(' ');

  function addFiles(selectedFiles: FileList | null, input: HTMLInputElement) {
    if (!selectedFiles) return;
    const result = selectComplaintFiles(files, selectedFiles);
    setSelectionErrors(result.errors);
    if (result.files.length > files.length) onChange(result.files);
    input.value = '';
  }

  function removeFile(index: number) {
    setSelectionErrors([]);
    onChange(files.filter((_, fileIndex) => fileIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Paperclip className="h-4 w-4 text-blue-700" aria-hidden="true" />
          Evidencias <span className="font-normal text-gray-500">(opcional)</span>
        </div>
        <p id="complaint-files-help" className="mt-1 text-xs text-gray-500">
          Hasta 5 imágenes o PDF. Máximo 10 MB por archivo.
        </p>
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        className="sr-only"
        aria-invalid={visibleErrors.length > 0 || undefined}
        aria-describedby={describedBy}
        disabled={disabled || files.length >= 5}
        onChange={event => addFiles(event.currentTarget.files, event.currentTarget)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-invalid={visibleErrors.length > 0 || undefined}
        aria-describedby={describedBy}
        disabled={disabled || files.length >= 5}
        onChange={event => addFiles(event.currentTarget.files, event.currentTarget)}
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || files.length >= 5}
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="h-5 w-5" aria-hidden="true" />
          Tomar foto
        </button>
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={disabled || files.length >= 5}
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-5 w-5" aria-hidden="true" />
          Adjuntar
        </button>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Archivos seleccionados">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <AttachmentPreview file={file} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                disabled={disabled}
                aria-label={`Quitar ${file.name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {visibleErrors.length > 0 && (
        <ul id="complaint-files-error" className="space-y-1 text-sm text-red-600" role="alert">
          {visibleErrors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
        </ul>
      )}
    </div>
  );
}
