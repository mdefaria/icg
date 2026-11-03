# Per-Platform formats the engine produces

These are recalled from the mobile apps, not measured against fresh screenshots. Anything marked "unverified" should be checked against a current phone before launch; changing it is a one-line edit in `src/time.ts` or `src/authors.ts`.

## timeAgo

Ages are sampled log-uniformly between one minute (30 seconds on X) and a per-Platform maximum, so most Comments are minutes to days old and few are weeks old. A creator reply is always no older than its Comment.

| Platform  | English                              | Spanish                                             | Maximum age | Notes                                                                                                                                                      |
| --------- | ------------------------------------ | --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TikTok    | `12m`, `2h`, `3d`, `1w`              | `12 min`, `2 h`, `3 d`, `1 sem`                     | 4 weeks     | After about four weeks TikTok switches to a date (`3-14`); the engine never goes that old. Spanish spacing unverified.                                     |
| Instagram | `12m`, `2h`, `3d`, `8w`              | `12 min`, `2 h`, `3 d`, `8 sem`                     | 30 weeks    | Instagram keeps counting weeks (`52w`) rather than switching to months.                                                                                    |
| YouTube   | `12m`, `2h`, `3d`, `2w`, `3mo`, `1y` | `12 min`, `2 h`, `3 d`, `2 sem`, `3 meses`, `1 año` | 2 years     | Compact form per the brief; older app versions wrote `3 days ago` / `hace 3 días`. Unverified for the current app. The renderer prefixes `• `.             |
| X         | `30s`, `12m`, `7h`                   | `30 s`, `12 min`, `7 h`                             | 23 hours    | X shows a date (`Mar 14` / `14 mar.`) for anything older than a day, which would need a clock; the engine stays under 24 hours instead of inventing dates. |

English is compact with no space; Spanish puts a space between number and unit and uses `min`, `sem`, `mes`/`meses`, `año`/`años`.

## Usernames

Stored without `@`; the YouTube and X Templates add it.

| Platform  | Rule enforced (`USERNAME_RULES`)                           | Shapes generated                                                                                         |
| --------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TikTok    | `[a-z0-9._]`, 2 to 24, no `..`, no trailing `.`            | `lena.makes`, `_juan_vlogs`, `sofia_garcia12`, `noa03`, about 10% `user8392017`                          |
| Instagram | `[a-z0-9._]`, 1 to 30, no leading or trailing `.`, no `..` | `lena.smith`, `juan_perez`, `_kat.reed_`, `thelenasmith`, 20% get trailing digits                        |
| YouTube   | `[A-Za-z0-9._-]`, 3 to 30                                  | `LenaSmith`, `LenaSmith-x7k2` (YouTube's auto-assigned suffix), `lena.makes`, about 6% `user-ab12cd34ef` |
| X         | `[A-Za-z0-9_]`, 4 to 15                                    | `LenaSmith`, `lena_vibes`, `Lena_Smith`, `LenaSmi83920174` (X's default name plus digits)                |

Display names are a first name, full name, first name plus initial, a lowercase first name, or the username itself, sometimes followed by an emoji (more often on X). YouTube display names lean towards full names because they are channel names. Names come from English, Spanish and international lists in `src/data/names.json`, mixed by language (Spanish Comments are about two thirds Spanish names).

## Counts

- Likes: Pareto with alpha 0.6, capped at 2.5M. Median around 5, about 80% under 100, a few percent in the thousands, under 1% at 10K or more. Pinned Comments use a 13x larger scale, creator-liked ones 4x.
- X: `replies` 2 to 12% of likes, `reposts` 3 to 20%, `views` 25 to 70 times likes plus a base of up to 1,500.
- YouTube: `replies` up to 8% of likes (the "N replies" link). No reposts or views.
- TikTok and Instagram: no extra counts.
- Creator reply likes: 5 to 55% of the Comment's likes plus a handful.

## Flags

`verified` 3% of generated commenters (generated creators are always verified), `pinned` 5%, `likedByCreator` 10%. A Manual Comment starts with all three off.
