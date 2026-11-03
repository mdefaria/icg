import { BankEntry, Comment } from "@icg/shared";
import type { Author, Reply } from "@icg/shared";
import { z } from "zod";
import { creatorName, generateAuthor } from "./authors";
import { REPLIES } from "./data";
import type { Engine, EngineDeps, GenerateOptions, RegenerableField, Rng } from "./engine";
import { sampleCounts, sampleLikes, sampleReplyLikes, withCounts } from "./likes";
import { alphanumeric, chance, createRng } from "./rng";
import { candidates, fillSlots, pickEntry, RecentIds } from "./select";
import { formatAge, parseAge, sampleAge } from "./time";

export const RECENT_CAPACITY = 50;

const Bank = z.array(BankEntry);

type Batch = {
  rng: Rng;
  creator: Author;
  entries: Set<string>;
  replies: Set<string>;
  usernames: Set<string>;
};

const RETRIES = 8;

export function createEngine(deps: EngineDeps, rng: Rng = Math.random): Engine {
  const bank = Bank.parse(deps.bank);
  const recent = new RecentIds(RECENT_CAPACITY);
  const recentReplies = new RecentIds(RECENT_CAPACITY);

  const newAuthor = (r: Rng, options: GenerateOptions, taken?: Set<string>): Author => {
    let author = generateAuthor(r, options.platform, options.language, deps.pickAvatar);
    for (let i = 0; taken?.has(author.username) && i < RETRIES; i++) {
      author = generateAuthor(r, options.platform, options.language, deps.pickAvatar);
    }
    taken?.add(author.username);
    return author;
  };

  const generatedCreator = (r: Rng, options: GenerateOptions): Author => ({
    ...generateAuthor(r, options.platform, options.language, deps.pickAvatar),
    verified: true,
  });

  const startBatch = (options: GenerateOptions): Batch => {
    const r = options.seed === undefined ? rng : createRng(options.seed);
    const creator = options.creator ?? generatedCreator(r, options);
    return {
      rng: r,
      creator,
      entries: new Set(),
      replies: new Set(),
      usernames: new Set([creator.username]),
    };
  };

  const seeded = (options: GenerateOptions) => options.seed !== undefined;

  const commentText = (
    r: Rng,
    options: GenerateOptions,
    creator: Author,
    batch?: Set<string>,
    seededRun = false,
  ) => {
    const pool = candidates(bank, options);
    const avoid = [seededRun ? new Set<string>() : recent.set, batch ?? new Set<string>()];
    const entry = pickEntry(r, pool, avoid);
    recent.add(entry.id);
    batch?.add(entry.id);
    return fillSlots(entry.text, r, entry.tone, creatorName(creator));
  };

  const replyText = (
    r: Rng,
    options: GenerateOptions,
    creator: Author,
    batch?: Set<string>,
    seededRun = false,
  ) => {
    const pool = candidates(REPLIES[options.language], {
      language: options.language,
      platform: options.platform,
      tones: options.tones,
    });
    const avoid = [seededRun ? new Set<string>() : recentReplies.set, batch ?? new Set<string>()];
    const entry = pickEntry(r, pool, avoid);
    recentReplies.add(entry.id);
    batch?.add(entry.id);
    return fillSlots(entry.text, r, entry.tone, creatorName(creator));
  };

  const makeReply = (
    r: Rng,
    options: GenerateOptions,
    author: Author,
    comment: { likes: number; timeAgo: string },
    text: string,
  ): Reply => ({
    author,
    text,
    likes: sampleReplyLikes(r, comment.likes),
    timeAgo: replyTimeAgo(r, options, comment.timeAgo),
  });

  const replyTimeAgo = (r: Rng, options: GenerateOptions, commentTimeAgo: string): string => {
    const commentAge = parseAge(commentTimeAgo);
    const age =
      commentAge === undefined
        ? sampleAge(r, options.platform)
        : Math.min(commentAge, sampleAge(r, options.platform, commentAge));
    return formatAge(age, options.platform, options.language);
  };

  const build = (options: GenerateOptions, batch: Batch, origin: Comment["origin"]): Comment => {
    const r = batch.rng;
    const manual = origin === "manual";
    const id = `c-${alphanumeric(r, 12)}`;
    const author = newAuthor(r, options, batch.usernames);
    if (manual) author.verified = false;
    const pinned = !manual && chance(r, 0.05);
    const likedByCreator = !manual && chance(r, 0.1);
    const likes = sampleLikes(r, { pinned, likedByCreator });
    const timeAgo = formatAge(sampleAge(r, options.platform), options.platform, options.language);
    const text = manual
      ? ""
      : commentText(r, options, batch.creator, batch.entries, seeded(options));
    const base: Comment = { id, origin, author, text, likes, timeAgo, pinned, likedByCreator };
    const comment = withCounts(base, sampleCounts(r, options.platform, likes));
    if (options.variant !== "creator-reply") return comment;
    const reply = manual
      ? ""
      : replyText(r, options, batch.creator, batch.replies, seeded(options));
    return { ...comment, reply: makeReply(r, options, batch.creator, comment, reply) };
  };

  const regenerators: Record<RegenerableField, (c: Comment, o: GenerateOptions) => Comment> = {
    text: (c, o) => {
      const creator = o.creator ?? c.reply?.author ?? generatedCreator(rng, o);
      let text = commentText(rng, o, creator);
      for (let i = 0; text === c.text && i < RETRIES; i++) text = commentText(rng, o, creator);
      return { ...c, text };
    },
    author: (c, o) => {
      const fresh = newAuthor(rng, o, new Set([c.author.username]));
      return {
        ...c,
        author: {
          ...c.author,
          username: fresh.username,
          displayName: fresh.displayName,
          avatar: fresh.avatar,
        },
      };
    },
    avatar: (c, o) => {
      const before = JSON.stringify(c.author.avatar);
      let avatar = deps.pickAvatar(rng, o.platform);
      for (let i = 0; JSON.stringify(avatar) === before && i < RETRIES; i++)
        avatar = deps.pickAvatar(rng, o.platform);
      return { ...c, author: { ...c.author, avatar } };
    },
    likes: (c, o) => {
      const likes = sampleLikes(rng, c);
      return withCounts({ ...c, likes }, sampleCounts(rng, o.platform, likes));
    },
    timeAgo: (c, o) => {
      const timeAgo = formatAge(sampleAge(rng, o.platform), o.platform, o.language);
      if (!c.reply) return { ...c, timeAgo };
      const commentAge = parseAge(timeAgo);
      const replyAge = parseAge(c.reply.timeAgo);
      const stale = commentAge === undefined || replyAge === undefined || replyAge > commentAge;
      return {
        ...c,
        timeAgo,
        reply: stale ? { ...c.reply, timeAgo: replyTimeAgo(rng, o, timeAgo) } : c.reply,
      };
    },
    reply: (c, o) => {
      if (!c.reply && o.variant !== "creator-reply") return c;
      const author = c.reply?.author ?? o.creator ?? generatedCreator(rng, o);
      let text = c.reply?.text ?? "";
      if (c.origin === "generated") {
        text = replyText(rng, o, author);
        for (let i = 0; text === c.reply?.text && i < RETRIES; i++)
          text = replyText(rng, o, author);
      }
      return { ...c, reply: makeReply(rng, o, author, c, text) };
    },
  };

  return {
    generate: (options) => build(options, startBatch(options), "generated"),
    generateMany: (options, count) => {
      const batch = startBatch(options);
      return Array.from({ length: Math.max(0, Math.floor(count)) }, () =>
        build(options, batch, "generated"),
      );
    },
    regenerate: (comment, field, options) => regenerators[field](Comment.parse(comment), options),
    manual: (options) => build(options, startBatch(options), "manual"),
  };
}
