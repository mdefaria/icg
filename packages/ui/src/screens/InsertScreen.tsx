import { DEFAULT_INSERT_OPTIONS, type InsertOptions, type InsertResult } from "@icg/host-sdk";
import { DEFAULT_PLACEMENT, type Comment } from "@icg/shared";
import { useState } from "react";
import { errorMessage } from "../cards";
import { usePanel } from "../context";
import { Actions, Button, Notice, NumberInput, Row, Section } from "../controls";
import { FRAME_LABELS, PLATFORM_LABELS } from "../labels";
import { planBatch } from "../placement";
import { useSetting } from "../settings";
import css from "./screens.module.css";

export type StaggeredInsertOptions = InsertOptions & { offsetSeconds: number };

type ItemStatus =
  | { status: "waiting" }
  | { status: "rendering" }
  | { status: "inserting" }
  | { status: "error"; message: string }
  | InsertResult;

export function insertLabel(canInsert: boolean): string {
  return canInsert ? "Insert at playhead" : "Download PNG";
}

function describe(item: ItemStatus): { text: string; tone: "ok" | "error" | "muted" } {
  switch (item.status) {
    case "waiting":
      return { text: "Waiting", tone: "muted" };
    case "rendering":
      return { text: "Rendering", tone: "muted" };
    case "inserting":
      return { text: "Inserting", tone: "muted" };
    case "inserted":
      return { text: `Inserted on V${item.track} at ${item.startSeconds}s`, tone: "ok" };
    case "downloaded":
      return { text: `Downloaded ${item.fileName}`, tone: "ok" };
    case "no-sequence":
      return { text: "No sequence open", tone: "error" };
    case "failed":
      return { text: `Failed: ${item.reason}`, tone: "error" };
    case "error":
      return { text: `Failed: ${item.message}`, tone: "error" };
  }
}

export function InsertScreen() {
  const { host, render, cards, settings, state, template, language, frame, sequence, goTo } =
    usePanel();
  const [insert, setInsert] = useSetting(settings, "insert");
  const [placements] = useSetting(settings, "placements");
  const [framePreset] = useSetting(settings, "frame");
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [busy, setBusy] = useState(false);
  const comments = state.comments;
  const seq = sequence.status === "ready" ? sequence.sequence : null;

  const setStatus = (id: string, status: ItemStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: status }));

  const heightOf = async (comment: Comment, scale: number): Promise<number | null> => {
    try {
      const image = await cards.get(comment, template, language);
      return (image.height * scale) / frame.height;
    } catch {
      return null;
    }
  };

  const run = async () => {
    setBusy(true);
    setStatuses(Object.fromEntries(comments.map((c) => [c.id, { status: "waiting" }])));
    const base = placements[template.platform] ?? DEFAULT_PLACEMENT;
    const heights = await Promise.all(comments.map((c) => heightOf(c, base.scale)));
    const plan = planBatch(base, heights, insert.staggerSeconds);
    for (const [i, comment] of comments.entries()) {
      const item = plan[i]!;
      try {
        setStatus(comment.id, { status: "rendering" });
        const overlay = await render({
          comment,
          template,
          frame,
          placement: item.placement,
          language,
        });
        setStatus(comment.id, { status: "inserting" });
        const options: StaggeredInsertOptions = {
          durationSeconds: insert.durationSeconds,
          label:
            comments.length > 1
              ? `${DEFAULT_INSERT_OPTIONS.label} ${i + 1}`
              : DEFAULT_INSERT_OPTIONS.label,
          offsetSeconds: item.offsetSeconds,
        };
        setStatus(comment.id, await host.insertOverlay(overlay, options));
      } catch (e) {
        setStatus(comment.id, { status: "error", message: errorMessage(e) });
      }
    }
    setBusy(false);
  };

  if (comments.length === 0) {
    return (
      <div>
        <Notice>Generate a Comment or write a Manual Comment first.</Notice>
        <Actions>
          <Button kind="primary" onClick={() => goTo("generate")}>
            Go to Generate
          </Button>
        </Actions>
      </div>
    );
  }

  return (
    <div>
      <p className={css.muted}>
        {comments.length === 1 ? "1 Overlay" : `${comments.length} Overlays`} ·{" "}
        {PLATFORM_LABELS[template.platform]} · {frame.width}×{frame.height}
        {seq ? ` · ${seq.name}` : ` · ${FRAME_LABELS[framePreset]}`}
      </p>
      {host.canInsert && sequence.status === "ready" && !seq ? (
        <Notice error>Open a sequence in the Host to Insert at the playhead.</Notice>
      ) : null}
      <Row>
        <NumberInput
          label="Duration (s)"
          value={insert.durationSeconds}
          min={0.1}
          max={600}
          step={0.5}
          onCommit={(durationSeconds) => setInsert({ ...insert, durationSeconds })}
        />
        <NumberInput
          label="Stagger (s)"
          value={insert.staggerSeconds}
          min={0}
          max={60}
          step={0.1}
          hint="Per Comment"
          onCommit={(staggerSeconds) => setInsert({ ...insert, staggerSeconds })}
        />
      </Row>
      <Actions>
        <Button kind="primary" grow disabled={busy} onClick={() => void run()}>
          {insertLabel(host.canInsert)}
        </Button>
      </Actions>
      <Section title="Status">
        <ul className={css.list} aria-label="Insert status">
          {comments.map((comment, i) => {
            const item = statuses[comment.id];
            const described = item ? describe(item) : { text: "Ready", tone: "muted" as const };
            return (
              <li key={comment.id} className={css.status}>
                <span className={css.statusIndex}>{i + 1}</span>
                <span className={css.statusName}>@{comment.author.username}</span>
                <span
                  className={`${css.statusText} ${
                    described.tone === "ok"
                      ? css.statusOk
                      : described.tone === "error"
                        ? css.statusError
                        : ""
                  }`}
                  data-testid={`insert-status-${i + 1}`}
                >
                  {described.text}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
