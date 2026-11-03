import { DEFAULT_PLACEMENT, type FramePreset, type Placement } from "@icg/shared";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { PLACEHOLDER_CARD, useCardImage } from "../cards";
import { selectedComment } from "../comments";
import { usePanel } from "../context";
import { Actions, Button, Checkbox, Checks, Notice, Select, Slider } from "../controls";
import { FRAME_LABELS, PLATFORM_LABELS, options } from "../labels";
import {
  SAFE_ZONES,
  cardFraction,
  clampPlacement,
  isPortrait,
  nudgePlacement,
  round,
  snapLines,
  snapPlacement,
  type Direction,
} from "../placement";
import { useSetting } from "../settings";
import css from "./screens.module.css";

const PREVIEW_MAX_HEIGHT = 440;
const KEYS: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

type Drag = {
  pointerId: number;
  x: number;
  y: number;
  start: Placement;
  width: number;
  height: number;
};

const pct = (v: number) => `${round(v * 100)}%`;

export function PlacementScreen() {
  const { settings, cards, state, template, language, frame, sequence } = usePanel();
  const [placements, setPlacements] = useSetting(settings, "placements");
  const [snap, setSnap] = useSetting(settings, "snap");
  const [safeZones, setSafeZones] = useSetting(settings, "safeZones");
  const [framePreset, setFramePreset] = useSetting(settings, "frame");
  const comment = selectedComment(state);
  const card = useCardImage(cards, comment, template, language);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<Placement | null>(null);

  const saved = placements[template.platform] ?? DEFAULT_PLACEMENT;
  const placement = live ?? saved;
  const save = (next: Placement) =>
    setPlacements({ ...placements, [template.platform]: clampPlacement(next) });

  const natural = card.image ?? { ...PLACEHOLDER_CARD, offsetX: 0, offsetY: 0 };
  const size = cardFraction(natural, frame, placement.scale);
  const snapSize = snap ? size : null;
  const left = placement.x + (natural.offsetX * placement.scale) / frame.width - size.width / 2;
  const top = placement.y + (natural.offsetY * placement.scale) / frame.height - size.height / 2;

  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || d.width === 0 || d.height === 0) return null;
    const moved = clampPlacement({
      ...d.start,
      x: round(d.start.x + (e.clientX - d.x) / d.width),
      y: round(d.start.y + (e.clientY - d.y) / d.height),
    });
    return snapSize ? snapPlacement(moved, snapSize) : moved;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    drag.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      start: saved,
      width: rect.width,
      height: rect.height,
    };
    setLive(saved);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const next = moveTo(e);
    if (next) setLive(next);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const next = moveTo(e);
    if (drag.current?.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    drag.current = null;
    setLive(null);
    if (next) save(next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const direction = KEYS[e.key];
    if (!direction) return;
    e.preventDefault();
    save(nudgePlacement(saved, direction, { snap: snapSize, large: e.shiftKey }));
  };

  const portrait = isPortrait(frame);
  const zones = safeZones && portrait ? SAFE_ZONES[template.platform] : [];
  const lines = snap ? snapLines(size) : null;
  const seq = sequence.status === "ready" ? sequence.sequence : null;

  return (
    <div>
      {seq ? (
        <p className={css.muted}>
          {seq.name} · {seq.width}×{seq.height}
        </p>
      ) : (
        <Select<FramePreset>
          label="Frame"
          value={framePreset}
          options={options(FRAME_LABELS)}
          onChange={setFramePreset}
        />
      )}
      {comment ? null : <Notice>No Comment yet: the outline shows where Comments will go.</Notice>}
      <div
        className={css.frameWrap}
        style={{ maxWidth: Math.round((PREVIEW_MAX_HEIGHT * frame.width) / frame.height) }}
      >
        <div
          ref={frameRef}
          className={css.frame}
          style={{ paddingBottom: pct(frame.height / frame.width) }}
          data-testid="frame-preview"
        >
          <div className={css.frameLayer}>
            {zones.map((zone) => (
              <div
                key={zone.label}
                className={css.guide}
                style={{
                  left: pct(zone.box.x),
                  top: pct(zone.box.y),
                  width: pct(zone.box.width),
                  height: pct(zone.box.height),
                }}
              >
                <div className={css.guideLabel}>{zone.label}</div>
              </div>
            ))}
            {lines
              ? lines.ys.flatMap((y, yi) =>
                  lines.xs.map((x, xi) => (
                    <span
                      key={`${xi}-${yi}`}
                      className={css.snapDot}
                      style={{ left: pct(x), top: pct(y) }}
                    />
                  )),
                )
              : null}
            <div
              className={css.card}
              role="slider"
              tabIndex={0}
              aria-label={`${PLATFORM_LABELS[template.platform]} Placement`}
              aria-valuetext={`x ${pct(placement.x)}, y ${pct(placement.y)}`}
              aria-valuenow={round(placement.y * 100)}
              data-testid="placement-card"
              aria-busy={card.pending}
              style={{ left: pct(left), top: pct(top), width: pct(size.width) }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
            >
              {card.image ? (
                <img className={css.cardImage} src={card.image.url} alt="" draggable={false} />
              ) : (
                <div
                  className={css.cardPlaceholder}
                  style={{ paddingBottom: pct(natural.height / natural.width) }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={css.readout}>
        x {pct(placement.x)} · y {pct(placement.y)} · scale {pct(placement.scale)}
        {" · drag, or use the arrow keys"}
      </div>
      <Slider
        label="Scale"
        value={placement.scale}
        min={0.25}
        max={2}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(scale) => save({ ...saved, scale })}
      />
      <Checks>
        <Checkbox label="Snap to 9 points" checked={snap} onChange={setSnap} />
        <Checkbox
          label={`${PLATFORM_LABELS[template.platform]} safe zones`}
          checked={safeZones}
          onChange={setSafeZones}
        />
      </Checks>
      {safeZones && !portrait ? (
        <p className={css.muted}>Safe-zone guides are drawn for vertical Frames only.</p>
      ) : null}
      {safeZones && portrait && SAFE_ZONES[template.platform].length === 0 ? (
        <p className={css.muted}>
          {PLATFORM_LABELS[template.platform]} has no overlay UI to avoid.
        </p>
      ) : null}
      <Actions>
        <Button small onClick={() => save(DEFAULT_PLACEMENT)}>
          Reset Placement
        </Button>
        <span className={css.muted}>Remembered for {PLATFORM_LABELS[template.platform]}.</span>
      </Actions>
    </div>
  );
}
