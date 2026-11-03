# Counts and UI copy per Platform and language

What `formatCount` (`src/format.ts`) and `copyFor` (`src/strings.ts`) implement. `OverlaySpec.language` (default `en`) picks the column; the Platform picks the rule. Tests: `src/format.test.ts`, `src/render.test.ts`.

Status column: **seen** means checked against the current mobile app from memory with reasonable confidence; **unverified** means a best guess that needs one look at a phone set to that language before launch.

## Numbers

All values are floored, never rounded (1,299 is `1.2K`, 999,999 is `999.9K`), which is what the apps do. Below 1,000 every Platform prints the plain integer. A count of 0 hides the number next to the icon on every Platform.

| Platform  | 1,000 to 9,999      | 10,000 to 999,999         | millions                            | Status (en / es)  |
| --------- | ------------------- | ------------------------- | ----------------------------------- | ----------------- |
| TikTok    | plain: `1234`       | one decimal: `12.4K`      | one decimal: `1.2M`                 | seen / unverified |
| Instagram | grouped: `1,234`    | one decimal: `12.4K`      | one decimal: `1.2M`                 | seen / seen       |
| X         | grouped: `1,234`    | one decimal: `12.4K`      | one decimal: `1.2M`                 | seen / seen       |
| YouTube   | one decimal: `1.2K` | no decimal: `12K`, `123K` | one decimal below 10: `1.2M`, `12M` | seen / seen       |

Spanish swaps the symbols, not the rules: decimal comma, dot grouping (`1.234`), ` mil` for thousands (`12,4 mil`, YouTube `12 mil`), ` M` for millions (`1,2 M`) and ` mil M` for billions. TikTok in Spanish may keep `K` (`12,4K`); unverified, so it follows the other three for now.

Trailing zeros are dropped (`1M`, `12 mil`, not `1.0M`). Billions use `B` in English.

These rules apply to every count a Template draws: likes, X replies/reposts/views and YouTube reply counts.

## Counts that are not likes

`Comment.replies`, `Comment.reposts` and `Comment.views` are used when present.

- X: reply, repost and view counts. When absent they are derived from likes, as in the spike: replies 8%, reposts 12%, views `likes x 38 + 1,200`. The creator's reply (thread variant) always derives.
- YouTube: `N replies` under the single variant. When absent: 1 if the Comment has a `reply`, otherwise no row.
- TikTok and Instagram: a `View N replies` row under the single variant only when `replies` is given (nothing is derived). Instagram's creator-reply variant shows `View N more replies` for `replies - 1` when `replies > 1`.

## UI copy

| Key              | TikTok en / es                                                  | Instagram en / es                               | YouTube en / es                            | X en / es                             |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| Reply            | Reply / Responder                                               | Reply / Responder                               | (icon only)                                | (icon only)                           |
| Pinned           | Pinned / Fijado (red, before the time)                          | Pinned / Fijado (after the time)                | Pinned by @x / Fijado por @x (above)       | not drawn: X has no pinned replies    |
| Creator label    | Creator / Creador (red)                                         | Author / Autor (after the time)                 | handle in a grey pill                      | none                                  |
| Liked by creator | Liked by creator / Le gusta al creador (creator avatar + heart) | same text, beside Reply or on its own line      | creator avatar + heart, no text            | not drawn                             |
| See translation  | See translation / Ver traducción                                | See translation / Ver traducción (beside Reply) | Translate to English / Traducir al español | Translate post / Traducir post (blue) |
| Replies row      | View N replies / Ver N respuestas                               | View N more replies / Ver N respuestas más      | N replies / N respuestas (blue)            | not drawn                             |

Singular forms: `View 1 reply`, `Ver 1 respuesta`, `1 reply`, `1 respuesta`, `View 1 more reply`, `Ver 1 respuesta más`.

### "See translation" rule

The apps show it only when the comment's language differs from the viewer's UI language. The Comment schema does not carry the text's language, so the renderer cannot decide this itself: the caller passes `seeTranslation: true` in the render options when it generated a Comment in a language other than `OverlaySpec.language` (for example an English Bank entry on a Spanish Overlay). Default off.

### Time-ago

`Comment.timeAgo` is drawn as given (`2h`, `2 h`, `hace 2 h`); the engine owns its wording per language. Separators the Template adds: TikTok none (time then Reply), Instagram none, YouTube `·` after the handle, X `·` after the handle.

### Flags a Platform ignores

X ignores `pinned` and `likedByCreator` (neither exists on X replies). The renderer never invents a label the Platform does not have.
