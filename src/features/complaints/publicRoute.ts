const PUBLIC_PATHS = new Set(['/opina', '/reclamos']);

export function isPublicComplaintPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname.replace(/\/+$/, ''));
}
