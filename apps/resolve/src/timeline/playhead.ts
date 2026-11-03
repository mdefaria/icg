import { timecodeToFrames } from "./timecode";

export type PlayheadInput = {
  currentTimecode: string;
  startTimecode: string;
  startFrame: number;
  frameRate: number;
  dropFrame: boolean;
};

export type Playhead = {
  frame: number;
  offsetFrames: number;
  offsetSeconds: number;
};

export function resolvePlayhead(input: PlayheadInput): Playhead | null {
  const current = timecodeToFrames(input.currentTimecode, input.frameRate, input.dropFrame);
  const start = timecodeToFrames(input.startTimecode, input.frameRate, input.dropFrame);
  if (current === null || start === null) return null;
  const offsetFrames = Math.max(0, current - start);
  return {
    frame: input.startFrame + offsetFrames,
    offsetFrames,
    offsetSeconds: offsetFrames / input.frameRate,
  };
}

export function durationToFrames(durationSeconds: number, frameRate: number): number {
  return Math.max(1, Math.round(durationSeconds * frameRate));
}
