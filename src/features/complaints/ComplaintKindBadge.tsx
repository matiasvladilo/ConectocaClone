import { Heart, Lightbulb, MessageSquareWarning } from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { COMPLAINT_KIND_BADGE_CLASSES, complaintKindLabel } from './complaintKinds';
import type { ComplaintKind, ComplaintStatus } from './types';

export function ComplaintKindBadge({ kind }: { kind: ComplaintKind }) {
  return <Badge className={COMPLAINT_KIND_BADGE_CLASSES[kind]}>{complaintKindLabel(kind)}</Badge>;
}

/** Colores del sistema de iOS para cada tipo y estado. */
export const KIND_COLOR: Record<ComplaintKind, string> = {
  complaint: '#FF3B30',
  suggestion: '#007AFF',
  compliment: '#34C759',
};

export const STATUS_COLOR: Record<ComplaintStatus, string> = {
  pending: '#FF9500',
  attended: '#34C759',
};

const KIND_ICON = {
  complaint: MessageSquareWarning,
  suggestion: Lightbulb,
  compliment: Heart,
} as const;

/** Ícono redondo del tipo (reclamo, sugerencia, felicitación), estilo lista de iOS. */
export function ComplaintKindIcon({ kind, size = 36 }: { kind: ComplaintKind; size?: number }) {
  const Icono = KIND_ICON[kind] ?? MessageSquareWarning;
  const color = KIND_COLOR[kind] ?? KIND_COLOR.complaint;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: size / 2, flexShrink: 0, background: `${color}1F`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Icono style={{ width: size * 0.5, height: size * 0.5, color }} />
    </span>
  );
}
