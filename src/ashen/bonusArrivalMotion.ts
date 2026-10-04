/** One three-second scene clock, including smoke and the destination reveal. */
export const BONUS_ARRIVAL = {
  impact: .65,
  ashes: 1.6,
  reveal: 2,
  end: 3,
} as const;

/** Zero velocity and acceleration at both ends keeps successive fades calm. */
export function arrivalEase(start: number, end: number, time: number) {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
