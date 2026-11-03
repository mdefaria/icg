import { useState } from "react";
import { z } from "zod";
import { Button } from "./controls";
import css from "./screens/screens.module.css";

export const UpdateInfo = z.object({
  latest: z.string().min(1),
  url: z.url(),
  notes: z.string().optional(),
});
export type UpdateInfo = z.infer<typeof UpdateInfo>;

export function UpdateBanner({
  info,
  onOpen,
}: {
  info: UpdateInfo | null;
  onOpen: (url: string) => void;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!info || dismissed === info.latest) return null;
  return (
    <div className={css.banner} role="status">
      <div className={css.bannerText}>
        <strong>ICG {info.latest} is available.</strong>
        {info.notes ? <span className={css.bannerNotes}>{info.notes}</span> : null}
      </div>
      <Button kind="primary" small onClick={() => onOpen(info.url)}>
        Get update
      </Button>
      <Button kind="ghost" small onClick={() => setDismissed(info.latest)}>
        Later
      </Button>
    </div>
  );
}
