# Architecture

Difracta is one runtime process, any number of thin clients, and a set of pure
packages they share. This document describes the architecture as it is in the
code and evolves with it. Each section ends with the reason behind its shape, so
the decision is not re-litigated every time someone touches the area.

## Topology

```text
Studio (web) ──────────────┐
Output pages (browsers) ───┼── websocket /live ──▶ Runtime ──▶ .difracta files
difracta CLI (agents) ─────┤
Desktop (main process) ────┘
```

Desktop is the same topology in one installable application: it starts a runtime
on the machine, shows that runtime's Studio in a window, and is itself one more
client of it (see Desktop below).

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
| `difracta-client`   | Connection, snapshot plus delta replica (`DocumentView`), acknowledged commands, coalesced inputs; Zeroconf browsing under `/discovery` (Node only)  | core, protocol, bonjour-service  |
| `difracta-runtime`  | Node host: document sessions, files and autosave, live server, static serving                                                                        | core, protocol, visuals, fastify |
| `difracta-render`   | Visual SDK (instances, player, helpers) and the WebGL2 compositor: homographies, Mask textures, calibration patterns                                 | core                             |
| `difracta-output`   | One display's page; no React                                                                                                                         | client, render                   |
| `difracta-studio`   | React authoring and performance UI                                                                                                                   | client, visuals                  |
| `difracta-cli`      | `difracta` command for shells and agents                                                                                                             | client                           |
| `difracta-desktop`  | Electron application: a bundled runtime of its own or a runtime elsewhere, its Studio in a window, native file dialogs and OS file opening           | client, runtime (bundled)        |

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
├── media { [id]: Media }             name, path (relative to the file's folder)
├── scenes { [id]: Scene }            name, order
├── layers { [id]: Layer }            kind, sceneId, parentId, enabled, order, + per kind
│                                     visual: visual, parameters, target, paths, opacity, blendMode
│                                     filter: filter, parameters, mix
├── controllers { [id]: Controller }  kind, parentId, order; number: value 0..1; color: value
├── links { [id]: Link }              controllerId, address, anchors
├── macros { [id]: Macro }            kind, parentId, order; macro: actions [set|toggle|trigger, chance?], mode, count
└── operational { blackout, calibration, sequence }   replicated, never saved
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
picks the first Output in order unless the payload names one or null. Removing
an Output removes its mapping from every Surface and unassigns the ones using
it.

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

### Media

A Media item is one image or video file the Installation shows: a name, unique
in the table, and a `path` relative to the Installation file's folder, POSIX
separators, `..` allowed. Its kind, image or video, is read from the extension
(`settings.media` lists them; `document/media.ts` derives it) and never stored;
a path with any other extension is refused. `media.create` names the item after
its file unless told otherwise, `media.rename`, `media.path` and `media.remove`
are the rest, all authoring, and `entity.move` orders them. The path helpers in
`document/media.ts` are pure and run in the browser too: one relativizes an
absolute path against the document's folder, which Desktop's picker and the CLI
use, and one says whether a resolved path stays under that folder.

A Visual refers to an item through a Parameter of kind `media`
(`{ kind: "media", accepts: "image" | "video", default: "" }`), whose value is
an item's id or `""` for none. Its Address is of type `media`: the options are
none plus the items of the accepted kind, `address.set` and `address.edit`
refuse anything else, a Macro `set` action swaps artwork, and a Link is refused.
`layer.visual` checks the value the same way; `layer.reset` puts `""` back.
`media.remove` clears every Parameter holding the item to `""`, as removing a
Surface clears Targets, and drops the Macro actions that would set it;
`media.path` does the same when the new extension changes the kind, since the
Parameters that held it accept only the kind it was. The file on disk is never
touched.

**Why a table and a reference rather than a path on the Layer:** the same file
is shown by several Layers and swapped by Macros; one entity gives it a name, a
status and one place to change the path. **Why relative paths:** a show folder
is copied to the stage machine or mounted into a container, and the file must
still be found beside the Installation. **Why the kind is derived:** the
extension already says it; storing it would be one more thing to keep in step.

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
copies everything inside with fresh ids. A Visual Layer starts without a Visual,
a Filter Layer without a Filter: both are picked afterwards from the Catalog. A
new Visual Layer takes the Target of the sibling it lands next to when that is a
Visual Layer with one, otherwise the first Surface, unless `layer.create` names
a Target or null. Removing a Surface clears the Target of Layers using it. The
first Scene created becomes `installation.activeScene`; the active Scene cannot
be removed.

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
takes. The Macro's Run Mode (`mode`, with `count` for Some) picks which actions
the run performs: all of them, one at random, `count` distinct ones at random,
or the next one in Sequence. The picked actions run in list order against the
document as the previous ones left it, so a later action sees an earlier one's
effect, and best-effort: an action that cannot run (its target gone, its Address
driven by a Controller) is skipped, the rest run, and the command's result
carries one warning per skipped action, which Studio toasts and the CLI prints.
Each picked action then rolls its Chance (`chance`, 0 to 1, absent for always);
a loser does nothing and says nothing. The result also carries `run`, how many
actions were picked and how many passed their Chance, which the CLI prints for a
mode other than All. One run is one commit, one revision, never undone, dirtying
like any performance write. Every Macro runs at most once per firing, so Macros
may run each other in any graph without a loop. `actionProblem` tells the
inspector which actions would be skipped today, so a broken one is seen at
rehearsal rather than heard at the show.

A Sequence's position is `operational.sequence[macroId]`, the index of the
action the next run fires: show state like Blackout, replicated to every client
and never saved, so every Sequence starts at the top when the document opens.
The run reads it modulo the action count and writes the next index, so a list
edited since the last run still lands on an action, and a Macro removed leaves
an entry nothing reads. Randomness comes from `random` in the command context:
`executeCommand` takes a source, `Math.random` by default, so a test passes a
seeded one and asserts what a run picked. Only the runtime executes commands,
which is why a source in the context is enough.

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
counting; a visited set does both. **Why the mode picks before the Chance rolls,
not after:** One with every action at 20% means one flash a fifth of the time,
which is what a shimmer wants; rolling first and picking a survivor would make
One always fire something, and a Sequence that re-rolled until an action passed
would stall unpredictably. **Why Chance is per action only:** a Macro that fires
the whole list a fraction of the time is a different thing, and the shimmer case
(a Blink Cue on many Surfaces at 40% each) needs the per-action one; a
Macro-wide value would be a second concept for the same effect.

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

A Parameter is declared once, in the definition, as one of five kinds: number
(with min, max, step and unit), color (four components from 0 to 1), choice
(named options), boolean or media (a Media item's id, of the accepted kind, or
`""`; see Media). Values live on the Layer in `parameters`, keyed by Parameter
name; picking a definition writes its id and the defaults in one command, and a
complete set of values can come along instead, which is how a pick is put back.
A Layer whose id the Catalog no longer has keeps it: the inspector shows the id
as unavailable and the Output draws nothing for that Layer.

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

Every change is a command: name, Zod payload schema,
`apply({document, payload, catalog, random}) → patches | error`, deterministic
given its context, and a kind. `executeCommand` validates the payload, runs
apply, applies the patches, validates only the touched entities
(`document/validate.ts`), and computes the inverse patches. `random` is the one
source of chance, consulted only by a Macro run.

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
and `run`. Runtime-scoped operations (documents, the Catalog) are not commands;
they are `request` messages defined in `difracta-protocol`. Together they are
the whole of what Studio does, so the CLI can do everything Studio can: `run`
for any command, `documents` for the requests, and shortcuts for the everyday
ones (`get`, `addresses`, `edit`, `set`, `catalog`, `undo`).

**Why:** with one definition per command there is nothing central to edit when a
feature is added, and the reducer is shared and deterministic given its context,
so any client could run it too if optimistic application is ever wanted, handing
it the runtime's draws.

## Addresses

An Address names a controllable property or trigger, such as
`installation/blackout` or `layer/<id>/opacity`. `resolveAddress` maps it to a
document path, a value type (boolean, number, color, choice, media or trigger),
a default, and for numbers a range and for choices and media the options;
`listAddresses` enumerates every reachable one. The entries today are Blackout,
a Scene's `play`, a Macro's `run`, a Surface's `render-scale`, a Controller's
`value`, and, per Layer, `enabled`, `opacity` and `blend` (Visual Layers), `mix`
(Filter Layers), `param/<name>` for every Parameter of the Layer's definition
and `cue/<key>` for every Cue it declares, typed from the Catalog. Controllers,
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

One websocket per client. After `hello` the runtime sends `welcome`, which
carries the connection's document mode (`documents: "pinned" | "free"`, see
Files), and the open document's summary (or null), and sends the summary again
on every change. Documents are still addressed by id, so a client can tell a
replaced document from the one it subscribed to; the client drops views of a
replaced one. A copy of the open file (Save As) holds the same Installation id:
opening it puts another document under an id clients are subscribed to, which
they could not notice, so the runtime sends each of them a new `snapshot`.

- `subscribe` the document → one `snapshot`, then `delta` messages carrying
  `fromRevision`, `revision` and per-path patches. Deltas produced within one
  event-loop turn are merged into one message per client. A `fromRevision`
  mismatch makes the client resubscribe.
- `subscribe` with `live: true` adds the **live state** to the snapshot and
  sends `live` messages afterwards: patches relative to the live root, with no
  revision. Live state is what is happening right now around the document, today
  the OSC door, the Output Sessions, the connected Display Hosts and the status
  of each Media item's file; it is never saved, never undone, and never changes
  the document revision. Studio reads it under the `live` path root
  (`["live", "outputs", id, "sessions"]`) with the same subscriptions as the
  document. Output pages never ask for it.
- `attach` declares the connection an Output page showing one Output; the
  runtime keeps an **Output Session** per attached connection. `telemetry`
  reports frame interval, render work, resolution, pixel ratio and workload once
  a second (`settings.live`). A session with no report for a few seconds shows
  as stale, one silent for minutes is dropped, and a closed socket drops it at
  once. Removing the Output drops its sessions.
- `display-host` declares a connection of kind `desktop` a **Display Host**: its
  name, its Displays (id, label, bounds, scale factor, primary, internal) and
  `showing`, Display id → Output id. The host sends it again, whole, on every
  change, and `null` to step down; the runtime refuses it from any other kind of
  client. See Display Hosts below.
- `command` is acknowledged with a `reply`. The caller's own delta is flushed
  before its reply, so code that runs on the reply (select what was just
  created) already finds it in the view. `history.undo` and `history.redo` are
  commands too.
- `input` is an unacknowledged latest-wins write to an Address, coalesced per
  frame on the client; the runtime applies it as `address.set`.
- `request` covers runtime-scoped operations: `documents.new/open` (replace the
  document; refused while it has unsaved changes unless `discard`),
  `documents.save/revert/close`, `catalog.list` and `displays.list/show/hide`.
  Paths in them are absolute paths on the runtime's machine. A pinned connection
  is refused `new`, `open`, `close` and a `save` to another path.

The document as a file does not travel on the socket: `GET /document` downloads
a copy and `PUT /document` replaces the content (see Files).

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

In the runtime, `live/live-server.ts` is the hub: it accepts sockets, reads each
message and hands it on. `client-session.ts` is one connection and its batched
sends, `client-sessions.ts` who among them hears what, `document-commands.ts`
runs commands, and `runtime-requests.ts` validates a `request`, applies the
pinned refusal and calls the request's handler. Handlers come by feature
(`document-requests.ts`, `catalog-requests.ts`, `display-requests.ts`) and the
table's type makes a request without a handler a compile error.

### Media status

`["live", "media", <id>]` holds `{ status }` for every Media item of the open
document: `ok`, `missing` (no file at the resolved path), `outside` (the path
leaves the Installation file's folder and the runtime does not allow that) or
`unsaved` (the Installation has no path yet, so nothing resolves). The runtime
(`live/media-status.ts`) stats every file when a document opens or is replaced,
when it is saved to a new path and after any command that touches `media`, and
replicates only the entries that changed; there is no file watcher, so a file
that appears later is noticed at the next of those moments.
`difracta media list` prints it beside each item.

**Why stat on those moments and not watch:** the moments are when the answer can
change from the document's side, which is what an operator asks about; a watcher
would cost a handle per file across the show folder for a status that Studio
shows and nothing acts on.

### Display Hosts

```text
CLI / Studio ── request displays.show {host, display, output} ──▶ Runtime
                                                                    │ display-request
Display Host ◀──────────────────────────────────────────────────────┘
      └── display-reply {ok | error} ──▶ Runtime ── reply ──▶ CLI / Studio
      └── display-host {…, showing} ──▶ Runtime ── live patches ──▶ live subscribers
```

The runtime keeps one entry per Display Host under the live root,
`["displayHosts", hostId]`: `id`, `sessionId`, `connectedAt`, `name`,
`displays`, `showing`. A later `display-host` from the same connection becomes
one patch per property that changed and one per Display whose Output changed
(`["displayHosts", id, "showing", displayId]`). Hosts belong to connections, not
to the document: replacing the document keeps them, and the next snapshot
carries them; a closed socket removes its host at once. `displays.list` returns
the same entries without a subscription, so it also answers when no Installation
is open.

A host's id is its name as a slug (`Stage PC` → `stage-pc`), with `-2`, `-3`…
while another connected host holds that slug, and stays for the connection's
lifetime. `displays.show { host, display, output }` and
`displays.hide { host, display }` take a host by id, or by name when only one
connected host has it, and a Display by id, or by label when only one of the
host's has it; names and labels match ignoring case. The runtime refuses what it
can tell is wrong (no such host, no such Display, no Installation open, the
Output is not in it), otherwise sends the host's connection a `display-request`
and replies to the requester with the host's `display-reply`: the ids the action
landed on, or the host's error. A host that does not answer within
`settings.displays.requestTimeoutMs`, or disconnects first, fails the request.
The runtime never edits `showing`: the host reports it after it acted.

In `@difracta/client`, `client.displayHost` (`offered-displays.ts`) is the host
side: `offer(report)` registers and updates, `onAction(handler)` answers the
runtime's requests with `{ ok: true }` or `{ ok: false, error }` (a throw
becomes the error), `withdraw()` steps down, and the offer is sent again after a
reconnect. Every client lists and places with the ordinary `request`.
`difracta displays list|show|hide` is the CLI's side of it, and Studio's is the
Open Output dialog (`entities/output/open-output-dialog.tsx`), opened from an
Output's card and inspector: "Open in a window" (a plain link, which in Desktop
becomes a window of Desktop's), "Show on a Display" with the hosts of
`["live", "displayHosts"]` and Show and Hide beside each Display, and the Output
page URL to copy. It is the same in a plain browser, since the hosts are
whichever Desktops are connected to the runtime, and it uses no bridge. The host
itself is Difracta Desktop (see Desktop).

**Why routed through the runtime:** whoever wants an Output on a Display (a
laptop's Studio, a shell) is rarely on the machine that has the Display. Both
are already clients of the same runtime, so the runtime is the one place that
knows every host and can check the Output exists before anyone opens anything.
**Why the host owns `showing`:** only the host knows whether the Output is
really up on the Display, or stopped being so without being asked.

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

## Discovery

The runtime announces itself with Zeroconf as `_difracta._tcp` on its HTTP port
(`difracta-runtime/src/discovery/`), whether or not the OSC door is open;
`--no-discovery` keeps it quiet, and a runtime bound to a loopback host
(`127.0.0.0/8`, `::1`, `localhost`) never announces, since nobody on the network
could reach it; `/health` reports `discovery: false` for both. The instance is
"Difracta on <hostname>", with the port added when it is not the default, so two
runtimes on one machine do not claim one name. Its TXT record carries `version`
and `document`, the open Installation's name, left out when nothing is open. The
record follows the document: a different one is announced once the changes have
been quiet for `settings.discovery.txtUpdateDelayMs`. `bonjour-service` cannot
change the record of a published service, so that is an unpublish and a publish,
and a browser sees the runtime leave and come back at once. Zeroconf errors are
logged and never stop the runtime.

Browsing is `@difracta/client/discovery`, a subpath of the client package that
only Node programs import (Zeroconf needs UDP sockets; the package's main entry,
which Studio and the Output page bundle, never touches it). It turns a browsed
service into a `DiscoveredRuntime` (the address the answer came from wins, then
an IPv4 one), keeps a list through up, down and record changes keyed by instance
name, and browses either once or until stopped. `difracta runtimes` browses for
`settings.discovery.browseMs` and lists who answered, this machine included,
with the `address:port` that `--url` takes. Desktop browses for as long as its
launch page is open.

**Why a service of its own:** the OSC services sit on the OSC port and say
nothing about where Studio and the live socket are, and a runtime started with
`--no-osc` would not be found at all. **Why the name and not the path in TXT:**
the name is what tells two mini-PCs apart in a list; the path would tell the
whole network how the machine's folders are laid out. A network that isolates
its clients blocks multicast, so an address typed by hand always works too.

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
`formatVersion`.

How the runtime was started decides its **document mode**, which the runtime
enforces for every client and tells each connection in `welcome`:

- **pinned** (the default): the runtime holds the file named on its command line
  or in `DIFRACTA_FILE` for as long as it runs. A missing file is created, named
  after the file, with its parent folders; without a file, or with one it cannot
  read, the runtime refuses to start. `documents.new`, `documents.open`,
  `documents.close` and `documents.save` to another path are refused. Save,
  revert and autosave recovery work as usual.
- **free** (`--documents free`): the file is optional, and clients replace the
  document through `documents.open` or `documents.new`, close it, and save it to
  another path. Only loopback peers get this; a connection from another machine
  is told `pinned` and held to it, so nobody names paths on a disk that is not
  theirs.

Requests name files by absolute path and the runtime never lists a folder; the
CLI resolves a relative path against its own working directory before sending
it. Studio shows New, Open, Save As and Close only to a free connection;
Download a Copy and Replace from File are there for both.

A new Installation, from `documents.new` or a missing file the runtime creates,
is the starter (`starterDocument` in `difracta-core/src/document/starter.ts`):
Output 1, a Full Frame Surface assigned to it, and Scene 1, active, whose one
Visual Layer targets that Surface and shows Zoom Rush at its default Parameters,
so opening the Output is the only step left before something shows. It is built
by running `output.create`, `surface.create`, `scene.create`, `layer.create` and
`layer.visual` on an empty Document, so it follows their defaults, gets fresh
ids and takes the Parameter values from the Catalog of the moment. None of it is
in the undo history. `documents.new` with `blank: true`
(`difracta documents new --blank`) gives an Installation with no entities
instead.

A new Installation starts clean and becomes dirty with its first change.
Replacing a document with unsaved changes needs an explicit discard, which also
removes that file's autosaves so the discarded state does not come back as a
recovery.

The open document also travels as a file over HTTP, in both modes and for every
peer, because only content moves and no path on the runtime's disk is named.
`GET /document` answers the text Save would write now, unsaved changes included,
as an attachment named after the file (or the Installation when it has none),
without touching the disk or the dirty state; 404 when nothing is open.
`PUT /document` takes a `.difracta` file's text as its body, validates it like
open does and replaces the document's content, keeping the path. The document is
dirty afterwards and nothing is written until someone saves, so the saved show
is still on disk and `documents.revert` undoes a bad upload; undo history does
not survive it. It answers the summary, or `{ error }` with 409 over unsaved
changes unless `?discard=true`, 422 for a file that is not an Installation and
413 past `settings.runtime.maxDocumentBytes`. The same Installation is replaced
in place, in one delta, as revert does. A file holding another Installation
keeps its own id: it takes the session's place on the same path, so clients see
a new summary and resubscribe as on open, and revert reopens the saved file the
same way. With nothing open the file becomes a new unsaved document. Studio's
Download a Copy and Replace from File, and `difracta documents download` and
`replace`, are these two routes.

**Why HTTP and not a `request`:** a browser downloads a GET natively, and the
upload mirrors it. A file's text inside a live message would be escaped into
JSON and parsed twice, and a frame past the socket's limit closes the connection
instead of answering an error, where HTTP answers 413. PUT, unlike a form POST,
is preflighted by browsers when it comes from another origin, and the runtime
answers no preflight, so a web page elsewhere cannot replace the show.

A Media item's file travels the same way, by id: `GET /media/<id>` resolves the
item's path against the open document's folder and streams the file
(`documents/media-routes.ts`) with the content type from its extension,
`Cache-Control: no-cache` and an ETag from size and modification time, so an
Output page revalidates cheaply and sees a replaced file, and with Range
requests honoured (206, `Content-Range`, 416), which video seeking needs. 404
for an unknown id, a missing file or a document without a path; 403 when the
resolved path leaves the folder, unless the runtime was started with
`--media-anywhere` (or `DIFRACTA_MEDIA_ANYWHERE=1`), which turns
`settings.media.allowOutsideShowFolder` on for that runtime alone: a machine
setting, never in the file. In a container the show folder is mounted for the
file already, so media beside it is reachable and `scp` puts files there.

**Why by id and not by path:** the URL then says nothing about the runtime's
disk, and renaming or moving the file is one `media.path` with every Output
following. **Why the folder boundary:** the Installation names files, so a file
anywhere on the machine would be one command away from any client; inside the
show folder is what a show carries with it, and the flag is for the rig that
keeps its footage elsewhere.

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
with an autosave sidecar is the recovery model those tools use. Pinned is the
default because a runtime driving a show is reached from other machines, and the
show it holds should not depend on what any of them does in a File menu.

## Desktop

`difracta-desktop` is an Electron application with three kinds of process. The
**main process** is Node: it owns the app's life cycle, windows, native dialogs
and the runtime child. The **runtime** is the ordinary `difracta-runtime`,
bundled with everything it imports into one file (`dist/runtime.mjs`, by
`scripts/build.mjs` with esbuild) and forked with Electron's `utilityProcess`,
started `--documents free` on every interface. Each **window** is a sandboxed
Chromium renderer showing a page the runtime serves: Studio from
`http://127.0.0.1:<port>/studio/`, and an Output page opened from Studio in a
window of its own with background throttling off. The build copies the built
Studio, Output page and Catalog thumbnails next to the bundle, and main names
them to the runtime through `DIFRACTA_STUDIO_DIST`, `DIFRACTA_OUTPUT_DIST` and
`DIFRACTA_THUMBNAILS_DIR`, so `dist/` runs without the repository or `tsx`.

Desktop shows one runtime at a time, in one of two modes. **Local mode** forks
the runtime described above. **Remote mode** forks nothing: it asks the runtime
at an address for `/health`, which must name a Difracta Runtime, and loads that
runtime's own `http://<host>:<port>/studio/`. The **launch page** is where a
person chooses: "Run on this computer", a live list of the runtimes discovered
on the network, the ones connected to before (kept when they are not on the
network now, and forgettable), and an address typed by hand (`host`, `host:port`
or a URL; the default port fills in). File ▸ Connect to... in the native menu
opens it again as a window over the running session, which goes on: the runtime
in use is marked there instead of offered, and closing the window changes
nothing. Only a chosen target ends the session, in this order (`connect-to.ts`):
the target is checked (`/health` for a runtime elsewhere, the port being free
for this computer), then the session is left (in local mode through the same
questions as quitting, described below; Cancel closes the launch page and
stays), the runtime child is stopped and waited for, and the new session starts,
so nothing starts while something is still stopping. A target that fails the
check is reported on the page with the session untouched. `desktop-modes.ts`
holds these moves; `local-session.ts` and `remote-session.ts` are what each mode
starts and ends.

Start-up: take the single-instance lock, then decide what to start with
(`start-up-mode.ts`). A file from the OS (command line, second launch,
`open-file`) always means local mode; otherwise the mode of the last launch is
resumed from `desktop-state.json` in the user data folder, which also holds the
last file and the remembered runtimes; the first launch ever shows the launch
page. A start that fails (the port is taken, the remembered runtime does not
answer within `settings.desktop.remoteCheckTimeoutMs`) lands on the launch page
with the reason, where a runtime already holding the port can be connected to
instead. A file arriving while Desktop is in remote mode asks natively whether
to switch to this computer and open it; Cancel keeps the remote session.

Local mode: pick the file (the one asked for, else the last one opened if it
still exists, else none); check the port is free and fork the runtime; ask
`/health` with a backoff until it answers, or give up when the port is taken,
the child exits or `settings.desktop.runtimeStartTimeoutMs` passes; connect to
it; open the Studio window, unless this start is without it (below). Main's
connection is a `@difracta/client` of kind `desktop` (`runtime-link.ts`), in
both modes. From the document summary every client receives it learns the open
file's path, which it remembers and gives to the OS's recent documents, and
whether there are unsaved changes. A local runtime that started with nothing
open is sent `documents.new`, so Desktop lands in a working Studio; an untouched
Installation is not dirty, so that never causes a question later. The runtime's
output goes to `runtime.log` under Electron's logs folder (Help ▸ Show Runtime
Log), the previous launch's kept beside it. In remote mode the link only reads,
and a connection that drops is retried quietly by the client while Studio's own
page shows the reconnect.

In both modes main writes the Studio window's title from that summary
(`window-title.ts`) and refuses the page's own (`page-title-updated`). It stands
in for the middle of Studio's in-page bar, which Desktop does not draw:
`Living - ~/shows/living.difracta - Difracta` in local mode, the home directory
as `~`, and `Untitled - Difracta` before a first save;
`Living - stage-pc (10.0.0.5:4800) - Difracta` in remote mode, with the machine
out of the announced name when it is known and no path, which is on the other
machine's disk. `* ` in front means unsaved changes, and with nothing open the
title is what is left: `Difracta`, or `stage-pc (10.0.0.5:4800) - Difracta`. It
is plain ASCII, like File ▸ Connect to..., because window managers and task
switchers draw titles with whatever font they have.

The launch page is a second entry of `difracta-studio` (`launch.html`,
`src/launch/`): it shares Studio's components and theme and imports no client,
no app shell and no Visuals, so its script is a few kilobytes on top of React.
No runtime serves it to Desktop; main serves it from the copy of the built
Studio in `dist/` over a scheme of its own, `app://desktop/studio/launch.html`,
registered as standard and secure before the app is ready. The handler answers
the launch page and `assets/` only, and resolves every path inside that folder
whatever the URL spells. The page talks to main through a bridge of its own,
`window.difractaLaunch` (`launch-contract.ts`, from a separate preload given
only to the launch window): `runLocal()`, `connect(address)`, `runtimes()` with
`onRuntimesChanged`, `remembered()`, `forget(address)`, `problem()` and
`current()`, the runtime in use when the page is open over a session and null
when the page is all there is. The two starting promises resolve with the reason
when a start fails, so the port being taken or an address not answering shows on
the page. Main checks that each message comes from the launch page's own URL.
While the page is open main browses `_difracta._tcp` and pushes every change.
One runtime is left out of the list: the one Desktop itself is starting or
running, recognised as this computer (its hostname, or an address of its own) on
the local runtime's port. Any other runtime on this computer, a
`difracta-runtime` service for one, is a target like the rest. In a browser the
page has no bridge and says only that it belongs to Desktop.

Studio in Desktop gets `window.difractaDesktop` from the preload script:
`pickOpenPath()`, `pickSavePath(suggestedName)`, `pickMediaPath()` and
`onOpenRequest(callback)`. Studio feature-detects it in
`documents/file-path-request.ts`: with the bridge, Open and Save As show native
dialogs and then send the same `documents.open` and `documents.save` with the
absolute path; without it, in a browser on a free runtime, the path is typed.
`pickMediaPath()` is the same for a Media file
(`entities/media/media-path-request.ts`): a native Open dialog filtered to the
extensions in `settings.media` (`media-dialog.ts` builds the filter list), whose
absolute path Studio relativizes against the Installation file's folder before
`media.create` or `media.path`; in a browser the path is typed. A file opened
from the OS while Desktop runs (a second launch, which the lock turns into a
message to the first; `open-file` on macOS) is handed to Studio through
`onOpenRequest` and goes through Studio's own open, unsaved-changes question
included. The preload exposes the bridge only to the local runtime's origin,
main answers only IPC whose sender frame is from that origin, and only while a
local session exists.

Every Studio window, local or remote, also gets `window.difractaMenu`
(`menu-contract.ts`): `setMenu(model)`, `onMenuCommand(callback)` and
`onFullScreenChange(callback)`. It is how Studio's menu shows in the native menu
bar (see Studio, the menu model): the page describes its File and Edit items,
and hears the id of the one that was clicked. The local window's preload
(`preload.ts`) exposes both bridges; a remote runtime's window gets
`menu-preload.ts`, which exposes this one only, and each preload hands its
bridges to the session's origin and no other. Main takes `setMenu` only from the
Studio window's own page at that origin, and validates the model with Zod
(`page-menu.ts`): only the `file` and `edit` menus, a bounded number of items,
bounded strings, ids of plain characters. Unknown menus and keys are dropped
rather than refused, so a newer Studio still gets its menus in an older Desktop.
Labels are drawn as plain text, `&` doubled so that it cannot become an Alt
mnemonic, and a shortcut is shown only when it has the plain `Ctrl+Shift+S`
form. What a page described is forgotten when its window navigates or reloads
and when the session changes. A Studio from before this bridge never calls it:
it keeps its in-page bar, and the native bar shows Desktop's own items. In both
modes windows refuse to navigate away from their runtime's origin, an Output
page opened from Studio gets an unthrottled window of its own, other links open
in the person's browser, and every window runs with `contextIsolation`,
`sandbox` and no `nodeIntegration`.

Leaving local mode stops the runtime on this computer, so it is asked about
first, in one place for every way of leaving. Every quit (File ▸ Quit, a signal,
the OS session ending) arrives as the app's `before-quit`, which `quit-gate.ts`
holds until the session agrees; closing the Studio window asks for a quit rather
than closing; a target chosen under Connect to... asks the same before the
switch. The questions are `Session.mayLeave`, whose order is `leave-checks.ts`:
with unsaved changes, Save, Don't Save or Cancel (Save without a file goes
through the Save dialog, Don't Save closes the document as discarded so its
autosave does not return as a recovery); then, with Output Sessions attached to
the runtime, a warning that they stop ("2 Outputs are showing from this
computer. Quitting stops them.", Quit or Cancel; "Switching" and Switch for
Connect to...). It warns and never refuses. Cancel on either leaves everything
as it was, so the acts are ordered apart from the questions: the sessions are
counted first, while the document they belong to is open; Save happens when
chosen; Don't Save waits until the second question is answered too. The count
comes from live state (`["live","outputs",id,"sessions"]`, stale sessions left
out), which main subscribes to for that one snapshot and lets go again; every
Output page counts, a window of this Desktop as much as a TV's browser, since
all go dark; a Display window (below) is one of them once its page has attached,
and is counted even before. Leaving remote mode stops nothing over there: the
Installation and its Outputs live in that runtime and stay. The one thing asked
is about this computer's Display windows, which close ("1 Display of this
computer is showing an Output. Quitting stops it."). Nothing is asked either
when no window of Desktop is open, because nobody is there to answer, nor of a
runtime that is not answering. After the questions the windows close and main
posts `shutdown` on the child's parent port: the runtime flushes its autosave,
closes and exits, and is killed only after
`settings.desktop.runtimeStopTimeoutMs`.

Local mode can start without the Studio window: `--no-studio` for one launch, or
File ▸ Startup ▸ Start Without Studio Window, kept in `desktop-state.json`, for
every launch (the flag only ever says yes; outside local mode it is ignored with
a log line). The runtime child, main's link and the session are as always, on
every interface and announced on the network, and nothing is on screen;
`window-all-closed` never quits Desktop. The way to Studio is to start Difracta
again: the second launch hands over to the running one, which opens the Studio
window (so does a click on the macOS Dock icon). In such a session the window is
a visit: closing it closes it and nothing else, and quitting is File ▸ Quit, a
signal or the end of the OS session. A file from the OS while there is no window
is opened by main itself with `documents.open`; with unsaved changes it is not,
and the Studio window is shown so that Studio's own Open asks.

While a local session runs, a runtime child that exits without having been asked
to is started again (`runtime-restarts.ts`): after
`settings.desktop.runtimeRestartInitialDelayMs`, doubled for every restart still
inside `runtimeRestartWindowMs`, with the path of the Installation that was open
by the last summary main saw, not the one Desktop started with. The runtime
loads an autosave newer than the file, so unsaved changes come back; an
Installation never saved has no path and no autosave, and the runtime comes up
with a new one. Studio, the Output pages and main's link reconnect by
themselves, as to any runtime that was away, and no window is reloaded.
`runtimeRestartLimit` restarts inside the window and Desktop stops trying: a
native error names `runtime.log`, and Studio keeps showing its own
"disconnected". Each restart is a line of Desktop's in `runtime.log`, which goes
on across restarts instead of rotating. An exit Desktop asked for (quit, leaving
local mode) is never restarted, and neither is a first start that fails, which
stays the launch page's to report.

File ▸ Startup ▸ Start at Login registers Desktop with the operating system
(`startup-settings.ts`): `app.setLoginItemSettings` on macOS and Windows. On
Linux that call does nothing, so Desktop writes and removes an XDG autostart
entry itself (`xdg-autostart.ts`): `difracta-desktop.desktop` in
`$XDG_CONFIG_HOME/autostart`, whose `Exec` is what is running now (the
executable, the app's folder for a build that is not packaged, `--no-sandbox`
only when this launch has it; for an AppImage, the AppImage file in `$APPIMAGE`
and no `--no-sandbox`, which its launcher adds by itself) plus `--no-studio`
when that setting is on, so the entry is written again when either checkbox
changes. The wish is not stored: the checkbox shows what the operating system
has.

The native menu bar is always visible and dark (`nativeTheme` is forced dark, as
Studio is), and one builder (`native-menu.ts`, a pure template;
`application-menu.ts` sets it) merges Desktop's items with the page's. **File**:
the page's items, Connect to..., the Startup submenu with its two checkboxes
(Start Without Studio Window greyed out in remote mode), Quit. **Edit**: the
page's Undo and Redo, which are the Installation's, then the cut, copy, paste
and select-all roles; the `undo` and `redo` roles are left out beside them, and
the keys still undo typing inside a text field. **View**: Actual Size, Zoom In
(with a hidden `Ctrl+=` twin), Zoom Out, Toggle Full Screen; the launch window's
View has Toggle Full Screen alone. **Help**: Reload Studio, Toggle Developer
Tools, and Show Runtime Log in local mode. Windows and Linux have no Window menu
and no Close Window: closing the Studio window quits Desktop and stops the local
runtime, too much for a casual Ctrl+W; Quit keeps its accelerator and goes
through the questions above. macOS keeps its conventions (the application menu
with Quit, Close Window in File, a Window menu). Items have stable ids
(`page:save`, `desktop:connect-to`, `help:reload-studio`), which is how the e2e
suite clicks them from the main process. A native menu cannot be edited once
set, so it is built again when the page's model, the session, the Studio or
launch window or a Startup checkbox changes, after
`settings.desktop.menuRebuildDelayMs` so a burst makes one rebuild. The launch
window has a smaller menu of its own (Quit, the text roles with undo and redo
for its address field, Developer Tools). An Output window has none
(`removeMenu`), and so none of the menu's shortcuts; F11 alone is handled in the
window itself, since an Output has to go full screen. A Display window has none
either, in a session without a Studio window too. On macOS, where one menu
serves every window, Developer Tools acts only when the focused window is
Studio's or the launch page's.

Studio's zoom is one setting of Desktop's, not a page's. Zoom In and Zoom Out
move half an Electron zoom level (the step of Electron's own zoom roles) between
-3 and +5, about 58% to 249% (`zoom-levels.ts`), and Actual Size goes back to 0,
100%. The level is kept in `desktop-state.json` as `zoomLevel` and put on every
Studio window Desktop opens, on this computer's runtime or one elsewhere, and a
change reaches every open one at once (`studio-zoom.ts`). Chromium keeps zoom
per host and shares it between that host's pages, which would zoom a runtime's
Output pages with its Studio and give a runtime elsewhere a level of its own, so
a Studio window's zoom is its own (`zoomMode: "isolated"`) and an Output or
Display window cannot zoom at all (`"disabled"`): a projector's page never
zooms. The launch page stays at 100%. Actual Size says the zoom there is now
("Actual Size (Now 120%)") and is greyed out at 100%; the zoom is one of the
changes that rebuild the menu.

The page's items show their shortcuts and do not act on them. Studio's key
handler (`keyboard/shortcut-keys.tsx`) is the only handler of Ctrl+S, Ctrl+O,
Ctrl+Shift+S, Ctrl+Z and Ctrl+Y, identical in a browser and in Desktop: on
Windows and Linux the items are built with `registerAccelerator: false`, which
prints the accelerator without listening for it. macOS has no such switch; there
a key goes to the page first and reaches the menu only if the page did not
`preventDefault()` it, which Studio does for every key it handles, and a click
that still arrives `triggeredByAccelerator` is never sent to the page as a
command (for Undo and Redo it is passed to the focused text field instead, which
is the one case Studio leaves the key alone). Windows and Linux hide the native
bar while a window is full screen, so main tells the page (`onFullScreenChange`)
and Studio draws its in-page bar for as long as that lasts.

In both modes Desktop is a **Display Host** of the session's runtime
(`display-host.ts`), over main's own link. It offers Electron's `screen`
Displays under the ids `1`, `2`… by position, left to right then top to bottom
(`screen-displays.ts`): short enough to type, and the same from launch to launch
while the Displays stay arranged as they are; Electron's own ids are neither. A
Display the operating system has no name for is labelled `Display <id>`, and the
host's name is the computer's hostname. The offer is sent again on
`display-added`, `display-removed` and `display-metrics-changed`, and withdrawn
when the session is left.

`show` opens a **Display window** (`display-window.ts`): the runtime's
`/output/?output=<id>`, an ordinary Output page and Output Session, on the
Display's bounds with no frame, full screen, always on top, background
throttling off, a black background, the cursor hidden by an inserted style, no
menu, no preload and the page security of every window; it never navigates off
the runtime's origin and opens no windows. A Display has one window: another
Output shown there is loaded into it. The host answers once the window exists,
not when the page attaches, and reports `showing` after every change. While any
Display window is open a `powerSaveBlocker` keeps the Displays awake. The window
is shown without taking the keyboard, so placing an Output does not pull typing
away from Studio; Esc is the one key it handles, the way out for a person whose
Display is covered: click it, press Esc, and the host does what `hide` does.

What should be on the Displays is a list of **placements**, an Output and the
description of a Display (`display-mapping.ts`), and every event (a request,
Esc, a Display plugged or unplugged, another Installation, an Output removed)
changes the placements or what is known, after which one step makes the windows
match (`display-plan.ts`, pure, as are the two files before). So an unplugged
Display loses its window, rather than have the operating system move it to
another Display, and keeps its placement, which opens the window again when the
Display is back; a placement whose Output is gone waits the same way, which
makes removing an Output undoable. Only `hide` and Esc drop a placement;
quitting, leaving the session or a window closed by other means do not.
Placements are saved in `desktop-state.json` per Installation id
(`displayMappings`, at most `settings.desktop.displayMappingsLimit`
Installations), because which Display shows what belongs to the computer and not
to the file; the host id is never saved. They are applied whenever the document
summary names that Installation: when the session starts, Studio window or not,
and when another document is opened. Placements of the Installation before are
carried over only for Outputs the new one has too, and its own saved ones win a
Display. A null summary (a runtime being started again, the moment between two
documents) changes nothing, so Displays stay lit through a restart.

After a reboot no id survives, so a placement finds its Display by description:
label, whether it is built in, and bounds. The same label at the same bounds
first; then the same label elsewhere (rearranged, another resolution), the same
size before the nearest; then the same bounds when one side has no label to
compare. A built-in Display never stands in for an external one, and a placement
that finds nothing waits: an unplugged projector's Output must not land on the
laptop's own Display, which often takes over its place on the desktop. A
placement that matched is described again as its Display is now.

**Why ids by position:** `difracta displays show stage-pc 2 wall` has to be
typed, and has to mean the same Display tomorrow. **Why answer on window
creation:** the page attaches seconds later on a slow GPU and not at all without
WebGL, and the window is what was asked for; whether it draws is what the
Output's sessions and telemetry say. **Why Esc and nothing else:** the window
covers a Display and sits above everything, so a person at that computer needs a
way out that needs no other window; every other key must do nothing in front of
an audience, and because the window never takes the keyboard by itself, Esc only
arrives after a deliberate click. **Why Esc forgets the placement:** otherwise
the next event would put the window back.

**Why the runtime is a child process:** it is the same program a mini-PC runs
standalone, so Desktop adds no second way of holding an Installation, a busy
runtime cannot freeze the window, and either side can crash and leave the
other's log. `utilityProcess` starts it from Electron's own binary, so an
installed Desktop needs no Node. **Why a message and not a signal to stop it:**
Windows has no signal a handler can catch, and an unflushed autosave is lost
work. **Why Studio is loaded from the runtime's URL** rather than from files
inside the app: Studio bundles `@difracta/visuals`, so the Studio a runtime
serves always matches that runtime's Catalog, and `location.host` is the
runtime, exactly as in a browser; Desktop's Studio and a laptop's browser tab
are the same client. Loopback is also what makes the free runtime accept its
paths. **Why remote mode loads the remote runtime's Studio** rather than
pointing Desktop's own at it: the two machines may run different versions, and a
Studio whose Catalog differs from its runtime's breaks previews and Parameter
controls; every use of `location.host` would need a parameter and the runtime
CORS. **Why remote content gets no document bridge:** a path picked on this disk
means nothing to a runtime elsewhere, and a page from another machine, possibly
another version, is not one to hand native dialogs to. **Why it may have the
menu bridge:** that bridge gives a page no power over Desktop. The page
describes a menu, which main bounds, validates and draws as plain labels, and it
hears which of its own items was clicked; it cannot read anything, open anything
or choose where Desktop goes, so the worst a hostile page can do is label its
own menu badly. **Why the launch page has a bridge of its own:** choosing where
Desktop goes and starting runtimes is something Studio must never be able to do,
and the launch page has no use for file pickers; three bridges keep each page to
its own few functions. **Why Studio's menu is in the native bar:** one menu bar
instead of two stacked ones, in the place the platform puts it, and the title
bar carries what the in-page bar's middle did. **Why shortcuts are only shown
there:** two handlers for Ctrl+S would save twice the day their conditions drift
apart; the page's handler exists anyway, for the browser. **Why an Output window
has no menu:** it sits on a projector in front of an audience, where a stray
Ctrl+R, Ctrl+Minus or Ctrl+Shift+I must do nothing. **Why Connect to... keeps
the session until a target is chosen:** leaving local mode stops the runtime and
turns every Output dark, which looking at a list, a change of mind or a mistyped
address must never cost; checking the target first keeps a failure from costing
it either. **Why Desktop can run without a window:** a venue's mini-PC is an
appliance that shows Outputs and is operated from a laptop; a Studio nobody
looks at costs a renderer and invites a stray click. **Why a second launch
brings Studio back, and no tray icon:** starting the app is what a person does
anyway when they cannot see it, and it works the same on every desktop, where
tray icons do not. **Why the quit is gated at `before-quit`:** it is the one
event every way of quitting passes before any window closes, so the questions
exist once, and a session without a window (where a window's `close` never
fires) needs no case of its own. **Why the Outputs warning never refuses:** the
person at the machine knows whether the show is over; Desktop only knows that
screens are attached. **Why the runtime is restarted with the current path:**
the file Desktop started with may be hours stale, and the autosave that holds
the unsaved work sits next to the file that was open. **Why restarts give up:**
a runtime that dies on the Installation it reopens would restart for ever,
hiding the problem and filling the log. **Why Linux needs its own autostart
file:** Electron's login items exist for macOS and Windows only, and the XDG
autostart directory is what Linux desktops read. **Why the login setting is not
stored:** two copies of one fact drift, and the operating system's is the one
that acts. **Why main writes the title:** only main knows where Studio comes
from, and a page from another machine does not get to name the window. **Why the
document bridge is four functions:** anything a page can call in main is attack
surface and is out of the CLI's reach; a file dialog is the one thing that needs
the OS, and what each returns is only a path, for a request or a command the CLI
can send too.

**Why Desktop re-executes itself on Linux** (`ozone-platform.ts`, the first
thing `main.ts` does): a Display window has to land on the Display it was asked
for and stay above everything there, and the Wayland protocol lets a client ask
for neither: the compositor puts a full-screen window on the monitor it chooses
and ignores stacking hints, and XWayland honours both. Electron picks Wayland by
itself on a Wayland session, and the platform is fixed before main runs, so a
switch appended there comes too late and only the command line counts: a launch
without `--ozone-platform` starts its own command line again with
`--ozone-platform=x11` in front, every argument kept, and exits before taking
the single-instance lock, which the new launch takes instead. An AppImage runs
the AppImage file itself again, not its executable, because that executable sits
in a mount that goes away with the process the AppImage runtime started.
`npm run desktop` and the Desktop suite pass the switch themselves, so nothing
starts twice under a script or a driver. An explicit `--ozone-platform` or
`--ozone-platform-hint` wins, and under Wayland picking a Display and staying on
top then do not work. The cost: XWayland has one scale factor for every monitor,
so on a mixed-DPI setup the Studio window can look soft on a HiDPI laptop screen
while a projector at scale 1 stays pixel-exact; GNOME's XWayland native scaling
and KDE's scaling of X11 apps by themselves remove that.

**Packaging** (`electron-builder.yml`, `npm run package:desktop`) wraps the
bundle in each operating system's package: AppImages for Linux x86_64 and arm64,
a dmg per Mac architecture, a per-user NSIS installer for Windows, all unsigned.
The package holds `dist/` without its source maps and a `package.json`, in one
asar archive, and no `node_modules`: esbuild inlined every dependency, so the
workspace packages Desktop bundles are devDependencies, and Electron is the only
import left. The runtime child reads its Studio, Output page and thumbnails out
of the archive through Electron's fs. Chromium's sandbox needs unprivileged user
namespaces, which Ubuntu 23.10 and later refuse to programs without an AppArmor
profile, and an AppImage cannot ship one or a setuid `chrome-sandbox`; the
AppImage's `AppRun` probes with `unshare -Ur true` and passes `--no-sandbox`
only when that fails. package.json's `productName` makes the user data folder
`~/.config/Difracta` on Linux, for a checkout's Desktop too.
`.github/workflows/release.yml` builds each OS on its own runner, takes the
version from a `vX.Y.Z` tag (package.json's version plus `-g<sha>` on main),
runs the Desktop suite against the x86_64 AppImage
(`DIFRACTA_DESKTOP_EXECUTABLE` points the harness at a packaged executable) and
attaches the packages to the tag's GitHub Release.

## Settings

`difracta-core/src/settings.ts` holds every tunable in one object: history
coalesce window and limit, autosave delay, default host, port and document mode,
the Media extensions and whether files outside the show folder are served, the
discovery service and its delays, how long a Display Host gets to answer, client
reconnect backoff, CLI connect timeout, Desktop's waits for its runtime to start
and stop and for a runtime elsewhere to answer, its window sizes and how many
runtimes it remembers. Packages import from there instead of carrying their own
literals.

## Rendering

`difracta-render` draws one Output's frame into a canvas behind a two-method
interface: `render(document, outputId, width, height, now)` and `dispose()`. The
Output page owns the animation loop, the canvas size and telemetry, and hands
the compositor a `mediaUrl(id)` resolver for the Installation's Media; the
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
frame resolution, so Render Scale does not apply to it. A shader Visual whose
update asks for a `resolution` below 1 renders instead into a buffer of that
share of the Surface's canvas size (`shader-buffers.ts`), only on the frames it
reports a change, and the buffer is composited like a canvas texture. **Why the
Visual asks rather than Render Scale deciding:** the cost is the fragment's, not
the Surface's, so a costly Visual exposes it as a Parameter a Controller can
ride mid-set, and every other shader keeps drawing straight into the frame with
no extra pass. An instance exists exactly while its Layer is planned: playing
another Scene, disabling the Layer or a Group above it, or clearing its Target
disposes it, and a change of Visual or canvas size replaces it, so a Scene
starts fresh every time it plays. A Layer at opacity zero is planned hidden: its
instance is kept but not stepped, nothing is drawn or uploaded for it, and it
resumes where it stopped when the fader comes back up. The frame is then
composited in plan order: every Layer's texture is drawn through its Surface's
homography with the Surface's Masks, the Layer's opacity, and its blend mode
(normal is premultiplied over, additive adds), so Layers stack as the navigator
shows and overlapping Surfaces combine as their light would in the room. The
frame is recomposited only when the document, the Output, the size, or any
Layer's picture changed, or any Filter reports that its picture would; a Scene
of Layers and Filters that report no change costs the Output only the instances'
updates, and a hidden Layer not even that.

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

Media: the loader (`media-loader.ts`) is engine-owned and preloading. On every
document revision it gives each item of the `media` table an element, an `<img>`
that decodes or a `<video>` that preloads muted and inline, from `mediaUrl(id)`
(`/media/<id>` on the runtime's origin for an Output page, with `crossOrigin`
set when that origin is not the page's; a data URL in the thumbnail harness and
the GPU suite), and drops the elements of items the table lost; nothing is
evicted while the Installation is open. The loader is kept outside the GPU
resources, so a lost context costs no reload. An instance reaches it through
`media` in its context (`sdk/media.ts`): `get(id)` is the shared handle, whose
`image` is null until the file is decoded and whose `version` counts the
pictures behind it, once for an image and once per presented video frame;
`video(id)` is a playback of the instance's own, an element over the same URL
that the browser serves from its cache, since two Layers showing one clip may be
at different positions. The GPU side (`media-textures.ts`) keeps one texture per
handle a running instance holds, uploads when the handle's version is newer than
the texture's, straight alpha and rows top first like a canvas Layer's, binds it
on the units after the mask's as `u_<name>` with `u_<name>_size`, and deletes
the textures of handles no instance holds any more. **Why the loader preloads
rather than the Visual fetching:** a Layer that starts showing an item mid-set
must find it decoded, and the table is the one list of what a show may need.
**Why a version on the handle:** the instance and the uploader read the same
counter, so a Visual reports `changed` exactly when the texture would differ and
a paused video uploads nothing.

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
what happens next. The one exception is a video element, whose clock is the
browser's: the Video Visual steers it (play, pause, rewind, rate) and reports a
change when a frame was presented, and Outputs playing the same clip are allowed
to drift. A Parameter that is not integrated (a color, a size) is read from
`frame.params` every frame and applies at once. Counts go through `fit`, which
grows or shrinks an entity list at its end, so the entities already on screen
stay where they are. `smooth` eases a value toward a target at a rate per second
for the cases where snapping would look wrong, and `rateTimer` turns an
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
the instance. It also tells the instance `hidden()` once when its Layer goes to
opacity zero and `shown()` before the first update after, which is how Video
pauses a faded-out clip and resumes it. An Output's size or Render Scale change
disposes and recreates instances; a Visual that wants to keep its state across
that can implement `resize`, none does yet.

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
Visual's to choose. An update may also return `resolution`, from 0.1 to 1, to
render below the Surface's resolution, with `renderResolution()` as the
Parameter that goes with it, keyed `renderResolution` since `defineShaderVisual`
refuses a Parameter named like an engine uniform; `u_resolution` is then the
buffer's size. An update may return `textures`, Media handles by name, kept like
uniforms: `{ media: handle }` is what the fragment reads as `sampler2D u_media`
and `vec2 u_media_size`, both declared by the fragment. Image and Video
(`difracta-visuals/src/visuals/image.ts`, `video.ts`) are the two shader Visuals
built on that: a `media` Parameter names the item, `media-fit.ts` holds the Tint
and Fit they share and the GLSL that maps the Surface's `uv` onto the picture
from `u_resolution` and `u_media_size`, and each reports `blank` while there is
no picture and `changed` only when a Parameter or the handle's version moved.
Video owns a playback per instance and a transport of stopped, paused and
playing driven by its Cues, Autoplay and the element's end.

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
resizable columns and a status strip. The File and Edit menus are a **menu
model** (`menu/menu-model.ts`): plain data, items of
`{ id, label, shortcutLabel?, enabled, separatorBefore? }` computed from the
document commands, the connection phase and whether the connection is free (a
pinned one has no New, Open, Save As or Close), with one function,
`runMenuCommand`, from an item's id to the command it runs. Two renderers draw
it (`menu/app-menu.tsx` picks): in a browser the in-page bar (`menu-bar.tsx`, a
Base UI menubar), and in Difracta Desktop the native menu bar, which gets the
model through `window.difractaMenu.setMenu` whenever its JSON text differs and
answers with ids through `onMenuCommand`. In Desktop the in-page bar is not
rendered at all, except while the window is full screen, where Windows and Linux
hide the native one; its Blackout toggle moves to the status strip and the
Installation's name and path are in the window title. Shortcuts have one handler
in both (`keyboard/shortcut-keys.tsx`), which calls `preventDefault()` for every
key it takes; menus only show them. Why a model: a menu item added to one
renderer would be missing from the other, and data is also what can cross to
another process and be tested without rendering anything.

The left column is the navigator: the Installation as root row, then one
collapsible section per entity kind. The right column is the inspector, showing
the settings of whatever is selected. The center holds tabs; the Outputs tab
shows one card per Output. Selection is Studio-local state and never reaches the
runtime; the selected row and card carry an outline so the inspector's subject
is visible at a glance. Rows with children open and close with a chevron: Output
rows start open so their live sessions stay in view, Surface rows start closed
so Masks and Paths do not crowd the list; creating a child or selecting one from
an inspector opens its parent. Column sizes and section open states are
remembered per browser in localStorage; row open states live in memory and reset
with the Installation. An empty section says how to add its first entity, and an
open row without children says so in one dim line.

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
a switch. A media Parameter is a select over the Media items of the kind it
accepts, None first, with a "+" beside it that adds an item through the Media
section's picker and picks it on the Layer in one flow, as the "+" on a Path row
makes a Path; a value whose item is gone shows as None. The options come with
the Address (`layerAddresses` takes the Media table), so the Link picker and the
Macro picker, which resolve against the whole document, list the same items.
Sliders and the color input stream every position through `address.edit`, one
send in flight at a time. The Parameters header has Reset all, one `layer.reset`
step. Section open states are remembered per section.

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
name, Run, the Run Mode with its count when Some, and the actions in the order
they run: each with its target, its Chance as a percent readout clicked to type
(100 clears it), the value it sets edited with the same control the Address has
in its own inspector (a media Address gets the same select and "+", so a Macro
swaps artwork from the same control), a Set or Toggle choice on switches, a grip
to drag it elsewhere in the list, the reason it would be skipped, if any, and in
Sequence a Next mark on the action the next run fires. "Add action…" opens the
same picker as Links, now over every Address in the Installation under its
Scene, Controllers, Macros, Scenes and Installation headings; each pick becomes
a set of the current value, or a trigger. A run that skipped anything shows a
toast naming what and why.

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

The Media section, below Surfaces, lists the Media items with their kind's icon
and, at the row's end, the kind as a dim word or, when the runtime cannot serve
the file, an amber warning naming the status (`live/media/<id>`: missing,
outside the show folder, or unsaved) explained on hover, the way a Layer without
a Target warns; each row subscribes to its own status. The section's "+" asks
for the file first: in Desktop it opens the native picker straight away, in a
browser a dialog with a path field, then sends `media.create` with the path
relativized against the Installation file's folder, and selects the new item.
Without a file for the Installation yet, the path is sent as it came, and the
row's "unsaved" warning says to save first. The Media inspector has the name,
the path as text committed on blur (`media.path`) with, in Desktop, a Browse
button running the same picker, the kind its extension says, the status with its
reason, and "Used by": the Layers whose media Parameter holds the item, found by
reading each Layer's definition for which Parameter is a media one; clicking one
selects the Layer and opens its Scene row. Remove works from the context menu,
the Delete key and Edit ▸ Remove like every entity.

**Why the "+" opens the picker before creating:** `media.create` names the item
after its file, so there is nothing to ask until the file is known, and an item
without a path would draw nothing and warn at once; other sections create a
named placeholder because a Surface or a Scene is useful before it is
configured. **Why the status is not computed in Studio:** only the runtime has
the disk the path resolves on; Studio shows what `live/media` reports and
explains it.

The Surface inspector places the Surface in its Output's frame with a small SVG:
the quad with draggable corner handles, other Surfaces on the same Output as
outlines, and the frame's aspect taken from the Output's session telemetry when
one is reporting. Corner buttons take arrow keys for nudging and two fields show
the selected corner as percentages of the frame. Dragging shows the handle at
the pointer and sends absolute sets with one in flight at a time
(`lib/use-latest-wins.ts`); everything else shows confirmed document values.
