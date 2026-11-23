/**
 * Impresión automática de la guía de despacho al llegar un pedido nuevo.
 *
 * POR QUÉ POR DISPOSITIVO: la preferencia va en localStorage y no en
 * `profiles`, porque la impresora está enchufada a un equipo concreto (el PC
 * de despacho). Si se guardara en la cuenta, al mismo usuario le saltaría el
 * diálogo de impresión en el celular.
 *
 * LÍMITE DEL NAVEGADOR: no existe forma de imprimir sin que se abra el diálogo
 * de impresión; `window.print()` siempre lo muestra y no hay API para
 * saltearlo. Con esto activado la guía queda armada y el diálogo abierto, así
 * que sale con un Enter. Para que salga sin ningún click hay que abrir Chrome
 * con el flag `--kiosk-printing` (ver docs/impresion-automatica.md).
 */

const CLAVE = 'conectoca:impresion-automatica';

/** ¿Este dispositivo tiene que imprimir solo al llegar un pedido? */
export function impresionAutomaticaActiva(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    // Safari en navegación privada puede tirar excepción al leer localStorage.
    return false;
  }
}

export function guardarImpresionAutomatica(activa: boolean): void {
  try {
    localStorage.setItem(CLAVE, activa ? '1' : '0');
  } catch {
    // Sin localStorage no se puede recordar la preferencia: queda apagada.
  }
}
