# Agent guidance

Difracta is a projection-mapping and generative-visuals engine for live
performance. Keep the domain language in `docs/GLOSSARY.md`; do not introduce
near-synonyms.

## Read only what the task needs

- Boundaries, data flow and the reasons behind them: `docs/ARCHITECTURE.md`
- Terms: `docs/GLOSSARY.md`
- `research/` is gitignored. Each contributor may use it for their own working
  notes, progress and scratch files; nothing in it is authoritative.

## Rules that keep the codebase cheap to change

- One command per file in `difracta-core/src/commands/`: schema, pure `apply`,
  and its test next to it. Register it with one line in `commands/index.ts`.
  Never add a central switch for a new command.
- Everything a control surface can move is an Address
  (`difracta-core/src/address/`). Add the address; do not add a special case to
  Macros, OSC or the CLI.
- Commands return patches; they never mutate. Performance commands (Blackout,
  Controller values, Cues) are `kind: "performance"`: replicated, not undoable,
  not dirtying.
- Tunables (history limits, autosave delay, ports, timeouts) live in
  `difracta-core/src/settings.ts`. Do not scatter magic numbers.
- Files stay under roughly 300 lines. Split by feature folder, not by technical
  layer. No `utils/`, `helpers/`, `types/` dumping grounds.
- Deltas are per property. Never send a whole Installation after the initial
  snapshot.
- The Output page stays tiny (no React). Studio is React with per-path
  subscriptions (`useDocumentPath`), so a control re-renders alone.
- Studio UI: Tailwind plus shadcn on Base UI (`components.json`, style
  `base-mira`). Add primitives with `npx shadcn@latest add <component>` in
  `difracta-studio/`; never hand-write them. Base UI composes with the `render`
  prop, not `asChild`. Studio is dark only.
- Studio entities: each entity kind has one folder under
  `difracta-studio/src/entities/<kind>/` with its navigator section, its
  inspector and anything else it shows, registered in `entities/index.ts`.
  Inspector building blocks (name, switch, copy fields, heading) live in
  `src/inspector/fields/` and are shared by every kind.
- Strict TypeScript, ESM, `.ts` import specifiers inside Node packages. Accept
  `unknown` at boundaries and validate with Zod.
- A runtime holds one Installation at a time; open and new replace it.
- Runtime is authoritative. Studio, Output and the CLI are clients of the same
  `@difracta/client`.
- Everything a person can do in Studio must be doable from the CLI. Studio
  gestures are commands and requests, so a new one is reachable through
  `difracta run` or `difracta documents` at once; give the everyday ones a
  shortcut and check `difracta --help` reads well to an agent.
- Desktop has three preload bridges, each for one kind of page, and none grows
  to serve another's. `window.difractaDesktop` (`bridge-contract.ts`) is for the
  local runtime's Studio only and carries only what needs the operating system,
  such as a file dialog; anything else goes through the runtime as a command or
  request, so the CLI can do it too. `window.difractaLaunch`
  (`launch-contract.ts`) is for the launch page (`difracta-studio/src/launch/`),
  which chooses where Desktop goes and imports no client, app shell or Visuals.
  `window.difractaMenu` (`menu-contract.ts`) goes to every Studio window, remote
  ones too, so it must give the page no power over Desktop: the page describes
  its menu, main validates it with Zod and draws it, and the page hears which
  item was clicked. Never add to it anything a page from another machine should
  not be able to do.
- A Studio menu item is added to the menu model
  (`difracta-studio/src/menu/menu-model.ts`), never to one renderer: the in-page
  bar and Desktop's native menu both draw that model, and `runMenuCommand` is
  the one place an item's id becomes a command. Its shortcut is handled in
  `keyboard/shortcut-keys.tsx` only; menus show it.
- In `difracta-desktop`, keep what is pure apart from what needs Electron: the
  `electron` module only exists inside the app, so a file with unit tests does
  not import it.
- A Visual's or Filter's `notes` are what an agent reads before using it. Write
  them when adding one: how it reads on a Surface, which Parameters interact,
  cost, what to stack it with.
- Visuals and Filters integrate, they never sample: anything time-derived lives
  in the instance `create` returns and advances by `dt`. A Filter's fragment
  only samples the frame with the uniforms its instance returns; a shader
  Visual's fragment only paints with them. Report `changed: false` when a frame
  would repeat itself, `blank` (Visual) or `identity` (Filter) when it would
  draw nothing or do nothing. Cues arrive as `cue(key)` on the instance; keep
  each event only while its effect is visible.
- Thumbnails are rendered, never drawn. After adding or changing a Visual or
  Filter run `npm run thumbnails -w @difracta/visuals [id…]` and keep the PNG it
  writes in `difracta-visuals/thumbnails/`. It needs Chromium for Playwright
  once: `npx playwright install chromium`.
- Comments and docs describe what the code does now. Planned work belongs in a
  contributor's `research/` notes, not in "later" remarks in source.

## Commands

Node 24. `npm run dev` starts the runtime (4800), Output dev server (4801) and
Studio dev server (4802). `npm run check` runs `npm test`, `npm run typecheck`,
`npm run lint` and `npm run format:check` at once, in parallel; `npm run build`
is separate. While iterating, run only what you touched
(`npx vitest run <file>`, `npm run typecheck -w <package>`); run `npm run check`
and, for a Desktop change, `npm run test:desktop` once, before reporting.
Typecheck is incremental and lint and format are cached, so a second run costs
seconds; the caches live in `node_modules/.cache/` and `*.tsbuildinfo`, and a
stale one is never the cause of a failure that a cold run does not show.
`npm run test:gpu` renders the compositor's pixel tests (`difracta-render/gpu/`)
in headless Chromium, which `npx playwright install chromium` provides once.
`npm run desktop` builds and launches Difracta Desktop; `npm run test:desktop`
drives the built app through Playwright and needs a display.
`npm run package:desktop` packages Desktop for the current OS into
`difracta-desktop/release/` (`electron-builder.yml`);
`DIFRACTA_DESKTOP_EXECUTABLE=<packaged executable>` makes the Desktop suite
drive that package instead. The CLI is `node difracta-cli/bin/difracta.mjs` (or
`npx difracta` inside the repo).
