/**
 * Generates a human-readable order number in the format: RBL-YYYYMMDD-XXXX
 * e.g. RBL-20240825-0042
 */
export function generateOrderNumber(): string {
  const now = new Date();
  const date = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  const random = Math.floor(Math.random() * 9000) + 1000; // 4-digit random
  return `RBL-${date}-${random}`;
}
