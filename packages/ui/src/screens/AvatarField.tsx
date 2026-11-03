import type { Avatar } from "@icg/shared";
import { useState } from "react";
import { errorMessage } from "../cards";
import { usePanel } from "../context";
import { Button, Field } from "../controls";
import { avatarFromFile } from "../images";
import { AvatarThumb } from "./CardPreview";
import css from "./screens.module.css";

const sameAvatar = (a: Avatar, b: Avatar) => JSON.stringify(a) === JSON.stringify(b);

export function AvatarField({
  label,
  avatar,
  onChange,
  onShuffle,
}: {
  label: string;
  avatar: Avatar;
  onChange: (avatar: Avatar) => void;
  onShuffle?: (() => void) | undefined;
}) {
  const { assets } = usePanel();
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await avatarFromFile(file));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Field label={label} error={error}>
      <div className={css.avatarRow}>
        <AvatarThumb avatar={avatar} size={40} />
        {onShuffle ? (
          <Button small onClick={onShuffle} aria-label={`Shuffle ${label}`}>
            Shuffle
          </Button>
        ) : null}
        <label className={css.fileButton}>
          Upload
          <input
            className={css.fileInput}
            type="file"
            accept="image/*"
            aria-label={`Upload ${label} image`}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {assets.silhouettes.length > 0 ? (
        <div className={css.avatarRow} role="group" aria-label={`Default ${label}s`}>
          {assets.silhouettes.map((silhouette, i) => (
            <button
              key={i}
              type="button"
              className={`${css.avatarPick} ${sameAvatar(silhouette, avatar) ? css.avatarPickOn : ""}`}
              aria-label={`Default ${label} ${i + 1}`}
              aria-pressed={sameAvatar(silhouette, avatar)}
              onClick={() => onChange(silhouette)}
            >
              <AvatarThumb avatar={silhouette} size={24} />
            </button>
          ))}
        </div>
      ) : null}
    </Field>
  );
}
