import type { HostInfo, Overlay, SequenceInfo, Theme } from "@icg/shared";

export type InsertOptions = {
  durationSeconds: number;
  label: string;
};

export type InsertResult =
  | { status: "inserted"; track: number; startSeconds: number }
  | { status: "downloaded"; fileName: string }
  | { status: "no-sequence" }
  | { status: "failed"; reason: string };

export type Unsubscribe = () => void;

export interface HostAdapter {
  readonly info: HostInfo;
  readonly canInsert: boolean;
  getSequenceInfo(): Promise<SequenceInfo | null>;
  insertOverlay(overlay: Overlay, options: InsertOptions): Promise<InsertResult>;
  getTheme(): Theme;
  onThemeChange(listener: (theme: Theme) => void): Unsubscribe;
  openExternal(url: string): void;
}

export const DEFAULT_INSERT_OPTIONS: InsertOptions = { durationSeconds: 3, label: "ICG comment" };
