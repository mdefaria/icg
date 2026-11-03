---
status: accepted
---
# One React UI shared by every Host

The generator UI (generation, editing, Placement, Insert) is a single React + TypeScript package mounted in three shells: the Premiere Pro UXP panel, the DaVinci Resolve Studio Workflow Integration plugin (Electron) and the web app. Adobe's UXP runtime is not a browser (flexbox-only CSS subset, no canvas text, no `@font-face`, no workers) and React is the only framework Adobe ships samples and web-component wrappers for; Angular is listed as "an option" with no confirmation it runs. Rather than write one UI for Premiere and another for Resolve and the web app, we use React everywhere so there is one UI to maintain and the Host adapters stay thin. The marketing site is unaffected by UXP constraints and is built with Astro.

## Consequences

- The shared UI must be written to UXP's CSS subset (flexbox, absolute positioning, pointer events; no grid, transitions, filters or HTML5 drag-and-drop) even where the other Hosts would allow more.
- Each Host provides an adapter implementing the same small interface (read sequence size and frame rate, write a file, import and Insert at the playhead).
