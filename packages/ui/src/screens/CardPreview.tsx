import type { Avatar, Comment } from "@icg/shared";
import { useCardImage } from "../cards";
import { usePanel } from "../context";
import { PLATFORM_LABELS } from "../labels";
import css from "./screens.module.css";

const DISPLAY_SCALE = 0.3;

export function CardPreview({ comment }: { comment: Comment }) {
  const { cards, template, language } = usePanel();
  const { image, pending, error } = useCardImage(cards, comment, template, language);
  const alt = `${PLATFORM_LABELS[template.platform]} Comment by ${comment.author.username}`;
  return (
    <div className={css.preview} aria-busy={pending}>
      {error ? (
        <div className={css.previewError} role="alert">
          Preview failed: {error}
        </div>
      ) : image ? (
        <>
          <img
            className={css.previewImage}
            src={image.url}
            alt={alt}
            style={{ width: Math.round(image.width * DISPLAY_SCALE) }}
          />
          {pending ? <div className={css.updating}>Updating preview</div> : null}
        </>
      ) : (
        <div className={css.skeleton} data-testid="card-skeleton" aria-label="Rendering preview">
          <div className={css.skeletonAvatar} />
          <div className={css.skeletonLines}>
            <div className={css.skeletonLine} style={{ width: "35%" }} />
            <div className={css.skeletonLine} style={{ width: "90%" }} />
            <div className={css.skeletonLine} style={{ width: "60%" }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function AvatarThumb({ avatar, size }: { avatar: Avatar; size: number }) {
  const { assets } = usePanel();
  const src = assets.avatarSrc(avatar);
  return (
    <span className={css.avatar} style={{ width: size, height: size, display: "block" }}>
      {src ? (
        <img src={src} alt="" />
      ) : avatar.kind === "default" && avatar.letter ? (
        <span className={css.avatarLetter} style={{ fontSize: size * 0.45 }}>
          {avatar.letter}
        </span>
      ) : (
        <>
          <span className={css.silhouetteHead} />
          <span className={css.silhouetteBody} />
        </>
      )}
    </span>
  );
}
