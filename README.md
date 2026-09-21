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
Studio on 4802. The runtime holds `research/dev.difracta`, created on first run;
`DIFRACTA_FILE=<path> npm run dev` holds another file. Open Studio at
http://localhost:4802/. To put a picture on a projector, create an Output in
Studio and open the URL its inspector shows in a browser on the machine driving
that projector. All three servers listen on every interface, so a laptop, the
mini-PC and the projector's browser can sit on one LAN.

## Desktop

```sh
npm run desktop                      # the launch page first, then whatever was chosen last time
npm run desktop -- show.difracta     # opens that file on this computer
npm run desktop -- --no-studio       # the runtime on this computer, with nothing on screen
```

Difracta Desktop is the Electron application (`difracta-desktop`). Its launch
page asks once where Studio should come from, and later launches resume that
choice. File ▸ Connect to... in the menu bar opens the page again over what is
running, and nothing stops until another target is chosen there. Studio's File
and Edit menus are in the native menu bar, and the window title names the
Installation and its file, or the runtime it is open in.

- **Run on this computer** starts a runtime of Desktop's own on port 4800 with
  `--documents free`, shows its Studio in a window, and opens and saves
  Installations with the operating system's file dialogs. Opening a `.difracta`
  file always does this.
- **Connect to a Runtime** shows the Studio of a runtime that is already
  running, such as the mini-PC's: pick it from the list of runtimes found on the
  network, or type `host`, `host:port` or a URL when the network hides them.
  Runtimes connected to before stay listed. The Installation stays on that
  machine, so there are no file dialogs and closing the window asks nothing.

A venue's mini-PC runs Desktop as an appliance, reached from a laptop whose
Desktop connects to it. Two checkboxes under File ▸ Startup set that up, and
both apply from the next start:

| Setting                     | Flag                         | What it does                                                                                                                                                                                                                                                                                      |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start Without Studio Window | `--no-studio` for one launch | Local mode starts the runtime and shows nothing. The runtime listens on every interface and is announced on the network as always. Starting Difracta again while it runs shows Studio; closing that window leaves the runtime running, and File ▸ Quit quits. In remote mode the flag is ignored. |
| Start at Login              |                              | The operating system starts Desktop at login: a login item on macOS and Windows, `~/.config/autostart/difracta-desktop.desktop` on Linux. The checkbox shows what the operating system has, so it is right after the entry was removed by other means.                                            |

Leaving the runtime on this computer (quitting, closing Studio, choosing another
target under Connect to...) asks about unsaved changes first, and then warns
when Outputs are showing from it, on this computer's screens or anywhere else,
since they go dark: "2 Outputs are showing from this computer. Quitting stops
them." It only warns. Stopped by SIGTERM or the end of the OS session with no
window open, Desktop asks nothing and stops the runtime cleanly, unsaved changes
autosaved.

If the runtime crashes or the OS kills it, Desktop starts it again with the
Installation that was open; the autosave brings unsaved changes back, and
Studio, the Output pages and the CLI reconnect by themselves. An Installation
that was never saved has no autosave to come back from. Three restarts within a
minute and Desktop stops trying and says where `runtime.log` is.

The script builds the Output page, Studio and Desktop, then launches the build;
stop `npm run dev` first, since both want port 4800, or move Desktop with
`DIFRACTA_PORT` (or connect Desktop to the dev runtime instead of running one).
To work on Studio inside Desktop with hot reload, keep `npm run dev` running and
start `npm run desktop -- --studio-url http://127.0.0.1:4802/studio/`: Desktop
forks no runtime and treats that dev server as this computer's Studio. The
runtime's log is under Help ▸ Show Runtime Log. On a Linux that restricts
unprivileged user namespaces (Ubuntu 23.10 and later) the script explains how to
give Electron its sandbox helper, or to run this development build with
`-- --no-sandbox`.

## Production

```sh
npm run build
node difracta-runtime/bin/difracta-runtime.mjs <file.difracta>
```

The runtime serves the built Studio at `/studio/` (the root redirects there),
the Output page at `/output/`, thumbnails at `/catalog/`, a `/health` JSON
endpoint, the open Installation as a file at `/document` and the live WebSocket
at `/live`. It holds the file given on the command line or in `DIFRACTA_FILE`,
creating it when it does not exist, and refuses to start without one. Autosaves
land next to the file and are recovered on the next open.

Started like this the runtime is **pinned**: clients save and revert its
Installation but cannot create, open or close one, nor save it to another path.
`--documents free` lifts that for clients on the runtime's own machine, and
makes the file optional; clients elsewhere on the network stay pinned.

In both modes any client can download a copy of the Installation
(`difracta documents download`, Studio's File menu, or `GET /document`) and
replace its content from a file of their own
(`difracta documents replace <file>`, or `PUT /document`). The replaced
Installation has unsaved changes until someone saves, and reverting brings the
saved one back.

Flags and their environment variables (`difracta-runtime/src/config.ts`):

| Flag                  | Variable                  | Default                |
| --------------------- | ------------------------- | ---------------------- |
| `--host <address>`    | `DIFRACTA_HOST`           | `0.0.0.0`              |
| `--port <number>`     | `DIFRACTA_PORT`           | `4800`                 |
| `<file.difracta>`     | `DIFRACTA_FILE`           | required when pinned   |
| `--documents <mode>`  |                           | `pinned`               |
| `--osc-port <number>` | `DIFRACTA_OSC_PORT`       | `9000`                 |
| `--no-osc`            | `DIFRACTA_NO_OSC=1`       | OSC on                 |
| `--no-discovery`      | `DIFRACTA_NO_DISCOVERY=1` | announced              |
|                       | `DIFRACTA_STUDIO_DIST`    | `difracta-studio/dist` |
|                       | `DIFRACTA_OUTPUT_DIST`    | `difracta-output/dist` |
|                       | `DIFRACTA_THUMBNAILS_DIR` | the Catalog's own      |

File paths in requests are absolute paths on the runtime's machine; the CLI
resolves a relative one against the shell's directory first.

The runtime announces itself on the local network with Zeroconf as
`_difracta._tcp`, named "Difracta on <hostname>", with its version and the open
Installation's name. `difracta runtimes` lists the ones that answer, with the
address to pass to `--url`; `--no-discovery` keeps a runtime out of the list,
and one bound to a loopback `--host` is never in it.

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
which `npx playwright install chromium` provides once. `npm run test:desktop`
launches the built Desktop through Playwright and needs a display; run
`npm run build` first. To keep its windows off your screen, or without a screen,
run it under Xvfb:
`env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 xvfb-run -a npm run test:desktop`.
With `WAYLAND_DISPLAY` set Electron would open its windows on the real Wayland
session; the suite drops it by itself inside `xvfb-run`, and the long form says
the same by hand.
