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
  Macros, OSC, Pads or the CLI.
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
- Strict TypeScript, ESM, `.ts` import specifiers inside Node packages. Accept
  `unknown` at boundaries and validate with Zod.
- Runtime is authoritative. Studio, Output and the CLI are clients of the same
  `@difracta/client`.
- Comments and docs describe what the code does now. Planned work belongs in a
  contributor's `research/` notes, not in "later" remarks in source.

## Commands

Node 24. `npm run dev` starts the runtime (4800), Output dev server (4801) and
Studio dev server (4802). `npm test`, `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run build`. The CLI is
`node difracta-cli/bin/difracta.mjs` (or `npx difracta` inside the repo).
