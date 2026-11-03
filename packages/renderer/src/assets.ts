import type { Avatar } from "@icg/shared";
import { z } from "zod";
import { base64ToBytes, bytesToDataUrl, sniffImageMime, type ImageMime } from "./bytes";
import type { EmojiLoader } from "./emoji";
import type { FontSet } from "./fonts";

export { sniffImageMime, type ImageMime } from "./bytes";

export type AvatarImage = { data: Uint8Array; mime: ImageMime };

export type ToPng = (image: AvatarImage) => Promise<Uint8Array>;

type MaybePromise<T> = T | Promise<T>;

export type PoolResolver = (id: string) => MaybePromise<Uint8Array | undefined>;

export interface AvatarLoader {
  prepare(avatar: Avatar): Promise<void>;
  href(avatar: Avatar): string | undefined;
  missingAvatars(): string[];
}

export type AvatarLoaderOptions = {
  pool?: PoolResolver;
  files?: Record<string, Uint8Array>;
  toPng?: ToPng;
};

export type RenderAssets = {
  fonts: FontSet;
  emoji: EmojiLoader;
  avatars: AvatarLoader;
};

export const PoolIndexLike = z.looseObject({
  entries: z.array(z.looseObject({ id: z.string().min(1), file: z.string().min(1) })),
});
export type PoolIndexLike = z.infer<typeof PoolIndexLike>;

export function poolResolver(
  index: unknown,
  read: (file: string) => MaybePromise<Uint8Array | undefined>,
): PoolResolver {
  const parsed = PoolIndexLike.parse(typeof index === "string" ? JSON.parse(index) : index);
  const files = new Map(parsed.entries.map((e) => [e.id, e.file]));
  return (id) => {
    const file = files.get(id);
    return file ? read(file) : undefined;
  };
}

const UserDataUrl = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/);

const isPromise = <T>(v: MaybePromise<T>): v is Promise<T> =>
  typeof (v as Promise<T> | undefined)?.then === "function";

export function createAvatarLoader(options: AvatarLoaderOptions = {}): AvatarLoader {
  const hrefs = new Map<string, string | null>();
  const pending = new Map<string, Promise<string | null>>();
  const missing = new Set<string>();

  const keyOf = (avatar: Avatar): string | undefined =>
    avatar.kind === "pool"
      ? `pool:${avatar.id}`
      : avatar.kind === "user"
        ? avatar.dataUrl
        : undefined;
  const label = (avatar: Avatar): string =>
    avatar.kind === "pool" ? `pool:${avatar.id}` : avatar.kind === "user" ? "user" : "default";

  const fail = (key: string, avatar: Avatar, reason: string): null => {
    hrefs.set(key, null);
    missing.add(`${label(avatar)}: ${reason}`);
    return null;
  };

  const encode = (key: string, avatar: Avatar, bytes: Uint8Array): MaybePromise<string | null> => {
    const mime = sniffImageMime(bytes);
    if (!mime) return fail(key, avatar, "not a PNG, JPEG, GIF or WebP image");
    if (mime !== "image/webp") {
      const href = bytesToDataUrl(mime, bytes);
      hrefs.set(key, href);
      return href;
    }
    if (!options.toPng) return fail(key, avatar, "WebP needs a converter (toPng)");
    return options.toPng({ data: bytes, mime }).then(
      (png) => {
        const href = bytesToDataUrl("image/png", png);
        hrefs.set(key, href);
        return href;
      },
      () => fail(key, avatar, "WebP conversion failed"),
    );
  };

  const resolveBytes = (avatar: Avatar): MaybePromise<Uint8Array | undefined> => {
    if (avatar.kind === "user") {
      const parsed = UserDataUrl.safeParse(avatar.dataUrl);
      if (!parsed.success) return undefined;
      return base64ToBytes(parsed.data.slice(parsed.data.indexOf(",") + 1).replace(/\s/g, ""));
    }
    if (avatar.kind !== "pool") return undefined;
    const inMemory = options.files?.[avatar.id];
    if (inMemory) return inMemory;
    return options.pool?.(avatar.id);
  };

  const start = (avatar: Avatar): MaybePromise<string | null | undefined> => {
    const key = keyOf(avatar);
    if (!key) return undefined;
    if (hrefs.has(key)) return hrefs.get(key);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const bytes = resolveBytes(avatar);
    const next = (b: Uint8Array | undefined) =>
      b
        ? encode(key, avatar, b)
        : fail(key, avatar, avatar.kind === "user" ? "invalid data URL" : "not found");
    const result = isPromise(bytes)
      ? bytes.then(next, () => fail(key, avatar, "read failed"))
      : next(bytes);
    if (isPromise(result)) {
      const tracked = result.finally(() => pending.delete(key));
      pending.set(key, tracked);
      return tracked;
    }
    return result;
  };

  return {
    async prepare(avatar) {
      await start(avatar);
    },
    href(avatar) {
      const result = start(avatar);
      return isPromise(result) ? undefined : (result ?? undefined);
    },
    missingAvatars: () => [...missing],
  };
}

const AVATAR_EXTENSIONS = ["png", "webp", "jpg", "jpeg", "gif"];

export function avatarDirectory(
  read: (file: string) => Promise<Uint8Array | undefined>,
): PoolResolver {
  let resolver: Promise<PoolResolver | undefined> | undefined;
  const indexed = (): Promise<PoolResolver | undefined> => {
    resolver ??= read("index.json").then(
      (bytes) => (bytes ? poolResolver(new TextDecoder().decode(bytes), read) : undefined),
      () => undefined,
    );
    return resolver;
  };
  return async (id) => {
    const fromIndex = await indexed();
    if (fromIndex) return fromIndex(id);
    for (const ext of AVATAR_EXTENSIONS) {
      const bytes = await read(`${id}.${ext}`).catch(() => undefined);
      if (bytes) return bytes;
    }
    return undefined;
  };
}
