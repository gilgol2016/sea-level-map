/**
 * Human-readable population formatter
 * e.g., 1,200,000,000 -> "1.2B", 142,000,000 -> "142M", 6,138,000 -> "6.1M", 250,000 -> "250K"
 */
export function formatPopulation(num: number): string {
  if (num <= 0) return '0';
  if (num >= 1_000_000_000) {
    const val = num / 1_000_000_000;
    return val % 1 === 0 ? `${val.toFixed(0)}B` : `${val.toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    const val = num / 1_000_000;
    return val % 1 === 0 ? `${val.toFixed(0)}M` : `${val.toFixed(1)}M`;
  }
  if (num >= 1_000) {
    const val = num / 1_000;
    return val % 1 === 0 ? `${val.toFixed(0)}K` : `${val.toFixed(0)}K`;
  }
  return num.toLocaleString();
}
