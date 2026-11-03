export type Timecode = {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  dropFrame: boolean;
};

const TIMECODE = /^(\d{2}):(\d{2}):(\d{2})([:;.,])(\d{2,3})$/;

export function parseTimecode(text: string): Timecode | null {
  const match = TIMECODE.exec(text.trim());
  if (!match) return null;
  const [, h, m, s, separator, f] = match;
  return {
    hours: Number(h),
    minutes: Number(m),
    seconds: Number(s),
    frames: Number(f),
    dropFrame: separator === ";" || separator === ",",
  };
}

export function parseFrameRate(text: string): { frameRate: number; dropFrame: boolean } | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(DF)?\s*$/i.exec(text);
  if (!match) return null;
  const frameRate = Number(match[1]);
  if (!(frameRate > 0)) return null;
  return { frameRate, dropFrame: match[2] !== undefined };
}

export function nominalFrameRate(frameRate: number): number {
  return Math.round(frameRate);
}

export function supportsDropFrame(frameRate: number): boolean {
  const nominal = nominalFrameRate(frameRate);
  return (nominal === 30 || nominal === 60) && Math.abs(frameRate - nominal) > 0.001;
}

function droppedFramesPerMinute(frameRate: number): number {
  return Math.round(frameRate * 0.0666666);
}

export function timecodeToFrames(
  timecode: Timecode | string,
  frameRate: number,
  dropFrame?: boolean,
): number | null {
  const tc = typeof timecode === "string" ? parseTimecode(timecode) : timecode;
  if (!tc) return null;
  const nominal = nominalFrameRate(frameRate);
  const useDropFrame = (dropFrame ?? tc.dropFrame) && supportsDropFrame(frameRate);
  const linear =
    tc.hours * 3600 * nominal + tc.minutes * 60 * nominal + tc.seconds * nominal + tc.frames;
  if (!useDropFrame) return linear;
  const totalMinutes = tc.hours * 60 + tc.minutes;
  return (
    linear - droppedFramesPerMinute(frameRate) * (totalMinutes - Math.floor(totalMinutes / 10))
  );
}

export function framesToTimecode(frame: number, frameRate: number, dropFrame: boolean): string {
  const nominal = nominalFrameRate(frameRate);
  const useDropFrame = dropFrame && supportsDropFrame(frameRate);
  let frameNumber = Math.max(0, Math.round(frame));
  if (useDropFrame) {
    const dropped = droppedFramesPerMinute(frameRate);
    const framesPerTenMinutes = Math.round(frameRate * 600);
    const framesPerMinute = nominal * 60 - dropped;
    const tenMinuteBlocks = Math.floor(frameNumber / framesPerTenMinutes);
    const remainder = frameNumber % framesPerTenMinutes;
    const extraMinutes =
      remainder < dropped ? 0 : Math.floor((remainder - dropped) / framesPerMinute);
    frameNumber += dropped * (9 * tenMinuteBlocks + extraMinutes);
  }
  const frames = frameNumber % nominal;
  const seconds = Math.floor(frameNumber / nominal) % 60;
  const minutes = Math.floor(frameNumber / (nominal * 60)) % 60;
  const hours = Math.floor(frameNumber / (nominal * 3600)) % 24;
  const separator = useDropFrame ? ";" : ":";
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(frames)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
