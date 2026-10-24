# Office Hours

A playable, UI-first pixel coworking office, with local mock coworkers, a communal theater, a real LeetCode practice room, and shared studio time standings. Built with React + Vite and a small Node server for LeetCode data and persisted activity.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` creates the static build in `dist/`.

The development and preview servers include both APIs. To serve the built app with the same APIs, run `npm run build` followed by `npm start` and open http://127.0.0.1:4173. `PORT` and `HOST` can override that address. A static-file-only host cannot serve the APIs; use the included Node server or route `/api/leetcode/` and `/api/activity/` to it. Tested with Node 22.

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
- Theater: walk down the bottom-center hallway (or click its THEATER sign) to enter the screening room. Walk through the upper-right doorway there to return to the studio.
- Algorithm room: enter the CODE CLUB doorway immediately to the right of the theater doorway in the original studio. Approach a computer, press E to sit, then press E or Open computer to start a real problem. Movement or Stand up leaves the chair.

Each computer opens an IDE on the left and an interactive demo on the right. The editor contains **starter HTML**, not the React source of the initial mock demo. Run renders that HTML in a sandbox; Reset returns to the demo. HTML drafts are kept per project in `sessionStorage`, including when you close and reopen a computer or reload the tab. If browser storage is unavailable, editing still works for the current workspace. Demo state and chat reset when the workspace closes. Code and chat are not shared with other browsers.

## Pair programming

Use **Pair up** in the header to choose a coworker, or **Pair with…** inside their workspace. Set a small goal and start a local practice session. The studio pauses while you work.

- You start as the driver. Your coworker navigates; ask for a headline, color, or accessibility idea in **Pair session**.
- Review each proposed change before applying it. If the source changed, the suggestion is rejected so it cannot overwrite your edits.
- **Swap roles** hands the keyboard to the simulated coworker. Your editor becomes read-only; choose a direction and review their proposed change. Swap back to edit freely.
- Five-minute turns suggest a handoff. Pause freezes the timer, editing, and code actions; resume whenever you are ready. Swapping starts a fresh turn.
- Run opens the current HTML in the existing sandbox and checks the run step. Keep a small checklist and notes alongside the conversation.
- **Finish**, Escape, or the workspace close button ends the active session and opens a recap. Save the recap and HTML as Markdown, return to the workspace, or head back to the office. Notes and session metrics are retained in the recap until you leave it; save it to keep them.

Pairing is a local product prototype with deterministic coworker suggestions, not a remote collaboration service. There are no invitations, shared cursors, voice calls, AI requests, or networked edits.

## Studio leaderboard

Open **Leaderboard** from the header in any room, or from a finished pairing recap. **People** ranks visitors by online hours or pairing hours; **Pairs** ranks each team’s active time together. Switch between **This week** (Monday 00:00 UTC) and **All time**. Small totals show `<0.01 h` alongside seconds/minutes so a first session is visible immediately. Equal exact totals share a rank; zero-time entries remain unranked. Expand a team to see its five most recent session goals and times, then pair with that coworker again.

- A browser profile gets a persistent random visitor ID in local storage. **Edit name** changes the display name without splitting its history. Tabs share the identity; separate browser profiles/devices are separate visitors. Blocked storage uses an explicitly temporary identity.
- Five-second heartbeats record server-observed time while the tab is visible and the connection is healthy. Pausing a pair session stops pair time while online time continues. Hidden tabs, offline periods, and server restarts earn no unobserved time. Long heartbeat gaps (over 15 seconds) are discarded rather than treated as work.
- Intervals are merged, so overlapping tabs cannot double-count someone’s online hours, a person’s pairing hours, or a team’s time. Pair IDs are canonical unordered member IDs: A+B and B+A are the same team; A+C is a different team. Role swaps and name changes never change the team. Returning to the same team adds another session to its total.
- Pairing is part of online time, not an additional online-hours bonus. The recap’s elapsed timer can include background/offline time; only observed foreground time reaches the board. Sessions with simulated coworkers are marked local practice. Those coworkers have no fabricated online hours and do not appear as real visitor profiles.

The board is shared by browsers connecting to the **same Node server**, not only by tabs. `GET /api/activity/board` returns both periods; `POST /api/activity/heartbeat` records bounded activity. The server uses receipt times, validates IDs/partners/body size, rejects cross-origin browser writes, serializes updates, and atomically saves `.data/activity.json` (gitignored). Set `OFFICE_ACTIVITY_FILE` to choose a persistent file/volume; run one server process per activity file. Persist this file across deployments to retain totals. If a save fails, the UI shows a reconnect/retry state rather than claiming the latest time was saved.

Visitor identities are anonymous browser profiles, not authenticated accounts. Names, session goals, and standings are visible to other visitors to that server. This is a studio prototype, not an abuse-resistant public competition: clearing browser data creates a new identity, and production account ownership, moderation, and multi-instance storage would need an authenticated service. There are no seeded hours, simulated background accrual, or retrospective estimates for sessions before tracking was added.

## The screening room

The theater is a second playable room connected to the studio’s existing hallway. Walk or click through its aisles, approach an unoccupied sofa, and press E (or tap the prompt) to settle in. E or movement stands you up. Two familiar coworkers are clearly labeled demo guests. Mobile movement buttons stay beside the room.

The watch party includes three silent ambient screenings, a shared queue, reactions, chat, play/pause, restart, seeking, and an expanded screen view. Add a direct HTTP(S) MP4 or WebM URL to screen your own video. YouTube/Vimeo page links are not supported. Browser codec support and the source server determine whether an external video can play. Video starts muted; sound is a personal setting. If browser autoplay blocks a remote start, **Join playback** lets that guest enable it.

Playback, queue changes, presence, chat, and reactions sync between tabs in the **same browser profile and origin** using `BroadcastChannel`. Use **Copy local room link** or **Open another seat** to try it. The theater link uses `?room=theater`. These links are local to this device; watching across devices would require a room service. If BroadcastChannel is unavailable, the room remains usable in solo mode.

Leaving the room pauses your local video. It pauses the shared screening when you are the last guest; otherwise the remaining guests keep watching. The studio remains mounted, preserving the office simulation while you visit. Room queues and messages stay in memory for the current app instance and are not saved to an account.

## The algorithm room

The third room has four playable computer desks, a leaderboard chalkboard, and a practice shelf of eight free LeetCode problems. The doorway is to the right of the theater in the studio; `?room=leetcode` also opens the room directly. Keyboard, click-to-approach, and touch controls work in the room. Phone users can switch directly between Room & problems and Leaderboard.

Statements, difficulty, topics, JavaScript starter code, and profile statistics are fetched from LeetCode’s website GraphQL endpoint through the same-origin, read-only adapter. There are no seeded leaderboard entries or offline replacement statements. Loading failures show Retry and an original-source link. Upstream access and schema can change, so this adapter is a best-effort integration rather than an official LeetCode API partnership.

At a computer, choose a problem, edit JavaScript, and run five room-authored practice cases. The runner executes in a worker inside an opaque-origin sandbox with network access blocked by CSP and a two-second timeout. User code never runs on the Node server. Drafts are saved per problem in browser local storage, with an in-memory fallback. Reset has an undo action, and results are marked stale when the draft changes. Ctrl/Cmd+Enter runs the practice cases; Tab still moves keyboard focus normally.

**Copy & submit on LeetCode** copies the draft and opens the official problem page. Select JavaScript, paste, and submit on LeetCode using your own browser login. The app does not collect passwords, cookies, or session tokens and does not submit solutions on your behalf. Local practice cases are not LeetCode’s hidden tests and never award leaderboard points.

Track up to eight public LeetCode usernames to build a browser-local studio leaderboard. Scores use unique all-time solved counts: **Easy × 1 + Medium × 3 + Hard × 5**. Equal scores and solve totals share a rank. Refresh pulls public stats; failed refreshes retain a clearly marked last snapshot. Tracking a username does not authenticate ownership of that account. Saved standings are shared across tabs through browser storage, not through a hosted multi-user leaderboard.

After an official submission, **Check Accepted** refreshes the selected profile and looks for this problem in its latest 20 public Accepted submissions since the problem was opened at the desk. Older submissions do not verify the current session. Private or unavailable activity cannot confirm it; public solve counts can still refresh. The read-only adapter caches catalog metadata for an hour, statements for a day, and profile data for a minute. Manual refresh can fetch new profile data after a five-second cooldown.

### Verify

`npm test` starts temporary Vite servers on ports 5174 (pairing), 5175 (theater), 5176 (LeetCode), and 5177 (studio leaderboard) and runs Playwright checks with installed Chrome, plus Node API/ranking checks. Set `PLAYWRIGHT_CHANNEL` to another installed Chromium channel if needed. Each test server uses its own ignored activity file. LeetCode tests use explicit API fixtures so CI does not depend on a third-party website; live problem and public-profile access is also checked manually during integration. Tests cover navigation, seated computers, ranking, new-Accepted checks, code execution/isolation/timeouts, drafts, HTML sanitization, outages, keyboard focus, mobile layout, and existing pairing/theater flows. Activity checks cover interval deduplication, two distinct pairs, pause/resume, connection gaps, identity changes, UTC weekly clipping, save/restart, and API validation. The video test generates its own WebM. Screenshots are written to ignored `test-results/`.

## Structure

- `src/Office.jsx`: movement loop, map collisions, click pathfinding, sprites, desk interaction.
- `src/PlayerSprite.jsx`: directional walking and sitting atlases, stable frame crops, canvas rendering.
- `src/world.js`: collision geometry, movement, chairs, pathfinding, NPC routines.
- `src/ChatWindow.jsx`: embedded mock coworker chat with suggested prompts.
- `src/ProjectWindow.jsx`: project window, interactive demo projects, sandboxed HTML preview.
- `src/PairLobby.jsx`, `src/PairPanel.jsx`: coworker discovery, goals, roles, reviewed suggestions, notes, and recaps.
- `src/pairing.js`, `src/pairing.css`: session timing, deterministic patch proposals, and studio-consistent pairing styles.
- `src/TheaterRoom.jsx`, `src/theaterWorld.js`: theater room, sofa interactions, screening controls, and collision geometry.
- `src/watchParty.js`, `src/theater.css`: local shared playback/presence, queue, chat, reactions, and theater styling.
- `src/MovementControls.jsx`: shared touch controls for all rooms.
- `src/LeetCodeRoom.jsx`, `src/labWorld.js`, `src/leetcode.css`: algorithm room, playable computers, and study-room UI.
- `src/LeetCodeBoard.jsx`, `src/leetcodeClient.js`: tracked public profiles, weighted rankings, API state, and statement sanitization.
- `src/LeetCodeWorkspace.jsx`, `src/practiceRunner.js`, `src/leetcodeProblems.js`: real problem editor, isolated local runner, and room-authored practice cases.
- `server/leetcode.mjs`, `server/index.mjs`: cached read-only upstream adapter and built-app server. Vite uses the same adapter in dev and preview.
- `src/Leaderboard.jsx`, `src/leaderboard.css`: people/pair standings, period/metric controls, team history, identity editing, and matching studio styling.
- `src/activityClient.js`, `server/activity.mjs`, `server/activityModel.mjs`: visibility-aware heartbeats, server persistence, interval unions, canonical team IDs, and UTC weekly totals.
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
