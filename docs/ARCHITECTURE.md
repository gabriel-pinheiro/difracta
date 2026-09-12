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

| Package             | Role                                                                                                                                                 | Depends on                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `difracta-core`     | Document model (normalized tables), patches, Addresses, Catalog and Parameter types, command registry, pure command reducers, undo history, settings | zod                              |
| `difracta-visuals`  | The built-in Catalog: Visual and Filter definitions, their implementations and thumbnails                                                            | core, render                     |
| `difracta-protocol` | Wire schemas for the live socket and runtime requests                                                                                                | core                             |
| `difracta-client`   | Connection, snapshot plus delta replica (`DocumentView`), acknowledged commands, coalesced inputs                                                    | core, protocol                   |
| `difracta-runtime`  | Node host: document sessions, files and autosave, live server, static serving                                                                        | core, protocol, visuals, fastify |
| `difracta-render`   | Visual SDK (instances, player, helpers) and the WebGL2 compositor: homographies, Mask textures, calibration patterns                                 | core                             |
| `difracta-output`   | One display's page; no React                                                                                                                         | client, render                   |
| `difracta-studio`   | React authoring and performance UI                                                                                                                   | client, visuals                  |
| `difracta-cli`      | `difracta` command for shells and agents                                                                                                             | client                           |

**Why:** Studio and Output are separate packages because an Output page runs in
smart-TV browsers and must stay tiny. Everything that can be pure lives in
`core` so the runtime, the CLI and a browser can run the same code.

## Document

A Document is one Installation as entity tables keyed by id plus a small
`operational` object for live state. Patches address any value by path.

```text
Document
├── installation { id, name, activeScene }
├── outputs { [id]: Output }
├── surfaces { [id]: Surface }        output, mappings per Output
├── masks { [id]: Mask }              surfaceId, mode, points, feather
├── paths { [id]: Path }              surfaceId, points, closed
├── scenes { [id]: Scene }            name, order
├── layers { [id]: Layer }            kind, sceneId, parentId, enabled, order, + per kind
│                                     visual: visual, parameters, target, paths, opacity, blendMode
│                                     filter: filter, parameters, mix
├── controllers { [id]: Controller }  kind, parentId, order; number: value 0..1; color: value
├── links { [id]: Link }              controllerId, address, anchors
├── macros { [id]: Macro }            kind, parentId, order; macro: actions [set|toggle|trigger]
└── operational { blackout, calibration }   replicated, never saved
```

Entity names inside one table are unique, or, for child entities such as Masks,
unique among the children of one parent (`PARENT_FIELDS`, `siblingsOf`).
Creating or renaming an entity into a name that is taken yields the next free
`Name N` (`document/names.ts`), the way DAWs and Chataigne do, instead of
failing.

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

Two more fields say what the Surface's Layers render into. `renderScale` (0.25×
to 2×, an Address so it is a slider and reachable from the CLI) multiplies the
resolution of the canvases Layers targeting the Surface draw on. `size` is the
Surface's real width and height in any unit, or null for automatic, set by
`surface.size`. `surfaceCanvasSize` (`document/geometry.ts`) turns them into
pixels: width follows the longer of the top and bottom edges as projected on the
Output, height the longer of the sides, so no axis is undersampled at any angle;
a stated size then stretches the shorter axis to the real aspect. **Why a stated
size at all:** a square seen at a steep angle projects as a tall trapezoid, and
its image alone cannot tell that from a tall Surface (the projector's optics
would have to be known), so automatic is right whenever the projector faces the
Surface, and the size is there for the steep ones.

### Masks

A Mask is a polygon in Surface Space, three to sixteen points, that decides
which part of its Surface is lit: `include` lights only its area, `exclude`
never lights it. A Surface with no include Masks is fully lit; with any, it
starts closed, and Masks then apply in order, each changing only its own
polygon. Feather is a fraction of Surface Space and fades inward only. Masks
live in their own table with a `surfaceId` and an `order` key scoped to that
Surface; `entity.move` keeps a Mask among its siblings. Removing a Surface
removes its Masks. Point commands (`mask.point.set`, `.nudge`, `.add`,
`.remove`) replace the whole `points` array, because patch paths address object
keys, not array positions, and sixteen points is a small value.

### Paths

A Path is a polyline in Surface Space, two to sixteen points, open or closed,
that a Visual follows: it lights nothing by itself. A Visual definition declares
the Paths it needs by key (`paths: [{ key, label }]`), and a Visual Layer's
`paths` binds a Path id to each key (`layer.path`). The bound Path must be on
the Layer's Target; a Layer with any declared Path unbound is not planned, so it
renders nothing and the inspector says which Path it needs. Picking another
Visual or Target keeps the bindings that still fit and drops the rest rather
than refusing, and removing a Path or its Surface unbinds it everywhere. Paths
live in their own table like Masks, with the same commands (`path.create`,
`.rename`, `.update` for open or closed, `.point.set`, `.nudge`, `.add`,
`.remove`, `.remove`); adding a point after the last one of an open Path
continues the line instead of splitting a closing edge. Masks and Paths of one
Surface share one order: `entity.move` on either takes its neighbours from both
tables (`surfaceChildren`), and a new one appends after both. Point order is the
Path's direction: Side A is the left of travel, Side B the right.

**Why bindings on the Layer rather than a Path Parameter:** a Parameter is a
value in the Visual's own vocabulary; a binding is a reference into the
Installation that must follow the Target and go away with its Path. Keeping it
apart from `parameters` keeps Addresses, Links and Macros out of it. **Why drop
rather than refuse:** an operator building a Scene picks the Visual first and
draws the Path after; a refusal in either order is a dead end, an empty binding
is a next step. **Why one order across two tables:** the navigator shows a
Surface's Masks and Paths as one list, and an order the operator cannot arrange
the way they read it is a small daily annoyance for no invariant gained; the
Masks still apply in their own sequence among Masks.

**Why a table rather than an array on the Surface:** Masks are selected,
renamed, reordered and inspected like any entity, and the navigator and
inspector iterate the entity registry. A row in a table with a parent id gets
all of that from the generic code; an array inside the Surface would need its
own selection, move and validation paths.

**Why mappings live on the Surface:** a mapping is calibration, and calibration
is what an operator loses when a projector is swapped and swapped back. Keeping
the dormant mappings on the Surface makes reassigning it to an earlier Output
restore its corners for free, without a table or navigator row per Surface and
Output pair. **Why a relative nudge command:** a held key sends commands faster
than replies return; an absolute position computed from the view would repeat or
lose steps, whereas deltas apply in full in any order.

### Scenes and Layers

A Scene is an ordered stack of Layers, and everything in the stack is a Layer: a
Visual Layer (a Visual on a Target, with opacity and blend mode), a Filter Layer
(a Filter with a mix) or a Group (a container). One `layers` table holds all
three with a `kind`, a `sceneId`, a `parentId` (null at the Scene root, a Group
otherwise) and an `order` key; document order is navigator order, top first, and
rendering will walk it bottom up. Siblings are the Layers sharing `sceneId` and
`parentId` (`PARENT_FIELDS`), so names and order keys are scoped to one parent.
`layer.move` places a Layer under any root or Group of any Scene, carrying a
Group's contents along and refusing cycles; `entity.move` still covers
reordering among siblings. `layer.group` wraps a Layer in a new Group at its
position and `layer.ungroup` dissolves one; duplicating a Scene or a Group
copies everything inside with fresh ids. A Visual Layer starts without a Visual
or Target, a Filter Layer without a Filter: both are picked afterwards from the
Catalog. Removing a Surface clears the Target of Layers using it. The first
Scene created becomes `installation.activeScene`; the active Scene cannot be
removed.

**Why one table for three kinds:** the stack is one ordering across kinds, and
the words followed the data. Having "Layer" mean only "Visual instance" left
Filters and Groups as second-class items with their own names, moves and menus;
with every entry a Layer, adding a Visual and adding a Filter are the same
gesture, and Filters and Groups reorder, group and hide through the same
commands. **Why a nullable Visual:** a Layer's place in the stack, its name, its
Group and its enabled state are worth authoring before any pixels exist, and the
choice of Visual is a separate gesture with its own picker.

### Controllers and Parameter Links

A Controller is one Installation-wide value that many Layers follow: a Number
Controller holds 0 to 1, a Color Controller a color, and both are Addresses
(`controller/<id>/value`) written like any other, from the inspector, a Macro,
OSC or the CLI. Controllers live in one `controllers` table with the same
`parentId` and `order` shape as Layers, so Groups arrange them in the navigator
with the same drag, move and ungroup commands; a Group has no value. Their
values are part of the file: a Color Controller is also how a static
Installation keeps its palette.

A Parameter Link (`links` table) makes one Controller drive one Layer Address: a
number, boolean or color Parameter, opacity, mix or enabled. A number link
stores `anchors`, the target values at Controller 0 and 1, and maps linearly
between them, clamped to the target's range and snapped to its step; reversed
anchors invert. Anchors are checked when written: both must lie within the
target's range and on its step grid, so the endpoints the inspector shows are
the values the Controller reaches. A boolean target is on from 0.5; a color link
copies the color. An Address has at most one Link; linking it elsewhere moves
it. `link.create` takes any number of Addresses, so wiring one Controller to the
same Parameter on thirty Layers is one command and one undo step.

Nothing is materialized. The Layer keeps its authored value in the document, and
whoever needs what the Layer shows asks `effectiveValue` or `effectiveLayer`
(`address/links.ts`), one rule in core that the Output runs once per frame
(`effectiveDocument` before planning, cached per document revision) and Studio
runs per row. A direct write to a linked Address is refused by name ("Speed is
controlled by Pulse"); unlinking, or removing the Controller, first writes the
effective value into the document so nothing on the wall changes. Removing a
Layer or Scene removes its Links; duplicating one copies them onto the copies;
picking another Visual drops the Links to Parameters the new definition lacks.
Playing a Scene never touches a Controller.

**Why resolve at read time rather than materialize:** materialized values need a
second implementation of the same rule on every client that wants to show a
change before the server confirms it, and the two drift. One function in core,
called where the value is needed, cannot. **Why the authored value stays:** it
is what the Layer goes back to when the Link goes, and it keeps Undo of a Link
one patch. **Why Links target Addresses and not entity fields:** a Link to
`layer/<id>/opacity` and one to `layer/<id>/param/speed` are the same record, so
anything that becomes an Address becomes linkable for free.

### Macros

A Macro (`macros` table) is a named, ordered list of actions run as one
performance step: a look, a hit, a state. Each action is one of three things on
one Address: `set` writes a value, `toggle` flips a switch, `trigger` fires a
trigger Address. Nothing else, because everything a show needs to move is an
Address: showing a Layer is a set of its `enabled`, a Scene change is a trigger
of `scene/<id>/play`, Blackout is a toggle of `installation/blackout`, and a
Macro that runs other Macros triggers their `macro/<id>/run`. Macros share the
Controllers' tree shape (`kind`, `parentId`, `order`; `document/tree.ts` holds
the move, ungroup and duplicate rules both use), so Groups arrange them the same
way. Actions live inside the Macro as an array with their own ids; a Macro is a
short list edited as a whole, not a table.

Running is `address.trigger` on `macro/<id>/run`, the same path OSC or the CLI
takes. The actions run in order against the document as the previous ones left
it, so a later action sees an earlier one's effect, and best-effort: an action
that cannot run (its target gone, its Address driven by a Controller) is
skipped, the rest run, and the command's result carries one warning per skipped
action, which Studio toasts and the CLI prints. One run is one commit, one
revision, never undone, dirtying like any performance write. Every Macro runs at
most once per firing, so Macros may run each other in any graph without a loop.
`actionProblem` tells the inspector which actions would be skipped today, so a
broken one is seen at rehearsal rather than heard at the show.

Adding actions takes any number of Addresses at once (`macro.actions.add`), each
captured with what the Address holds now, so ticking fifteen opacities records
the state the wall is in. Removing a Layer, Scene, Controller or Macro drops the
actions on it; picking another Visual drops the actions on Parameters or Cues
the new one lacks; duplicating a Layer does not copy actions, since a Macro
names its targets on purpose.

**Why three action kinds and not a catalog of verbs:** v1-style unions (play
scene, show item, set opacity, trigger cue…) grow with every controllable thing
and each verb needs its own inspector, router and discovery entry. Over
Addresses, a Macro can do anything a slider or an OSC message can, including
what does not exist yet. **Why best-effort:** a Macro is fired mid-set from a
Pad; refusing the whole run because one Layer was deleted yesterday takes the
performer's hit away. Skipping with a warning keeps the show going and tells the
truth afterwards. **Why once per run rather than a depth limit:** a diamond (A
runs B and C, both run D) should run D once, and a cycle should stop without
counting; a visited set does both.

### Catalog and Parameters

The Catalog is the set of Visual and Filter definitions a runtime knows
(`core/catalog/`). A definition is code with a stable id, a name, a description,
a backend (`canvas` or `shader`), an optional `recommended` flag, a Parameter
schema, and for Visuals the Paths they follow and the Cues they answer to. Core
owns the types and the validation; `difracta-visuals` owns the entries and their
thumbnails, and the runtime passes that Catalog to the command registry. A
definition's file also carries its implementation, written against the SDK in
`difracta-render` (see Visuals and Filters below); the runtime and Studio only
read the metadata. A definition may carry `notes`: paragraphs for whoever
composes with it, human or agent, saying what the code cannot (how it reads on a
Surface, which Parameters interact, what it costs, what to stack it with). The
runtime answers `catalog.list` with its definitions minus their functions and
shader source, which is how the CLI's `catalog` prints the notes and a reference
generated from the schema, and how its `addresses` resolves Parameters without
shipping the Visuals package.

Thumbnails are rendered, not drawn: `npm run thumbnails` in `difracta-visuals`
runs each definition through the compositor in a headless Chromium (Playwright),
a Visual on a full-frame Surface for a few seconds with its first Cue fired a
few times near the end, a Filter over a gray checkerboard with a ring, and
writes one PNG per definition. **Why rendered:** a thumbnail is then what the
definition does, and adding a definition costs one command rather than an
illustration; Filters over the same picture compare with each other, and the
ring shows displacements a checkerboard alone would hide. Every command's
`apply` receives it, so `layer.visual` and `layer.filter` can refuse an unknown
id and check values.

A Parameter is declared once, in the definition, as one of four kinds: number
(with min, max, step and unit), color (four components from 0 to 1), choice
(named options) or boolean. Values live on the Layer in `parameters`, keyed by
Parameter name; picking a definition writes its id and the defaults in one
command, and a complete set of values can come along instead, which is how a
pick is put back. A Layer whose id the Catalog no longer has keeps it: the
inspector shows the id as unavailable and the Output draws nothing for that
Layer.

**Why the Catalog is injected rather than imported by core:** the same commands
run wherever the registry does, including a CLI with no Visuals at hand, and a
runtime built with a different Catalog validates against exactly what it can
render. **Why an unknown id is a warning and not an error:** a Catalog changes
between versions and between machines; a file that opened yesterday must open
today, with one Layer flagged, rather than refuse as a whole.

### Calibration Mode

`operational.calibration` names one Surface, or one Mask or Path of it, plus the
highlighted corner or point, the view for the Output's other Surfaces (hidden,
outlines, patterns) and the live session that entered it. `calibration.set`
replaces the whole entry and `calibration.exit` clears it; both are performance
commands, so they replicate at once and never enter undo history. The runtime
clears the entry when its owner's session closes. Authoring commands do not
touch it, so removing or unassigning the calibrated Surface leaves a stale entry
behind briefly; readers go through `resolveCalibration`, which treats a dangling
entry as no calibration, and the next `set` or `exit` overwrites it.

**Why:** the Output only needs the whole state, and one small object written
atomically is easier to reason about than corner, view and Mask arriving as
separate patches. Owner tracking exists because a Studio tab closed
mid-alignment would otherwise leave a pattern on stage.

## Commands and patches

Every change is a command: name, Zod payload schema, pure
`apply({document, payload}) → patches | error`, and a kind. `executeCommand`
validates the payload, runs apply, applies the patches, validates only the
touched entities (`document/validate.ts`), and computes the inverse patches.

- `authoring` commands enter undo history.
- `performance` commands are show input: replicated, never undoable.
  `address.set` and `address.toggle` are the generic ones; `scene.play` and the
  calibration commands are others.

Dirty is decided separately from the kind: the document is dirty when any patch
touched something outside `operational`, whichever command made it. A played
Scene or an opacity moved from OSC is saved state and counts; Blackout and
Calibration Mode are never saved and never count.

**Why:** the file must reflect what the Outputs show, and busking changes it
through performance commands all night; the undo stack, by contrast, is for
authoring gestures a person wants to take back.

Commands are registered by one import line in `commands/index.ts`. The registry
is the only source for the runtime handler and the CLI's `commands`, `describe`
and `run`. Runtime-scoped operations (documents, files, the Catalog) are not
commands; they are `request` messages defined in `difracta-protocol`. Together
they are the whole of what Studio does, so the CLI can do everything Studio can:
`run` for any command, `documents` for the requests, and shortcuts for the
everyday ones (`get`, `addresses`, `edit`, `set`, `catalog`, `undo`).

**Why:** with one definition per command there is nothing central to edit when a
feature is added, and the reducer is pure and shared, so any client can run it
too if optimistic application is ever wanted.

## Addresses

An Address names a controllable property or trigger, such as
`installation/blackout` or `layer/<id>/opacity`. `resolveAddress` maps it to a
document path, a value type (boolean, number, color, choice or trigger), a
default, and for numbers a range and for choices the options; `listAddresses`
enumerates every reachable one. The entries today are Blackout, a Scene's
`play`, a Macro's `run`, a Surface's `render-scale`, a Controller's `value`,
and, per Layer, `enabled`, `opacity` and `blend` (Visual Layers), `mix` (Filter
Layers), `param/<name>` for every Parameter of the Layer's definition and
`cue/<key>` for every Cue it declares, typed from the Catalog. Controllers,
Macros, OSC and the CLI all read and write Addresses.

Two commands write one: `address.edit` is the authoring write the inspector
sends, undoable, labelled by the property ("Change Opacity", "Change Speed") and
coalescing per Address so a drag is one step; `address.set` is the same write
for show control, never undone. Both share one reducer, which refuses an unknown
Address, a value the type does not accept (a number outside its range or off its
step grid is refused by name, never snapped), and an Address a Controller
drives, which cannot be written directly by anyone. A trigger Address is fired
rather than written, through `address.trigger` and `address/fire.ts`: a Layer's
Cue changes nothing in the document and returns an event instead, a Scene's play
sets the active Scene, a Macro's run performs its actions. The runtime commits a
command's patches before announcing its events to every session subscribed to
the document, so a Macro's Parameter changes are in place before its Cue lands.
An event is never stored, undone or replayed to a session that connects later;
an Output hands it to the Layer's Visual instance as `cue(key)`.

**Why:** hand-written target unions mean every new controllable thing needs
changes in the domain, protocol, inspector, OSC router and discovery tree. With
one Address table a new entry is reachable from every control surface at once.

**Why the resolved Address carries range, options and default:** a control needs
exactly those to draw itself, so the inspector renders one row per Address
without knowing whether it is looking at a Layer setting or a Visual Parameter,
and a Link's mapping and an OSCQuery range come from the same place.

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
- `command` is acknowledged with a `reply`. The caller's own delta is flushed
  before its reply, so code that runs on the reply (select what was just
  created) already finds it in the view. `history.undo` and `history.redo` are
  commands too.
- `input` is an unacknowledged latest-wins write to an Address, coalesced per
  frame on the client; the runtime applies it as `address.set`.
- `request` covers runtime-scoped operations: `documents.new/open` (replace the
  document; refused while it has unsaved changes unless `discard`),
  `documents.save/revert/close`, `files.list` and `catalog.list`.

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

## OSC and OSCQuery

The show-control door (`difracta-runtime/src/osc/`): OSC over UDP in, OSCQuery
over HTTP for discovery, and the OSCQuery WebSocket both ways, all on one port
(`settings.osc.port`, `--osc-port`, `--no-osc`; a machine setting, never part of
the file). The runtime announces itself with Zeroconf as `_oscjson._tcp` and
`_osc._udp`, named "Difracta on <hostname>", fixed for the machine so a hub's
saved module reconnects whatever Installation is open; the open Installation's
name is the root node's DESCRIPTION.

The tree has two branches, one leaf per Controller at `/controller/<id>` and one
per Macro at `/macro/<id>`, keyed by id so a rename or a move into a Group never
breaks a mapping; the name, with its Group ("Looks · Tint"), is the leaf's
DESCRIPTION. A Number Controller is a float with RANGE 0..1 and CLIPMODE both, a
Color Controller an RGBA color, a Macro an impulse. Groups are not nodes.
Nothing else is exposed: a Layer's Parameters are reached through a Controller,
so that a value a hub drives is marked as driven in every inspector, and through
Macros for everything else.

An incoming message becomes the command Studio would send, under the actor
"osc": a Controller message is `address.set` on `controller/<id>/value` (one
number or a boolean for a Number Controller, clamped to 0..1 and rounded past
float32 noise; one RGBA argument or three or four numbers for a Color
Controller), a Macro message is `address.trigger` on `macro/<id>/run` with any
or no arguments. Bundles apply in order, their time tags ignored; wildcard
addresses are rejected. Rejections are logged once per reason per window with a
count of what was suppressed, so a misrouted fader does not flood the log.

The WebSocket carries the OSCQuery commands LISTEN and IGNORE, after which the
runtime streams every change to a listened Controller as a binary OSC message,
coalesced per event-loop turn like the deltas, and announces PATH_ADDED,
PATH_REMOVED and PATH_CHANGED (a rename, or a move into another Group) so the
hub refreshes its tree by itself. Binary frames on the same socket are OSC
input, the same as UDP. The number of connected WebSocket clients and the port
are part of the live state (`live/osc`), which Studio's status strip shows.

**Why one port for all three:** OSCQuery's HOST_INFO advertises OSC_PORT and
WS_PORT; keeping them equal to the HTTP port means one number to open in a
firewall and one to type when Zeroconf is blocked. **Why ids in paths and names
in descriptions:** Chataigne shows names while mapping and stores paths; a path
made of the name would break every mapping on a rename. **Why Controllers and
Macros only:** the case for driving a Layer Parameter directly is convenience,
and the case against is a value that changes with nothing in Studio saying who
moved it. A Controller made from the row's own link menu is one click, and it
leaves the mark.

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

## Rendering

`difracta-render` draws one Output's frame into a canvas behind a two-method
interface: `render(document, outputId, width, height, now)` and `dispose()`. The
Output page owns the animation loop, the canvas size and telemetry; the
compositor advances the Visual instances, draws, and reports what it did. Under
Blackout, or before a document arrives, the loop ticks once per
`settings.output.idleFrameMs` and a document change wakes it, so the frame after
a Blackout lands within one display frame.

`planFrame` is the pure part: given a document and an Output it lists what to
draw this frame. Outside Calibration Mode that is the active Scene's Visual
Layers, bottom first, each one that is enabled with every Group above it
enabled, has a Visual with every Path it declares bound on its Target, and
targets a Surface on this Output with a mapping; Filters are passed over until
they render, and a Group only gates. With no active Scene the frame is black. In
Calibration Mode on that Output the Scene gives way to the calibrated Surface as
a pattern (grid, diagonals, border, name, corner labels, the selected corner
marked) and the others follow the view. Masks apply to the pattern only while a
Mask or Path is being aligned, and that shape is then drawn over it with its
points marked, a Mask as a loop and an open Path as a line. That drawing lives
in `calibration-drawing.ts` and goes through the same Surface Space program as
the Layers (`surface-program.ts`), so a pattern lands exactly where the Scene
will.

Each planned Layer has a Visual instance (`layer-players.ts`). A canvas Visual's
draws on its own canvas, sized by `surfaceCanvasSize` and capped at the GPU's
texture limit, with a texture uploaded on the frames the instance drew; a shader
Visual's yields uniforms, and its program (`shader-visuals.ts`, one per Visual,
kept once compiled) runs over the Surface's quad straight into the frame at
frame resolution, so Render Scale does not apply to it. An instance exists
exactly while its Layer is planned: playing another Scene, disabling the Layer
or a Group above it, or clearing its Target disposes it, and a change of Visual
or canvas size replaces it, so a Scene starts fresh every time it plays. A Layer
at opacity zero is planned hidden: its instance is kept but not stepped, nothing
is drawn or uploaded for it, and it resumes where it stopped when the fader
comes back up. The frame is then composited in plan order: every Layer's texture
is drawn through its Surface's homography with the Surface's Masks, the Layer's
opacity, and its blend mode (normal is premultiplied over, additive adds), so
Layers stack as the navigator shows and overlapping Surfaces combine as their
light would in the room. The frame is recomposited only when the document, the
Output, the size, or any Layer's picture changed, or any Filter reports that its
picture would; a Scene of Layers and Filters that report no change costs the
Output only the instances' updates, and a hidden Layer not even that.

The plan also places the Scene's Filter Layers: each one enabled with its
Groups, holding a Filter, with a mix above zero and at least one planned Layer
that is not hidden below it on this Output, is listed with its position in the
stack (`below`), and a Group only gates, so a Filter inside a Group still
transforms what lies under the Group. Each planned Filter has an instance
(`filter-players.ts`) that lives as long as the Visual instances do, and whose
update yields the pass's uniforms or says the pass would be an identity (an
Amount at zero), in which case it is left out; a pass is also left out on a
frame where every Layer below it is blank, since it would transform nothing.
When any pass remains, the frame goes through the chain (`filter-chain.ts`): the
Layers accumulate into one of two frame-sized textures instead of the screen,
each pass in plan order reads the current one and writes the other with the
Filter's fragment, the Layer's mix applied as a blend between input and result,
then the last texture is presented; with no pass, Layers draw straight to the
screen as before and the textures are never touched. Programs are compiled once
per Filter and kept.

**Why Layers draw straight into the frame rather than into a Surface buffer:**
one draw per Layer is the whole pipeline, blend modes read naturally as what is
already on the wall, and Filters, which transform the accumulated frame below
them, get to bleed across Surfaces, which is wanted. **Why a Filter with nothing
under it is not planned, and an identity pass or one over blank Layers is
dropped:** each pass is a full-frame draw, the most expensive thing an Output
does, and all would produce exactly their input.

Geometry: every vertex is a Surface Space position pushed through the Surface's
homography in the vertex shader, with clip-space `w` carrying the projective
term, so the GPU interpolates Surface Space perspective-correctly and every
later shape drawn in Surface Space (Masks, Paths) inherits the mapping for free.
The homography and the quad a Surface is drawn with are computed once per
mapping change or frame resize and cached by the corners object's identity
(`surface-geometry.ts`). The pattern is computed in the fragment shader from
Surface Space coordinates and their screen-space derivatives, so its lines are
about one pixel wide at any projection and cost no geometry. Labels are text
rendered once per string into a small texture.

Surface edges: every draw of a whole Surface, a Layer's canvas, a shader Visual
or a calibration fill or pattern, fades out over one pixel centred on the edge
in the fragment shader, from the Surface Space distance to the nearest edge and
its screen-space gradient. For the outer half of that fade to be drawn, the quad
is grown one pixel outward on the Output's pixels, each projected corner moved
along the miter of its two edges and brought back into Surface Space through the
inverse homography, so the vertex shader still projects it and interpolates
Surface Space exactly; a Mask samples clamp past the edge and the fade decides
there. The context has no multisampling: this feather is the only edge
smoothing, so the edge looks the same drawn straight to the screen or into the
Filter chain's textures, and the only lines left unsmoothed are the calibration
outlines. **Why in the fragment shader and not multisampling:** the Filter
chain's textures have no samples to resolve, so with a Filter active a
multisampled context still showed every edge aliased, and the resolve it costs
per frame on a TV bought nothing the feather does not.

Masks: one alpha texture per Surface, sized like a Layer canvas from the
Surface's extent on the Output (`maskTextureSize`: without Render Scale or the
physical size, each side rounded up to the next 64 texels, at least 256, capped
at the GPU's limit, width and height separately), rebuilt only when that
Surface's Masks change (identity comparison, since the document is immutable per
revision) or that size does, and sampled once per fragment. The texture is kept
for as long as the Surface has a planned Layer or a calibration drawing on the
Output, whether or not that Layer drew this frame, so a Visual that blinks does
not rebuild its Surface's Masks on every flash. Feather is drawn inward from the
polygon edge and clipped to it, so no Mask changes coverage outside its own
boundary. **Why sized to the Surface, in steps:** a Mask edge is only as sharp
as its texels on the wall, and rounding the size up keeps a corner drag from
re-rasterizing every step.

**Why WebGL2 only:** the projector machines and smart TVs this runs on all have
it, WebGPU still does not reach every such browser, and one engine is half the
code of two.

### Visuals and Filters

A Visual is a definition plus `create`, which makes one **instance** per Layer
per Output (`render/sdk/`). An instance is a closure over its own state with two
methods the player calls every animation frame: `update(frame)` advances the
state by `frame.dt` seconds, and `render(canvas)` draws the state onto the
Layer's 2D context. `frame` carries the current Parameter values, the size and a
`changed` flag (true on the first frame and whenever a Parameter or a Path
differs from the previous frame); `create` gets the same plus a `random` source
seeded from the Layer id. Time only ever arrives as a delta, clamped to 100 ms
so a tab that slept does not fast-forward. The Paths the Visual declares arrive
under their keys in `paths`, resolved to pixels (`sdk/path.ts`): points, total
length, `at(t)` for the place a fraction of the way along with its tangent, and
`side(sample, side)` for a unit vector off the Path on Side A, Side B, outward
or inward, the last two judged against the centroid. A shader Visual reads the
same Path as `u_path_<key>_points[16]`, `_count` and `_closed` in Surface Space,
declared by the engine. The player rebuilds a Path's geometry only when its
object or the canvas size changed, since the document is immutable per revision,
and counts that as a change so a static Visual redraws when its Path is dragged.
**Why pixels for canvas and Surface Space for shaders:** each is what that
backend draws in; a canvas Visual measuring reach in pixels wants the Path there
too, and a fragment already gets `u_resolution` to do the same.

The one rule of the SDK is that a Visual **integrates, it never samples**:
anything time-derived (a phase, a position, a clock) lives in the instance and
advances by `dt` times the current rate, so changing Swim Speed only changes
what happens next. A Parameter that is not integrated (a color, a size) is read
from `frame.params` every frame and applies at once. Counts go through `fit`,
which grows or shrinks an entity list at its end, so the entities already on
screen stay where they are. `smooth` eases a value toward a target at a rate per
second for the cases where snapping would look wrong, and `rateTimer` turns an
Automatic Rate into firings by accumulating `dt * rate`, jittered around the
mean, so a rate change carries the progress toward the next firing instead of
rescheduling it. `automaticRate()` is the Parameter every event-driven Visual
declares for that, always with the same label and range. `ticker` is the regular
counterpart, a clock in hertz that says how many ticks passed and how far the
next one is, for things that beat rather than happen; `smoothstep` eases within
such a tick.

`update` may return a report. `changed: false` means the previous drawing is
still right: the player leaves the Layer's canvas alone and the compositor
re-uses the texture it uploaded last. `blank: true` means there is nothing to
draw: the player skips `render` and the compositor skips the Layer; the next
non-blank frame redraws. Both default to the safe answer, so a Visual that never
reports is redrawn every frame. Solid Color reports `changed` straight from the
frame and `blank` at alpha zero, which is why a static Installation costs
nothing between edits. The player (`createVisualPlayer`) owns this bookkeeping:
completing a Layer's values with the schema defaults, detecting changes,
clamping time, clearing the canvas around `render`, and creating or disposing
the instance. An Output's size or Render Scale change disposes and recreates
instances; a Visual that wants to keep its state across that can implement
`resize`, none does yet.

**Why stateful instances and no absolute time:** a frame that is a function of
elapsed time and Parameters is discontinuous in the Parameters, so every speed,
rate or count change jumps, and anything emergent (particles, trails, games) has
nowhere to live. Integrating from `dt` makes stability under live Parameter
changes the default rather than a per-Visual effort. **Why a seeded random
source anyway:** it costs a dozen lines and makes a Layer look the same on every
run and a Visual replayable in a test; nothing user-facing depends on it, and no
Surface is ever rendered by two Outputs that would need to agree. **Why the
flags come from `update` and not `render`:** `render` is what they skip.

A Filter is a definition plus a GLSL `fragment` defining `filter_image(uv)` over
the frame accumulated below it, and optionally `create`, which makes one
instance per Filter Layer per Output with the same `update(frame)` as a
Visual's. The instance is the JavaScript half of an animated Filter: it
integrates its phase or tick count from `dt` and returns the uniforms the
fragment reads this frame, so the fragment only samples and Rate or Speed change
live without a skip. Every uniform is `u_<name>`: the Parameters by name (number
as float, color as vec4, choice as an int index, boolean as bool) and the
instance's by key. The engine's prelude supplies `u_resolution`, `u_texel`,
`sample_input` (clamped at the edges), `sample_mirrored` (reflected, so
displaced pixels never show the frame border), `hash` and `hash2`, and after the
fragment it applies the Layer's mix and keeps the result premultiplied. An
update may report `changed: false`, meaning the pass would repeat itself for the
same input, and `identity: true`, meaning it would return its input, which skips
the pass; uniforms carry over until returned again. The player
(`createFilterPlayer`) does the bookkeeping without a GPU, so a Filter's
behaviour is tested frame by frame like a Visual's. A Filter without `create`
changes only with its Parameters. **Why the same instance model as Visuals:**
sampling absolute time in the shader is what made every Rate and Speed change
jump before, and a fragment that reads a counter cannot tell whether it was
integrated or sampled.

A shader Visual (`defineShaderVisual`) is the same idea over Surface Space: a
fragment defining `render_visual(uv)` and an optional `create` whose `update`
returns `{changed?, blank?, uniforms?}`. The engine applies the Layer's opacity,
blend mode and Masks and premultiplies the result. An instance may return
uniform arrays (`Float32Array`, `vec2s`, `vec3s`, `vec4s` in `sdk/uniforms.ts`)
for a fragment that reads several live events through a fixed-size array; that
size is the only limit on how many a shader can show at once, and it is the
Visual's to choose.

Cues reach the instance, canvas or shader, as `cue(key)` before its next
`update`, and the instance keeps whatever it needs: a list of live envelopes, a
counter, a beam per hit. An event is dropped by the Visual once it is no longer
visible, a burst after its last flash, a blink after its fade, so there is no
engine-owned history and no cap on how many a Visual may hold. **Why no timeline
store:** handing each instance the event when it happens is the whole feature;
recording occurrences with ages and delivery orders for a pure renderer to read
back was the workaround for not having instances.

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
carry an outline so the inspector's subject is visible at a glance. Rows with
children open and close with a chevron: Output rows start open so their live
sessions stay in view, Surface rows start closed so Masks and Paths do not crowd
the list; creating a child or selecting one from an inspector opens its parent.
Column sizes and section open states are remembered per browser in localStorage;
row open states live in memory and reset with the Installation. An empty section
says how to add its first entity, and an open row without children says so in
one dim line.

Why per-entity folders: every entity kind contributes the same two pieces, a
navigator section and an inspector, and they change together. Each kind lives in
`src/entities/<kind>/` and is registered once in `src/entities/index.ts`; the
navigator and inspector iterate that registry rather than knowing kinds. Shared
field components under `src/inspector/fields/` keep inspectors short and
uniform.

The Scenes section lists each Scene as a collapsible row with a play button and,
when active, a green dot; its Layers nest under it and Groups nest further, each
Layer row with an eye and rows under a disabled Group faded. Rows drag among
siblings, into a Group or a Scene by dropping on the row's middle, and to other
Scenes. Selecting a Scene never plays it. The "+" on a Scene or Group row opens
a menu of the three kinds, and new Layers land at the top with a default name,
ready to rename in the inspector. The Layer inspector starts with what the Layer
is made of, its name, description and trait badges, and a button into the
Library, then the name, then two collapsible sections of Address rows: Layer
(enabled, Target, opacity and blend mode, or mix) and Parameters. A row is a
label, the control for the Address's type and, when the value is not the
default, a reset button; numbers are a slider with a readout that turns into an
input when clicked (typed values clamp to the range), colors are the browser's
color input with an editable hex and an alpha slider, choices a select, booleans
a switch. Sliders and the color input stream every position through
`address.edit`, one send in flight at a time. The Parameters header has Reset
all, one `layer.reset` step. Section open states are remembered per section.

The Controllers section is a tree like a Scene's: Number and Color Controllers
with their live value at the right (a percentage, a swatch), Groups that open
and close, drag among siblings and into Groups. It starts closed unless it is
empty, where the hint to add one is all there is. The section's "+" offers the
three kinds and asks for a name, since a Controller is named for what it drives.
The Controller inspector has the name, the value as the same Address row a
Parameter gets, and a Links section listing every target with its Layer, a
number Link's anchors editable in place, unlink, and "Add link…". That opens the
Link picker: every compatible Address in the Installation grouped by Scene, a
search box matching Scene, Layer, Visual and Parameter names word by word, tick
boxes, "Select all results" and one Link button, so one Controller reaches the
same Parameter on thirty Layers in a few keystrokes; an Address linked elsewhere
shows its Controller and moves on pick. On a Layer, every Address row ends in a
link menu: "Link to" lists the Controllers of the right kind, "New Number
Controller" or "New Color Controller" makes one named after the row ("Koi Pond
Opacity") and links it in one step, and a linked row shows the effective value
read-only, a chip with the Controller's name and value that opens it, and
Unlink, so there is no control to mistake for an override. A Layer whose Enabled
is linked shows a link glyph in place of its eye.

The Macros section has the same shape, each Macro row with its action count and
a Run button, and starts closed unless it is empty. The Macro inspector has the
name, Run, and the actions in the order they run: each with its target, the
value it sets edited with the same control the Address has in its own inspector,
a Set or Toggle choice on switches, a grip to drag it elsewhere in the list, and
the reason it would be skipped, if any. "Add action…" opens the same picker as
Links, now over every Address in the Installation under its Scene, Controllers,
Macros, Scenes and Installation headings; each pick becomes a set of the current
value, or a trigger. A run that skipped anything shows a toast naming what and
why.

The Library is the picker for Visuals and Filters. It is bound to one Visual or
Filter Layer and takes over the center column while open: a search box, three
facets (backend, Path, Cues) and a grid of tiles with thumbnails and badges.
Search is fuzzy and ranked: a name starting with the query beats a name with a
word starting with it, which beats the letters in order, and any name match
beats a description with a word starting with the query (letters in order are
tried on names only, since over a description they match nearly everything);
recommended entries come first among equals and lead the list when nothing is
typed. Clicking a tile or moving with the arrow keys applies the definition to
the Layer through `layer.visual` or `layer.filter`, so the Outputs are the
preview; Enter keeps it, Escape discards the browse and puts back what the Layer
had when the Library opened, and the browse undoes as one step because the
commands coalesce per Layer. Adding a Visual or Filter Layer opens the Library
for it, since picking is the next thing to do; double-clicking a Layer row or
the inspector's button opens it later. Selecting another Visual or Filter Layer
rebinds the Library, selecting anything else closes it. A Layer still carrying
its generated name takes the name of what it picks.

**Why apply on highlight rather than preview locally:** the projector is the
only honest preview of a Visual on a real Surface, and Studio has no renderer of
its own; applying to the runtime shows every candidate where it will be seen.
**Why the center column rather than a dialog:** the navigator and the inspector
stay usable, so a Layer's other settings can change while candidates are
compared.

The Surface, Mask and Path inspectors carry a Calibrate toggle and, while
active, the view for the other Surfaces; the corner or point selected in the
inspector is mirrored to the Output as it changes, and focusing a corner or
point button selects it, so Tab and the arrow keys agree. While the mode is on,
selecting another Surface, Mask or Path moves the pattern to it; selecting
anything else leaves it on. A Visual Layer whose Visual follows Paths shows one
row per Path below its Target, a select over the Target's Paths with a "+" that
creates one named after the Layer, binds it and selects it. The status strip
shows what is being calibrated with an exit link, so a forgotten Calibration
Mode stays visible. Escape clears the selection outside text fields and dialogs.

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
