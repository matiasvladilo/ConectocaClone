/**
 * Guardar / compartir un archivo generado en el cliente (PDF, Excel, PNG).
 *
 * POR QUÉ EXISTE: en el navegador, descargar un archivo es crear un
 * `<a download>` y hacerle click, o dejar que jsPDF/XLSX lo hagan por dentro.
 * Dentro del WebView de Capacitor eso NO funciona: el WebView no tiene gestor de
 * descargas, así que el usuario toca "Exportar" y no pasa nada — un bug que solo
 * aparece en la app empaquetada, nunca en la PWA. Este helper unifica los dos
 * caminos:
 *
 *   - Web  → el `<a download>` de siempre (comportamiento idéntico al actual).
 *   - Nativo → escribe el archivo con @capacitor/filesystem y abre la hoja de
 *              compartir del sistema (@capacitor/share), que es como el usuario
 *              de móvil espera "sacar" un archivo: guardarlo en Archivos,
 *              mandarlo por WhatsApp, mail, etc.
 *
 * Los plugins de Capacitor se importan de forma perezosa (`await import`) para
 * que la PWA no cargue nada nativo: en el navegador este archivo pesa solo el
 * camino web.
 */

import * as XLSX from 'xlsx';
import { isNativePlatform } from './platform.ts';

const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Exporta un workbook de XLSX por el camino unificado (web descarga, nativo
 * comparte). Reemplaza a `XLSX.writeFile(wb, nombre)`, que internamente hace el
 * `<a download>` que el WebView de Capacitor ignora.
 */
export async function exportarLibroExcel(
  workbook: XLSX.WorkBook,
  nombre: string,
): Promise<void> {
  const datos = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  await entregarArchivo(new Blob([datos], { type: MIME_XLSX }), nombre, MIME_XLSX);
}

/** Convierte un Blob a string base64 (sin el prefijo data:). */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // result es "data:<mime>;base64,XXXX" — nos quedamos con lo de después de la coma.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Entrega un archivo al usuario. En web descarga; en nativo guarda y comparte.
 *
 * @param blob       El contenido ya generado.
 * @param nombre     Nombre de archivo con extensión (p. ej. "Ventas_2026-11.xlsx").
 * @param mimeType   Tipo MIME, usado por la hoja de compartir para elegir apps.
 */
export async function entregarArchivo(
  blob: Blob,
  nombre: string,
  mimeType: string,
): Promise<void> {
  if (!isNativePlatform()) {
    descargarEnWeb(blob, nombre);
    return;
  }

  // Import perezoso: solo se evalúa dentro del contenedor nativo.
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  const base64 = await blobABase64(blob);

  // Cache es el directorio correcto para un archivo efímero que se va a
  // compartir: no requiere permisos de almacenamiento y el SO lo puede limpiar.
  const escrito = await Filesystem.writeFile({
    path: nombre,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: nombre,
      url: escrito.uri,
      dialogTitle: 'Compartir o guardar',
    });
  } catch (err) {
    // El usuario puede cancelar la hoja de compartir: no es un error que deba
    // propagarse como fallo de la exportación. Cualquier otra cosa sí se relanza.
    const mensaje = err instanceof Error ? err.message : String(err);
    if (!/cancel/i.test(mensaje)) throw err;
  }
}

/** El camino web de siempre: crear un enlace de descarga y accionarlo. */
function descargarEnWeb(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Liberar la URL tras un tick: revocarla de inmediato cancela la descarga en
  // algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
