import type { RegenerableField } from "@icg/engine";
import type { Author, Comment, Reply } from "@icg/shared";
import { useState } from "react";
import { errorMessage } from "../cards";
import { selectedComment } from "../comments";
import { usePanel } from "../context";
import {
  Actions,
  Button,
  Checkbox,
  Checks,
  Notice,
  NumberInput,
  Row,
  Section,
  TextInput,
} from "../controls";
import { AvatarField } from "./AvatarField";
import { CardPreview } from "./CardPreview";
import { required } from "./CreatorSection";
import css from "./screens.module.css";

const FIELD_LABELS: Record<RegenerableField, string> = {
  text: "text",
  author: "username",
  avatar: "Avatar",
  likes: "likes",
  timeAgo: "time",
  reply: "reply",
};

export function EditScreen() {
  const { engine, options, state, dispatch, goTo } = usePanel();
  const comment = selectedComment(state);
  const [error, setError] = useState<string | null>(null);

  if (!comment) {
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

  const index = state.comments.findIndex((c) => c.id === comment.id);
  const update = (patch: Partial<Comment>) =>
    dispatch({ type: "update", comment: { ...comment, ...patch } });
  const updateAuthor = (patch: Partial<Author>) =>
    update({ author: { ...comment.author, ...patch } });
  const updateReply = (patch: Partial<Reply>) => {
    if (comment.reply) update({ reply: { ...comment.reply, ...patch } });
  };
  const removeReply = () => {
    const next = { ...comment };
    delete next.reply;
    dispatch({ type: "update", comment: next });
  };
  const regenerate = (field: RegenerableField) => {
    try {
      dispatch({ type: "update", comment: engine.regenerate(comment, field, options) });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const regen = (field: RegenerableField) => (
    <Button
      kind="ghost"
      small
      aria-label={`Regenerate ${FIELD_LABELS[field]}`}
      onClick={() => regenerate(field)}
    >
      Regenerate
    </Button>
  );

  return (
    <div>
      {state.comments.length > 1 ? (
        <Actions>
          <Button
            small
            disabled={index <= 0}
            onClick={() => dispatch({ type: "select", id: state.comments[index - 1]!.id })}
          >
            Previous
          </Button>
          <span className={css.muted}>
            Comment {index + 1} of {state.comments.length}
          </span>
          <Button
            small
            disabled={index >= state.comments.length - 1}
            onClick={() => dispatch({ type: "select", id: state.comments[index + 1]!.id })}
          >
            Next
          </Button>
        </Actions>
      ) : null}
      <Section>
        <CardPreview comment={comment} />
      </Section>
      {error ? <Notice error>{error}</Notice> : null}
      <TextInput
        label="Username"
        value={comment.author.username}
        validate={required}
        action={regen("author")}
        onCommit={(username) => updateAuthor({ username })}
      />
      <TextInput
        label="Display name"
        value={comment.author.displayName}
        onCommit={(displayName) => updateAuthor({ displayName })}
      />
      <AvatarField
        label="Avatar"
        avatar={comment.author.avatar}
        onChange={(avatar) => updateAuthor({ avatar })}
        onShuffle={() => regenerate("avatar")}
      />
      <TextInput
        label="Text"
        value={comment.text}
        multiline
        action={regen("text")}
        onCommit={(text) => update({ text })}
      />
      <Row>
        <NumberInput
          label="Likes"
          value={comment.likes}
          min={0}
          integer
          action={regen("likes")}
          onCommit={(likes) => update({ likes })}
        />
        <TextInput
          label="Time ago"
          value={comment.timeAgo}
          validate={required}
          action={regen("timeAgo")}
          onCommit={(timeAgo) => update({ timeAgo })}
        />
      </Row>
      <Checks>
        <Checkbox
          label="Verified"
          checked={comment.author.verified}
          onChange={(verified) => updateAuthor({ verified })}
        />
        <Checkbox
          label="Pinned"
          checked={comment.pinned}
          onChange={(pinned) => update({ pinned })}
        />
        <Checkbox
          label="Liked by creator"
          checked={comment.likedByCreator}
          onChange={(likedByCreator) => update({ likedByCreator })}
        />
      </Checks>
      <Section title="Creator reply">
        {comment.reply ? (
          <>
            <TextInput
              label="Reply text"
              value={comment.reply.text}
              multiline
              action={regen("reply")}
              onCommit={(text) => updateReply({ text })}
            />
            <Actions>
              <Button small onClick={removeReply}>
                Remove reply
              </Button>
            </Actions>
          </>
        ) : (
          <Actions>
            <Button small onClick={() => regenerate("reply")}>
              Add creator reply
            </Button>
            <span className={css.muted}>Shown with the Creator reply variant.</span>
          </Actions>
        )}
      </Section>
    </div>
  );
}
