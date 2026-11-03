---
status: accepted
---
# No AI at runtime, offline after one activation

Comments and usernames are produced from a curated, hand-written Bank and procedural generators bundled with each Host, and Avatars come from a bundled pool of synthetic images. Nothing calls an LLM or image model at runtime. We chose this over the obvious LLM-backed design because the product is sold once (no recurring revenue to cover per-use costs), editors expect plugins to work offline on set and in suites without internet, and a server dependency would make the one-time Key unenforceable without constant online checks. AI may be used at build time to draft Bank entries and generate the Avatar pool; those outputs are curated and shipped as static assets. The only network calls are Key Activation (once per Device), a non-blocking version check, and optional crash reports.

## Consequences

- Believability depends on Bank size and curation, not model quality. The Bank is the product's core asset and ships updates like code.
- Adding a language or Platform means authoring Bank content, not changing a prompt.
- Runtime AI (and an MCP server exposing the generator) can be added later as a separate, optionally online feature without changing this architecture.
