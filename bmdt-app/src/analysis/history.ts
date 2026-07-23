import type { CanonicalPoseFrame } from '../types';
import type { AnalysisResult } from './model';

export interface HistoryEntry { pose: CanonicalPoseFrame; result: AnalysisResult; }

/** Fixed-size ring buffer: bounded memory and O(1) appends for real-time analysis. */
export class MotionHistoryBuffer {
  private readonly entries: Array<HistoryEntry | undefined>;
  private next = 0;
  private count = 0;

  constructor(readonly capacity = 300) { this.entries = new Array(Math.max(2, capacity)); }
  get size(): number { return this.count; }
  get latest(): HistoryEntry | null { return this.count ? this.entries[(this.next - 1 + this.entries.length) % this.entries.length] ?? null : null; }
  push(entry: HistoryEntry): void { this.entries[this.next] = entry; this.next = (this.next + 1) % this.entries.length; this.count = Math.min(this.count + 1, this.entries.length); }
  clear(): void { this.entries.fill(undefined); this.next = 0; this.count = 0; }
  forEachNewest(visitor: (entry: HistoryEntry, index: number) => void): void {
    for (let index = 0; index < this.count; index++) { const entry = this.entries[(this.next - 1 - index + this.entries.length) % this.entries.length]; if (entry) visitor(entry, index); }
  }
  durationMs(now: number): number { const oldest = this.count ? this.entries[(this.next - this.count + this.entries.length) % this.entries.length] : null; return oldest ? Math.max(0, now - oldest.result.timestamp) : 0; }
  getWindow(timestamp: number, windowMs: number): HistoryEntry[] {
    const result: HistoryEntry[] = [];
    const cutoff = timestamp - windowMs;
    for (let index = 0; index < this.count; index++) {
      const entry = this.entries[(this.next - 1 - index + this.entries.length) % this.entries.length];
      if (entry && entry.result.timestamp >= cutoff) result.push(entry);
    }
    return result;
  }
}
