# @icg/bank

The Bank: hand-written Comment texts in English and Spanish, tagged by tone, Context and (rarely) Platform. The engine draws from it; nothing is generated at runtime (ADR 0001).

## Layout

- `data/<language>/<tone>.json`: one JSON array of `BankEntry` inputs per language and tone, formatted by Prettier. Fields: `id` (`en-hype-0001`), `language`, `tone`, `text`, optional `platforms`, `contexts`, `weight`.
- `src/index.ts`: `loadBank()`, `loadBankByLanguage(language)` and `BANK_STATS`. The JSON is imported statically so every Host bundle carries it.
- `scripts/lint-bank.ts`: the gate. Runs as part of `pnpm test`.
- `scripts/preview.ts`: prints random entries with slots filled in.

## Writing entries

- Each text should read like a real comment from a specific kind of person. Vary length, casing, punctuation and slang; keep typos rare and believable.
- Slots: `{creator}` (the creator's name, about 10% of entries), `{n}` (a small number, rarely), `{emoji}` (any emoji that fits the tone). No other braces.
- `contexts`: tag only entries that make sense on just that kind of video (`short-film`, `ad`, `tutorial`, `vlog`, `music`). Untagged means universal, so untagged entries can land on an ad too.
- `platforms`: tag only entries that are genuinely Platform-specific (a "fyp" or "duet" line is TikTok, "subscribed" is YouTube).
- `emoji` entries contain no words.
- Legal line: `product` entries and anything tagged `ad` are neutral questions, jokes or curiosity ("price?", "does it come in black", "the editing on this ad is better than the product lol"). Never endorsements or testimonials, anywhere in the Bank. No slurs, sexual content, harassment of real people, brand or celebrity names, or medical or financial claims.
- Spanish is written natively across Spain, Mexico, Rioplatense, Colombian and neutral Latin American registers, never translated from English.

## Lint rules

`pnpm --filter @icg/bank lint:bank` checks, per language:

- every entry parses with `BankEntry` from `@icg/shared` and matches its file's language and tone; ids are unique and well formed;
- no exact duplicates and no near duplicates (multiset Jaccard on normalised tokens above 0.8, slots ignored);
- slot syntax;
- the endorsement, claim and brand blacklists (`BLACKLIST`, `BRANDS` in the script), matched on whole words of the normalised text;
- per-tone counts of at least 75% of the target and at least 1,200 entries per language;
- whitespace, at most three lines, at most 280 characters.

It also warns when `{creator}` falls outside 5 to 15% of a language. When a legitimate entry trips the blacklist, rephrase it; extend the list when you spot a new endorsement pattern.

## Curation workflow

1. Review in situ: `pnpm --filter @icg/bank preview es funny` (20 random entries; add a count as a third argument, or use `all` as the tone).
2. Edit the JSON: change the `text`, delete entries, or add new ones with the next free id in that file. Ids are never reused once shipped.
3. Run `pnpm --filter @icg/bank test` (lint plus loader tests) and fix what it reports.
4. Run `pnpm format`, then open a PR. Review the diff like code: every changed text is a product change.
