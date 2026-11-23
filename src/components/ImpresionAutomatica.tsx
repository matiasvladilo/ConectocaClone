import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Order } from '../App';
import { ThermalReceiptTemplate } from './ThermalReceiptTemplate';

/**
 * Imprime la guía térmica de los pedidos que van llegando, de a uno.
 *
 * Se monta siempre (sin diálogo abierto) y dibuja el pedido que toca dentro de
 * `#print-root`, el mismo contenedor que usa la impresión manual. El CSS de
 * `@media print` oculta el resto de la app y deja la guía en flujo normal.
 *
 * `window.print()` es bloqueante hasta que se cierra el diálogo, así que la
 * cola avanza sola: cuando vuelve de imprimir avisa al padre y entra el
 * siguiente pedido.
 */

interface ImpresionAutomaticaProps {
  /** Pedidos pendientes de imprimir, en orden de llegada. */
  cola: Order[];
  /** Se llama con el pedido ya mandado a imprimir, para sacarlo de la cola. */
  alImprimir: (orderId: string) => void;
  anchoPapel?: '58mm' | '80mm';
  tamanoLetra?: number;
  margenY?: number;
  margenX?: number;
  businessName?: string;
  businessRut?: string;
  businessAddress?: string;
}

export function ImpresionAutomatica({
  cola,
  alImprimir,
  anchoPapel = '80mm',
  tamanoLetra = 12,
  margenY = 5,
  margenX = 2,
  // Mismos valores que usa la impresión manual (ThermalReceiptConfig), para
  // que la guía automática salga idéntica a la que ya imprimen a mano.
  businessName = 'PANIFICADORA ELORRIO LTDA.',
  businessRut = '76.020.756-K',
  businessAddress = 'Av. Pedro de Valdivia 4260',
}: ImpresionAutomaticaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const pedido = cola[0];
  const idPedido = pedido?.id;

  useEffect(() => {
    if (!idPedido) return;
    let cancelado = false;

    const imprimir = async () => {
      // Esperar el logo y las fuentes: si se imprime antes de que carguen, la
      // guía sale sin logo o con la tipografía de respaldo.
      const nodo = contenedorRef.current;
      if (nodo) {
        const pendientes = Array.from(nodo.querySelectorAll('img')).filter((img) => !img.complete);
        await Promise.all(
          pendientes.map(
            (img) =>
              new Promise<void>((resolver) => {
                img.addEventListener('load', () => resolver(), { once: true });
                img.addEventListener('error', () => resolver(), { once: true });
              }),
          ),
        );
      }
      try {
        await document.fonts?.ready;
      } catch {
        // Fuentes no críticas: si falla, se imprime con la de respaldo.
      }
      if (cancelado) return;

      try {
        window.print();
      } finally {
        // Con --kiosk-printing, print() no bloquea: vuelve en cuanto manda el
        // trabajo. Sin esta pausa el siguiente pedido se dibujaría encima
        // mientras el anterior todavía se está mandando, y Chrome puede
        // descartar uno de los dos trabajos.
        await new Promise((resolver) => setTimeout(resolver, 800));
        // Siempre se saca de la cola, incluso si se canceló el diálogo: si no,
        // quedaría reintentando el mismo pedido para siempre.
        alImprimir(idPedido);
      }
    };

    void imprimir();
    return () => {
      cancelado = true;
    };
    // `alImprimir` se deja fuera a propósito: solo tiene que dispararse cuando
    // cambia el pedido que toca imprimir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPedido]);

  if (!pedido) return null;

  const destino = document.getElementById('print-root');
  if (!destino) return null;

  return createPortal(
    <div
      ref={contenedorRef}
      id="thermal-receipt-print"
      className="thermal-print-content"
      style={{ width: anchoPapel, padding: `${margenY}mm ${margenX}mm` }}
    >
      <ThermalReceiptTemplate
        order={pedido}
        businessName={businessName}
        businessRut={businessRut}
        businessAddress={businessAddress}
        fontSize={tamanoLetra}
      />
    </div>,
    destino,
  );
}
