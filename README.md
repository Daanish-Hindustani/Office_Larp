# Office Hours

A multiplayer pixel coworking office built with React, Vite, and Node. People sign in, walk around the same office, work at browser-based computers, and watch screenings together. Four NPC coworkers—Milo, Leo, Jun, and Ada—provide projects, conversations, and local pairing practice.

## Run locally

Requires **Node 22.13 or newer**. Node 22 prints an experimental warning for its built-in SQLite module.

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173), enter a username, and select **Enter office**. New usernames are created automatically; existing usernames reopen the same account. No password is needed. Use a second browser profile or incognito window to create a second user. Tabs in one browser profile share the signed-in account; separate profiles represent different people.

```sh
npm run build
npm start
```

This serves the production build and APIs at [127.0.0.1:4173](http://127.0.0.1:4173). NGINX proxies to this Node process. Static hosting alone cannot run the backend.

## Multiplayer

- Each signed-in browser connects to `/api/world/events` using Server-Sent Events. Validated HTTP actions update player positions, room membership, messages, and screening state. Disconnects automatically reconnect and recover current presence and recent messages.
- See other players in the studio, theater, and algorithm room. Click a real player to open their character screen and exchange private messages. NPC interactions open a game-style dialogue box at the bottom of the screen, with a character portrait, pixel text, a reply field, and previous/next controls for conversation history. There is no permanent Studio people chat panel. Sign out from the controls bar to change usernames.
- Accounts, sessions, and the most recent 10,000 messages persist in SQLite. Private messages are delivered and returned only to their sender and recipient. Server administrators can access the database; messages are not end-to-end encrypted.
- Real people count toward the live online indicator. NPCs are explicitly labeled and do not appear as real users. **Pair up** remains a local NPC practice feature; there are no remote shared editors, shared cursors, voice calls, or synchronized NPC routines.
- The theater fills the room view without screening or watch-party columns. Sitting opens shared demo playback across devices connected to the same server. Each guest signs in. Theater playback and presence are in memory and reset when the server restarts.
- Movement is client-controlled and bounded by the server. Players do not block each other while walking. Studio and algorithm-room desks are reserved by the server before a player sits, so simultaneous requests have one winner. Occupied desks are unavailable to other players, including other tabs using the same username. Standing up, changing rooms, signing out, or disconnecting releases the reservation. Broken connections expire after roughly 30–40 seconds; presence and reservations reset on server restart. Theater sofas still use local seating. This is not a competitive authoritative physics server.

## Browser-side coding

Open a computer to edit and run **HTML, CSS, and JavaScript** in an opaque-origin sandboxed iframe. Projects start with `index.html`, `styles.css`, and `script.js`. Use **Add file** to create more `.html`, `.css`, or `.js` files (up to 30 per project), then select a file tab to edit it. **Preview page** chooses the HTML entry; **Run** includes the project’s CSS and JavaScript in file-tab order. Explicit local stylesheet/script references are also supported and are not automatically included a second time. Files use flat names with no folders. This runs classic browser JavaScript; there is no npm or package build pipeline. The algorithm room runs JavaScript practice cases in a worker inside a network-blocked sandbox, with a two-second timeout. **User code is never evaluated, compiled, or executed by the Node backend or the host computer.** It runs on the visitor's browser/device. There is no server shell, terminal, filesystem access, or native C++/Java compiler.

All project files stay in the browser tab's session storage, including added files; old single-HTML drafts migrate automatically. Pairing suggestions and Markdown recaps still target `index.html`. Algorithm drafts stay in browser local storage.

Project files are not account-synced. Avoid leaving private drafts on a shared device. Messages are persisted as text and never executed automatically.

The algorithm room uses a read-only server adapter for LeetCode statements and public profiles. Practice cases are room-authored, not LeetCode's hidden tests. Official submission opens LeetCode, where the user logs in and submits themselves. The algorithm room shows only the playable room: choose problems inside a computer workspace and click its chalkboard for the LeetCode leaderboard. Tracked LeetCode usernames remain browser-local; studio online/pairing time is account-based and saved on the server.

## Deploy with Docker and NGINX

```sh
docker compose up --build -d
```

Visit [localhost:8080](http://localhost:8080). The supplied [NGINX config](deploy/nginx.conf) proxies the app and disables buffering for its event stream, with a 75-second read timeout and ten-second server pings. See the [NGINX proxy documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering) for buffering behavior.

For a public deployment, terminate **HTTPS** at NGINX or your load balancer. Set these environment variables before starting Compose:

```sh
export OFFICE_ORIGIN=https://office.example.com
export OFFICE_SECURE_COOKIES=1
docker compose up --build -d
```

The included NGINX container listens on HTTP port 8080; put it behind your HTTPS reverse proxy or add your certificate/listen-443 configuration. The explicit origin must exactly match the URL users visit, including any nonstandard port. Browser APIs used by the app require HTTPS outside localhost. Do not expose the Node container directly when `TRUST_PROXY=1`.

The production server streams MP4/WebM files with byte-range support so browsers can seek without downloading the whole video into server memory. The `office-data` Docker volume stores accounts, sessions, messages, and activity. Keep and back up that volume across deployments. `docker compose down -v` deletes it. Run **one Node instance** per office: presence and screening state are process-local, and the existing activity ledger uses a single writer. Horizontal scaling needs a shared event broker and replacement activity storage. The service caps connections at 200 total and five per account; these are protective bounds, not a load-tested capacity guarantee.

### Host installation without Docker

```sh
npm ci
npm run build
NODE_ENV=production OFFICE_ORIGIN=https://office.example.com HOST=127.0.0.1 PORT=4173 npm start
```

Run this with a process manager/systemd. Install NGINX, copy `deploy/nginx.conf`, replace `app:4173` with `127.0.0.1:4173`, set your hostname and TLS certificate, and reload NGINX after `nginx -t`. Set `TRUST_PROXY=1` only if the backend is reachable solely through a trusted proxy that overwrites `X-Real-IP`. The default loopback binding keeps it private.

| Environment variable    | Purpose / default                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `HOST`, `PORT`          | Node bind address; `127.0.0.1:4173`                                                                   |
| `OFFICE_ORIGIN`         | Exact public browser origin for write validation; local HTTP host if omitted                          |
| `OFFICE_DB`             | SQLite path; `.data/office.sqlite`                                                                    |
| `OFFICE_ACTIVITY_FILE`  | Account time ledger; `.data/activity.json`                                                            |
| `OFFICE_SECURE_COOKIES` | `1` for HTTPS; defaults to enabled in production. Compose disables it for its localhost HTTP example. |
| `TRUST_PROXY`           | `1` trusts the proxy's overwritten `X-Real-IP` for authentication throttling                          |

Username-only entry does not verify identity: anyone who knows a username can use that account and read its private messages. Existing accounts and history are preserved when upgrading, and old password hashes are removed automatically. Session cookies are HttpOnly and SameSite=Lax; tokens are hashed in the database and expire after seven days. Logout revokes the session and closes its event streams. Mutations validate browser origin, body size, identities, and action values; authentication, chat, and screening actions are rate limited. Account registration is open. Invitation-only signup, blocking, and moderation tools are not implemented.

## Controls and NPCs

- WASD/arrows: walk. Click the floor to pathfind. Touch movement controls are available.
- Approach a chair, computer, or NPC and press **E** to interact. Sitting at a studio or algorithm-room computer automatically opens its workspace. Close the workspace to stand up or move. **Escape** closes a workspace or conversation.
- The studio's lower doorways lead to the theater and code club. Direct links also work: `?room=theater` and `?room=leetcode`.
- NPCs walk, take breaks, and return to their desks. Their conversations and pairing suggestions are deterministic local practice, with no AI service.
- The account leaderboard records server-observed foreground online and NPC pairing time. Overlapping tabs do not double-count. Hidden tabs, disconnects, and restarts earn no unobserved time. Names can be edited without changing account ownership or history.
- Theater seats animate through approach, lowering, sitting, and standing. Sitting opens a full-screen screening of the supplied **Adialante launch demo**, with shared play/pause/seek and personal sound controls. Playback starts muted; returning guests join the current demo position instead of restarting it. Back to room or Escape returns to the seated room view. A 1080p web copy and poster are bundled in `public/media/`; the original 4K file is unchanged.
- Sound and autoplay permissions are personal settings.

## Verification

```sh
npm test
npm run build
```

Node API tests cover persistence, session revocation, validation, cross-origin writes, forged identities, private-message isolation, screening conflicts, activity deduplication, and upstream adapters. Playwright tests launch temporary Vite servers on ports 5174–5177 and 5182 using installed Chrome. Set `PLAYWRIGHT_CHANNEL` for a different installed Chromium channel. Browser tests cover independent users, avatar movement, removal of the studio chat panel, reloads, reconnects, theater playback sync, mobile layout, existing NPC pairing, and browser execution isolation/timeouts. LeetCode browser tests use API fixtures and do not require the external site. New multiplayer screenshots are written to the system temporary directory.

## Structure

- `server/multiplayer.mjs`: SQLite accounts/sessions/chat, authenticated event stream, presence, screening state.
- `server/index.mjs`: production static/API server; `vite.config.js` mounts the same APIs in development.
- `src/Conversation.jsx`, `src/conversation.css`: character portraits, NPC conversations, and private player dialogue.
- `src/Multiplayer.jsx`, `src/multiplayer.css`: authentication screen, shared client connection, remote avatars.
- `src/Office.jsx`, `src/world.js`, `src/PlayerSprite.jsx`: office simulation, NPCs, movement and sprites.
- `src/TheaterRoom.jsx`, `src/watchParty.js`: shared screening and theater controls.
- `src/projectFiles.js`, `src/projectFiles.css`: project files, browser preview composition, file creation and persistence.
- `src/ProjectWindow.jsx`, `src/LeetCodeWorkspace.jsx`, `src/practiceRunner.js`: client-side editors and execution.
- `src/PairLobby.jsx`, `src/PairPanel.jsx`, `src/pairing.js`: NPC pairing practice.
- `server/activity.mjs`, `server/activityModel.mjs`, `src/activityClient.js`: authenticated account time ledger.
- `deploy/nginx.conf`, `Dockerfile`, `compose.yaml`: deployment.

Character assets: [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT), [MetroCity by JIK-A-4](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) (CC0). Notices live in `public/assets/game-characters/`. Original visual notes are in `docs/design.md`.
