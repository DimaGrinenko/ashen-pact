/** Visible elapsed time: dropped frames must not slow a Spine clip down. */
export class AnimationClock {
  private previous: number | null = null;

  next(time: number): number {
    const elapsed = this.previous === null ? 0 : Math.max(0, time - this.previous) / 1000;
    this.previous = time;
    return elapsed;
  }

  reset(): void { this.previous = null; }
}

/** An absolute scene clock preserves visible time between RAFs and tab events. */
export class VisibleTimeline {
  private hiddenAt: number | null = null;
  private hiddenTotal = 0;
  private readonly startedAt: number;
  constructor(startedAt: number) { this.startedAt = startedAt; }
  setPaused(time: number, paused: boolean): void {
    if (paused && this.hiddenAt === null) this.hiddenAt = time;
    else if (!paused && this.hiddenAt !== null) {
      this.hiddenTotal += Math.max(0, time - this.hiddenAt);
      this.hiddenAt = null;
    }
  }
  seconds(time: number): number {
    return Math.max(0, (this.hiddenAt ?? time) - this.startedAt - this.hiddenTotal) / 1000;
  }
}
