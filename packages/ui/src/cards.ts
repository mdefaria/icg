import type { Comment, Language, Overlay, OverlaySpec, Template } from "@icg/shared";
import { useEffect, useRef, useState } from "react";
import { bytesToDataUrl, cropToContent } from "./images";

export type RenderOverlay = (spec: OverlaySpec) => Promise<Overlay>;

export type CardImage = {
  url: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export const CARD_RENDER_SCALE = 0.5;
const STAGE = { width: 1100, height: 2200 };
export const PLACEHOLDER_CARD = { width: 1032, height: 420 };

export async function renderCardImage(
  render: RenderOverlay,
  comment: Comment,
  template: Template,
  language: Language,
): Promise<CardImage> {
  const s = CARD_RENDER_SCALE;
  const frame = { width: Math.round(STAGE.width * s), height: Math.round(STAGE.height * s) };
  const overlay = await render({
    comment,
    template,
    frame,
    placement: { x: 0.5, y: 0.5, scale: s },
    language,
  });
  const full = bytesToDataUrl(overlay.png);
  const crop = await cropToContent(full, overlay.frame.width, overlay.frame.height);
  const box = crop?.box ?? { x: 0, y: 0, width: overlay.frame.width, height: overlay.frame.height };
  return {
    url: crop?.url ?? full,
    width: box.width / s,
    height: box.height / s,
    offsetX: (box.x + box.width / 2 - overlay.frame.width / 2) / s,
    offsetY: (box.y + box.height / 2 - overlay.frame.height / 2) / s,
  };
}

export interface CardImages {
  get(comment: Comment, template: Template, language: Language): Promise<CardImage>;
}

const CACHE_SIZE = 60;

export function createCardImages(render: RenderOverlay): CardImages {
  const cache = new Map<string, Promise<CardImage>>();
  let queue: Promise<unknown> = Promise.resolve();
  return {
    get(comment, template, language) {
      const key = JSON.stringify([comment, template, language]);
      const hit = cache.get(key);
      if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const job = queue.then(() => renderCardImage(render, comment, template, language));
      queue = job.catch(() => undefined);
      cache.set(key, job);
      job.catch(() => cache.delete(key));
      while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
      return job;
    },
  };
}

export type CardState = { image: CardImage | null; pending: boolean; error: string | null };

export const PREVIEW_DEBOUNCE_MS = 150;

export function useCardImage(
  cards: CardImages,
  comment: Comment | null,
  template: Template,
  language: Language,
): CardState {
  const [state, setState] = useState<CardState>({
    image: null,
    pending: comment !== null,
    error: null,
  });
  const key = comment ? JSON.stringify([comment, template, language]) : null;
  const shown = useRef(false);

  useEffect(() => {
    if (!comment) {
      setState({ image: null, pending: false, error: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, pending: true, error: null }));
    const timer = setTimeout(
      () => {
        cards.get(comment, template, language).then(
          (image) => {
            shown.current = true;
            if (!cancelled) setState({ image, pending: false, error: null });
          },
          (error: unknown) => {
            if (!cancelled) setState({ image: null, pending: false, error: errorMessage(error) });
          },
        );
      },
      shown.current ? PREVIEW_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cards, key]);

  return state;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
