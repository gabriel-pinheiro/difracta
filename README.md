# Difracta

Difracta is a projection-mapping and generative-visuals engine for live
performance: one runtime holds an Installation, browsers attached to projectors
render its Scenes, and Studio, the shell and OSC hubs edit and drive it at once.
Everything a control surface can move is an Address, everything that changes the
Installation is a command, and the runtime is the one source of truth.

## Run locally

Node 24.

```sh
npm install
npm run dev
```

`npm run dev` starts the runtime on port 4800, the Output dev server on 4801 and
Studio on 4802. Open Studio at http://localhost:4802/. To put a picture on a
projector, create an Output in Studio and open the URL its inspector shows in a
browser on the machine driving that projector. All three servers listen on every
interface, so a laptop, the mini-PC and the projector's browser can sit on one
LAN.

## Production

```sh
npm run build
node difracta-runtime/bin/difracta-runtime.mjs <file.difracta>
```

The runtime serves the built Studio at `/studio/` (the root redirects there),
the Output page at `/output/`, thumbnails at `/catalog/`, a `/health` JSON
endpoint and the live WebSocket at `/live`. It opens the file given on the
command line, at most one, and holds one Installation at a time. Autosaves land
next to the file and are recovered on the next open.

Flags and their environment variables (`difracta-runtime/src/config.ts`):

| Flag                   | Variable                | Default                |
| ---------------------- | ----------------------- | ---------------------- |
| `--host <address>`     | `DIFRACTA_HOST`         | `0.0.0.0`              |
| `--port <number>`      | `DIFRACTA_PORT`         | `4800`                 |
| `--projects-dir <dir>` | `DIFRACTA_PROJECTS_DIR` | `~/Difracta`           |
| `--osc-port <number>`  | `DIFRACTA_OSC_PORT`     | `9000`                 |
| `--no-osc`             | `DIFRACTA_NO_OSC=1`     | OSC on                 |
|                        | `DIFRACTA_STUDIO_DIST`  | `difracta-studio/dist` |
|                        | `DIFRACTA_OUTPUT_DIST`  | `difracta-output/dist` |

Relative file paths in requests resolve inside the projects directory.

## Show control

The runtime speaks OSC over UDP and OSCQuery over HTTP and WebSocket on one
port, 9000 by default, and announces itself with Zeroconf as `_oscjson._tcp` and
`_osc._udp` under the name "Difracta on <hostname>", so a hub such as Chataigne
finds it and reconnects to it whatever Installation is open.

The OSC tree has one leaf per Controller at `/controller/<id>` (a float from 0
to 1, or an RGBA colour) and one per Macro at `/macro/<id>` (an impulse). Paths
carry ids, so a rename or a move into a Group never breaks a mapping; the name
is the leaf's description. Everything else in the Installation is reached
through Controllers and Macros, so a value a hub drives is marked as driven in
every inspector.

## Working from a shell

```sh
node difracta-cli/bin/difracta.mjs --help
```

The CLI is a client of the same runtime as Studio. Every Studio gesture is a
command or a request, so `difracta run <command>` and `difracta documents` reach
all of them, and the everyday ones have shortcuts: `scene`, `get`, `edit`,
`set`, `trigger`, `outputs`, `osc` (the tree a hub binds to). Names work
wherever ids do, replies name what they created, and `--json` makes every output
one JSON value. `difracta --help` ends with a guide to the Address grammar and a
Layer recipe.

## Quality

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

`npm run test:gpu` renders the compositor's pixel tests in headless Chromium,
which `npx playwright install chromium` provides once.
