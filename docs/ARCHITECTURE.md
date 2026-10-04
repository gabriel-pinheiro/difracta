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

| Package             | Role                                                                                                                                                                                              | Depends on                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `difracta-core`     | Document model (normalized tables), patches, Addresses, Catalog and Parameter types, command registry, pure command reducers, undo history, settings, the payloads a Sharer and a Viewer exchange | zod                              |
| `difracta-visuals`  | The built-in Catalog: Visual and Filter definitions, their implementations and thumbnails, and the fetched Bundled Pack                                                                           | core, render                     |
| `difracta-protocol` | Wire schemas for the live socket and runtime requests                                                                                                                                             | core                             |
| `difracta-client`   | Connection, snapshot plus delta replica (`DocumentView`), acknowledged commands, coalesced inputs; Zeroconf browsing under `/discovery` (Node only)                                               | core, protocol, bonjour-service  |
| `difracta-runtime`  | Node host: document sessions, files and autosave, live server, static serving                                                                                                                     | core, protocol, visuals, fastify |
| `difracta-render`   | Visual SDK (instances, player, helpers) and the WebGL2 compositor: homographies, Mask textures, calibration patterns; the Viewer of Screen Shares                                                 | core                             |
| `difracta-output`   | One display's page; no React                                                                                                                                                                      | client, render                   |
| `difracta-studio`   | React authoring and performance UI                                                                                                                                                                | client, visuals                  |
| `difracta-cli`      | `difracta` command for shells and agents                                                                                                                                                          | client                           |
| `difracta-desktop`  | Electron application: a bundled runtime of its own or a runtime elsewhere, its Studio in a window, native file dialogs and OS file opening                                                        | client, runtime (bundled)        |

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
├── surfaces { [id]: Surface }        mappings per Output, each enabled or not
├── regions { [id]: Region }          surfaceId, bounds (topLeft, bottomRight)
├── masks { [id]: Mask }              surfaceId, mode, points, feather
├── paths { [id]: Path }              surfaceId, points, closed
├── packs { [packId]: PackAttachment } name (a copy), relativePath? (a hint); never the Bundled Pack
├── shares { [id]: Share }            name, order: a Screen Share
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

A Surface names a real-world projection target. `mappings` holds one Surface
Mapping per Output it was ever on, keyed by Output id: `enabled`, and the
quadrilateral where Surface Space's corners land, in normalized Projection Frame
coordinates (`document/geometry.ts`); corners may lie outside the unit square
when a Surface overshoots the projector's edge. The Surface renders on every
Output whose mapping is enabled, each through its own corners, and an Output
without an entry is off (`document/mappings.ts` has the readers).
`surface.assign` takes a list of Outputs and `enabled`: it flips the flag of a
mapping the Surface already has, keeping its corners, creates one covering the
whole frame for an Output it was never on, and leaves nothing behind when asked
to take the Surface off one of those. `surface.create` puts the Surface on the
first Output in order unless the payload lists others or none. Removing an
Output removes its mapping from every Surface. A file written while a Surface
had one `output` reads as that mapping enabled and the others disabled
(`SurfaceSchema`), and is written back in the present shape.

Corners are edited by `surface.corner.set` (absolute) and `surface.corner.nudge`
(relative), on the mapping of the `output` they name. It may be left out while
the Surface is on exactly one Output; on several the command is refused, naming
them (`pickOutput`), and `calibration.set` resolves its Output the same way.
Both coalesce under one key per Output and corner, so a drag or a held arrow key
is one undo step, and both round to a millionth of the frame so files stay free
of float noise.

**Why a Surface on several Outputs, with no sync between them:** a score shown
on the stage's LED panel and on the host's return TV, or a background shared by
a projector per table, is one thing to compose and to change, and a Surface per
Output would be so many copies of every Layer. Each Output already runs its own
Visual Instances and hears every Cue, so showing a Surface twice costs the
document nothing but a second mapping; the copies may differ in what is random
or counted per instance, which is fine for content that repeats and is why this
is not a way to blend projectors. **Why `enabled` on the mapping rather than a
list of Outputs beside it:** one place says both where the Surface lands and
whether it does, a switch is one patch on one property, and a disabled mapping
is the dormant calibration that was already kept.

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

### Regions

A Region is an axis-aligned rectangle of Surface Space, two corners, that a
Layer targets instead of the whole Surface. A Layer's `target` is one id that
names a Surface or a Region; `resolveTarget` (`document/targets.ts`) turns it
into the owning Surface, the Region if any, and the rectangle, and everything
that needs the Surface (mapping, Masks, Path Bindings, canvas size) reads it
from there. Removing a Region, or its Surface, nulls the Target of the Layers on
it, as removing a Surface always did. Regions live in their own table with a
`surfaceId`, share the Surface's child order with Masks and Paths, and have
`region.create`, `.rename`, `.corner.set`, `.corner.nudge` and `.remove`; corner
commands replace the whole `bounds`, clamped inside the unit square and at least
`REGION_MIN_SIDE` from the other corner. Bounds are not Addresses.

**Why one id rather than a tagged Target:** every command, Macro action, CLI
payload and wire field that carries a Target keeps working, and the one place
that must tell the two apart is the resolver. **Why the rectangle inherits the
homography rather than being a mapping of its own:** the reason Regions exist is
that a projector nudge is one recalibration, not one per panel; a rectangle in
Surface Space is that by construction, while a second quadrilateral would have
to be dragged back into parallel by eye.

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
continues the line instead of splitting a closing edge. Regions, Masks and Paths
of one Surface share one order: `entity.move` on any takes its neighbours from
all three tables (`surfaceChildren`), and a new one appends after them. Point
order is the Path's direction: Side A is the left of travel, Side B the right.

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
the disabled mappings on the Surface makes putting it back on an earlier Output
restore its corners for free, without a table or navigator row per Surface and
Output pair. **Why a relative nudge command:** a held key sends commands faster
than replies return; an absolute position computed from the view would repeat or
lose steps, whereas deltas apply in full in any order.

### Media

Media is an image or video entry of a Pack, or a Screen Share. Neither is an
item of the Installation: a Pack is a folder on the runtime's machine, and the
Installation records which Packs it attaches and names entries through Media
references.

A **Pack** (`core/src/packs/`) is any folder of images and videos with a
manifest, `<pack>/.difracta/pack.json` (`PackManifestSchema`, strict, `version`
1): the Pack's `id`, `name`, optional `readOnly: true`, and one entry per media
file found in it. An entry has an `id`, a slug of its path inside the Pack
without the extension, segments joined with dashes (`tunnels/04.mp4` →
`tunnels-04`, `entryIdFor`), made unique with a numeric suffix, assigned at
first scan and never changed, so a Layer keeps working across a rename; its
`file`, relative and POSIX with no segment starting with a dot; its `type`
(`image` or `video`, from the extension, `settings.media` lists them); a `name`,
the file name at first scan, editable; optional `description` and `notes`;
`tags`, free-form, compared ignoring case, of which Difracta reads `loop`, `hit`
and `recommended` (`KNOWN_TAGS`); a `fingerprint`, the first sixteen hex
characters of the SHA-256 of the file's first `settings.packs.fingerprintBytes`
bytes, a dash and the size in base 36 (`formatFingerprint`), which keys its
thumbnail and proxy and re-attaches the entry to a file renamed inside the Pack;
and, once measured, `width`, `height`, `duration`, `thumbnailAt`, `beats` and
`firstBeat`. A Pack's id is the slug of its folder name plus four random base-36
characters (`packIdFor`, `neon-k7f3`), so two people each making a "neon" Pack
never collide; the Bundled Pack's is `bundled` (`BUNDLED_PACK_ID`). A file that
is gone keeps its entry: missing is live status, never written.

The Installation's `packs` table holds one row per attached Pack, keyed by Pack
id: `name`, a copy so a Pack this machine lacks can still be named, and an
optional `relativePath`, written when the Pack sat inside or beside the
Installation's folder at attach time (relative, POSIX, `..` allowed, normalized
by `normalizeMediaPath`), so a show folder carrying its Packs opens elsewhere
with no Registry. The Bundled Pack is implicit and never in the table. The
`shares` table holds the Screen Shares: `name` and `order`, nothing more (see
Screen Shares below). `packs.attach { packId, name, relativePath? }`,
`packs.detach { packId }` and `packs.rename { packId, name }` are authoring
commands and refuse `bundled`; detaching never rewrites Layers.
`share.create { name?, after? }` (named "Screen Share" unless told otherwise,
numbered while another holds the name), `share.rename` and `share.remove` manage
the Screen Shares; removing one clears every Parameter holding it and drops the
Macro actions that would set it, as removing a Surface clears Targets;
`entity.move` reorders them.

A Visual refers to Media through a Parameter of kind `media`
(`{ kind: "media", accepts: "image" | "video" | "live", default: "" }`), whose
value is a **Media reference**: `<packId>/<entryId>` with exactly one slash and
a slug on each side (`parseMediaReference`, `core/src/packs/reference.ts`) for
an image or video, a Screen Share's id for live, or `""` for none. Core
validates the shape only (`mediaValueProblem`, `document/media.ts`: a live value
must name a Screen Share the Installation has); whether the entry exists, is of
the accepted type and has its file is live status the runtime computes. Nothing
in core enumerates entries, so the resolved Address is of type `media` with
`accepts` and no `options`; `address.set`, `address.edit` and a Macro `set`
action write the same string, and a Link is refused. `layer.visual` checks a
value the same way; `layer.reset` puts `""` back. `media.replace { from, to }`
sets every Layer Parameter and Macro action value equal to `from` to `to`, both
Pack entries or both Screen Shares: how "swap this clip everywhere" is done.
`mediaReferencesInUse(document, catalog)` (`document/media-uses.ts`) is the one
scan of where references are held, the `media` Parameter values of every Layer
whose definition the Catalog knows and every Macro set action whose Address is
of type `media`; the render loader preloads what it names, `media.replace`
rewrites it and Studio counts it before a Pack is detached. The path helpers in
`document/media.ts` are pure and run in the browser too: one relativizes an
absolute path against the document's folder, for the `relativePath` hint, and
one says whether a resolved path stays under that folder.

The CLI has a group for each (`difracta-cli/src/commands/packs.ts`, `media.ts`).
`difracta packs list` prints the Bundled Pack and the attached ones with id,
state (`ok`, `preparing n/m`, `missing`, `loading`), entry count, read-only and
folder or hint; `packs add <folder>` sends `packs.add` (a relative folder is
resolved against the shell's directory when the runtime is on this machine);
`packs attach <pack>` attaches one of `packs known`, the Registry's listing,
with the document command; `packs detach`, `packs locate <pack> <folder>` and
`packs rescan` follow. `difracta media list [pack]` prints every entry with its
reference, path inside the Pack, type, size, length, Beats with the tempo they
make, tags and `missing`; `media tag <entry> <tag…> [--remove]`,
`media beats <entry> <beats|none> [--first-beat <s>]`,
`media thumbnail <entry> <seconds>` and `media rename <entry> <name>` go through
`media.update`; `media replace <from> <to>` runs `media.replace`;
`media screen-share [name]` adds a Screen Share. A reference typed at the shell
is `<pack>/<entry>` by ids, or a Pack's name in place of its id and the entry's
path inside the Pack, with or without its extension, in place of the entry's id
(`media-references.ts`), resolved against the `packs` live slice the CLI's
replica holds and the Installation's `packs` table; an ambiguous name or path is
refused naming the candidates, and a well-formed reference into a Pack the
runtime has not loaded is kept as typed, since the Installation may hold it on
purpose. `edit` and `set` resolve a media Address's value the same way, a Screen
Share by name; `run` payloads pass media values through unchanged. Listings
print both the reference and the path.

**Why a reference and not an item:** an item made picking a two-step, create
then bind; the reference is what a person picks in the Library and what a Macro
sets. **Why ids, not paths, inside a Pack:** a rename would break every Layer;
the fingerprint re-attaches the entry instead. **Why the Pack id carries a
random suffix:** plain slugs collide across machines. **Why the Installation
holds no absolute path:** a show would relocate on every machine change; the
Registry and the relative hint cover both cases. **Why shape-only validation in
core:** core runs in every client and never reads a disk; existence is the
runtime's live word.

### Bundled Pack

Difracta ships a set of white-on-black clips as the Bundled Pack, from its own
repository, `difracta-media`. `settings.media.bundle` pins one release by
version and SHA-256. `scripts/fetch-media.mjs` (`npm run media:fetch`; also the
root `postinstall` and the first step of `dev`, `build`, `desktop` and
`package:desktop`) downloads that release's tarball, refuses it unless the hash
matches, and unpacks it into `difracta-visuals/bundled/` (gitignored) with a
`.version` stamp, so a second run is free unless `--force`.
`DIFRACTA_MEDIA_DIR=<path>` copies from a local checkout of the media repository
instead, stamped `dir:<path>`. While the pin has no SHA-256 and no directory is
given, the script writes an empty manifest and warns; with one pinned, a failed
fetch fails the install or the build. `difracta-visuals` exports where the
folder is (`bundledRoot`, `src/bundled/manifest.ts`); the runtime finds it
there, or where `DIFRACTA_BUNDLED_DIR` says: Desktop's build copies it to
`dist/bundled`, and the packaged runtime reads it from the asar archive like the
thumbnails. The Catalog holds Visuals, Filters and Fonts only; the Bundled Pack
is a Pack like any other, read-only, attached to every Installation and never
written to.

**Why a separate repository, pinned and fetched, and then shipped inside every
package:** the clips are tens of megabytes of binary that change on their own
schedule, and in Difracta's history every revision of them would stay in every
clone forever; the media repository keeps them, its own checks and its thumbnail
rendering apart, and a version plus a hash in `settings.ts` makes each Difracta
commit name exactly one bundle. Fetching at install and build, not at show time,
means a runtime on a stage without network has every clip, and a clip that a
file names is the same on every machine that runs the same Difracta version.

### Scenes and Layers

A Scene is an ordered stack of Layers, and everything in the stack is a Layer: a
Visual Layer (a Visual on a Target, with opacity and blend mode), a Filter Layer
(a Filter with a mix) or a Group (a container). One `layers` table holds all
three with a `kind`, a `sceneId`, a `parentId` (null at the Scene root, a Group,
or, for a Filter Layer, a Visual Layer) and an `order` key; document order is
navigator order, top first, and rendering will walk it bottom up. Siblings are
the Layers sharing `sceneId` and `parentId` (`PARENT_FIELDS`), so names and
order keys are scoped to one parent. The nesting rule (`layerNestingProblem`,
`document/layers.ts`) is that a Group holds any kind, a Visual Layer holds only
Filter Layers, which then transform its picture alone (see Rendering), and a
Filter Layer holds nothing, so nesting under a Visual Layer is one level deep;
the parent is always in the same Scene. `layer.move` places a Layer under any
root or Group of any Scene, or a Filter Layer in or out of a Visual Layer,
carrying a Group's contents and a Visual Layer's Filter Layers along
(`descendantLayers`) and refusing cycles; `entity.move` still covers reordering
among siblings. `layer.group` wraps a Layer in a new Group at its position and
refuses a Filter Layer inside a Visual Layer, since a Group cannot go there;
`layer.ungroup` dissolves a Group, and Filter Layers inside its Visual Layers
stay where they are. Removing a Visual Layer removes its Filter Layers with it;
duplicating a Scene, a Group or a Visual Layer copies everything inside with
fresh ids. A Visual Layer starts without a Visual, a Filter Layer without a
Filter: both are picked afterwards from the Catalog. A new Visual Layer takes
the Target of the sibling it lands next to when that is a Visual Layer with one,
otherwise the first Surface, unless `layer.create` names a Target or null.
Removing a Surface clears the Target of Layers using it. The first Scene created
becomes `installation.activeScene`; the active Scene cannot be removed.

**Why one table for three kinds:** the stack is one ordering across kinds, and
the words followed the data. Having "Layer" mean only "Visual instance" left
Filters and Groups as second-class items with their own names, moves and menus;
with every entry a Layer, adding a Visual and adding a Filter are the same
gesture, and Filters and Groups reorder, group and hide through the same
commands. **Why a nullable Visual:** a Layer's place in the stack, its name, its
Group and its enabled state are worth authoring before any pixels exist, and the
choice of Visual is a separate gesture with its own picker. **Why a Visual
Layer's Filters are Filter Layers with a `parentId`, not a list on the Layer:**
a Filter Layer already has an id, Addresses (`layer/<id>/mix`, its Parameters),
a row, an inspector, Links and Macro actions; nesting it reuses all of that, and
the same catalog serves both places, where a list on the Visual Layer would have
needed new Addresses, Link targets and selection paths. Position decides what a
Filter affects, and there is no per-Filter switch: dragging it in or out is the
whole gesture.

### Controllers and Parameter Links

A Controller is one Installation-wide value that many Layers follow: a Number
Controller holds 0 to 1, a Color Controller a color, a Text Controller text with
its line breaks, and each is an Address (`controller/<id>/value`) written like
any other, from the inspector, a Macro, OSC or the CLI. Controllers live in one
`controllers` table with the same `parentId` and `order` shape as Layers, so
Groups arrange them in the navigator with the same drag, move and ungroup
commands; a Group has no value. Their values are part of the file: a Color
Controller is also how a static Installation keeps its palette.

A Parameter Link (`links` table) makes one Controller drive one Layer Address: a
number, boolean, color or text Parameter, opacity, mix or enabled. A number link
stores `anchors`, the target values at Controller 0 and 1, and maps linearly
between them, clamped to the target's range and snapped to its step; reversed
anchors invert. Anchors are checked when written: both must lie within the
target's range and on its step grid, so the endpoints the inspector shows are
the values the Controller reaches. A boolean target is on from 0.5; a color link
copies the color, and a text link the text, with every line break turned into a
space at a target of one line. A Text Controller drives text Parameters and
nothing else. An Address has at most one Link; linking it elsewhere moves it.
`link.create` takes any number of Addresses, so wiring one Controller to the
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
(`core/catalog/`) and its Bundled Fonts (see Bundled Fonts below). A definition
is code with a stable id, a name, a description, a backend (`canvas` or
`shader`), an optional `recommended` flag, a Parameter schema, and for Visuals
the Paths they follow and the Cues they answer to. Core owns the types and the
validation; `difracta-visuals` owns the entries and their thumbnails, and the
runtime passes that Catalog to the command registry. A definition's file also
carries its implementation, written against the SDK in `difracta-render` (see
Visuals and Filters below); the runtime and Studio only read the metadata. A
definition may carry `notes`: paragraphs for whoever composes with it, human or
agent, saying what the code cannot (how it reads on a Surface, which Parameters
interact, what it costs, what to stack it with). The runtime answers
`catalog.list` with its definitions minus their functions and shader source,
which is how the CLI's `catalog` prints the notes and a reference generated from
the schema, and how its `addresses` resolves Parameters without shipping the
Visuals package.

Thumbnails are rendered, not drawn: `npm run thumbnails` in `difracta-visuals`
runs each definition through the compositor in a headless Chromium (Playwright),
a Visual on a full-frame Surface for a few seconds with its first Cue fired a
few times near the end, a Filter over a gray checkerboard with a ring, and
writes one PNG per definition. Image and Video show a clip of the Bundled Pack
by Media reference, the picture being the clip's thumbnail. Where the defaults
would make a poor picture, the definition has a setup in
`scripts/thumbnail-setups.ts`: Parameter values over the defaults, how long it
runs, and whether the Cue fires (Counter rests, since a Cue that close to the
picture catches its digits rolling). **Why rendered:** a thumbnail is then what
the definition does, and adding a definition costs one command rather than an
illustration; Filters over the same picture compare with each other, and the
ring shows displacements a checkerboard alone would hide. Every command's
`apply` receives it, so `layer.visual` and `layer.filter` can refuse an unknown
id and check values.

A Parameter is declared once, in the definition, as one of six kinds: number
(with min, max, step and unit), color (four components from 0 to 1), choice
(named options, each optionally naming the Bundled Font a control draws it in),
boolean, media (a Media reference of the accepted type, or `""`; see Media) or
text (a string of at most `settings.text.maxLength` characters, on one line
unless the declaration says `multiline`; `textProblem` is the one rule, for a
Parameter, an Address and a Text Controller alike). Values live on the Layer in
`parameters`, keyed by Parameter name; picking a definition writes its id and
the defaults in one command, and a complete set of values can come along
instead, which is how a pick is put back. A Layer whose id the Catalog no longer
has keeps it: the inspector shows the id as unavailable and the Output draws
nothing for that Layer.

**Why the Catalog is injected rather than imported by core:** the same commands
run wherever the registry does, including a CLI with no Visuals at hand, and a
runtime built with a different Catalog validates against exactly what it can
render. **Why an unknown id is a warning and not an error:** a Catalog changes
between versions and between machines; a file that opened yesterday must open
today, with one Layer flagged, rather than refuse as a whole.

### Bundled Fonts

The typefaces text is drawn in are part of the Catalog (`FontDefinition`: id,
name, description and files), defined in `difracta-visuals/src/fonts/fonts.ts`
with their files in `difracta-visuals/fonts/` and their licences beside them.
Each is one weight in up to two files, Latin and Latin Extended. The runtime
serves the folder at `GET /fonts/<file>` (`settings.runtime.fontsPath`) with any
origin allowed to read, from inside `@difracta/visuals` or from where
`DIFRACTA_FONTS_DIR` says, which is how Desktop's build, copying it to
`dist/fonts`, serves it from the asar archive. `catalog.list` carries the fonts,
and `difracta catalog` lists them. A text Visual declares its Font with
`fontParameter()`, a choice over the fonts' ids whose options each name their
font.

**Why fonts ship with Difracta:** an Output runs on whatever machine faces the
wall, a TV's browser included, and `system-ui` is another typeface on each; a
font installed on the laptop that made the show is not on the machine that plays
it. **Why a choice Parameter and no `font` kind:** the fonts are fixed at build
time, so the options are known where the Parameter is declared, and every reader
of choices, the CLI, Macros and validation, works as it is.

### Calibration Mode

`operational.calibration` names one Surface, or one Mask, Path or Region of it,
the one Output showing it (`outputId`, among those the Surface is on), plus the
highlighted corner or point, the view for the Output's other Surfaces (hidden,
outlines, patterns) and the live session that entered it. `calibration.set`
replaces the whole entry and `calibration.exit` clears it; both are performance
commands, so they replicate at once and never enter undo history. The runtime
clears the entry when its owner's session closes. Authoring commands do not
touch it, so removing the calibrated Surface or taking it off that Output leaves
a stale entry behind briefly; readers go through `resolveCalibration`, which
treats a dangling entry as no calibration, and the next `set` or `exit`
overwrites it.

**Why one Output at a time, for a Mask, Path or Region too:** the mode takes the
Scene off the Output it is on, so a pattern on every Output of a Surface would
darken twenty tables to align a Mask at one, and the operator stands in front of
one projector. The edit itself is in Surface Space and reaches the others as
they play.

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
a default, for numbers a range, for choices the options and for media what it
accepts; `listAddresses` enumerates every reachable one. The entries today are
Blackout, a Scene's `play`, a Macro's `run`, a Surface's `render-scale`, a
Controller's `value`, and, per Layer, `enabled`, `opacity` and `blend` (Visual
Layers), `mix` (Filter Layers), `param/<name>` for every Parameter of the
Layer's definition and `cue/<key>` for every Cue it declares, typed from the
Catalog. Controllers, Macros, OSC and the CLI all read and write Addresses.

Two commands write one: `address.edit` is the authoring write the inspector
sends, undoable, labelled by the property ("Change Opacity", "Change Speed") and
coalescing per Address so a drag is one step; `address.set` is the same write
for show control, never undone. Both share one reducer, which refuses an unknown
Address, a value the type does not accept (a number outside its range or off its
step grid is refused by name, never snapped), and an Address a Controller
drives, which cannot be written directly by anyone. `addresses.edit` is
`address.edit` for several Addresses at once, one undoable step labelled by
their properties and coalescing per set of Addresses, refused whole when one
write is: what a gesture moving several values together sends, such as the Live
crop rectangle dragged whole. A trigger Address is fired rather than written,
through `address.trigger` and `address/fire.ts`: a Layer's Cue changes nothing
in the document and returns an event instead, a Scene's play sets the active
Scene, a Macro's run performs its actions. The runtime commits a command's
patches before announcing its events to every session subscribed to the
document, so a Macro's Parameter changes are in place before its Cue lands. An
event is never stored, undone or replayed to a session that connects later; an
Output hands it to the Layer's Visual instance as `cue(key)`.

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
  the OSC door, the Output Sessions, the connected Display Hosts, the Packs the
  runtime has loaded and who shares into each Screen Share; it is never saved,
  never undone, and never changes the document revision. Studio reads it under
  the `live` path root (`["live", "outputs", id, "sessions"]`) with the same
  subscriptions as the document. `live` is `true` for all of it or a list of its
  sections (`LIVE_SECTIONS`: `osc`, `outputs`, `displayHosts`, `packs`,
  `shares`); the snapshot carries the sections asked for and only their patches
  follow (`liveStateFor`, `liveSectionWanted`). An Output page asks for
  `["packs"]` alone: the Packs say which entries its Layers can load, and an
  edit to an entry's beats reaches a playing clip through them; it never pays
  for telemetry or Display Hosts.
- `attach` declares the connection an Output page showing one Output; the
  runtime keeps an **Output Session** per attached connection. `telemetry`
  reports frame interval, render work, resolution, pixel ratio and workload
  (Layers and Filters run per frame, the video players playing and held, and the
  Screen Shares viewed and connected, with a refusal's words) once a second
  (`settings.live`). A session with no report for a few seconds shows as stale,
  one silent for minutes is dropped, and a closed socket drops it at once.
  Removing the Output drops its sessions.
- `display-host` declares a connection of kind `desktop` a **Display Host**: its
  name, its Displays (id, label, bounds, scale factor, primary, internal) and
  `showing`, Display id → Output id. The host sends it again, whole, on every
  change, and `null` to step down; the runtime refuses it from any other kind of
  client. See Display Hosts below.
- `share`, `share-view` and `share-signal` are the Screen Shares' messages, and
  `share-viewer`, `share-ended`, `share-viewing` and `share-signal` the
  runtime's answers: a `desktop` connection shares into a slot, any connection
  views one, and signalling passes between them unread. See Screen Shares below.
- `command` is acknowledged with a `reply`. The caller's own delta is flushed
  before its reply, so code that runs on the reply (select what was just
  created) already finds it in the view. `history.undo` and `history.redo` are
  commands too.
- `input` is an unacknowledged latest-wins write to an Address, coalesced per
  frame on the client; the runtime applies it as `address.set`.
- `request` covers runtime-scoped operations: `documents.new/open` (replace the
  document; refused while it has unsaved changes unless `discard`),
  `documents.save/revert/close`, `catalog.list`, `displays.list/show/hide` and
  `shares.stop`. Paths in them are absolute paths on the runtime's machine. A
  pinned connection is refused `new`, `open`, `close` and a `save` to another
  path.

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
(`document-requests.ts`, `catalog-requests.ts`, `display-requests.ts`,
`pack-requests.ts`, `screen-shares.ts`), each given the payload and the
connection it came from, and the table's type makes a request without a handler
a compile error.

### Packs in the runtime

`["live", "shares", <id>]` holds each Screen Share's state (see Screen Shares
below). `["live", "packs", <packId>]` is where a loaded Pack goes: its name,
whether it is read-only, `loading`, `ok` or `missing`, its folder, a warning
when a scan hit a limit, whether ffmpeg is there, how many entries are prepared,
and its entries, each the manifest entry plus whether its file is there and
which of its thumbnail and proxy exist (`protocol/src/packs.ts`). The runtime
loads the Bundled Pack at start, the Packs the open Installation attaches, and
the folders `--pack <dir>` (repeatable) or `DIFRACTA_PACKS` (a path list) name
for one run (`difracta-runtime/src/packs/`, `pack-store.ts`).

The **Registry** (`registry.ts`) is the machine's record of where each Pack it
knows is: `packs.json` in the user's config folder (`$XDG_CONFIG_HOME` or
`~/.config`, `~/Library/Application Support`, `%APPDATA%`; `DIFRACTA_PACKS_FILE`
overrides, `platform-dirs.ts`), a map from Pack id to folder and name, so
`packs.known` lists without scanning. `packs.add` and `packs.locate` write it;
`--pack` folders join it in memory only. An attached Pack is resolved in order:
the Registry, then the Installation's `relativePath` hint against the file's
folder, accepted only when the manifest there carries the same id, else
`missing`, with its name from the Installation's copy. Detaching unloads a Pack
unless `--pack` named it; a `--pack` Pack stays loaded whatever is attached.

Loading walks the folder (`walk.ts`: dot folders and dot files skipped,
`settings.packs.maxDepth` levels, `settings.packs.maxMedia` files, path order, a
warning past a limit), fingerprints each file (`fingerprint.ts`) and brings the
manifest up to date (`scan.ts`, pure: new files get entries, a file whose
fingerprint matches a missing entry's takes that entry's `file`, nothing is
removed and no metadata is touched), writing it only when it changed. The
manifest, thumbnails and proxies live in the Pack's `.difracta/`; when that
cannot be written (a read-only mount, a stick without permission) they live in
`<cache>/difracta/packs/<packId>/` instead (`$XDG_CACHE_HOME` or `~/.cache`,
`~/Library/Caches`, `%LOCALAPPDATA%`; `DIFRACTA_CACHE_DIR` overrides), and the
Pack is read-only only when its manifest says so. A read-only Pack, the Bundled
Pack among them, is never written and never baked.

The **baker** (`baker.ts`, plans in `bake-jobs.ts`) queues every entry whose
file is there and that lacks a measurement, its thumbnail or, for a video, its
proxy, `settings.packs.bake.concurrency` at a time under `nice`
(`settings.packs.bake.nice`; plain on Windows): ffprobe for width, height and
duration, written into the manifest; a WebP thumbnail at `thumbnailAt` or
`settings.packs.thumbnail.defaultAt` of the duration, fitted inside
`settings.packs.thumbnail`; an H.264 proxy at `settings.packs.proxy` height and
bitrate, no audio. The binaries come from `PATH` or `DIFRACTA_FFMPEG` and
`DIFRACTA_FFPROBE` (`tools.ts`); without them Packs load with `ffmpeg: false`
and nothing bakes. Each finished entry patches its own flags and the Pack's
`prepared` count; a failed one is logged and left for the next run. Every change
to a Pack's data goes through one chain per Pack (`PackStore.change`), so a bake
landing while a tag is edited loses nothing. Deltas are per property
(`pack-live.ts`, `diffPackLive`): a Pack first read is set whole, after that a
tag edit is one patch on the entry's `tags`, a rename one on `name`.

The requests (`live/pack-requests.ts` over `packs/pack-operations.ts`):
`packs.add { folder }` scans, writes the manifest, records the Registry, loads
the Pack and applies `packs.attach` with a `relativePath` hint when the folder
sits inside or beside the Installation's folder (at most one `..`);
`packs.known` lists the Registry with whether each Pack is loaded;
`packs.locate { packId, folder }` requires the folder's manifest to carry that
id, records it and loads the Pack; `packs.rescan`; `packs.rename` writes the
manifest and the Registry, then applies the document command so the
Installation's copy follows; `media.update` edits an entry's name, tags
(trimmed, one per spelling ignoring case, first-use case kept), Beats, first
beat, thumbnail time (re-baked) or measured size and duration. Every write on a
read-only Pack is refused with the reason. `packs.add` and `packs.locate` name
folders on the runtime's disk, so a pinned connection is refused them like
`documents.open` (`pinnedRefusal`); the other Pack requests are open to every
client. `packs.detach` is a plain document command; the store follows the
Installation's `packs` table.

**Why a Registry per machine and a hint in the file:** the Installation names a
Pack by id so a show travels; where that Pack is differs on every machine, and a
show folder carrying its own Packs should open without setup. **Why bake with
the system's ffmpeg:** bundling one adds tens of megabytes of GPL builds to
every package; a runtime without it still shows every clip, only without
previews. **Why one change at a time per Pack:** probing a hundred clips while
someone tags one must not write a manifest that forgets either edit.

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

### Screen Shares

```text
Sharer (desktop) ── share {mediaId, share: {sharer, source}} ──▶ Runtime ── live patches ──▶ live subscribers
Viewer ── share-view {mediaId, view} ──▶ Runtime ── share-viewer {viewerId, joined} ──▶ Sharer
                                         Runtime ── share-viewing {idle | live | interrupted | refused} ──▶ Viewer
Sharer ── share-signal {mediaId, viewerId, payload} ──▶ Runtime ── share-signal {mediaId, payload} ──▶ that Viewer
Viewer ── share-signal {mediaId, payload} ──▶ Runtime ── share-signal {mediaId, viewerId, payload} ──▶ Sharer
Any client ── request shares.stop {mediaId} ──▶ Runtime ── share-ended {reason: stopped} ──▶ Sharer
```

A Screen Share is an entity of the `shares` table (see Media above): a slot. A
Sharer, a connection of kind `desktop`, shares a screen or window into it; any
connection views it as a Viewer. Pictures travel over WebRTC, one peer
connection per Viewer, straight between the two; the runtime keeps who shares
into each slot and who views it, and relays their signalling. Everything is
keyed by slot, the Media id, so one connection may share into several slots and
view several. The wire schemas are in `difracta-protocol/src/screen-shares.ts`;
the runtime's side is `live/screen-shares.ts`, which decides what is taken, and
`live/share-slot.ts`, one slot with its share and Viewers.

- `share { mediaId, share: { sharer, source } | null, resume? }` declares,
  updates or stops (null) the connection's share of a slot: the Sharer's name
  and whether it shares a `screen` or a `window`, nothing else. The runtime
  refuses it from any other kind of client, for an id that is not a `share` item
  of the open Installation, and when none is open, answering
  `share-ended { reason: "refused", message }`. A declaration from another
  connection replaces the share: the first Sharer hears
  `share-ended { reason: "replaced" }` and every Viewer is announced to the new
  one.
- `share-view { mediaId, view }` joins (true) or leaves a slot. The runtime
  answers each join, and tells each Viewer of every later change, with
  `share-viewing`: `idle` (nobody shares; it waits, and is connected when a
  Sharer comes), `live` or `interrupted` with the share's id, which changes when
  another share starts in the slot so the Viewer drops what it had, or `refused`
  with the reason: the slot is not in the open Installation, or it already has
  `settings.shares.maxViewers` Viewers, waiting ones included. A join from a
  Viewer already there is how a Viewer asks for a new offer: the runtime
  announces it to the Sharer again.
- `share-viewer { mediaId, viewerId, joined }` tells the Sharer of each Viewer
  that joins or leaves; `viewerId` is the Viewer's session id, stable for its
  connection. On `joined` the Sharer offers to that Viewer, dropping any
  connection it had to it. While the Sharer is away a Viewer's request for a new
  offer goes nowhere; it asks again once it hears `live`.
- `share-signal { mediaId, viewerId?, payload }` carries an opaque payload (an
  offer, an answer or an ICE candidate, as `ShareSignal` in core says, which
  only the two ends read): from the Sharer, `viewerId` names one Viewer of the
  slot; from a Viewer it is absent and the runtime adds it on the way to the
  Sharer. The runtime validates the envelope, never the payload, and bounds it
  at `settings.shares.maxSignalBytes` characters of JSON. A payload from a
  connection that does not share into the slot, for a Viewer that is not one of
  its, or from a Viewer while nobody is connected as its Sharer, is dropped.
- `shares.stop { mediaId }` is a `request` any client may make: the share ends,
  its Sharer hears `share-ended { reason: "stopped" }`, the Viewers `idle`. It
  fails when nobody shares into the slot.

The live state keeps a slot's state under `["shares", id]`:
`{ status: "idle" }`, or
`{ status: "live" | "interrupted", sharer, source, since, viewers }`, where
`since` is when the share started and `viewers` counts the slot's Viewers,
waiting ones included. A share that starts or ends sets the entry whole;
everything else is one patch per property (`status`, `sharer`, `source`,
`viewers`).

A share belongs to its slot and its Sharer's connection, not to the document. A
Scene change touches nothing. Removing the slot, or replacing the document with
one that has no `share` item of the same id, ends the share with
`share-ended { reason: "removed" }` and refuses its Viewers; a revert, a Save
As, reopening the file or any other replacement that keeps the slot keeps the
share. A Viewer's socket closing removes it, and its Sharer hears so. A Sharer's
socket closing makes its shares `interrupted`: the Viewers keep whatever peer
connection still works, since the picture never went through the runtime. The
same Sharer is recognised by its connection's actor (`hello`'s `client.actor`,
which `@difracta/client` sends on every reconnect): a declaration marked
`resume`, which the client sends after a reconnect, from a connection with that
actor within `settings.shares.interruptedForMs` takes the share back, with the
same id and `since`, and the runtime announces the Viewers that joined meanwhile
and says which left. After the delay the slot falls to `idle`. A `resume` takes
a slot only while nobody else shares into it, so a Sharer replaced while away
does not take it back and hears `replaced` instead. A declaration without
`resume` is always a new share, from the same actor too: a Desktop that started
again holds no peer connection, so every Viewer is announced to it. A runtime
restart needs nothing of its own: every client reconnects, Sharers declare again
and Viewers ask again, under new Viewer ids.

In `@difracta/client`, `client.sharing` (`screen-share/sharing.ts`) is the
Sharer's side: `share(mediaId, { sharer, source })`, `stop(mediaId)`,
`signal(mediaId, viewerId, payload)`, and listeners for Viewers joining and
leaving, their payloads, and a share that ended without it asking, which it then
forgets. `client.viewing` (`screen-share/viewing.ts`) is the Viewer's:
`view(mediaId)`, `requestOffer(mediaId)`, `leave(mediaId)`,
`signal(mediaId, payload)`, `state(mediaId)` and listeners for its standing and
the Sharer's payloads. After a reconnect the client declares every share again,
as a resume, and asks again for every slot it views. Neither holds any WebRTC
object. The CLI has `difracta share list` (each slot with status, Sharer, screen
or window, since when and Viewers, from the live state) and
`difracta share stop <share>`; `difracta media screen-share [name]` adds a slot.
Studio adds a slot from the Media section, shows each slot's status in its row
and inspector and every active share in its status strip, stops a share with
`shares.stop`, and views a slot as one Viewer per window while a picture of it
is on screen (see Studio).

**Why the runtime relays and never reads:** it is already the one place every
client can reach, so a Sharer and a Viewer on different machines need no other
server, and a runtime that only passes opaque payloads between named ends has
nothing to get wrong about codecs or networks, while the picture itself never
costs it anything. **Why keyed by slot:** Layers, Macros and the live state
already name the Screen Share; keying the protocol, the state and the Sharer's
own bookkeeping by the same id lets one Desktop share into several slots and one
Output view several without any other identity. **Why a second Sharer replaces
the first rather than being refused:** at a show the person at the laptop that
means to share now is right, and whoever shared before may have walked away; the
first Sharer is told, so nothing is silently lost. **Why a share starts only
from its own machine:** choosing a screen or window, and the operating system's
consent to capture it, happen where the content is; a request from another
machine could not answer the system's picker and would start a capture nobody at
that machine chose. Stopping is safe from anywhere, so any client may stop.
**Why no window title travels:** a title can carry a document's name, a chat or
a URL, and it would reach every client of the runtime and the file of anyone who
looked; the Sharer's name and screen or window are enough to tell shares apart.

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
Color Controller an RGBA color, a Text Controller a string, a Macro an impulse.
Groups are not nodes. Nothing else is exposed: a Layer's Parameters are reached
through a Controller, so that a value a hub drives is marked as driven in every
inspector, and through Macros for everything else.

An incoming message becomes the command Studio would send, under the actor
"osc": a Controller message is `address.set` on `controller/<id>/value` (one
number or a boolean for a Number Controller, clamped to 0..1 and rounded past
float32 noise; one RGBA argument or three or four numbers for a Color
Controller; one string for a Text Controller, cut at the longest text it holds,
never through a character), a Macro message is `address.trigger` on
`macro/<id>/run` with any or no arguments. Bundles apply in order, their time
tags ignored; wildcard addresses are rejected. Rejections are logged once per
reason per window with a count of what was suppressed, so a misrouted fader does
not flood the log.

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

A Pack entry's file is addressed by its Media reference,
`GET /packs/<packId>/<entryId>` (`settings.runtime.packsPath`,
`packs/pack-routes.ts`): the original streams with its content type, an ETag
from size and modification time under `Cache-Control: no-cache`, Range requests
honoured for seeking, and any origin allowed (`send-file.ts`); `/thumb` and
`/proxy` under it stream what the runtime baked, 404 until they exist. 404,
naming the problem, for a Pack that is not loaded, an entry the Pack lacks and a
missing file. The Output page and Studio's Preview build the URL from the
reference.

**Why by reference and not by path:** the URL then says nothing about the
runtime's disk, and a file renamed inside its Pack keeps its entry, so every
Output follows.

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
Studio, Output page, Catalog thumbnails and Bundled Pack next to the bundle, and
main names them to the runtime through `DIFRACTA_STUDIO_DIST`,
`DIFRACTA_OUTPUT_DIST`, `DIFRACTA_THUMBNAILS_DIR` and `DIFRACTA_BUNDLED_DIR`, so
`dist/` runs without the repository or `tsx`.

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
Desktop's own pages (the launch page and the share window's, below) and
`assets/` only, and resolves every path inside that folder whatever the URL
spells. The page talks to main through a bridge of its own,
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
`pickMediaPath()` is a native Open dialog filtered to the extensions in
`settings.media` (`media-dialog.ts` builds the filter list); nothing in Studio
calls it. A file opened from the OS while Desktop runs (a second launch, which
the lock turns into a message to the first; `open-file` on macOS) is handed to
Studio through `onOpenRequest` and goes through Studio's own open,
unsaved-changes question included. The preload exposes the bridge only to the
local runtime's origin, main answers only IPC whose sender frame is from that
origin, and only while a local session exists.

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
the page's items, Connect to..., Share Screen..., the Startup submenu with its
two checkboxes (Start Without Studio Window greyed out in remote mode), Quit.
**Edit**: the page's Undo and Redo, which are the Installation's, then the cut,
copy, paste and select-all roles; the `undo` and `redo` roles are left out
beside them, and the keys still undo typing inside a text field. **View**:
Actual Size, Zoom In (with a hidden `Ctrl+=` twin), Zoom Out, Toggle Full
Screen; the launch window's View has Toggle Full Screen alone. **Help**: Reload
Studio, Toggle Developer Tools, and Show Runtime Log in local mode. Windows and
Linux have no Window menu and no Close Window: closing the Studio window quits
Desktop and stops the local runtime, too much for a casual Ctrl+W; Quit keeps
its accelerator and goes through the questions above. macOS keeps its
conventions (the application menu with Quit, Close Window in File, a Window
menu). Items have stable ids (`page:save`, `desktop:connect-to`,
`help:reload-studio`), which is how the e2e suite clicks them from the main
process. A native menu cannot be edited once set, so it is built again when the
page's model, the session, the Studio or launch window or a Startup checkbox
changes, after `settings.desktop.menuRebuildDelayMs` so a burst makes one
rebuild. The launch window has a smaller menu of its own (Quit, the text roles
with undo and redo for its address field, Developer Tools). An Output window has
none (`removeMenu`), and so none of the menu's shortcuts; F11 alone is handled
in the window itself, since an Output has to go full screen. A Display window
has none either, in a session without a Studio window too. On macOS, where one
menu serves every window, Developer Tools acts only when the focused window is
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
Display window cannot zoom at all (`neverZoom`): a projector's page never zooms.
**Why `neverZoom` sets the mode on the contents, not as a preference:**
`disabled` as a `zoomMode` preference leaves the page at the zoom Chromium
remembers for its host and then refuses every change, so an Output opened at
whatever level a page of that host was once zoomed to, its canvas a pixel off
the Display's size; set with `setZoomMode`, it reverts the page to 100%, and it
is set again after each navigation because it does not last across one. The
launch page stays at 100%. Actual Size says the zoom there is now ("Actual Size
(Now 120%)") and is greyed out at 100%; the zoom is one of the changes that
rebuild the menu.

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

In both modes Desktop can be a **Sharer** of the session's runtime
(`screen-sharing.ts`). File ▸ Share Screen... opens the **share window**, whose
page is the third entry of `difracta-studio` (`share.html`, `src/share/`),
served like the launch page over `app://desktop/studio/share.html` and never by
a runtime. The page is the Sharer itself: it holds a connection of its own to
the runtime, of kind `desktop`, the captures and one peer connection per Viewer
of each share. Over that connection it follows the open Installation and its
live state (`share-installation.ts`), lists the Screen Shares with who shares
into each (`share-slots.ts`), adds one with the ordinary `share.create` when the
Installation has none, declares its shares and exchanges the signalling
(`client.sharing`, `sharer.ts`). Its actor is made up once and kept in
`desktop-state.json` (`sharerActor`), so the runtime recognises the same Sharer
after a reconnect, and its name is the computer's hostname, as the Display
Host's is (`host-name.ts`). A runtime that was started again finds the page
declaring its shares again by itself, each a new share of the capture that never
stopped.

Starting a share is choosing the slot, a slot somebody shares into included,
since a second Sharer takes the first one's place; Sharp or Smooth; whether the
cursor shows; then the screen or window. The list then shows each share with its
slot, a small picture of what is captured, what it is (a screen or a window, the
quality, the cursor), how many Viewers a connection was made for and how many
are connected, and Stop. Shares are keyed by slot and one Desktop runs several
at once. A share ends when Stop is pressed, when the capture ends (the shared
window closed), and when the runtime says so (`share-ended`: replaced, stopped
by another client, the slot removed, refused), which leaves a line with the
runtime's words until it is dismissed.

`share-sending.ts` is one share's connections: send only, no ICE servers, a
connection from scratch under a new id every time the runtime announces a
Viewer, the first time or again, and an answer or a candidate taken only under
the id of the connection in hand. The encoding comes from
`core/shares/share-quality.ts` and `settings.shares.sharer`: the quality's
bitrate and frame rate from the first frame (`sendEncodings`), its codecs first
in its order (`setCodecPreferences`), what gives way under load once the answer
is in (`degradationPreference`), and the track's content hint. The capture is
asked for a picture no larger than `maxWidth` by `maxHeight`, which Chromium
honours by scaling a larger source down in its shape (a 2560 by 1440 screen was
captured at 1920 by 1080); `scaleResolutionDownBy` does the same for a capturer
that would not. A connection that failed is dropped: a Viewer that is still
there asks for a new offer, and one that went with a runtime that was started
again never says it left.

Which screen or window a capture gets is main's to say (`share-capture.ts`, with
the rules in `share-sources.ts`, pure). The page asks the browser
(`getDisplayMedia`), and main answers through `setDisplayMediaRequestHandler`,
set on the share window's own session (a partition in memory that no other page
is ever in) and answering only a request whose frame is the share page. On a
Wayland session, known by its environment since Desktop's own windows run on X11
there, the operating system asks: listing the sources raises its dialog, and the
one source it returns is granted with no second question; a dialog closed
without a choice is a capture refused, which the page takes for a change of
mind. Everywhere else the share window has its own picker (`source-picker.tsx`):
the page asks the bridge for this computer's windows and for its screens, apart,
so the screens do not wait for the windows, the person chooses one, the page
tells main which (`choose`), and the capture that follows gets that one, which
has to be one main listed. The share window itself is left out of the list. On a
Mac whose Screen Recording permission is off the start flow says where to turn
it on. The cursor is asked for or not as the person chose (`cursor` in the
capture's constraints), but Chromium's screen capture draws it into every
picture and says so in the track's settings (`cursor: "always"`, under X11 in
Electron 44), so the list shows the cursor as the capture has it and a line says
when it is there unasked.

The share window's bridge is `window.difractaShare` (`share-contract.ts`, from
`share-preload.ts`, given to that window only and only to that page):
`context()` (the runtime's live socket, how Desktop names the runtime, the
Sharer's name and actor, who asks for the source, the Mac's permission),
`sources(kind)`, `choose(id)`, `report(sharing)`, how many shares the page runs,
and `onStopAll(callback)`. Main checks that each message comes from the share
page in the share window of the session Desktop is in (`share-bridge.ts`).

Closing the share window hides it while it shares and closes it when it does
not, and File ▸ Share Screen... shows it again. The window is never throttled,
so it goes on capturing and encoding while hidden. Quitting, and leaving the
runtime for another, ask first while something is shared ("This computer is
sharing its screen into 1 Screen Share. Quitting stops it.", before the
questions about unsaved changes and Outputs, since going on changes nothing
until every question was answered), then stop the shares: main asks the page to
stop (`onStopAll`), the page stops each share and reports none once the
runtime's live state says none is this computer's any more, and main closes the
window, after `settings.desktop.shareStopTimeoutMs` at the latest
(`share-stopping.ts`, `ScreenSharing.stop`).

**Why a page of Desktop's own and not Studio's page:** a page may capture a
screen only in a secure context, and a runtime serves plain HTTP, so the Studio
of a runtime elsewhere, which is the main case, has no `getDisplayMedia` at all;
`app://desktop` is secure. And handing out this computer's screen is not
something a page from another machine, possibly another version, gets a bridge
for. **Why the page holds the connection, not main:** the captures and the peer
connections can only live in a page, so with the connection there too the
signalling makes no hop through main, the page reads the slots and the live
state as any client does, and main mirrors nothing of a show it never draws.
**Why a connection of its own, apart from main's link:** closing the share
window then ends nothing of Desktop's as a Display Host. **Why a session of its
own:** the answer to a capture is set per session, and in that one there is only
the share page to ask. **Why the picker's titles never leave the machine:** a
title is a document's name or a mail's subject; the person choosing needs it and
nobody else does, so the declaration carries the Sharer's name and whether it is
a screen or a window, and the operator sees the picture. **Why closing hides:**
a share runs through a show in a window nobody looks at, and a stray click on
its close button must not take the picture off the wall; Stop is what stops.
**Why a share starts only here:** the person at the machine chooses what of
their screen others see.

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
and the launch page has no use for file pickers; a bridge per kind of page keeps
each page to its own few functions. **Why Studio's menu is in the native bar:**
one menu bar instead of two stacked ones, in the place the platform puts it, and
the title bar carries what the in-page bar's middle did. **Why shortcuts are
only shown there:** two handlers for Ctrl+S would save twice the day their
conditions drift apart; the page's handler exists anyway, for the browser. **Why
an Output window has no menu:** it sits on a projector in front of an audience,
where a stray Ctrl+R, Ctrl+Minus or Ctrl+Shift+I must do nothing. **Why Connect
to... keeps the session until a target is chosen:** leaving local mode stops the
runtime and turns every Output dark, which looking at a list, a change of mind
or a mistyped address must never cost; checking the target first keeps a failure
from costing it either. **Why Desktop can run without a window:** a venue's
mini-PC is an appliance that shows Outputs and is operated from a laptop; a
Studio nobody looks at costs a renderer and invites a stray click. **Why a
second launch brings Studio back, and no tray icon:** starting the app is what a
person does anyway when they cannot see it, and it works the same on every
desktop, where tray icons do not. **Why the quit is gated at `before-quit`:** it
is the one event every way of quitting passes before any window closes, so the
questions exist once, and a session without a window (where a window's `close`
never fires) needs no case of its own. **Why the Outputs warning never
refuses:** the person at the machine knows whether the show is over; Desktop
only knows that screens are attached. **Why the runtime is restarted with the
current path:** the file Desktop started with may be hours stale, and the
autosave that holds the unsaved work sits next to the file that was open. **Why
restarts give up:** a runtime that dies on the Installation it reopens would
restart for ever, hiding the problem and filling the log. **Why Linux needs its
own autostart file:** Electron's login items exist for macOS and Windows only,
and the XDG autostart directory is what Linux desktops read. **Why the login
setting is not stored:** two copies of one fact drift, and the operating
system's is the one that acts. **Why main writes the title:** only main knows
where Studio comes from, and a page from another machine does not get to name
the window. **Why the document bridge is four functions:** anything a page can
call in main is attack surface and is out of the CLI's reach; a file dialog is
the one thing that needs the OS, and what each returns is only a path, for a
request or a command the CLI can send too.

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
import left. The runtime child reads its Studio, Output page, thumbnails and
Bundled Pack out of the archive through Electron's fs. Chromium's sandbox needs
unprivileged user namespaces, which Ubuntu 23.10 and later refuse to programs
without an AppArmor profile, and an AppImage cannot ship one or a setuid
`chrome-sandbox`; the AppImage's `AppRun` probes with `unshare -Ur true` and
passes `--no-sandbox` only when that fails. package.json's `productName` makes
the user data folder `~/.config/Difracta` on Linux, for a checkout's Desktop
too. `.github/workflows/release.yml` builds each OS on its own runner, takes the
version from a `vX.Y.Z` tag (package.json's version plus `-g<sha>` on main),
runs the Desktop suite against the x86_64 AppImage
(`DIFRACTA_DESKTOP_EXECUTABLE` points the harness at a packaged executable) and
attaches the packages to the tag's GitHub Release.

## Settings

`difracta-core/src/settings.ts` holds every tunable in one object: history
coalesce window and limit, autosave delay, default host, port and document mode,
the Media extensions, the Pack scan limits and bake settings, the pinned Bundled
Pack release, the discovery service and its delays, how long a Display Host gets
to answer, the Viewers a Screen Share takes, how long an interrupted share waits
for its Sharer, how large a relayed signalling payload may be and a Viewer's
waits (before leaving a slot, before asking for a new offer, between asks), how
long Live holds a lost frame and the least a crop leaves, the largest picture a
Sharer sends and what Sharp and Smooth each mean (content hint, what gives way
under load, frame rate, bitrate, codec order), the size of the pictures in
Desktop's own picker, client reconnect backoff, CLI connect timeout, Desktop's
waits for its runtime to start and stop, for a runtime elsewhere to answer and
for the share window to stop its shares, its window sizes and how many runtimes
it remembers. Packages import from there instead of carrying their own literals.

## Rendering

`difracta-render` draws one Output's frame into a canvas behind a two-method
interface: `render(document, outputId, width, height, now)` and `dispose()`. Its
host is the Output page or Studio's Preview, each with a compositor of its own.
The Output page owns the animation loop, the canvas size and telemetry, and
hands the compositor a `mediaUrl(id)` resolver for the Installation's Media and
its client's `viewing` for the Screen Shares; the compositor advances the Visual
instances, draws, and reports what it did. Under Blackout, or before a document
arrives, the loop ticks once per `settings.output.idleFrameMs` and a document
change wakes it, so the frame after a Blackout lands within one display frame.

`planFrame` is the pure part: given a document and an Output it lists what to
draw this frame. Outside Calibration Mode that is the active Scene's Visual
Layers, bottom first, each one that is enabled with every Group above it
enabled, has a Visual with every Path it declares bound on its Target, and
targets a Surface enabled on this Output, or a Region of one; Filters are passed
over until they render, and a Group only gates. A Layer on a Region draws with
the Region's projected quad, its rectangle's corners pushed through the
Surface's homography, so its own homography is the composed map and the Layer's
canvas is sized to the Region's pixels; the Surface's Mask texture is sampled
through the rectangle (`u_mask_rect`), and Paths reach the Visual in Region
Space (`plan.ts`). With no active Scene the frame is black. In Calibration Mode
on that Output the Scene gives way to the calibrated Surface as a pattern (grid,
diagonals, border, name, corner labels, the selected corner marked) and the
others follow the view. Masks apply to the pattern only while a Mask, Path or
Region is being aligned, and that shape is then drawn over it with its points
marked, a Mask as a loop and an open Path as a line; while the quad or a Region
is aligned, the Surface's Regions are drawn as named rectangles, the aligned one
brighter with its two corners marked. That drawing lives in
`calibration-drawing.ts` and goes through the same Surface Space program as the
Layers (`surface-program.ts`), so a pattern lands exactly where the Scene will.

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

The plan also places the Scene's root Filter Layers: each one enabled with its
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
screen as before and the textures are never touched. The passes themselves are
one program per Filter (`filter-programs.ts`), compiled once and kept, which run
from any source texture into whatever framebuffer is bound at whatever size.

A Filter Layer inside a Visual Layer is planned on that Layer's draw instead,
bottom first, and never among the root Filters: it transforms that Layer's
picture alone, in its Target's space, before the picture is drawn onto the
Surface (`layer-chain.ts`). Its instance lives like a root one, keyed by the
Filter Layer, is told the Target's size on this Output (the Layer canvas size at
Render Scale 1, capped like any canvas) rather than the frame's, and idles with
the Layer while it is hidden. On a frame where the Visual drew something new, a
pass reports a change, the set of Filters changed or the Target's size did, the
Layer's picture (its canvas texture, its reduced-resolution shader buffer, or a
full-resolution shader Visual rendered into a buffer) goes through its passes at
the Target's full size, scaled up by the first pass when the Visual renders
below it, alternating between a result buffer the Layer keeps and a scratch
buffer of that size every filtered Layer shares, so the last pass lands in the
result; on any other frame the kept result is composited again, so a still Image
under a still Colorize renders once. The chain holds the picture the way the
frame chain does, rows bottom first, so a Filter's top is the top on the wall
whichever chain runs it: a canvas texture or shader buffer, rows top first, is
copied in turned over, a full-resolution shader Visual is rendered in bottom
first, and the result is sampled turned back when composited. It is then drawn
like a canvas Layer's texture: the Target's homography, the Surface's Masks, the
feathered edge, the Layer's opacity and its blend mode all apply after the
Filters, so fading a mirrored clip fades the mirrored picture and nothing a
nested Filter does leaks outside its Surface. The fragments run unchanged:
`u_input`, `u_resolution` and `u_texel` describe the Target buffer, and
`sample_input` clamps at the Target's edge. A Layer with no nested pass to run
(none planned, all identity, or mix zero) keeps the plain path at no added cost,
and the result buffer is dropped once the Layer has no planned Filter.

**Why Layers draw straight into the frame rather than into a Surface buffer:**
one draw per Layer is the whole pipeline, blend modes read naturally as what is
already on the wall, and root Filters, which transform the accumulated frame
below them, get to bleed across Surfaces, which is wanted (an LED panel split
into Surfaces, distorted as one). **Why a Visual Layer's own Filters run in
Target space instead:** a Mirror, a Kaleido or a Crop of one clip has to mean
the clip on its wall, following the Surface's mapping and cut by its Masks, and
it must not reach the Surfaces next to it; running them on the frame would
ignore the mapping. The buffer costs the Layer a texture its Target's size and
one pass per Filter, usually less than a frame-wide pass, and a full-resolution
shader Visual that used to be evaluated per Output pixel through the homography
is resampled from that buffer instead, which softens a strongly keystoned
Surface a touch, as a canvas Layer already is. **Why a Filter with nothing under
it is not planned, and an identity pass or one over blank Layers is dropped:**
each pass is a full-frame draw, the most expensive thing an Output does, and all
would produce exactly their input.

Geometry: every vertex is a Surface Space position pushed through the Surface's
homography in the vertex shader, with clip-space `w` carrying the projective
term, so the GPU interpolates Surface Space perspective-correctly and every
later shape drawn in Surface Space (Masks, Paths) inherits the mapping for free.
The homography and the quad a Target is drawn with are computed once per corner
change or frame resize and cached per Target by the corner values
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

Media: the loader (`media-loader.ts`) is engine-owned and preloading. The page
hands the compositor the `packs` live state as it has it (`setPacks`; the Output
page and Studio's Preview subscribe to `["live", "packs"]` and pass the slice on
every change; the thumbnail harness and the GPU suite make one up with
`fakePacks`). On every document revision, and whenever the slice changes, the
engine (`engine-media.ts`, `pack-sources.ts`) scans the Media references the
document names (`mediaReferencesInUse`: every `media` Parameter value of every
Layer and every Macro set action on such an Address) and makes one source per
image or video reference whose entry the slice has in a Pack that is not
missing, with its file there and of the type the Parameter accepts: its URL from
`mediaUrl(reference)` (`/packs/<packId>/<entryId>` on the runtime's origin for
an Output page, with `crossOrigin` set when that origin is not the page's; a
data URL in the harnesses), its revision the entry's fingerprint and its beats
the entry's. A reference into a missing Pack or entry, or of another type, gives
no source and its Layer stays blank. The loader gives each source an element, an
`<img>` that decodes or a `<video>` that preloads muted and inline, and drops
the elements of references the document no longer names or the Packs no longer
have; nothing else is evicted while the Installation is open. A source whose URL
or revision changed is loaded again under `?v=<n>`, since the browser keeps what
it fetched per URL and would show the old picture, and gets a new shared handle,
which is how the Video Visual knows to open a fresh playback. The render package
reads the slice by structure (`PacksView`), so it depends on core alone. The
loader is kept outside the GPU resources, so a lost context costs no reload. An
instance reaches it through `media` in its context (`sdk/media.ts`): `get(id)`
is the shared handle, whose `image` is null until the file is decoded and whose
`version` counts the pictures behind it; `video(id)` is a playback of the
instance's own, since two Layers showing one clip may be at different positions,
whose handle counts one version per presented frame. A video item is kept warm
(`media-preload.ts`): one element preloaded to its first frame, and a poster cut
from that frame with `createImageBitmap`, which is what the shared handle shows.
A playback takes the warm element, so its first frame is there at once, and a
fresh one preloads in its place; a playback asked for while none is warm opens
an element over the same URL, which the browser serves from its cache. The
preloads take turns (`media-preload-queue.ts`):
`settings.media.video.preloadBatch` load their first frame at the same moment,
the first ones and the ones replacing a taken element alike, and a turn ends
with the first frame, an error, or `preloadStallMs` without either, so a file
that never loads holds nobody back. One waiting its turn holds no element. Each
frame the compositor starts the ones waiting, the entries the planned Layers
name in a Parameter first. The loader counts the elements it holds, for
telemetry. The GPU side (`media-textures.ts`) keeps one texture per handle a
running instance holds, uploads when the handle's version is newer than the
texture's, straight alpha and rows top first like a canvas Layer's, flushes
after a video frame, binds it on the units after the mask's as `u_<name>` with
`u_<name>_size`, and deletes the textures of handles no instance holds any more.
**Why the loader preloads rather than the Visual fetching:** a Layer that starts
showing an item mid-set must find it decoded, and the table is the one list of
what a show may need. **Why a version on the handle:** the instance and the
uploader read the same counter, so a Visual reports `changed` exactly when the
texture would differ and a paused video uploads nothing. **Why a playback is
held only while playing or paused:** every video element holds a decoder, and a
show has many more Layers waiting for a Play Cue than playing; holding none
while stopped makes the count follow what plays, not what is planned. **Why
preloads take turns:** a decoder at work, a player playing or loading its first
frame, takes one of the hardware decoders, of which Chromium on Linux with
VA-API runs 16 at the same moment (`settings.media.video.hardwareDecoders`;
other platforms were not measured), and a player that starts past them decodes
on the CPU. Loaded all at once, an Installation with more video entries than
that would hand CPU-decoding players to the Layers that play them; in turns,
only what plays counts. An Output playing more players than the limit says so in
its telemetry's readers, Studio's Output card and `difracta outputs`, as a
warning inferred from the count, since a page cannot ask which decoder a player
got. **Why the warm element is handed over rather than kept as the poster:** a
player opened on Play starts a frame or two late, one already on its first frame
starts at once, and the poster needs no decoder.

Screen Shares: the engine is the Viewer (`live-viewer.ts`, one `live-slot.ts`
per slot), kept beside the loader in `engine-media.ts`, which is the `media`
context the instances get, and outside the GPU resources like it. The host hands
the compositor `shares`, the signalling: `view`, `leave`, `requestOffer`,
`signal`, `state` and the two listeners, which `client.viewing` is as it stands,
so the engine imports no client; peer connections, video elements and timers are
injected too, and the tests run the whole lifecycle with none of a browser's.
Each frame `wantedShares` (`live-wanted.ts`, asked once per document revision)
says which slots this Output views: the ones a Visual Layer of the active Scene
names in a Media Parameter accepting `live`, enabled or not, with a Target on
this Output. The Viewer views a slot that became wanted and leaves one
`settings.shares.viewer.leaveAfterMs` after it stopped being, or at once when
the `media` table lost it. A slot holds one video element and at most one
receive-only `RTCPeerConnection` with no ICE servers. The Sharer offers and the
slot answers, in the payloads of `ShareSignal` (`core/shares/share-signal.ts`):
`offer`, `answer` and `ice`, each under the `connection` id the Sharer gave its
offer, so a candidate of a connection since replaced is dropped. A new offer
replaces the connection in hand; a share under another id drops it and waits for
its Sharer's offer; an `interrupted` share keeps it, since only the Sharer's
socket to the runtime is gone. While the runtime says somebody shares and the
connection is neither up nor on its way, the slot asks for a new offer with
`requestOffer`: at once when the connection `failed`, after
`askAfterDisconnectedMs` when it is `disconnected`, after `askEveryMs` when
there is none, and again every `askEveryMs` until an offer arrives. A refused
Viewer asks to view again every `retryRefusedMs`. An instance reads a slot
through `media.live(id)`: a handle like any Media's, whose version counts the
frames presented, and `lost`, true while the picture in the handle is the last
one of a connection that is `disconnected` or `failed`. The element keeps that
frame, and the texture with it, until a new connection's first frame replaces it
or the runtime says nobody shares, which empties the handle. The compositor
reports the slots viewed, the ones connected and a refusal's words, which the
Output page sends as `workload.shares` in its telemetry and `difracta outputs`
prints. A compositor given no `shares` views nothing, and its Live Layers are
blank. A page with several places that show shares gives each compositor a
`viewer` instead of `shares`: a claim on the page's one `SharedViewer`
(`shared-viewer.ts`), which holds one `LiveViewer` and views the union of what
its claims want, a slot while any claim wants it, leaving it `leaveAfterMs`
after the last one stopped; a claim can `pause`, wanting nothing until its next
sync, and disposing the compositor disposes its claim. Every claim reads the
same slots, so the page is one Viewer per slot however many places show it.
Studio is that page (see Studio). `loopbackShares` (`loopback-share.ts`) is a
Sharer inside the page over real peer connections, for the thumbnails and the
GPU suite, which have no runtime.

**Why the engine is the Viewer, and not the Visual:** a share has one picture
per Output however many Layers show it, it must be there before the Layer that
shows it is enabled, and what to do when a connection drops is the same for
every Layer; an instance that negotiated would do all of that per Layer and
could not be tested without a browser. **Why on demand:** every Viewer is one
more encode on the Sharer's machine, so an Output that shows no Layer of a share
must not cost one; counting disabled Layers keeps the Macro that enables one
from starting a negotiation on the beat. **Why recovery is the Viewer's to
ask:** the side that stopped receiving is the one that knows, and sooner; a
Sharer waiting for its own connection to fail took fifteen seconds in the spike
where an asking Viewer took a quarter of one. **Why `lost` comes from the
connection and not from frames stopping:** a Sharer may send nothing while its
screen is still, so a slide that does not change and a share that dropped look
the same in frames, and only the connection tells them apart. **Why one Viewer
per page rather than one per compositor:** the runtime knows a Viewer by its
connection and the Sharer offers once per Viewer, so two engines on one
connection would both answer the same offer, and a connection per place would
cost the Sharer another encode, of the eight a share takes, for a picture the
page already has. **Why a connection id in every payload:** the runtime relays
in order but the two ends replace connections on their own, and a candidate
added to the wrong connection fails it.

**Why a video upload is flushed:** the copy is a command queued with the rest of
the frame's, and Chromium's hardware decoder on Linux (VA-API) can reuse the
buffer it reads before the queue is sent, so the texture gets a frame from
further ahead for an instant; sent at once, the copy runs first.

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
run and a Visual replayable in a test; nothing user-facing depends on it, and
two Outputs showing one Surface are not expected to agree. **Why the flags come
from `update` and not `render`:** `render` is what they skip.

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
Video has a transport of stopped, paused and playing driven by its Cues,
Autoplay and the element's end, and holds a playback while playing or paused;
stopped, it shows the shared handle or nothing, unless Keep Warm has it hold the
playback for the next Play.

Live (`live.ts`) shows a Screen Share from `media.live(id)` with the same Fit
(`FIT_GLSL` in `media-fit.ts`) and no Tint: four Crop Parameters, each the
fraction cut from one side, become the rectangle the fragment samples
(`live-crop.ts`, which keeps `settings.shares.viewer.minCropSide` of the picture
when opposite crops would meet, Left and Top winning), and the Fit works on that
rectangle's shape. It reports `changed` with each frame that arrives. While the
share is `lost` the instance counts `dt`: with On Signal Loss at Hold it shows
the last frame for `holdSeconds` and then reports `blank`, at Blank it does at
once. **Why the crop is the Visual's and clamped there, not refused by the
Parameters' ranges:** two Layers cut two parts of one screen, a Macro moves a
crop like any Address, and a range that kept Left and Right from meeting would
forbid cutting a corner out.

Video follows a tempo through the entry's Beats (`media.beats(id)` in the
context, read from the sources the `packs` live state made on every call, so an
edit reaches a clip that is playing without a reload). With Sync to Tempo on,
the rate is Tempo over the clip's own tempo, `beats × 60 / duration`, times
Speed read as the nearest power of two; an entry without Beats, or a playback
whose length the element does not know yet, plays at Speed. The Beat Cue says a
beat of the song is now: the instance reads the playback's position, takes the
distance to the nearest line of a grid of song beats in clip time starting at
the First Beat, and owes it. Each update bends the rate toward paying that over
`settings.media.video.sync.chaseSeconds`, by `maxBend` at most and in steps of
`bendStep`, and takes what the bend paid during `dt` off what is owed; within
`lockedWithin` nothing is owed and the rate is the tempo's. A new Beat Cue
replaces what was left with a fresh measure. The arithmetic is
`visuals/video-sync.ts`, pure and tested without a video.

**Why Beats and not a BPM:** a loop is a whole number of beats long, and its
tempo, 135.2 for 16 beats in 213 frames, is a rounding that would drift. **Why
Tempo as a Parameter and not measured between Beat Cues:** an instance made a
moment ago, as every press of a held pad makes one, has the tempo from its first
frame, and the jitter of a Cue's journey reaches the phase only. **Why bend and
never seek:** a seek is a visible jump and a decode from the last keyframe; a
rate a tenth off is neither. **Why Speed snaps:** at ×¾ no pulse stays on a
beat, so there would be nothing to chase. **Why per instance:** the clock is the
video element's, so the position is the instance's to read; what it cannot do,
start in phase, belongs to a clock the Installation would hold.

Text is drawn by shader Visuals through `text` in their context (`sdk/text.ts`),
the engine's `TextRasters` (`text-rasters.ts`) over a `FontLoader`
(`font-loader.ts`). The loader gives every file of every Bundled Font a
`FontFace` of its own family when the compositor is made, so all are loaded by
the time a Layer asks; a font is ready with its first file, and text in it is
drawn with a font list of its files, then the first Bundled Font's, then the
system's. The instance breaks its own lines: `text.measure(style)` answers
widths in ems, and `layoutText` (`sdk/text-layout.ts`), which is pure and tested
with a made-up measure, turns a text, a box and a Fit into lines and a size, Fit
by halving toward the largest size at which the wrapped block still fits and
then balancing its lines. `text.block` then rasterizes those lines, and
`text.rows` a list of texts as cells of one size, each centered in its own, in
as many columns as keep the picture nearest to square (`gridColumns`), which is
how Counter gets its digits: eleven cells in one column would reach the longest
side a picture may have at a fifth of the size a grid allows, and the digits
would be stretched on any large Target. Counter asks for its Prefix and Suffix
as a second picture, since a long one would widen every digit's cell. Both
answer a handle shaped like a Media handle, returned under `textures` and
uploaded, bound and deleted by `MediaTextures` like a picture. The canvas holds
coverage on opaque black, the fill in red and the outline in green, drawn with
`lighter` so each channel adds up alone, and `text_color` in `TEXT_GLSL` colors
a sample from two uniforms. A request is rasterized once and shared by every
instance making it; the compositor tells `TextRasters` each frame which handles
instances hold, and it forgets the rest, while an instance still holding a
forgotten handle keeps its canvas. Sizes asked for go through `rasterSize`, a
ladder a quarter octave apart, and a picture that would pass
`settings.text.maxRasterSize` is drawn at the largest size that fits, which its
handle says. Everything answers undefined until the font is there, `version`
advances when one arrives, and a font that failed throws, so its Layers stop
with an issue naming the font. Text (`visuals/text.ts`) and Counter
(`visuals/counter.ts`) are the two Visuals built on it; Counter's count and its
columns, each easing along the strip of digits the way the count went, are
`visuals/counter-count.ts`.

**Why the browser rasterizes whole strings, and no glyph atlas or distance
field:** shaping, kerning, accents and scripts written right to left come with
`fillText`, and a text changes far less often than a frame is drawn. **Why
coverage and not color:** a color swept by a Controller would otherwise draw and
upload the text on every frame; as uniforms, colors cost nothing, at the price
of emoji showing as silhouettes. **Why a ladder of sizes:** a Size ridden live
would otherwise rasterize per frame, and the picture is only ever shrunk, by
less than a fifth. **Why shader Visuals only:** a canvas Visual draws text on
its own canvas already, and what it would gain is the shared font, not the
cache.

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
the settings of whatever is selected. The center holds tabs: the Preview, which
is Studio's own rendering of an Output, a Surface or a Layer, and the Outputs
tab, which shows one card per Output; the tab last used is remembered per
browser. Selection is Studio-local state and never reaches the runtime; the
selected row and card carry an outline so the inspector's subject is visible at
a glance. Rows with children open and close with a chevron: Output rows start
open so their live sessions stay in view, Surface rows start closed so Regions,
Masks and Paths do not crowd the list; creating a child or selecting one from an
inspector opens its parent. Column sizes and section open states are remembered
per browser in localStorage; row open states live in memory and reset with the
Installation. An empty section says how to add its first entity, and an open row
without children says so in one dim line.

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
a switch. A choice whose options name a Bundled Font draws each in its face
(`fonts/bundled-fonts.ts`): the chosen one's font is loaded when the row
appears, the others' when the list first opens, from `/fonts/<file>` on the
page's origin, and an option whose font fails stays in Studio's own. A text
Parameter is a field, several lines tall when the Parameter takes line breaks,
that commits on Enter or when it is left and never while typing, since every
commit reaches the wall; where Enter breaks the line, Ctrl+Enter commits, and
Escape puts back what the document holds. A media Parameter accepting `live` is
a select over the Installation's Screen Shares, None first, with a "+" beside it
that adds a slot and picks it on the Layer in one flow, as the "+" on a Path row
makes a Path; a value naming no Screen Share shows as None. One accepting an
image or a video is the Media reference as text, `<pack>/<entry>`, committed
when the field is left (`inspector/fields/media-control.tsx`). The Link picker
and the Macro picker resolve against the whole document and draw the same
control. Sliders and the color input stream every position through
`address.edit`, one send in flight at a time. The Parameters header has Reset
all, one `layer.reset` step. Section open states are remembered per section.

The Controllers section is a tree like a Scene's: Number, Color and Text
Controllers with their live value at the right (a percentage, a swatch, the
first words), Groups that open and close, drag among siblings and into Groups.
It starts closed unless it is empty, where the hint to add one is all there is.
The section's "+" offers the four kinds and asks for a name, since a Controller
is named for what it drives. The Controller inspector has the name, the value as
the same Address row a Parameter gets, and a Links section listing every target
with its Layer, a number Link's anchors editable in place, unlink, and "Add
link…". That opens the Link picker: every compatible Address in the Installation
grouped by Scene, a search box matching Scene, Layer, Visual and Parameter names
word by word, tick boxes, "Select all results" and one Link button, so one
Controller reaches the same Parameter on thirty Layers in a few keystrokes; an
Address linked elsewhere shows its Controller and moves on pick. On a Layer,
every Address row ends in a link menu: "Link to" lists the Controllers of the
right kind, "New Number Controller", "New Color Controller" or "New Text
Controller" makes one named after the row ("Koi Pond Opacity") and links it in
one step, and a linked row shows the effective value read-only, a chip with the
Controller's name and value that opens it, and Unlink, so there is no control to
mistake for an override. A Layer whose Enabled is linked shows a link glyph in
place of its eye.

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
Filter Layer and takes over the center column while open, leaving the Preview
above it when that is the tab in use: a search box, three facets (backend, Path,
Cues) and a grid of tiles with thumbnails and badges. Search is fuzzy and
ranked: a name starting with the query beats a name with a word starting with
it, which beats the letters in order, and any name match beats a description
with a word starting with the query (letters in order are tried on names only,
since over a description they match nearly everything); recommended entries come
first among equals and lead the list when nothing is typed. Clicking a tile or
moving with the arrow keys applies the definition to the Layer through
`layer.visual` or `layer.filter`, so the Outputs and the Preview show each
candidate; Enter keeps it, Escape discards the browse and puts back what the
Layer had when the Library opened, and the browse undoes as one step because the
commands coalesce per Layer. Adding a Visual or Filter Layer opens the Library
for it, since picking is the next thing to do; double-clicking a Layer row or
the inspector's button opens it later. Selecting another Visual or Filter Layer
rebinds the Library, selecting anything else closes it. A Layer still carrying
its generated name takes the name of what it picks.

The binding, a Layer, is Studio-local state (`library/browser-state.tsx`); the
frame, keyboard and grid are `library/library-shell.tsx`.

**Why apply on highlight rather than try a candidate locally:** the projector is
the only honest view of a Visual on a real Surface, and the Preview renders the
runtime's document like any Output; applying to the runtime shows every
candidate where it will be seen, and in the Preview with no second path to keep
in step. **Why the center column rather than a dialog:** the navigator and the
inspector stay usable, so a Layer's other settings can change while candidates
are compared.

The Preview (`difracta-studio/src/preview/`) renders an Output, a Surface flat
or a Layer inside Studio with a compositor of its own (`preview-canvas.ts`), fed
the document of Studio's view as deltas change it and the Cues the view hears.
It is not an Output Session: it never attaches, reports no telemetry and appears
on no Output card. Its header picks what is shown, Follow selection or a named
Output, and while following the closest framing allowed, Output, Surface or
Layer; the choice (`preview-choice.ts`) is remembered per Installation in
localStorage. A named Output stays whatever is selected and shows the active
Scene, so it shows what is on stage.

Following (`preview-target.ts`), a selected Output is shown. A selected Surface,
Region, Mask or Path names its Surface (`selection/selection-surface.ts`, which
calibration follows too) and a Visual Layer the Surface of its Target. With the
framing at Output the Preview moves to the Output that Surface is on: the one
shown now when the Surface is on it, else the one picked for the Surface in its
inspector, else the only one it is on. A Surface on several Outputs with none of
those to prefer leaves the Preview where it is, and the header lists the Outputs
to click. With the framing at Surface or Layer the Surface is shown flat,
whether it is on an Output or not; Surface framing shows a Visual Layer as the
flat Surface of its Target. With the framing at Layer a selected Layer is shown
with only what it draws with: a Visual Layer on the flat Surface of its Target,
a Filter Layer or a Group on the Output shown, since neither has a Target. The
Layer stays shown while a selection that does not move the Preview is made,
until another target is shown, a Scene is selected, or its Scene is no longer
the one shown. A selected Scene, or the Scene of a selected Layer, is shown
whether it plays or not, on whatever the Preview shows; it stays shown while
other things are selected, until another Scene is, it becomes the active one, or
the document closes, and the header names it while it is not the one playing.
Any other selection leaves the Preview where it is.

The Preview's copy of the document (`preview-document.ts`) has Blackout lifted,
the Scene shown made the active one, and is otherwise the document itself,
shared by reference; the header carries a Blackout badge while the Outputs are
dark. An Output is rendered as its projector gets it, Calibration Mode included.
A Surface shown flat is rendered on an Output that exists in the copy alone,
under an id no Output or mapping of the document has: the Surface gets a mapping
there with the corners of the full frame and no other Surface has one, so only
Layers targeting it draw, Filter Layers transform it alone, and Calibration
Mode, which is on a real Output, does not show.

A Layer shown is rendered on that Surface or Output with the copy's Layers
narrowed (`preview-layers.ts`), under the same ids so its Visual Instances are
the ones the Preview already has. A Visual Layer is kept alone and moved to its
Scene's root, so no Group gates it and no Filter Layer applies. A Group is kept
with everything in it, moved to the root the same way. A Filter Layer is kept
with every Layer below it in the stack and the Groups it is in, which still gate
it, so the stack is drawn up to and including it and nothing above. A Layer's
own enabled switch is kept, and the header says Disabled while that leaves
nothing of the Layer to draw.

The frame is letterboxed. An Output's ratio is the one its freshest Output
Session reports, 16:9 while none does, or one picked in the header and
remembered per Output. A Surface's is its size when it has one, else the shape
of its mapping on the Output it is on, measured along its longer edges as its
canvases are, else 16:9 (`preview-aspect.ts`); the header offers no ratio then.
The canvas takes the size it is shown at, in device pixels, once the panel has
kept that size for `settings.preview.resizeSettleMs`, and the old frame is
stretched meanwhile. Frames are rendered only while the Preview is the tab in
use and the page is visible; under the Outputs tab it stays mounted and idle, so
coming back starts no Visual again.

With Outline selection on in the header, off at first and remembered with the
choice, an SVG over the frame (`preview-overlay.tsx`) outlines the selected
Surface on the Output shown, by its mapping's corners; a selected Region there,
by its bounds projected through that mapping with the compositor's `homography`;
and a selected Region of the Surface shown flat, by its bounds
(`preview-outline.ts`). The overlay takes no pointer events and is no part of
the rendered frame.

**Why a compositor in Studio rather than the Output's pixels:** composing needs
no display attached, and a stream of frames would cost the Output encoding work
and the network a video; the price is that the Preview is representative, not
identical, since its Visual Instances are its own. **Why not an Output
Session:** a session is a display showing the Installation, which the Output
cards, the status strip and Desktop's quit warning count. **Why Blackout is
lifted:** Blackout darkens the room, and what it hides is what the operator
needs to see before releasing it. **Why Calibration Mode is kept on an Output:**
an Output made only to be looked at in the Preview is calibrated there. **Why
the size waits for the panel:** Visual Instances are made for a frame size, so
every size rendered starts them again. **Why the Surface's Output is never
guessed:** as with calibration, showing another projector's frame as if it were
the one meant misleads more than staying put. **Why a flat Surface is a mapping
in a copy of the document rather than a second way to render:** the compositor
renders Outputs and nothing else, so a Surface heavily warped on its projector
is tuned on the same code that will project it. **Why one framing switch rather
than a choice per kind:** the framings nest, so the closest one allowed says
what every selection shows, with no combination that shows nothing. **Why a
Layer is shown out of its Groups:** looking at one Layer is how it is composed,
and a Group switched off for the show would otherwise hide it; a Filter Layer
stays in its Groups because what it transforms is the stack as the Outputs draw
it. **Why the Scene shown stays:** a Scene is composed by selecting its Layers,
then Surfaces, Controllers and Macros, and the Preview going back to what plays
at each of those would hide the work; it is not remembered across sessions, so a
show reopens on what plays.

The Surface, Mask, Path and Region inspectors carry a Calibrate toggle and,
while active, the view for the other Surfaces. Calibrating is on the Surface's
mapping Output (`lib/mapping-output.ts`): the Output showing its pattern now,
else the one this Studio picked for the Surface, else the only one it is on. On
several Outputs with none picked there is none and Calibrate is disabled, with a
"Show on" select over the Surface's Outputs above it; the pick is Studio's own,
kept per Surface and never saved. The corner or point selected in the inspector
is mirrored to the Output as it changes, and focusing a corner or point button
selects it, so Tab and the arrow keys agree. While the mode is on, selecting
another Surface, Mask, Path or Region moves the pattern to it, on the same
Output when that Surface is on it, on its only Output otherwise, and not at all
when it is on several others (`followedOutput`); selecting anything else leaves
it on. A Visual Layer whose Visual follows Paths shows one row per Path below
its Target, a select over the Target's Paths with a "+" that creates one named
after the Layer, binds it and selects it. The status strip shows what is being
calibrated with an exit link, so a forgotten Calibration Mode stays visible.
Escape clears the selection outside text fields and dialogs.

Blackout sits in the menu bar because it is the one control a performer must
reach without looking; it writes `installation/blackout` through the input
channel and is not undoable.

The Media section, below Surfaces, lists the Packs and the Screen Shares. The
Bundled Pack comes first with a Bundled badge and no Detach, then the attached
Packs by name, then the Screen Shares in their order. A Pack row reads its state
from `live/packs/<id>` (`entities/pack/pack-status.ts`): "preparing 42/310" with
a thin bar while the baker works, "missing" with Locate…, a read-only badge, and
a warning for a scan limit or a runtime without ffmpeg. The section's "+" offers
Add Pack ▸ From folder…, Add Pack ▸ each Pack the runtime's machine knows and
the Installation does not attach (`packs.known`), and Screen Share. Packs and
Screen Shares are two entity kinds (`entities/pack/`, `entities/share/`) sharing
one section (`entities/media/`); the collapsed section's warning count is the
missing Packs plus the interrupted slots.

Naming a folder (`packs.add`, `packs.locate`) is allowed where `documents.open`
is (`entities/pack/pack-gate.ts`): inside Difracta Desktop, through its
`pickPackFolder` bridge, or on a free loopback connection, where the path is
typed; elsewhere From folder… and Locate… are disabled with the reason and a
known Pack is attached instead. Selecting a Pack shows its inspector
(`pack-inspector.tsx`: name through `packs.rename` unless read-only, location on
disk, entry and prepared counts, Rescan, Locate… when missing, Remove from
Installation) and opens the Library on it to browse. Every Remove of a Pack, the
Delete key's included, first says how many Layers and Macro actions use its
entries (`usesMatching`), then sends `packs.detach`; those references read as
missing afterwards.

The Library (`library/`) has three bindings (`browser-state.tsx`): a Layer,
which browses the Catalog (`layer-library.tsx`); a Pack, browse mode
(`media-library.tsx`); and a media Address, Parameter mode, opened from the chip
in a Layer's or Macro action's row (`inspector/fields/media-control.tsx`, its
states in `media-chip-state.ts`: set, missing Pack with Locate…, missing entry,
a value that is not a reference, empty). The rows are the entries of every
loaded Pack from the `packs` live slice; facets (`media-facets.tsx`,
`media-search.ts`) scope by Pack, by the entry's folder inside it as a
breadcrumb, by tags whose counts narrow as tags are picked, and by type when not
bound to a Parameter; search ranks name, tags, description and notes. A tile
(`media-tile.tsx`) shows the baked thumbnail from `/packs/<pack>/<entry>/thumb`
and plays the proxy, or the original when none is baked, muted on hover; a
missing entry is hidden unless the query names it. In Parameter mode a click
sets the Address at once, so the Outputs preview it, Enter keeps and Escape
restores what the Address held, and a strip above the grid
(`media-description.tsx`) describes the entry it holds; in browse mode a click
selects the entry and sets nothing. An entry is an entity kind of its own
(`entities/entry/`), selected by its Media reference, with no row: its Pack's
row shows as holding the selection, and the Library stays open while the
selection is the Pack or one of its entries. Its inspector
(`entry-inspector.tsx`, `media-player.tsx`, `tag-editor.tsx`) edits name, tags,
Beats, first beat and the thumbnail frame through `media.update`, fills a width,
height or duration the manifest lacks when the original loads, and is read-only,
each field saying why, for a read-only Pack; its file path opens the Library on
that folder of the Pack. Nothing removes an entry, so the kind has no `removal`
and Remove does nothing on one. While browsing, the Library takes the whole
center column, since there is nothing to preview; while picking under the
Preview tab it sits under the Preview, as the Catalog does for a Layer. The
Library with no entries anywhere shows one Add Pack….

The Screen Shares follow in their order, rows dragging to reorder (`entity.move`
on `shares`). A row shows, at its end, the slot's status from
`live/shares/<id>`: `idle` dim, `live` green, `interrupted` amber with a warning
explained on hover (`entities/share/share-status.ts`); the collapsed section's
warning count is the interrupted slots. The section's "+" offers Screen Share,
which sends `share.create` and selects the slot. Its inspector
(`share-inspector.tsx`) has the name (`share.rename`), the status in words, and
while somebody shares the Sharer, screen or window, since when, the Viewers out
of the eight a share takes, the picture, and Stop, which sends `shares.stop`;
idle, it says how a share starts: in Difracta Desktop on the computer to share
from, File ▸ Share Screen... There is no Start: a share starts only on its
Sharer's machine. Remove (`share.remove`) works from the context menu, the
Delete key and Edit ▸ Remove like every entity. The status strip lists every
slot somebody shares into, `live` or `interrupted`, with its Sharer
(`status/active-shares.tsx`), in every Studio whoever shares, and clicking one
selects the slot. The share window's list and the strip read the slots the same
way (`entities/share/share-slots.ts`).

**Why the status is not computed in Studio:** only the runtime knows who is
connected to it; Studio shows what `live/shares` reports and explains it.

Studio is one Viewer (`lib/share-viewer.tsx`): a `SharedViewer` over its
client's `viewing`, made with the client and living as long, of which every
place showing a share takes a claim. The Preview's compositor gets one as its
`viewer`, so a Live Layer shows the share there as on an Output, and the claim
wants nothing while the Preview's loop is stopped (another tab in use, the page
hidden). `SharePicture` (`entities/share/share-picture.tsx`) claims one slot
while it is mounted and the page visible and copies each new frame of it into a
canvas at the size shown, keeping the slot's last known shape (16:9 before any)
for an empty frame; the slot's inspector and the crop editor show it. So Studio
views a slot only while a picture of it is on screen, one Viewer per slot for
the whole window, and leaves `settings.shares.viewer.leaveAfterMs` after the
last picture goes. A slot's own inspector shows its picture only while somebody
shares, so looking at an idle slot views nothing.

A Visual may add a panel to the Layer inspector above its Parameter rows
(`entities/layer/visual-panels.ts`, by Visual id); the rows stay below it, so
everything a panel writes is an Address like any other. Live has the crop editor
(`entities/layer/live-crop/`): the slot's picture with the rectangle its four
crops leave, drawn as the Visual's instance makes them (`cropRect`, Left and Top
winning when they cross), what is cut dimmed. Each side drags, streaming
`address.edit` to that crop, and the inside drags the whole rectangle at its
size, streaming `addresses.edit` with all four, one send in flight at a time as
the sliders do; values are on the Parameters' step, a side stops `minCropSide`
short of the side facing it, and each drag undoes as one step. A crop a
Controller drives shows where the Controller puts it and has no grip, and the
inside does not drag while any is driven. With no Screen Share picked, or nobody
sharing, the frame is empty and the crops still drag.

**Why Studio does not start a share:** choosing a screen or window, and the
operating system's consent, happen where the content is. **Why the status strip
names every share:** a screen on its way to a projector is something the person
at any Studio should not lose track of, whoever started it. **Why one Viewer for
the window:** see Rendering; a Preview, a crop editor and an inspector showing
the same slot cost the Sharer one encode, not three. **Why a panel above the
rows rather than a control in place of them:** the crops stay Addresses a Link,
a Macro or the CLI moves, and a row is where a Link shows.

The Surface inspector lists every Output, in Output order, as an accordion
(`entities/surface/surface-outputs.tsx`): each row has the Output's name and a
switch that puts the Surface on it (`surface.assign`), "Turn all on" does so for
the rest in one command, and at most one row, of an enabled Output, is open. The
open row is the Surface's mapping Output, so a Surface on one Output opens on
it, one on several opens on none until a row is clicked, and opening another row
while the Surface is calibrated takes the pattern to that Output. An Output's
inspector lists the Surfaces on it, and clicking one selects the Surface with
that Output's row open. The Mask, Path and Region editors take their shape from
the Surface's stated Size, else from the mapping of its mapping Output, else
from the first Output it is on. **Why no row opens by itself on several
Outputs:** a corner dragged on the wrong projector's mapping looks like a drag
that did nothing, so the corners only exist once a projector was chosen.

The open row places the Surface in that Output's frame with a small SVG: the
quad with draggable corner handles, other Surfaces on the same Output as
outlines, and the frame's aspect taken from the Output's session telemetry when
one is reporting. Corner buttons take arrow keys for nudging and two fields show
the selected corner as percentages of the frame. Dragging shows the handle at
the pointer and sends absolute sets with one in flight at a time
(`lib/use-latest-wins.ts`); everything else shows confirmed document values.
