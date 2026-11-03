export type TrackItem = {
  start: number;
  end: number;
};

export type VideoTrack = {
  index: number;
  items: TrackItem[];
};

export type InsertPlan = {
  trackIndex: number;
  tracksToAdd: number;
};

export function isRangeFree(items: TrackItem[], start: number, durationFrames: number): boolean {
  const end = start + durationFrames;
  return items.every((item) => item.end <= start || item.start >= end);
}

export function planInsert(
  tracks: VideoTrack[],
  playheadFrame: number,
  durationFrames: number,
): InsertPlan {
  const ordered = [...tracks].sort((a, b) => a.index - b.index);
  const free = ordered.find((track) => isRangeFree(track.items, playheadFrame, durationFrames));
  if (free) return { trackIndex: free.index, tracksToAdd: 0 };
  const highest = ordered.length ? ordered[ordered.length - 1]!.index : 0;
  return { trackIndex: highest + 1, tracksToAdd: 1 };
}
