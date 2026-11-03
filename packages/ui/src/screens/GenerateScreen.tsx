import type { Context } from "@icg/shared";
import { useState } from "react";
import { errorMessage } from "../cards";
import { usePanel } from "../context";
import {
  Actions,
  Button,
  Chips,
  Notice,
  NumberInput,
  Row,
  Section,
  Segmented,
  Select,
} from "../controls";
import {
  CONTEXT_LABELS,
  LANGUAGE_LABELS,
  PLATFORM_LABELS,
  THEME_LABELS,
  TONE_LABELS,
  VARIANT_LABELS,
  options,
} from "../labels";
import { useSetting, type GenerateSettings } from "../settings";
import { CardPreview } from "./CardPreview";
import { CreatorSection } from "./CreatorSection";
import css from "./screens.module.css";

const ANY_CONTEXT = "any";
const CONTEXT_OPTIONS = [{ value: ANY_CONTEXT, label: "Any" }, ...options(CONTEXT_LABELS)];

export function GenerateScreen() {
  const { engine, settings, options: generateOptions, state, dispatch, goTo } = usePanel();
  const [generate, setGenerate] = useSetting(settings, "generate");
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<GenerateSettings>) => setGenerate({ ...generate, ...patch });

  const run = (produce: () => void) => {
    try {
      produce();
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onGenerate = () =>
    run(() =>
      dispatch({ type: "add", comments: engine.generateMany(generateOptions, generate.count) }),
    );
  const onManual = () =>
    run(() => {
      dispatch({ type: "add", comments: [engine.manual(generateOptions)], select: true });
      goTo("edit");
    });

  return (
    <div>
      <Segmented
        label="Platform"
        value={generate.platform}
        options={options(PLATFORM_LABELS)}
        onChange={(platform) => update({ platform })}
      />
      <Row>
        <Segmented
          label="Theme"
          value={generate.theme}
          options={options(THEME_LABELS)}
          onChange={(theme) => update({ theme })}
        />
        <Segmented
          label="Language"
          value={generate.language}
          options={[
            { value: "en", label: "EN" },
            { value: "es", label: "ES" },
          ]}
          onChange={(language) => update({ language })}
        />
      </Row>
      <Segmented
        label="Variant"
        value={generate.variant}
        options={options(VARIANT_LABELS)}
        onChange={(variant) => update({ variant })}
      />
      <Chips
        label="Tone"
        values={generate.tones}
        options={options(TONE_LABELS)}
        onChange={(tones) => update({ tones })}
        hint={generate.tones.length === 0 ? "No tone picked: any tone" : undefined}
      />
      <Row>
        <Select
          label="Context"
          value={generate.context ?? ANY_CONTEXT}
          options={CONTEXT_OPTIONS}
          onChange={(value) =>
            update({ context: value === ANY_CONTEXT ? null : (value as Context) })
          }
        />
        <NumberInput
          label="Count"
          value={generate.count}
          min={1}
          max={10}
          integer
          onCommit={(count) => update({ count })}
        />
      </Row>
      <CreatorSection />
      <Actions>
        <Button kind="primary" grow onClick={onGenerate}>
          Generate
        </Button>
        <Button onClick={onManual}>Manual</Button>
        {state.comments.length > 0 ? (
          <Button kind="ghost" onClick={() => dispatch({ type: "clear" })}>
            Clear
          </Button>
        ) : null}
      </Actions>
      {error ? <Notice error>{error}</Notice> : null}
      {state.comments.length === 0 ? (
        <p className={css.muted}>
          Generated Comments appear here in {LANGUAGE_LABELS[generate.language]}. Each one becomes
          its own Overlay when you Insert.
        </p>
      ) : (
        <Section title={`Comments (${state.comments.length})`}>
          <ul className={css.list} aria-label="Comments">
            {state.comments.map((comment, i) => (
              <li
                key={comment.id}
                className={`${css.item} ${comment.id === state.selectedId ? css.itemSelected : ""}`}
              >
                <div className={css.itemHead}>
                  <span className={css.itemTitle}>
                    {i + 1}. @{comment.author.username}
                    {comment.origin === "manual" ? " (Manual)" : ""}
                  </span>
                  <Button
                    kind="ghost"
                    small
                    aria-label={`Edit Comment ${i + 1}`}
                    onClick={() => {
                      dispatch({ type: "select", id: comment.id });
                      goTo("edit");
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    kind="ghost"
                    small
                    aria-label={`Remove Comment ${i + 1}`}
                    onClick={() => dispatch({ type: "remove", id: comment.id })}
                  >
                    Remove
                  </Button>
                </div>
                <CardPreview comment={comment} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
