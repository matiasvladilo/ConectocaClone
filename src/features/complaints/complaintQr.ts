export function complaintQrUrl(publicUrl: string): string {
  return new URL('/reclamos', publicUrl).toString();
}
