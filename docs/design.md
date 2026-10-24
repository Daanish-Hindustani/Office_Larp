# Design and verification

## Direction

The user’s pixel-office screenshot is the primary reference: warm wood, dark teal walls, varied coworkers, speech bubbles, and computers. The generated concept in `concept.png` establishes the dark application shell, green status dots, pixel headings, right-hand builder list, and keyboard footer. The whole requested flow is implemented, including a code-left / preview-right project state.

Intentional adaptations from the generated concept: the six-desk map follows the user’s requested office layout; the IDE opens as a focused dialog instead of taking up the lower half of the room; builder names and projects use a consistent set of local mock data; the mobile screen stacks the builder list and adds touch controls. Floor labels and UI text remain real HTML. The map and character art are raster assets; the small project demos use HTML/CSS.

## Visual comparison ledger

- Composition: full office left, four builders and You right, controls below. Reduced map height and sidebar row spacing so desktop controls stay visible.
- Palette: charcoal #161d24 shell, teal room walls, honey oak floor, cream speech bubbles, sage status and interaction accents.
- Typography: pixel headings with Press Start 2P, DM Sans interface text, Space Mono editor and keyboard controls. Fonts are bundled locally.
- Artwork: separately generated transparent character strip layers over a people-free map. Characters remain independent, animate, and align with desk chairs.
- Interaction state: IDE is split equally between editable starter HTML and an interactive mock preview. Modal preview changes to the sandbox output after Run.
- Responsive behavior: desktop at 1536×1024, mobile at 390×844. No horizontal overflow; project code and preview stack on mobile.
- Copy audit: the brand, online indicator, help/sound controls, builder list, welcome note, and movement hints follow the concept’s information architecture. The room title, consistent mock names, and concise supporting copy are deliberate adaptations.

Both the generated concept and final browser captures were inspected with view_image. The implementation was faithfully verified against the concept’s visual system and the supplied office reference, with the adaptations above. No known material visual defects remain.

## Browser checks

Browser plugin unavailable; used Playwright with installed Chrome. Checked page title/content, no framework error overlay, no app console errors, loaded art, desktop/mobile screenshots, keyboard movement, click-to-walk, furniture collisions, E interaction, click desk, garden action, add task, edit and Run HTML, Escape/close, help, and speech bubble greeting. A hidden tooltip intercepting mobile desk clicks was fixed by disabling pointer events on decorative tooltips and speech bubbles.

## Asset provenance

Generated using the built-in image generation tool. Assets are copied into the project, with originals retained in the tool’s generated-image directory.

- `docs/concept.png`: full Office Hours game interface concept, dark shell, warm pixel coworking room, builder sidebar and split IDE state.
- `public/assets/office.png`: production orthographic 16-bit room map with six desks, windows, plants, kitchenette, sofa lounge, and clear walkable space; no people or interface text.
- `public/assets/characters.png`: transparent five-person sprite strip, evenly spaced, different skin tones, hairstyles, and cream/lavender/rust/green/blue outfits.

This prototype has no networking, authentication, persistence, real coworkers, or live coding integration. These are next-step features, not simulated backend functionality.

## Directional walking update

Replaced the player’s whole-body rotation with a generated four-direction, four-frame walking atlas at `public/assets/player-walk.png`. It preserves the curly-haired character’s cream shirt and teal trousers, with front, side, and back views and alternating limb poses. The built-in image generation tool used `characters.png` as its reference. The prompt requested a transparent 4×4 RPG walk sheet, consistent character scale, fixed feet, neutral/left-step/neutral/right-step poses, and no background or labels.

`PlayerSprite.jsx` crops the source atlas at render time, centers each pose, and anchors the feet consistently. Animation advances using actual travel distance rather than held keys; blocked movement, released keys, and an open project window all stop the gait.

## Sitting, proximity interactions, and coworkers

Added generated `public/assets/sitting.png` (five characters × standing, lowering, seated) and `public/assets/npc-walk.png` (four NPCs × four directions × opposite steps). The built-in generator used the existing character strip as its identity reference. Runtime atlas crops in `spriteFrames.js` preserve scale and the ground anchor. Sitting uses actual compact bent-leg poses; the NPC floating animation is removed.

Nearby chairs and people show a contextual floating icon, E key, and action label. E sits in a free chair or opens a coworker chat; E or movement stands the player up. The seated computer remains accessible via the room action bar. Click-to-approach follows moving coworkers and respects chair occupancy.

Local chat supports typed messages, suggested questions, delayed mock replies, Escape, focus containment, and opening the coworker’s project. The new surfaces reuse the existing charcoal, sage, pixel-heading and monospace visual system. Chat is intentionally a focused modal, matching the project window.

Playwright with installed Chrome verified the visible sitting transition, E to sit/stand/chat, movement to stand, project access while seated, chat send/reply/project/close, mobile no-overflow, and each NPC’s full sit/stand/walk/return cycle. A two-minute simulated routine check completed 4–6 cycles per NPC. Browser console had no app errors. Desktop and mobile captures of the sitting prompt and chat were inspected with view_image. A floating-point path-edge issue was fixed by anchoring reached waypoints exactly and using a tiny collision tolerance.

## Game interaction and chair alignment correction

Corrected the actual chair centers (21.5% and 47.2% map width), separated standing foot and seated body anchors, and composited the map’s chair-back pixels in front of seated bodies. Chair geometry now blocks normal movement, while sitting docks at the chair and standing includes a step out through the chair entry point.

A new built-in image generation pass created `public/assets/npc-side-walk.png`: four NPCs × four right-facing poses (neutral, forward step, passing, opposite step), matching the existing characters. `npcSideFrames` records source crops and head anchors. Left motion mirrors the same art, with animation selected from actual travel distance. Facing follows actual movement after collision handling.

World clicks now approach/select an object. A nearby highlight plus E prompt identifies the target; E explicitly confirms sit/chat/computer actions. Chat turns standing actors toward one another. Ground clicks while seated are queued until the stand-and-step-out transition completes. The sidebar remains a direct chat shortcut.

Playwright verified four different side poses while positions advanced, no automatic sitting/chat/project opening on click, E confirmation, chair docking and exit, project access, queued walking after standing, mobile layout, no app console errors, and multiple completed NPC routines. Native-size desktop screenshots and a mobile screenshot were inspected with view_image; original chair pixels were also inspected at 4× for alignment.

## Sitting polish: six-pose transition

The built-in image generator produced `public/assets/sitting-sequence.png` using `sitting.png` and `characters.png` as references. The prompt requested five character rows and six distinct back-facing poses per character: upright, knee bend, reach/crouch, lowering, settling, and seated/ready, preserving head size and identity on transparency. Source rectangles and head anchors are in `seatFrames.js`.

Player and NPCs share `SEAT_TIMING` and the same pose selection: a 0.14-second facing pause, 0.96-second sit, and 0.72-second reversed stand. Heads and shoulders retain their source scale, with a small grounded dip; only the lower body fits the seat anchor. The chair-back foreground starts at the lowering pose. Interaction tooltips and the player arrow are hidden during the transition.

Playwright with installed Chrome verified all six sit poses and all six reverse stand poses, alignment/facing/sit/exit states, stationary seated art, mobile overflow, and 3–6 completed routines for each NPC over two simulated minutes. Canvas bounds showed a gradual lower-body anchor from pixel 115 to 95 while the head stayed between pixels 16 and 20. Close-up screenshots of the bend, lower, and seated phases were inspected with view_image. No app console errors.

## Chair visibility correction

This supersedes the earlier chair-foreground notes. Capturing the rendered office revealed that the foreground chair-back copy covered the seated character’s torso and legs. Removed that overlay and its runtime/DOM/CSS machinery. The existing seated sprite now stays in front of the chair art, retaining the full shirt, arms, and bent-leg silhouette.

Verification compared the same seated frame with and without the overlay, then inspected a contact sheet of all six rendered player phases and all four seated NPCs. These are screenshots of the composed office rather than isolated atlas/canvas checks, which had missed the occlusion. Sitting, standing, and mobile sitting passed with no browser errors.

## Pull chair out, then sit

Separated the chairs from the room so the movement is real, rather than moving a duplicate over baked-in artwork. The built-in image generator edited the original room into `public/assets/office-floor.png`, removing only the six workstation chairs and retaining the lounge furniture. A second pass created the matching transparent `public/assets/desk-chair.png`. Both final assets are stored in the workspace and inspected with view_image.

`ChairSprite.jsx` renders six independently positioned props. `updateChairAction` in `world.js` is shared by player and NPCs: reach/grab, pull the chair 1.6 map units over 0.68 seconds with backward steps, move into the pulled-out seat, line up, and use the six-pose sit. Standing clears the seat, pushes the chair back over 0.58 seconds, then steps away. Chair drawing stays behind its occupant so the character’s body remains visible.

Playwright with Chrome verified 31 increasing chair-offset samples from 0 to 1.594, the final 1.6 offset while seated, a complete push back to zero, player/NPC state sequences, mobile layout, and multiple full NPC pull/sit/push cycles. The scene contains only six chair props over the chair-free floor, with no stationary duplicates. Fixed-camera close-up screenshots of the rendered reach/pull/sit sequence and the full office were inspected with view_image. No app console errors; build passed.

## Cushion placement correction

The previous anchor put the seated pelvis too far south on the chair, over its backrest. Moved the shared `seatPoint` forward using `SEAT_FORWARD = 2.3`, including the initial NPC positions. Chair draw order derives from the same offset so seated bodies remain fully visible. The character now steps farther into the chair before lowering.

The built-in image generator edited the previous chair into `public/assets/desk-chair-seat.png`, requesting an explicit cushion above a separate narrow south-side backrest, with the same teal palette, caster base, armrests, and transparent pixel-art style. This is the currently rendered chair asset. The pull distance (1.6 map units) and timing remain unchanged.

Playwright with Chrome captured a close-up comparison of the seated player and all four NPCs; view_image inspection confirmed hips over the cushion between armrests, with the backrest below them. The pelvis anchor and cushion center agree within one rendered pixel. Sitting, standing, push-back, repeated NPC cycles, mobile layout, console health, and the production build passed.

## Walk around, sit, and scoot in

After pulling out the chair, the actor follows three physical waypoints around the inner armrest to the front of the cushion. The same path is used by the player and NPCs. Once the sitting animation completes, a 0.72-second `rolling-in` stage moves chair offset from 1.6 to 0 and moves the seated actor by the same amount. `seatFrame` stays at the settled pose so the character never walks during the seated scoot. Initial NPCs now start seated with their chairs tucked in. Getting up first uses `rolling-out`, then the existing stand/clear/push/leave sequence.

Playwright verified the lateral detour and front approach, all state transitions, 31 seated rolling samples with a constant pelvis-to-cushion relationship, a fully tucked final chair, the reverse exit, mobile overflow, no browser errors, and multiple completed NPC routines. A fixed-camera contact sheet of the full rendered sequence was inspected with view_image.

## Partial chair occlusion (user reference)

The user clarified that some of the character’s body should disappear behind the chair on the front approach. `ChairSprite.jsx` now renders a separate foreground canvas containing only the front cushion lip, narrow lower backrest, and armrests. These pixels share the chair’s offset but sort ahead of actors standing north of the chair; the rest of the chair remains behind. This adds selective lower-body occlusion without recreating the earlier full-chair overlay that hid the torso. No new raster art was needed.

Playwright paused on the same approach pose and captured the actual scene with and without the foreground layer. view_image inspection confirmed that the lower legs disappear while the head, shirt, and arms remain visible. A seated capture confirmed partial lower-body occlusion. Mask inspection found transparent head/torso areas and opaque lip/backrest regions. Pull, walk-around, sit, scoot, stand, and mobile sitting passed with no app errors.

## Authored game sprites replace generated poses

The previous generated frames changed body proportions and depended on lower-body stretching, which made the character appear to float. Replaced the character renderer with intact MetroCity character sheets distributed by Pixel Agents. Source: https://github.com/pixel-agents-hq/pixel-agents. Original creator and CC0 license: https://jik-a-4.itch.io/metrocity-free-topdown-character-pack. MIT redistribution notice and source credits are included beside the assets. The Rojatzo chair reference was examined for the lowering motion; its GIF is not shipped. No LimeZu assets are shipped.

Each sheet contains seven 16×32 cells per direction, with three walking cells and authored seated/typing cells. Cells render at a fixed integer scale with no body deformation. The seated registration adds six source pixels, matching Pixel Agents. The cushion anchor is now `7.1 - 7.8 * 0.28`, replacing the earlier 2.3 value. It reflects the chair top and cushion position, rather than compensating for a cropped generated pose. Only the current chair collider is ignored while docking; desks remain solid. Standing characters leave via the armrest path instead of walking through the chair.

Browser plugin not available; verified localhost:5173 using Playwright with installed Chrome at 1536×1024 and 390×844. Checks passed for page identity, meaningful content, no framework overlay or app errors, 36 scoot samples with a constant chair/body offset, complete player entry and exit, repeated NPC cycles (three or four per NPC), mobile overflow, and production build. Paused-clock close-ups and the six-stage contact sheet were inspected visually. Other browser engines were not tested. These notes supersede the earlier generated six-pose implementation.

## Pair programming workspace

Pairing uses the existing studio palette, pixel headings, authored character avatars, monospace chrome, and sage action buttons. The header's Pair up control opens a four-coworker lobby. Each coworker workspace also has a direct pairing entry point. No changes to the office simulation or character artwork were needed.

The existing code/preview workspace gains a companion rail with Conversation and Pair session tabs. A session has a small goal, driver/navigator roles, five-minute turns, pause/resume, explicit role swaps, reviewed code proposals, a checklist, notes, and an activity trail. A simulated coworker proposes small changes to the starter HTML; applying a proposal checks that the underlying source still matches the reviewed version. The navigator can review and run code, while the editor belongs to the current driver. The local nature of the coworker is stated in setup and the lobby.

Finishing or closing an active session shows a recap with a Markdown download containing the notes and HTML. Returning to the workspace preserves its conversation and preview. HTML drafts now use per-project tab storage, with an in-memory fallback when storage is blocked; earlier notes saying every edit resets on close are superseded. Session notes are exported through the recap rather than stored automatically. This adds no remote collaboration, backend, or AI service.

At 390×844, Shared code and Partner & chat switch between the stacked editor/preview and companion tools. The session controls remain above both views. Desktop retains code, preview, and companion tools side by side. Lobby focus is contained, companion tabs support arrow keys, and active-session Escape leads to the recap.

Verification: production build and four automated Chrome browser scenarios pass. They cover stale proposal rejection, code ownership, simulated partner edits, unchanged-code reruns, checklist updates, chat preservation, recap contents/download, draft recovery, blocked storage, ordinary desk access, elapsed-time/pause behavior, focus containment, and mobile navigation without page overflow. Desktop, mobile, suggestion review, and recap screenshots were visually inspected. Other browser engines have not been tested. `npm test` produces fresh captures in ignored `test-results/`.
