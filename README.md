# Office Hours

A playable, UI-first hackathon prototype of a pixel coworking office. Built with React + Vite; all people and projects are local mocks.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` creates the static build in `dist/`.

## Explore

- WASD or arrow keys: move. Furniture blocks movement.
- Click walkable floor: find a path there.
- Click a computer, chair, or coworker to approach and select it. Press E at the floating prompt to confirm.
- Interact with a coworker to open their code, project preview, and chat together. Chat stays on the right; smaller screens stack the panels.
- Opening a coworker’s computer shows the same chat workspace. Their latest reply also updates the message strip above the editor. Your own desk has no coworker chat.
- E: use the floating nearby prompt to sit, stand, talk, or open a computer. Escape closes chat or a project.
- Chairs and people highlight when they are the nearby interaction target. Clicking does not automatically sit or open chat.
- While seated, use Open computer below the room; E or movement stands you up.
- Touch: tap the floor or use the movement buttons below the office.
- Sound: toggle a quiet synthesized ambient chord.

Each computer opens an IDE on the left and an interactive demo on the right. The editor contains **starter HTML**, not the React source of the initial mock demo. Run renders that HTML in a sandbox; Reset returns to the demo. HTML drafts are kept per project in `sessionStorage`, including when you close and reopen a computer or reload the tab. If browser storage is unavailable, editing still works for the current workspace. Demo state and chat reset when the workspace closes. Nothing is shared with other browsers.

## Pair programming

Use **Pair up** in the header to choose a coworker, or **Pair with…** inside their workspace. Set a small goal and start a local practice session. The studio pauses while you work.

- You start as the driver. Your coworker navigates; ask for a headline, color, or accessibility idea in **Pair session**.
- Review each proposed change before applying it. If the source changed, the suggestion is rejected so it cannot overwrite your edits.
- **Swap roles** hands the keyboard to the simulated coworker. Your editor becomes read-only; choose a direction and review their proposed change. Swap back to edit freely.
- Five-minute turns suggest a handoff. Pause freezes the timer, editing, and code actions; resume whenever you are ready. Swapping starts a fresh turn.
- Run opens the current HTML in the existing sandbox and checks the run step. Keep a small checklist and notes alongside the conversation.
- **Finish**, Escape, or the workspace close button ends the active session and opens a recap. Save the recap and HTML as Markdown, return to the workspace, or head back to the office. Notes and session metrics are retained in the recap until you leave it; save it to keep them.

Pairing is a local product prototype with deterministic coworker suggestions, not a remote collaboration service. There are no invitations, shared cursors, voice calls, AI requests, or networked edits.

### Verify

`npm test` starts a temporary Vite server on port 5174 and runs Playwright checks with installed Chrome. Set `PLAYWRIGHT_CHANNEL` to another installed Chromium channel if needed. Checks cover the pairing loop, stale-change protection, role ownership, timer/pause behavior, recap export, draft recovery, keyboard focus, and mobile layout. Screenshots are written to ignored `test-results/`.

## Structure

- `src/Office.jsx`: movement loop, map collisions, click pathfinding, sprites, desk interaction.
- `src/PlayerSprite.jsx`: directional walking and sitting atlases, stable frame crops, canvas rendering.
- `src/world.js`: collision geometry, movement, chairs, pathfinding, NPC routines.
- `src/ChatWindow.jsx`: embedded mock coworker chat with suggested prompts.
- `src/ProjectWindow.jsx`: project window, interactive demo projects, sandboxed HTML preview.
- `src/PairLobby.jsx`, `src/PairPanel.jsx`: coworker discovery, goals, roles, reviewed suggestions, notes, and recaps.
- `src/pairing.js`, `src/pairing.css`: session timing, deterministic patch proposals, and studio-consistent pairing styles.
- `src/data.js`: people, desks, starter HTML.
- `src/App.jsx`: shell, interaction windows, help, touch controls, ambient sound.
- `public/assets/`: generated room/chairs and authored character sheets.

The world uses a chair-free generated room map, six independently moving chair sprites, animated character sprites, and real HTML hit areas. Map interaction coordinates are percentages, so resizing stays aligned. Coworkers have staggered routines: sit at their desks, stand up, walk through the aisles, take a short break, return, and sit again. The player uses a four-direction sprite atlas with alternating arm and leg poses. Walk frames advance with distance traveled, and return to standing when movement stops or furniture blocks the path.

See [design notes](docs/design.md) for the visual reference and verification details.

NPC chair occupancy is shared with the player: a returning coworker waits if you took their empty chair. Conversations pause the office. Replies are deterministic mock messages, with no AI API or networking.

The chair centers are calibrated to the map artwork. Seated poses use a separate seat anchor. The chair’s front lip and armrests occlude the lower body, while the head and torso stay visible. NPC sideways movement uses a four-pose atlas with a stable head anchor; left-facing movement mirrors the same poses.

Characters use intact 16×32 MetroCity frames distributed by Pixel Agents: three walking cells per direction and a dedicated seated/typing pose. All frames use one integer pixel scale. Sitting switches to the authored pose with the six-pixel seated registration used by Pixel Agents; no body parts are stretched. The pose is anchored to the chair cushion and the chair’s foreground layer covers the hips. Standing reverses the pose change before the actor walks around the armrest.

Chair entry includes reaching for the backrest, pulling the chair out, walking around the armrest to the front of the cushion, sitting, then scooting the chair and seated character together toward the desk. Getting up first rolls the chair out, then stands, clears the seat, and pushes the chair back before leaving. Player and NPCs share the same chair-action state machine; each chair moves independently, behind its seated occupant.

The seated pelvis anchor is calibrated to the cushion between the armrests, north of the lower backrest. `desk-chair-seat.png` makes the cushion and backrest distinct. This alignment is shared by initial NPC poses and the player/NPC sit transitions; the pull distance and timing stay unchanged.

Character sources and licenses: [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT) and the original [MetroCity pack by JIK-A-4](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) (CC0). Redistribution notices are in `public/assets/game-characters/`.

Chair depth uses two layers from the same transparent prop: the full chair behind the character, plus a foreground mask for the front seat lip, lower backrest, and armrests. Approaching from the front hides lower legs naturally; moving back out restores them. The mask travels with the chair during scooting.
