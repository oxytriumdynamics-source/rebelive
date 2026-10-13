/**
 * Formats or derives a concise, unique Rebel ID from an internal user ID or ObjectId.
 * Standard format: `#RBL-XXXXXX` (e.g. `#RBL-04BC91` or `#RBL-8848`).
 */
export function formatRebelId(id?: string | null): string {
  if (!id) return '#RBL-8848';
  const trimmed = String(id).trim();
  if (trimmed.startsWith('REBEL-')) {
    const code = trimmed.replace('REBEL-', '').trim();
    return `#RBL-${code.toUpperCase()}`;
  }
  if (trimmed.startsWith('#RBL-')) {
    return trimmed.toUpperCase();
  }
  if (trimmed.startsWith('#')) {
    const code = trimmed.slice(1).trim();
    return `#RBL-${code.toUpperCase()}`;
  }
  const clean = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  if (!clean) return '#RBL-8848';
  const suffix = clean.length > 6 ? clean.slice(-6).toUpperCase() : clean.toUpperCase();
  return `#RBL-${suffix}`;
}
