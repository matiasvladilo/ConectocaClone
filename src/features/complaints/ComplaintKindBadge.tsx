import { Badge } from '../../components/ui/badge';
import { COMPLAINT_KIND_BADGE_CLASSES, complaintKindLabel } from './complaintKinds';
import type { ComplaintKind } from './types';

export function ComplaintKindBadge({ kind }: { kind: ComplaintKind }) {
  return <Badge className={COMPLAINT_KIND_BADGE_CLASSES[kind]}>{complaintKindLabel(kind)}</Badge>;
}
