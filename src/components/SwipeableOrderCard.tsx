import { ReactNode, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'motion/react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import {
  puedeAvanzar,
  puedeRetroceder,
  flowIndex,
  ORDER_FLOW,
  type FlowStep,
} from '../utils/orderStatusFlow';
import { hapticLigero } from '../utils/haptics';

interface SwipeableOrderCardProps {
  orderId: string;
  status: string;
  userRole?: string;
  /**
   * Abre el detalle. Solo se dispara en un toque real, no al arrastrar.
   * Opcional: en pantallas cuya tarjeta ya tiene botones de acción (despacho,
   * producción) no se pasa, para que tocar un botón no abra además el detalle.
   */
  onTap?: () => void;
  /**
   * Confirmó un cambio de estado deslizando. El padre hace la llamada a la API,
   * el toast y el "deshacer" (necesita `previo` para volver atrás).
   */
  onCambiarEstado: (orderId: string, destino: FlowStep, previo: FlowStep) => void;
  children: ReactNode;
}

// Cuánto hay que arrastrar para que el cambio se confirme. Por debajo, la
// tarjeta vuelve sola a su lugar.
const UMBRAL = 72;

/**
 * Envuelve la tarjeta de un pedido y le agrega "deslizar para cambiar de
 * estado": a la derecha avanza, a la izquierda retrocede. Respeta los permisos
 * del rol (ver orderStatusFlow): si en un sentido no hay transición permitida,
 * no se revela nada y la tarjeta vuelve sola.
 *
 * Tocar (sin arrastrar) abre el detalle — `motion` distingue el tap del drag,
 * así que no se disparan los dos a la vez.
 */
export function SwipeableOrderCard({
  orderId,
  status,
  userRole,
  onTap,
  onCambiarEstado,
  children,
}: SwipeableOrderCardProps) {
  const x = useMotionValue(0);
  const [arrastrando, setArrastrando] = useState(false);

  const destinoAvanzar = puedeAvanzar(status, userRole);
  const destinoRetroceder = puedeRetroceder(status, userRole);

  // Paneles de revelado: el de avanzar (verde) se ve al mover a la derecha; el
  // de retroceder (ámbar) al mover a la izquierda. La opacidad sigue al dedo.
  const opacidadAvanzar = useTransform(x, [0, UMBRAL], [0, 1]);
  const opacidadRetroceder = useTransform(x, [-UMBRAL, 0], [1, 0]);

  const estadoActual = (): FlowStep => {
    const i = flowIndex(status);
    return i >= 0 ? ORDER_FLOW[i] : { key: status as any, label: status, progress: 0 };
  };

  const confirmar = (destino: FlowStep) => {
    hapticLigero();
    onCambiarEstado(orderId, destino, estadoActual());
  };

  const alSoltar = (_e: unknown, info: PanInfo) => {
    setArrastrando(false);
    const dx = info.offset.x;
    // La tarjeta siempre vuelve a su lugar; el contenido se re-renderiza con el
    // estado nuevo si hubo cambio.
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 });

    if (dx > UMBRAL && destinoAvanzar) confirmar(destinoAvanzar);
    else if (dx < -UMBRAL && destinoRetroceder) confirmar(destinoRetroceder);
  };

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden' }}>
      {/* Panel AVANZAR (verde), anclado a la izquierda: se ve al mover a la derecha */}
      {destinoAvanzar && (
        <motion.div
          aria-hidden
          style={{ opacity: opacidadAvanzar }}
          className="absolute inset-0 flex items-center justify-start px-5"
        >
          <div className="absolute inset-0" style={{ background: '#EAF3DE' }} />
          <span className="relative flex items-center gap-2 text-sm font-medium" style={{ color: '#2A5B0E' }}>
            <ChevronRight className="w-5 h-5" />
            {destinoAvanzar.label}
          </span>
        </motion.div>
      )}

      {/* Panel RETROCEDER (ámbar), anclado a la derecha: se ve al mover a la izquierda */}
      {destinoRetroceder && (
        <motion.div
          aria-hidden
          style={{ opacity: opacidadRetroceder }}
          className="absolute inset-0 flex items-center justify-end px-5"
        >
          <div className="absolute inset-0" style={{ background: '#FAEEDA' }} />
          <span className="relative flex items-center gap-2 text-sm font-medium" style={{ color: '#854F0B' }}>
            {destinoRetroceder.label}
            <ChevronLeft className="w-5 h-5" />
          </span>
        </motion.div>
      )}

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        style={{ x, position: 'relative', touchAction: 'pan-y' }}
        onDragStart={() => setArrastrando(true)}
        onDragEnd={alSoltar}
        // onTap solo se dispara en un toque real; si hubo arrastre, no. El guard
        // extra evita el caso de un micro-drag que suelta justo sobre el toque.
        onTap={() => { if (!arrastrando && onTap) onTap(); }}
      >
        {children}
      </motion.div>
    </div>
  );
}
