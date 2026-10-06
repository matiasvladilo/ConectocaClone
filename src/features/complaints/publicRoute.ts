export function isPublicComplaintPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === '/reclamos';
}
