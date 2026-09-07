# Architecture

Difracta is one runtime process, any number of thin clients, and a set of pure
packages they share. This document describes the boundaries as they exist after
slice one. Decisions and their reasons are in `adr/`.

## Topology

```text
Studio (web or Electron) ──┐
Output pages (browsers) ───┼── websocket /live ──▶ Runtime ──▶ .difracta files
difracta CLI (agents) ─────┘                         │
Chataigne ──── OSC / OSCQuery (later slice) ─────────┘
```

The runtime is authoritative. It holds every open Installation as a Document,
applies commands, replicates per-property deltas, keeps undo history, and saves
files. Clients never hold state the runtime does not have, except transient UI
state.

## Packages

| Package             | Role                                                                                                          | Depends on              |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `difracta-core`     | Document model (normalized tables), patches, Addresses, command registry, pure command reducers, undo history | zod                     |
| `difracta-protocol` | Wire schemas for the live socket and runtime requests                                                         | core                    |
| `difracta-client`   | Connection, snapshot plus delta replica (`DocumentView`), acknowledged commands, coalesced inputs             | core, protocol          |
| `difracta-runtime`  | Node host: document sessions, files and autosave, live server, static serving                                 | core, protocol, fastify |
| `difracta-output`   | One display's page; no React                                                                                  | client                  |
| `difracta-studio`   | React authoring and performance UI                                                                            | client                  |
| `difracta-cli`      | `difracta` command for shells and agents                                                                      | client                  |

Planned: `difracta-engine` (Visual SDK, renderer, compositor),
`difracta-visuals` (catalog), `difracta-app` (Electron shell).

## Document

A Document is one Installation as entity tables keyed by id plus a small
`operational` object for live state. Patches address any value by path.

```text
Document
├── installation { id, name }
├── outputs { [id]: Output }
└── operational { blackout }          replicated, never saved
```

Later slices add tables (surfaces, mappings, regions, masks, guides, scenes,
items, controllers, links, macros, pads, pickers). Composition order will be a
parent id plus an order key on each item, not nested arrays.

## Commands and patches

Every change is a command: name, Zod payload schema, pure
`apply({document, payload}) → patches | error`, and a kind. `executeCommand`
validates the payload, runs apply, applies the patches, validates only the
touched entities, and computes the inverse patches.

- `authoring` commands enter undo history and dirty the document.
- `performance` commands are show input: replicated, never undoable, never
  dirtying. `address.set` and `address.toggle` are the generic ones.

## Addresses

An Address names a controllable property or trigger, such as
`installation/blackout`. `resolveAddress` maps it to a document path and a value
type; `listAddresses` enumerates every reachable one. Controllers, Macros, Pads,
OSC, and the CLI all read and write Addresses, so a new Address is reachable
from every control surface at once.

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
  `documents.list/new/open/ save/close` and `files.list`.

## Undo

Per document, in the runtime. Each entry records the originating actor (a stable
identity a client sends in `hello`, such as one Studio browser or one CLI user;
the session id otherwise), forward and inverse patches, and an optional coalesce
key so consecutive edits of one field within a second merge. `undo` pops the
caller's own last entry, or anyone's with `global`. An entry whose inverse
overlaps a later entry from another session is refused instead of clobbered.

## Files

One Installation per `.difracta` file: JSON with sorted keys, a `kind` and
`formatVersion`. Save is explicit. Dirty documents autosave to
`<file>.difracta.autosave` on a five-second debounce; the file listing flags a
newer sidecar and `documents.open` can recover from it. The runtime remembers
which files were open and reopens them on start.

## Studio

Per-path subscriptions: `useDocumentPath(view, path)` re-renders one component
when a delta touches that path. There is no client-side optimistic apply yet;
LAN round trips are short enough, and the input channel gives sliders immediate
local feedback later if needed.
