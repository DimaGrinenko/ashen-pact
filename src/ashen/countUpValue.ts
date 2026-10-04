/** Keep the award's precision while counting; ordinary amounts stay at cents. */
export function countUpValue(cents: number, progress: number): number {
  if (progress >= 1) return cents;
  const decimals = cents.toFixed(4).split('.')[1].replace(/0+$/, '').length;
  const scale = 10 ** decimals;
  return Math.min(cents, Math.floor(cents * Math.max(0, progress) * scale) / scale);
}
