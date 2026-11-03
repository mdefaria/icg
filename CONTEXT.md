# ICG (Instagram Comment Generator)

A paid tool for video editors that generates believable social-media comments and places them as overlays on footage from inside Premiere Pro, DaVinci Resolve Studio, or a web app.

## Language

**Comment**:
One generated social-media comment as data: username, display name, Avatar, text, like count, time-ago and flags (verified, pinned, creator reply, liked by creator).
_Avoid_: card, item, entry

**Manual Comment**:
A Comment whose Avatar, username and text the user supplies themselves (own image, typed text) instead of generating them. Language-neutral.
_Avoid_: custom comment, blank comment

**Avatar**:
The profile picture shown on a Comment. Generated Avatars are always synthetic, never a photo of a real person; a Manual Comment may use any image the user supplies.
_Avoid_: profile picture, pfp, photo

**Bank**:
The curated, hand-written set of comment texts tagged by Platform, language and tone that generation draws from. No text is produced by AI at runtime.
_Avoid_: corpus, dataset, library

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

## Commercial

**Key**:
The signed license string a buyer receives by email after a one-time payment. Proves purchase; there are no buyer accounts.
_Avoid_: serial, token, license (use Key)

**Activation**:
Binding a Key to one Device, done once online; afterwards the Host works offline.
_Avoid_: login, sign-in, registration

**Device**:
One installation of a Host counted against a Key's limit.
_Avoid_: seat, machine, install

**Seat**:
The unit an agency buys: one Seat grants a fixed number of Devices.
_Avoid_: user, license
