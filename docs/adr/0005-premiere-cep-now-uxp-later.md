---
status: accepted
---
# Premiere integration ships on CEP now, migrates to UXP before December 2028

Despite UXP being Adobe's current platform (GA in Premiere 25.6) and CEP being formally sunset (no new Marketplace submissions after Dec 2027, disabled by default from Dec 2028, removal reported for Dec 2029), the first Premiere integration is a CEP panel with an ExtendScript adapter, supporting Premiere 23 and newer. UXP would have forced a minimum of Premiere 26.2 (hybrid addon) and a native C++ build matrix just to rasterise an Overlay, excluding the 25.x cohort at launch and putting the riskiest piece on the critical path. CEP gives a real Chromium with `@font-face` and WASM, a mature insert API, full version coverage, and a panel crash that cannot take Premiere down. The cost is a known, dated port to UXP, plus distributing through our own signed installer instead of a double-click `.ccx`.

## Consequences

- Premiere is installed by the same signed `.pkg`/`.exe` pipeline as Resolve, which drops a self-signed, timestamped extension into the shared CEP folder so no debug flag is needed.
- A one-day probe of resvg-WASM inside UXP runs during spikes purely to inform the port.
- The UXP port must ship before December 2028; it is tracked as a roadmap item from day one, and the Host adapter interface is written so the panel code is reused.
