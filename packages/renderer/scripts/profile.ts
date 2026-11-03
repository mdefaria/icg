import { FRAME_PRESETS, type Comment } from "@icg/shared";
import { sampleComment } from "../src/fixtures";
import { loadNodeAssets } from "../src/node-assets";
import { renderOverlay } from "../src/render";
import { initRenderer } from "../src/wasm";

await initRenderer();
const assets = loadNodeAssets();
const template = { platform: "tiktok", theme: "dark", variant: "creator-reply" } as const;

async function median(label: string, comment: Comment, runs = 5) {
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await renderOverlay(
      {
        comment,
        template,
        frame: FRAME_PRESETS["9:16"],
        placement: { x: 0.5, y: 0.62, scale: 0.92 },
      },
      assets,
    );
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  console.log(`${label.padEnd(40)} ${t[Math.floor(runs / 2)]!.toFixed(0)} ms`);
}

const full = sampleComment("tiktok", "en", 0);
const stripEmoji = (s: string) =>
  s.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D|[\u{1F3FB}-\u{1F3FF}]/gu, "");
const noEmoji: Comment = {
  ...full,
  text: stripEmoji(full.text),
  author: { ...full.author, displayName: stripEmoji(full.author.displayName) },
  reply: full.reply && { ...full.reply, text: stripEmoji(full.reply.text) },
};
const defaultAvatars: Comment = {
  ...noEmoji,
  likedByCreator: false,
  author: { ...noEmoji.author, avatar: { kind: "default", letter: "L" } },
  reply: noEmoji.reply && {
    ...noEmoji.reply,
    author: { ...noEmoji.reply.author, avatar: { kind: "default", letter: "N" } },
  },
};
const noText: Comment = {
  ...defaultAvatars,
  text: "",
  reply: defaultAvatars.reply && { ...defaultAvatars.reply, text: "" },
};

await median("full card (emoji + pool avatars + text)", full);
await median("no emoji", noEmoji);
await median("no emoji, letter avatars", defaultAvatars);
await median("no emoji, letter avatars, empty text", noText);
