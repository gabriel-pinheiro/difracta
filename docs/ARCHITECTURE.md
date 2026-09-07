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

The runtime is authoritative. It holds every open Installation as a Document,
applies commands, replicates per-property deltas, keeps undo history, and saves
files. Clients never hold state the runtime does not have, except transient UI
state.

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

One websocket per client. After `hello` the runtime sends `welcome` and the
open-document list, and keeps broadcasting the list on change.

- `subscribe` a document → one `snapshot`, then `delta` messages carrying
  `fromRevision`, `revision` and per-path patches. Deltas produced within one
  event-loop turn are merged into one message per document per client. A
  `fromRevision` mismatch makes the client resubscribe.
- `command` is acknowledged with a `reply`. `history.undo` and `history.redo`
  are commands too.
- `input` is an unacknowledged latest-wins write to an Address, coalesced per
  frame on the client; the runtime applies it as `address.set`.
- `request` covers runtime-scoped operations:
  `documents.list/new/open/save/close` and `files.list`.

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
`formatVersion`. The runtime opens exactly the files named on its command line
and nothing else; Studio and the CLI open more through `documents.open`.

Save is explicit and atomic: the content is written to a sibling temporary file,
flushed to disk, then renamed over the target, so a crash leaves either the old
file or the complete new one.

Dirty documents autosave to a sibling `<name>.<timestamp>.autosave.difracta` on
a debounce (`settings.autosave`); only the newest sidecar is kept. Opening a
file whose sidecar is younger than the file loads the sidecar instead: the
document starts dirty and `recovered`, Studio shows a banner, and nothing is
written until someone saves. `documents.revert` reloads the file as saved over
the open document in one delta and drops the sidecars. A successful save also
removes them.

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
and section open states are remembered per browser in localStorage.

Why per-entity folders: every entity kind contributes the same two pieces, a
navigator section and an inspector, and they change together. Each kind lives in
`src/entities/<kind>/` and is registered once in `src/entities/index.ts`; the
navigator and inspector iterate that registry rather than knowing kinds. Shared
field components under `src/inspector/fields/` keep inspectors short and
uniform.

Blackout sits in the menu bar because it is the one control a performer must
reach without looking; it writes `installation/blackout` through the input
channel and is not undoable.
