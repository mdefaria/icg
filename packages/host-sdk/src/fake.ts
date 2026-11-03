import type { HostInfo, Overlay, SequenceInfo, Theme } from "@icg/shared";
import type { HostAdapter, InsertOptions, InsertResult, Unsubscribe } from "./adapter";

export type FakeInsert = {
  overlay: Overlay;
  options: InsertOptions;
  track: number;
  startSeconds: number;
};

export type FakeHostOptions = {
  info?: Partial<HostInfo>;
  sequence?: SequenceInfo | null;
  theme?: Theme;
  playheadSeconds?: number;
  canInsert?: boolean;
};

export class FakeHostAdapter implements HostAdapter {
  readonly info: HostInfo;
  readonly canInsert: boolean;
  readonly inserts: FakeInsert[] = [];
  readonly openedUrls: string[] = [];
  sequence: SequenceInfo | null;
  playheadSeconds: number;
  failNextInsert: string | null = null;
  private theme: Theme;
  private readonly listeners = new Set<(theme: Theme) => void>();

  constructor(options: FakeHostOptions = {}) {
    this.info = { kind: "web", version: "0.0.0-fake", os: "other", ...options.info };
    this.canInsert = options.canInsert ?? true;
    this.sequence = options.sequence === undefined ? defaultSequence : options.sequence;
    this.playheadSeconds = options.playheadSeconds ?? 0;
    this.theme = options.theme ?? "dark";
  }

  getSequenceInfo(): Promise<SequenceInfo | null> {
    return Promise.resolve(this.sequence);
  }

  insertOverlay(overlay: Overlay, options: InsertOptions): Promise<InsertResult> {
    if (this.failNextInsert) {
      const reason = this.failNextInsert;
      this.failNextInsert = null;
      return Promise.resolve({ status: "failed", reason });
    }
    if (!this.canInsert) {
      return Promise.resolve({ status: "downloaded", fileName: `${options.label}.png` });
    }
    if (!this.sequence) return Promise.resolve({ status: "no-sequence" });
    const track = this.inserts.filter((i) => overlaps(i, this.playheadSeconds, options)).length + 1;
    this.inserts.push({ overlay, options, track, startSeconds: this.playheadSeconds });
    return Promise.resolve({ status: "inserted", track, startSeconds: this.playheadSeconds });
  }

  getTheme(): Theme {
    return this.theme;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    for (const listener of this.listeners) listener(theme);
  }

  onThemeChange(listener: (theme: Theme) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  openExternal(url: string): void {
    this.openedUrls.push(url);
  }
}

const defaultSequence: SequenceInfo = {
  name: "Sequence 01",
  width: 1080,
  height: 1920,
  frameRate: 30,
};

function overlaps(existing: FakeInsert, startSeconds: number, options: InsertOptions): boolean {
  const existingEnd = existing.startSeconds + existing.options.durationSeconds;
  const newEnd = startSeconds + options.durationSeconds;
  return existing.startSeconds < newEnd && startSeconds < existingEnd;
}
