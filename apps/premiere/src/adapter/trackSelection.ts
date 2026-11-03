export type Span = { startSeconds: number; endSeconds: number };

export type TrackOccupancy = { index: number; clips: Span[] };

export type TrackChoice = { kind: "existing"; index: number } | { kind: "create"; index: number };

export function spanAt(playheadSeconds: number, durationSeconds: number): Span {
  return { startSeconds: playheadSeconds, endSeconds: playheadSeconds + durationSeconds };
}

export function overlaps(a: Span, b: Span): boolean {
  return a.startSeconds < b.endSeconds && b.startSeconds < a.endSeconds;
}

export function isTrackFree(track: TrackOccupancy, span: Span): boolean {
  return !track.clips.some((clip) => overlaps(clip, span));
}

export function chooseTrack(tracks: TrackOccupancy[], span: Span): TrackChoice {
  const sorted = [...tracks].sort((a, b) => a.index - b.index);
  const highestOccupied = sorted.reduce(
    (highest, track) => (isTrackFree(track, span) ? highest : Math.max(highest, track.index)),
    -1,
  );
  const candidate = sorted.find(
    (track) => track.index > highestOccupied && isTrackFree(track, span),
  );
  if (candidate) return { kind: "existing", index: candidate.index };
  const top = sorted.length ? (sorted[sorted.length - 1]?.index ?? -1) + 1 : 0;
  return { kind: "create", index: top };
}
