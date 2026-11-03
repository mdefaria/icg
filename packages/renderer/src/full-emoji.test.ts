import { beforeAll, describe, expect, it } from "vitest";
import { sampleComment } from "./fixtures";
import { createNodeAssets, fullEmojiAvailable, PACKAGE_PATHS } from "./node-assets";
import { buildCard, prepareComment, renderCommentPng } from "./render";
import { initRenderer } from "./wasm";

const TEXT = "#️⃣ 1️⃣ ©️ ❤️ ❤️‍🔥 👍🏽 👨‍💻 🏳️‍🌈 🇲🇽 🇪🇸 🏴󠁧󠁢󠁳󠁣󠁴󠁿 🌆 🫠 🧑🏿‍🦼‍➡️ 🦖";

describe.skipIf(!fullEmojiAvailable())("full emoji sets from scripts/fetch-emoji.ts", () => {
  const assets = createNodeAssets({ emojiDir: PACKAGE_PATHS.fullEmoji });

  beforeAll(async () => {
    await initRenderer();
  });

  for (const platform of ["tiktok", "x"] as const) {
    it(`finds keycaps, flags, ZWJ and skin-tone sequences for ${platform}`, async () => {
      const comment = { ...sampleComment(platform, "en", 0), text: TEXT };
      const template = { platform, theme: "dark", variant: "single" } as const;
      await prepareComment(comment, template, assets);
      expect(buildCard(comment, template, assets).missingEmoji).toEqual([]);
      const png = await renderCommentPng(comment, template, 1, assets);
      expect(png.length).toBeGreaterThan(10_000);
    });
  }
});
