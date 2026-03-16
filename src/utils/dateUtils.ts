/**
 * Safe date utilities for handling YYYY-MM-DD calendar dates without timezone shifts.
 *
 * Problem: new Date("2026-03-16") is parsed as UTC midnight.
 * In Chile (UTC-3) that becomes March 15 at 9pm → displays as March 15. Wrong!
 *
 * Solution: parse YYYY-MM-DD components directly into a local Date.
 */

/**
 * Parse a YYYY-MM-DD string as a local calendar date (no timezone shift).
 */
export function parseDate(dateStr: string): Date {
  const s = (dateStr || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Normalize a date field that may be YYYY-MM-DD or ISO timestamp.
 * Always returns the YYYY-MM-DD string of the LOCAL calendar date.
 */
export function toLocalDateStr(value: string | undefined | null): string {
  if (!value) return '';
  const s = value.trim();
  // Pure date string – keep as-is (no conversion through Date)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // ISO timestamp – extract the local date parts
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Format a YYYY-MM-DD string for display in Chilean locale (DD/MM/YYYY).
 * Safe: never passes through a UTC Date constructor.
 */
export function formatDateCL(
  dateStr: string | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CL', options ?? { day: '2-digit', month: '2-digit', year: 'numeric' });
}
