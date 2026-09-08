# Architecture

Difracta is one runtime process, any number of thin clients, and a set of pure
packages they share. This document describes the architecture as it is in the
code and evolves with it. Each section ends with the reason behind its shape, so
the decision is not re-litigated every time someone touches the area.

## Topology

```text
Studio (web) ──────────────┐
Output pages (browsers) ───┼── websocket /live ──▶ Runtime ──▶ .difracta files
difracta CLI (agents) ─────┘
```

The runtime is authoritative. It holds one Installation at a time as a Document,
applies commands, replicates per-property deltas, keeps undo history, and saves
files. Clients never hold state the runtime does not have, except transient UI
state.

**Why one Installation:** a runtime runs one show on one mini-PC, the way a
Chataigne or Resolume process runs one project. Holding several would mean
Output pages and Studio disagreeing about which one is "the" Installation, and
copies of a file (Save As) clashing on entity ids. One document makes "open"
mean replace, keeps every Output attached to the same document, and lets a copy
on disk keep its ids.

**Why:** show control (OSC from a hub such as Chataigne), several Studio
windows, Output displays and shell agents all mutate the same Installation. One
authoritative process is the only place ordering, validation and undo can be
consistent.

## Packages

| Package             | Role                                                                                                                    | Depends on              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `difracta-core`     | Document model (normalized tables), patches, Addresses, command registry, pure command reducers, undo history, settings | zod                     |
| `difracta-protocol` | Wire schemas for the live socket and runtime requests                                                                   | core                    |
| `difracta-client`   | Connection, snapshot plus delta replica (`DocumentView`), acknowledged commands, coalesced inputs                       | core, protocol          |
| `difracta-runtime`  | Node host: document sessions, files and autosave, live server, static serving                                           | core, protocol, fastify |
| `difracta-output`   | One display's page; no React                                                                                            | client                  |
| `difracta-studio`   | React authoring and performance UI                                                                                      | client                  |
| `difracta-cli`      | `difracta` command for shells and agents                                                                                | client                  |

**Why:** Studio and Output are separate packages because an Output page runs in
smart-TV browsers and must stay tiny. Everything that can be pure lives in
`core` so the runtime, the CLI and a browser can run the same code.

## Document

A Document is one Installation as entity tables keyed by id plus a small
`operational` object for live state. Patches address any value by path.

```text
Document
├── installation { id, name }
├── outputs { [id]: Output }
├── surfaces { [id]: Surface }        output, mappings per Output
└── operational { blackout }          replicated, never saved
```

Entity names inside one table are unique. Creating or renaming an entity into a
name that is taken yields the next free `Name N` (`document/names.ts`), the way
DAWs and Chataigne do, instead of failing.

Entities the user can arrange carry an `order` key (`document/order.ts`): a
short string that sorts lexicographically, produced by fractional indexing.
`entity.move` places an entity after a sibling by setting only that entity's key
to a value between its new neighbours, so a move is one patch, one inverse
patch, and one changed line in the file. When two neighbours leave no room (keys
from older files can tie) the command renumbers the whole table once. Readers
sort with `orderedEntries`; the file's sorted keys say nothing about order.

**Why:** a nested tree forces every change to rebuild, re-validate and re-send
the whole Installation. Flat tables keyed by id make a change one patch, keep
validation local to the touched entity, and let ordering be a parent id plus an
order key rather than array positions.

### Surfaces and mappings

A Surface names a real-world projection target. Its `output` is the Output it
renders through, or null while unassigned, and `mappings` holds one Surface
Mapping per Output it was ever assigned to, keyed by Output id. A mapping is the
quadrilateral where Surface Space's corners land, in normalized Projection Frame
coordinates (`document/geometry.ts`); corners may lie outside the unit square
when a Surface overshoots the projector's edge. Only the mapping for `output` is
used. `surface.assign` reuses a mapping the Surface already has for the chosen
Output and otherwise creates one covering the whole frame; `surface.create`
picks the only Output when the Installation has exactly one. Removing an Output
removes its mapping from every Surface and unassigns the ones using it.

Corners are edited by `surface.corner.set` (absolute) and `surface.corner.nudge`
(relative). Both coalesce under one key per corner, so a drag or a held arrow
key is one undo step, and both round to a millionth of the frame so files stay
free of float noise.

**Why mappings live on the Surface:** a mapping is calibration, and calibration
is what an operator loses when a projector is swapped and swapped back. Keeping
the dormant mappings on the Surface makes reassigning it to an earlier Output
restore its corners for free, without a table or navigator row per Surface and
Output pair. **Why a relative nudge command:** a held key sends commands faster
than replies return; an absolute position computed from the view would repeat or
lose steps, whereas deltas apply in full in any order.

## Commands and patches

Every change is a command: name, Zod payload schema, pure
`apply({document, payload}) → patches | error`, and a kind. `executeCommand`
validates the payload, runs apply, applies the patches, validates only the
touched entities (`document/validate.ts`), and computes the inverse patches.

- `authoring` commands enter undo history and dirty the document.
- `performance` commands are show input: replicated, never undoable, never
  dirtying. `address.set` and `address.toggle` are the generic ones.

Commands are registered by one import line in `commands/index.ts`. The registry
is the only source for the runtime handler and the CLI's `commands`, `describe`
and `run`. Runtime-scoped operations (documents, files) are not commands; they
are `request` messages defined in `difracta-protocol`.

**Why:** with one definition per command there is nothing central to edit when a
feature is added, and the reducer is pure and shared, so any client can run it
too if optimistic application is ever wanted.

## Addresses

An Address names a controllable property or trigger, such as
`installation/blackout` or `layer/<id>/opacity`. `resolveAddress` maps it to a
document path and a value type; `listAddresses` enumerates every reachable one.
Controllers, Macros, Pads, OSC, and the CLI all read and write Addresses.

**Why:** hand-written target unions mean every new controllable thing needs
changes in the domain, protocol, inspector, OSC router and discovery tree. With
one Address table a new entry is reachable from every control surface at once.

## Live protocol

One websocket per client. After `hello` the runtime sends `welcome` and the open
document's summary (or null), and sends it again on every change. Documents are
still addressed by id, so a client can tell a replaced document from the one it
subscribed to; the client drops views of a replaced one.

- `subscribe` the document → one `snapshot`, then `delta` messages carrying
  `fromRevision`, `revision` and per-path patches. Deltas produced within one
  event-loop turn are merged into one message per client. A `fromRevision`
  mismatch makes the client resubscribe.
- `subscribe` with `live: true` adds the **live state** to the snapshot and
  sends `live` messages afterwards: patches relative to the live root, with no
  revision. Live state is what is happening right now around the document, today
  the Output Sessions; it is never saved, never undone, and never changes the
  document revision. Studio reads it under the `live` path root
  (`["live", "outputs", id, "sessions"]`) with the same subscriptions as the
  document. Output pages never ask for it.
- `attach` declares the connection an Output page showing one Output; the
  runtime keeps an **Output Session** per attached connection. `telemetry`
  reports frame interval, render work, resolution, pixel ratio and workload once
  a second (`settings.live`). A session with no report for a few seconds shows
  as stale, one silent for minutes is dropped, and a closed socket drops it at
  once. Removing the Output drops its sessions.
- `command` is acknowledged with a `reply`. `history.undo` and `history.redo`
  are commands too.
- `input` is an unacknowledged latest-wins write to an Address, coalesced per
  frame on the client; the runtime applies it as `address.set`.
- `request` covers runtime-scoped operations: `documents.new/open` (replace the
  document; refused while it has unsaved changes unless `discard`),
  `documents.save/revert/close` and `files.list`.

**Why a live root instead of a second channel:** telemetry, calibration state
and playback all need per-path subscriptions exactly like document values, so
they ride the same view and the same hooks. Keeping them out of the revision
means an Output reporting once a second never forces anyone to resubscribe, and
keeping them opt-in means an Output page pays nothing for other pages' reports.

**Why:** busking is a stream of Macro triggers and Controller moves. Shipping
the whole Installation on each would parse and re-render everything on every
client. Per-path deltas make a Macro that changes twelve values cost one packet
of twelve pairs, and let Studio components subscribe to single paths. The
separate input channel keeps continuous values out of the acknowledged path and
out of undo.

## Undo

Per document, in the runtime. Each entry records the originating actor (a stable
identity a client sends in `hello`, such as one Studio browser or one CLI user;
the session id otherwise), forward and inverse patches, and an optional coalesce
key. Consecutive entries with the same key from one actor within the coalesce
window merge into one step, so a slider drag or a burst of renames is one
Ctrl+Z. `undo` pops the caller's own last entry, or anyone's with `global`. An
entry whose inverse overlaps a later entry from another actor is refused instead
of clobbered. History is bounded (`settings.history`) and never persisted.

**Why:** Studio, the CLI and OSC all mutate the same document. A Studio-only
undo would compute inverses against state it may not have, bypass validation,
and vanish on reload. In the runtime it reuses the reducers' inverse patches and
gives agents `difracta undo`.

## Files

One Installation per `.difracta` file: JSON with sorted keys, a `kind` and
`formatVersion`. The runtime opens the one file named on its command line, if
any, and nothing else; Studio and the CLI replace it through `documents.open` or
`documents.new`. Replacing a document with unsaved changes needs an explicit
discard, which also removes that file's autosaves so the discarded state does
not come back as a recovery.

Save is explicit and atomic: the content is written to a sibling temporary file,
flushed to disk, then renamed over the target, so a crash leaves either the old
file or the complete new one.

Dirty documents autosave to a sibling `<name>.<timestamp>.autosave.difracta` on
a debounce (`settings.autosave`); only the newest sidecar is kept. Opening a
file whose sidecar is younger than the file loads the sidecar instead: the
document starts dirty and `recovered`, Studio says so in the status strip, and
nothing is written until someone saves. `documents.revert` reloads the file as
saved over the open document in one delta and drops the sidecars. A successful
save also removes them.

**Why:** users of DAWs and Chataigne expect one document per file that can be
versioned next to the rest of a show and moved between machines. Explicit save
with an autosave sidecar is the recovery model those tools use.

## Settings

`difracta-core/src/settings.ts` holds every tunable in one object: history
coalesce window and limit, autosave delay, default host and port, client
reconnect backoff, CLI connect timeout. Packages import from there instead of
carrying their own literals.

## Studio

Per-path subscriptions: `useDocumentPath(view, path)` re-renders one component
when a delta touches that path. There is no client-side optimistic apply; LAN
round trips are short enough, and the input channel gives sliders immediate
local feedback.

The shell is a menu bar (File, Edit, Blackout, the Installation's name), three
resizable columns and a status strip. The left column is the navigator: the
Installation as root row, then one collapsible section per entity kind. The
right column is the inspector, showing the settings of whatever is selected. The
center holds tabs; the Outputs tab shows one card per Output. Selection is
Studio-local state and never reaches the runtime; the selected row and card
carry an outline so the inspector's subject is visible at a glance. Column sizes
and section open states are remembered per browser in localStorage. An empty
section says how to add its first entity.

Why per-entity folders: every entity kind contributes the same two pieces, a
navigator section and an inspector, and they change together. Each kind lives in
`src/entities/<kind>/` and is registered once in `src/entities/index.ts`; the
navigator and inspector iterate that registry rather than knowing kinds. Shared
field components under `src/inspector/fields/` keep inspectors short and
uniform.

Blackout sits in the menu bar because it is the one control a performer must
reach without looking; it writes `installation/blackout` through the input
channel and is not undoable.

The Surface inspector places the Surface in its Output's frame with a small SVG:
the quad with draggable corner handles, other Surfaces on the same Output as
outlines, and the frame's aspect taken from the Output's session telemetry when
one is reporting. Corner buttons take arrow keys for nudging and two fields show
the selected corner as percentages of the frame. Dragging shows the handle at
the pointer and sends absolute sets with one in flight at a time
(`lib/use-latest-wins.ts`); everything else shows confirmed document values.
