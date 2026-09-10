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
├── scenes { [id]: Scene }            name, order
├── layers { [id]: Layer }            kind, sceneId, parentId, enabled, order, + per kind
│                                     visual: visual, parameters, target, opacity, blendMode
│                                     filter: filter, parameters, mix
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

### Catalog and Parameters

The Catalog is the set of Visual and Filter definitions a runtime knows
(`core/catalog/`). A definition is code with a stable id, a name, a description,
a backend (`canvas` or `shader`), an optional `recommended` flag, a Parameter
schema, and for Visuals the Paths they need and the Cues they answer to. Core
owns the types and the validation; `difracta-visuals` owns the entries and their
thumbnails, one file per definition (a Filter's is a gray checkerboard through
that Filter, so Filters compare against the same picture), and the runtime
passes that Catalog to the command registry. A Visual's file also carries its
implementation, written against the SDK in `difracta-render` (see Visuals
below); the runtime and Studio only read the metadata. A definition may carry
`notes`: paragraphs for whoever composes with it, human or agent, saying what
the code cannot (how it reads on a Surface, which Parameters interact, what it
costs, what to stack it with). The runtime answers `catalog.list` with its
definitions minus their functions, which is how the CLI's `catalog` prints the
notes and a reference generated from the schema, and how its `addresses`
resolves Parameters without shipping the Visuals package. Every command's
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

`operational.calibration` names one Surface, or one Mask of it, plus the
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
enumerates every reachable one. The entries today are Blackout and, per Layer,
`enabled`, `opacity` and `blend` (Visual Layers), `mix` (Filter Layers) and
`param/<name>` for every Parameter of the Layer's definition, typed from the
Catalog. Controllers, Macros, Pads, OSC, and the CLI all read and write
Addresses.

Two commands write one: `address.edit` is the authoring write the inspector
sends, undoable, labelled by the property ("Change Opacity", "Change Speed") and
coalescing per Address so a drag is one step; `address.set` is the same write
for show control, never undone. Both share one reducer, which refuses an unknown
Address and a value the type does not accept. A Parameter Link will add one more
refusal there: an Address a Controller drives cannot be written directly, by
anyone.

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
interface: `render(document, outputId, width, height)` and `dispose()`. The
Output page owns the animation loop, the canvas size and telemetry; the
compositor only draws, and skips the frame entirely when the document, Output
and size are the ones it drew last, so a static Installation costs nothing
between edits.

`planFrame` is the pure part: given a document and an Output it lists what each
Surface shows this frame. Outside Calibration Mode every assigned Surface is a
dim fill cut by its Masks. In Calibration Mode on that Output the calibrated
Surface is a pattern (grid, diagonals, border, name, corner labels, the selected
corner marked) and the others follow the view. Masks apply to the pattern only
while a Mask is being aligned, and that Mask is then outlined with its points
marked.

Geometry: every vertex is a Surface Space position pushed through the Surface's
homography in the vertex shader, with clip-space `w` carrying the projective
term, so the GPU interpolates Surface Space perspective-correctly and every
later shape drawn in Surface Space (Regions, Guides) inherits the mapping for
free. The homography is computed once per mapping change and cached by the
corners object's identity. The pattern is computed in the fragment shader from
Surface Space coordinates and their screen-space derivatives, so its lines are
about one pixel wide at any projection and cost no geometry. Labels are text
rendered once per string into a small texture.

Masks: one alpha texture per Surface at a fixed 512×512, rebuilt only when that
Surface's Masks change (identity comparison, since the document is immutable per
revision), sampled once per fragment. Feather is drawn inward from the polygon
edge and clipped to it, so no Mask changes coverage outside its own boundary.

**Why WebGL2 only:** the projector machines and smart TVs this runs on all have
it, WebGPU still does not reach every such browser, and one engine is half the
code of two. Why a fixed-size Mask texture: Masks are fractions of Surface
Space, so the texture does not depend on the frame; a full-resolution texture
would be rebuilt on every drag of a point and uploaded at megabytes a step.

### Visuals

A Visual is a definition plus `create`, which makes one **instance** per Layer
per Output (`render/sdk/`). An instance is a closure over its own state with two
methods the player calls every animation frame: `update(frame)` advances the
state by `frame.dt` seconds, and `render(canvas)` draws the state onto the
Layer's 2D context. `frame` carries the current Parameter values, the size and a
`changed` flag (true on the first frame and whenever a Parameter differs from
the previous frame); `create` gets the same plus a `random` source seeded from
the Layer id. Time only ever arrives as a delta, clamped to 100 ms so a tab that
slept does not fast-forward.

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
declares for that, always with the same label and range.

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
flags come from `update` and not `render`:** `render` is what they skip. **Why
Filters are not in the SDK:** every Filter is a fragment shader over the Layer
below it, run by the compositor's framebuffer chain, and that contract is
defined with the compositor.

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
sessions stay in view, Surface rows start closed so Masks do not crowd the list;
creating a child or selecting one from an inspector opens its parent. Column
sizes and section open states are remembered per browser in localStorage; row
open states live in memory and reset with the Installation. An empty section
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

The Surface and Mask inspectors carry a Calibrate toggle and, while active, the
view for the other Surfaces; the corner or point selected in the inspector is
mirrored to the Output as it changes, and focusing a corner or point button
selects it, so Tab and the arrow keys agree. While the mode is on, selecting
another Surface or Mask moves the pattern to it; selecting anything else leaves
it on. The status strip shows what is being calibrated with an exit link, so a
forgotten Calibration Mode stays visible. Escape clears the selection outside
text fields and dialogs.

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
