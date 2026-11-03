# ICG (Instagram Comment Generator)

A paid tool for video editors that generates believable social-media comments and places them as overlays on footage from inside Premiere Pro, DaVinci Resolve Studio, or a web app.

## Language

**Comment**:
One generated social-media comment as data: username, display name, Avatar, text, like count, time-ago and flags (verified, pinned, creator reply, liked by creator).
_Avoid_: card, item, entry

**Avatar**:
The profile picture shown on a Comment. Always synthetic, never a photo of a real person.
_Avoid_: profile picture, pfp, photo

**Template**:
The visual spec a Comment is rendered with: platform (TikTok, Instagram...), theme (dark, light) and variant (single, creator reply...).
_Avoid_: style, skin, layout

**Overlay**:
The rendered transparent PNG of one or more Comments at their Placements on a Frame. The thing that ends up on the timeline.
_Avoid_: image, PNG, export, graphic

**Placement**:
The position and scale of a Comment on the Frame.
_Avoid_: position, location, transform

**Frame**:
The output canvas preset the Overlay is rendered at (9:16, 4:5, 1:1, 16:9).
_Avoid_: canvas, resolution, aspect

**Host**:
The application the user runs ICG inside: Premiere Pro, DaVinci Resolve Studio, or the web app.
_Avoid_: NLE, editor, app, platform (reserved for TikTok/Instagram)

**Platform**:
The social network a Template imitates: TikTok, Instagram, etc.
_Avoid_: network, app, host

**Insert**:
Putting an Overlay onto the Host timeline at the playhead.
_Avoid_: add, place, drop, export
