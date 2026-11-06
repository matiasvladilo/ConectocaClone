/**
 * Toque háptico en el contenedor nativo. En el navegador es un no-op y no carga
 * el plugin (import perezoso), así que la PWA no suma peso.
 *
 * Se usa, por ejemplo, al confirmar un cambio de estado deslizando una tarjeta:
 * ese "tap" físico es lo que hace que el gesto se sienta nativo en iOS/Android.
 */
import { isNativePlatform } from './platform.ts';

export async function hapticLigero(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* plugin ausente: el háptico es un lujo, nunca un requisito */
  }
}
